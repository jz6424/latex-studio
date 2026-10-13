import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { copyFile, mkdir, readdir, readFile, unlink, writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { tmpdir } from 'os'

// Electron names the data folder after the app: "latex-widget-editor" (the
// package name) under `npm run dev`, but "LaTeX Studio" (the productName)
// once packaged. Pinning it means both see the same saved projects. Must run
// before anything below reads userData.
app.setPath('userData', join(app.getPath('appData'), 'latex-widget-editor'))

interface CompileResult {
  success: boolean
  /** Base64 so the PDF can cross the IPC boundary as JSON. */
  pdfBase64?: string
  /** Only set on failure: the trimmed pdflatex error, for display. */
  log?: string
}

// --- pdflatex ----------------------------------------------------------------

/** Scratch directory for compiles. Reused rather than made fresh each time, so
 * pdflatex can benefit from its own auxiliary files between runs. */
const COMPILE_DIR = join(tmpdir(), 'latex-studio-compile')

const COMPILE_TIMEOUT_MS = 45_000
const COMPILE_MAX_BUFFER_BYTES = 10 * 1024 * 1024

/** MiKTeX's winget install lands per-user under %LOCALAPPDATA%, which isn't
 * necessarily on PATH yet for an already-running process — check the known
 * install locations before falling back to relying on PATH (which covers TeX
 * Live and any install that did register itself). */
function resolvePdflatexPath(): string {
  const candidates = [
    join(process.env['LOCALAPPDATA'] ?? '', 'Programs', 'MiKTeX', 'miktex', 'bin', 'x64', 'pdflatex.exe'),
    'C:\\Program Files\\MiKTeX\\miktex\\bin\\x64\\pdflatex.exe',
    '/Library/TeX/texbin/pdflatex'
  ]
  return candidates.find((candidate) => candidate && existsSync(candidate)) ?? 'pdflatex'
}

/** pdflatex's log is mostly package-loading noise; pull out just the part
 * starting at the first "!" error line (or the tail, if none is found). */
function extractErrorSummary(log: string): string {
  const ERROR_CONTEXT_LINES = 18
  const FALLBACK_TAIL_LINES = 25

  const lines = log.split(/\r?\n/)
  const errorIndex = lines.findIndex((line) => line.startsWith('!'))
  const excerpt =
    errorIndex === -1
      ? lines.slice(-FALLBACK_TAIL_LINES)
      : lines.slice(errorIndex, errorIndex + ERROR_CONTEXT_LINES)
  return excerpt.join('\n').trim()
}

async function compileLatex(texSource: string): Promise<CompileResult> {
  await mkdir(COMPILE_DIR, { recursive: true })
  await writeFile(join(COMPILE_DIR, 'document.tex'), texSource, 'utf-8')

  const pdfPath = join(COMPILE_DIR, 'document.pdf')

  // Without this, a failed or aborted compile would leave the *previous*
  // successful document.pdf sitting on disk — the code below just reads
  // whatever file is there, so it would silently report stale content as a
  // fresh success instead of surfacing that this compile actually failed.
  await unlink(pdfPath).catch(() => {
    // Fine if it didn't exist yet (first compile ever).
  })

  return new Promise((resolve) => {
    execFile(
      resolvePdflatexPath(),
      ['-interaction=nonstopmode', '-halt-on-error', '-output-directory', COMPILE_DIR, 'document.tex'],
      { cwd: COMPILE_DIR, timeout: COMPILE_TIMEOUT_MS, maxBuffer: COMPILE_MAX_BUFFER_BYTES },
      async (error, stdout, stderr) => {
        if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
          resolve({ success: false, log: 'pdflatex was not found. Install MiKTeX or TeX Live and try again.' })
          return
        }
        // Success is judged by whether a PDF was actually produced, not by the
        // exit code: pdflatex reports failure for recoverable problems that
        // still yield a usable document.
        try {
          const pdf = await readFile(pdfPath)
          resolve({ success: true, pdfBase64: pdf.toString('base64') })
        } catch {
          resolve({ success: false, log: extractErrorSummary(stdout || stderr || String(error)) })
        }
      }
    )
  })
}

// --- Projects (saved to disk, one JSON file each) -----------------------------

/** The document itself is opaque here — it's the renderer's normalized doc
 * tree (see renderer/src/model/types.ts's DocState), which the main process
 * has no need to understand the shape of to just persist and hand back. */
interface ProjectSummary {
  id: string
  title: string
  updatedAt: number
}

interface ProjectRecord extends ProjectSummary {
  doc: unknown
}

const PROJECTS_DIR = join(app.getPath('userData'), 'projects')

function projectFilePath(id: string): string {
  return join(PROJECTS_DIR, `${id}.json`)
}

/** Lightweight metadata for every saved project, newest first — used to
 * populate the home screen's project list without loading every full doc. */
