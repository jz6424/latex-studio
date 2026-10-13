import { useEffect, useState } from 'react'
import { nanoid } from 'nanoid'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import Sidebar from './components/Sidebar'
import Page from './components/Page'
import RenderedPage from './components/RenderedPage'
import SourcePanel from './components/SourcePanel'
import DragPreviewOverlay from './components/DragPreviewOverlay'
import MatrixDimensionsDialog from './components/MatrixDimensionsDialog'
import PlotDialog from './components/PlotDialog'
import { usePlotEditor } from './model/plotEditor'
import HomePage from './components/HomePage'
import { useDocStore } from './model/store'
import type { DocState } from './model/types'
import { nestedAwareCollisionDetection } from './dnd/collision'
import { readDragData, type DragData } from './dnd/dragData'
import { applyDrop, placeMatrix, type PendingMatrixDrop } from './dnd/handleDrop'

/** The home screen (project launcher) versus the actual editor. */
type Screen = 'home' | 'editor'

/** How long to let typing settle before writing a project to disk — avoids
 * a save on every single keystroke. */
const AUTOSAVE_DEBOUNCE_MS = 800

/** "widget" is the editable canvas; "rendered" is a real pdflatex compile of
 * the same document. */
type ViewMode = 'widget' | 'rendered'

/** Export runs through a save dialog in the main process, so it can be
 * cancelled; "done" is a transient confirmation that clears itself. */
type ExportState = 'idle' | 'exporting' | 'done'

const EXPORT_CONFIRMATION_MS = 2200

/** A drag must travel this far before it starts, so clicking a sidebar tool or
 * a drag handle doesn't register as a tiny accidental drag. */
const DRAG_ACTIVATION_DISTANCE_PX = 5

export default function App(): JSX.Element {
  const [screen, setScreen] = useState<Screen>('home')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [dragging, setDragging] = useState<DragData | null>(null)
  const [isOverDropZone, setIsOverDropZone] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('widget')
  const [exportState, setExportState] = useState<ExportState>('idle')
  const [pendingMatrix, setPendingMatrix] = useState<PendingMatrixDrop | null>(null)

  const doc = useDocStore((s) => s.doc)
  const plotEditing = usePlotEditor((s) => s.editing)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE_PX } })
  )

  // Autosaves the open project to disk shortly after any edit, so switching
  // projects (or just closing the app) never loses work — there's no
  // explicit "Save" button anywhere in the editor.
  useEffect(() => {
    if (screen !== 'editor' || !projectId) return
    const timer = setTimeout(() => {
      window.api.saveProject(projectId, doc.title, doc)
    }, AUTOSAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [screen, projectId, doc])

  // The debounce above means an edit made in the last 800ms could still be
  // unsaved at the moment of navigating away — flush immediately rather than
  // let that window get lost when leaving for the home screen.
  function goHome(): void {
    if (projectId) window.api.saveProject(projectId, doc.title, doc)
    setScreen('home')
  }

  function handleDragStart(event: DragStartEvent): void {
    setIsOverDropZone(false)
    setDragging(readDragData(event.active) ?? null)
  }

  function handleDragOver(event: DragOverEvent): void {
    setIsOverDropZone(Boolean(event.over))
  }

  function handleDragEnd(event: DragEndEvent): void {
    setDragging(null)
    setIsOverDropZone(false)
    const pending = applyDrop(event)
    if (pending) setPendingMatrix(pending)
  }

  async function handleExportPdf(): Promise<void> {
    setExportState('exporting')
    try {
      const title = useDocStore.getState().doc.title
      const result = await window.api.exportPdf(title)
      if (result.canceled) {
        setExportState('idle')
        return
      }
      setExportState('done')
      setTimeout(() => setExportState('idle'), EXPORT_CONFIRMATION_MS)
    } catch {
      setExportState('idle')
    }
  }

  if (screen === 'home') {
    return (
      <HomePage
        onCreateProject={() => {
          useDocStore.getState().resetDocument()
          setProjectId(nanoid(10))
          setScreen('editor')
        }}
        onOpenProject={async (id) => {
          const record = await window.api.loadProject(id)
          if (!record) return
          useDocStore.getState().loadDocument(record.doc as DocState)
          setProjectId(id)
          setScreen('editor')
        }}
      />
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={nestedAwareCollisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="app-shell">
        <header className="app-header">
          <button type="button" className="app-brand app-brand-link" onClick={goHome} title="Back to Home">
            <span className="app-logo">∫</span>
            <span className="gradient-text app-brand-text">LaTeX Studio</span>
          </button>

          <div className="view-toggle">
            <ViewToggleButton label="Widgets" mode="widget" current={viewMode} onSelect={setViewMode} />
            <ViewToggleButton label="Rendered" mode="rendered" current={viewMode} onSelect={setViewMode} />
          </div>

          <div className="app-header-actions">
            <button type="button" className="btn" onClick={() => setSourceOpen((open) => !open)}>
              {sourceOpen ? 'Hide Source' : 'View Source'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleExportPdf}
              disabled={exportState === 'exporting'}
            >
              {EXPORT_LABELS[exportState]}
            </button>
          </div>
        </header>

        <div className="app-body">
          {viewMode === 'widget' ? (
            <>
              <Sidebar />
              <Page />
            </>
          ) : (
            <RenderedPage />
          )}
          {sourceOpen && <SourcePanel onClose={() => setSourceOpen(false)} />}
        </div>
      </div>

      <DragPreviewOverlay dragging={dragging} overDropZone={isOverDropZone} />

      {plotEditing && viewMode === 'widget' && (
        <PlotDialog key={plotEditing.blockId} blockId={plotEditing.blockId} isNew={plotEditing.isNew} />
      )}

      {pendingMatrix && (
        <MatrixDimensionsDialog
          onCancel={() => setPendingMatrix(null)}
          onConfirm={(rows, cols) => {
            placeMatrix(pendingMatrix.kind, rows, cols, pendingMatrix.target)
            setPendingMatrix(null)
          }}
        />
      )}
    </DndContext>
  )
}

const EXPORT_LABELS: Record<ExportState, string> = {
  idle: 'Export PDF',
  exporting: 'Exporting…',
  done: 'Saved ✓'
}

function ViewToggleButton({
  label,
  mode,
  current,
  onSelect
}: {
  label: string
  mode: ViewMode
  current: ViewMode
  onSelect: (mode: ViewMode) => void
}): JSX.Element {
  return (
    <button
      type="button"
      className="view-toggle-btn"
      data-active={current === mode || undefined}
      onClick={() => onSelect(mode)}
    >
      {label}
    </button>
  )
}
