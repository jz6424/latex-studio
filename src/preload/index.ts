import { contextBridge, ipcRenderer } from 'electron'

/**
 * The renderer's entire view of the main process, exposed on `window.api`.
 * Kept to explicit named calls rather than a generic `invoke` passthrough, so
 * the renderer can't reach channels this file doesn't list. The matching
 * ambient type lives in renderer/src/global.d.ts.
 */
const api = {
  /** Saves the current window's rendering as a PDF, via a native save dialog.
   * Resolves with `canceled: true` if the dialog is dismissed. */
  exportPdf: (docTitle: string): Promise<{ canceled: boolean; filePath?: string }> =>
    ipcRenderer.invoke('export-pdf', docTitle),

  /** Compiles .tex source with a real pdflatex. On success returns the PDF as
   * base64; on failure, a trimmed error log. */
  compileLatex: (texSource: string): Promise<{ success: boolean; pdfBase64?: string; log?: string }> =>
    ipcRenderer.invoke('compile-latex', texSource),

  /** Metadata for every saved project, newest first — for the home screen's
   * project list. Each project is one JSON file under the app's user data
   * directory, keyed by id. */
  listProjects: (): Promise<{ id: string; title: string; updatedAt: number }[]> =>
    ipcRenderer.invoke('list-projects'),
  /** Writes (or overwrites) a project's saved state. `doc` is the renderer's
   * own document shape — opaque to the main process, just persisted as-is. */
  saveProject: (id: string, title: string, doc: unknown): Promise<void> =>
    ipcRenderer.invoke('save-project', id, title, doc),
  loadProject: (id: string): Promise<{ id: string; title: string; updatedAt: number; doc: unknown } | null> =>
    ipcRenderer.invoke('load-project', id),
  deleteProject: (id: string): Promise<void> => ipcRenderer.invoke('delete-project', id)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