async function listProjects(): Promise<ProjectSummary[]> {
  await mkdir(PROJECTS_DIR, { recursive: true })
  const entries = await readdir(PROJECTS_DIR)

  const summaries: ProjectSummary[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue
    try {
      const record = JSON.parse(await readFile(join(PROJECTS_DIR, entry), 'utf-8')) as ProjectRecord
      summaries.push({ id: record.id, title: record.title, updatedAt: record.updatedAt })
    } catch {
      // A corrupt or half-written file shouldn't take down the whole list —
      // just leave it out.
    }
  }

  summaries.sort((a, b) => b.updatedAt - a.updatedAt)
  return summaries
}

// --- Backups -----------------------------------------------------------------

/**
 * Timestamped copies of each project's file, in backups/<project id>/.
 * Autosave overwrites a project with whatever is in the editor, so a bad
 * in-memory document (a bug, an accidental mass delete) would otherwise
 * replace the only copy. A copy is taken:
 *   - every time a project is opened — the state you last left it in;
 *   - before a save, if the newest copy is over BACKUP_INTERVAL_MS old, so
 *     a long session has checkpoints too;
 *   - before a project is deleted.
 * Only the newest MAX_BACKUPS per project are kept.
 */
const BACKUPS_DIR = join(app.getPath('userData'), 'backups')
const MAX_BACKUPS = 30
const BACKUP_INTERVAL_MS = 10 * 60 * 1000

/** When each project was last backed up this run, to skip the folder
 * listing on every autosave. */
const lastBackupAt = new Map<string, number>()

async function backupProject(id: string): Promise<void> {
  const source = projectFilePath(id)
  if (!existsSync(source)) return
  const dir = join(BACKUPS_DIR, id)
  await mkdir(dir, { recursive: true })
  // ISO time with the separators macOS/Windows dislike swapped out; it still
  // sorts chronologically as text.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  await copyFile(source, join(dir, `${stamp}.json`))
  lastBackupAt.set(id, Date.now())

  const copies = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort()
  for (const old of copies.slice(0, Math.max(0, copies.length - MAX_BACKUPS))) {
    await unlink(join(dir, old)).catch(() => {})
  }
}

async function backupIfStale(id: string): Promise<void> {
  const last = lastBackupAt.get(id)
  if (last !== undefined && Date.now() - last < BACKUP_INTERVAL_MS) return
  await backupProject(id)
}

/** A failed backup must never stop the save, open or delete it guards. */
async function tryBackup(run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (e) {
    console.error('Project backup failed:', e)
  }
}

async function saveProject(id: string, title: string, doc: unknown): Promise<void> {
  await mkdir(PROJECTS_DIR, { recursive: true })
  await tryBackup(() => backupIfStale(id))
  const record: ProjectRecord = { id, title, updatedAt: Date.now(), doc }
  await writeFile(projectFilePath(id), JSON.stringify(record), 'utf-8')
}

async function loadProject(id: string): Promise<ProjectRecord | null> {
  let record: ProjectRecord
  try {
    record = JSON.parse(await readFile(projectFilePath(id), 'utf-8')) as ProjectRecord
  } catch {
    return null
  }
  await tryBackup(() => backupProject(id))
  return record
}

async function deleteProject(id: string): Promise<void> {
  await tryBackup(() => backupProject(id))
  await unlink(projectFilePath(id)).catch(() => {
    // Already gone is fine.
  })
}

// --- IPC ---------------------------------------------------------------------

/**
 * Registered once at startup rather than per window: ipcMain.handle throws on
 * a duplicate channel name, so registering inside createWindow would crash the
 * second time a window is opened (on macOS, reactivating after closing the
 * last one does exactly that).
 */
function registerIpcHandlers(): void {
  // Exports what's currently on screen via Chromium's printer, using the
  // @media print rules in layout.css to hide the editing chrome. This is the
  // WYSIWYG export; the pdflatex path above is the real typeset compile.
  ipcMain.handle('export-pdf', async (event, docTitle: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { canceled: true }

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export to PDF',
      defaultPath: `${docTitle || 'document'}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (canceled || !filePath) return { canceled: true }

    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      landscape: false,
      pageSize: 'Letter'
    })
    await writeFile(filePath, pdf)
    return { canceled: false, filePath }
  })

  ipcMain.handle('compile-latex', (_event, texSource: string): Promise<CompileResult> => compileLatex(texSource))

  ipcMain.handle('list-projects', (): Promise<ProjectSummary[]> => listProjects())
  ipcMain.handle('save-project', (_event, id: string, title: string, doc: unknown): Promise<void> =>
    saveProject(id, title, doc)
  )
  ipcMain.handle('load-project', (_event, id: string): Promise<ProjectRecord | null> => loadProject(id))
  ipcMain.handle('delete-project', (_event, id: string): Promise<void> => deleteProject(id))
}

// --- Window lifecycle --------------------------------------------------------

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    // Shown only once the renderer has painted, so startup doesn't flash an
    // empty frame; backgroundColor matches the app theme for the same reason.
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f0a1e',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // In development electron-vite serves the renderer over HTTP for hot reload;
  // a packaged build loads the built files from disk.
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  // macOS convention: clicking the dock icon with no windows open reopens one.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// macOS convention: the app stays running with no windows open; every other
// platform quits.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
