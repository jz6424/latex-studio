import { useDraggable } from '@dnd-kit/core'
import type { ToolDef } from '../model/types'
import { sidebarToolDragId, type DragData } from '../dnd/dragData'
import KatexView from './KatexView'
import './Sidebar.css'

/** One draggable swatch in the sidebar palette: a KaTeX preview of what the
 * tool produces, plus its name. Dragging it onto a slot creates a new node. */
export default function SidebarTool({ tool }: { tool: ToolDef }): JSX.Element {
  const dragData: DragData = { origin: 'sidebar', toolId: tool.id }
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: sidebarToolDragId(tool.id),
    data: dragData
  })

  return (
    <button
      ref={setNodeRef}
      className="sidebar-tool"
      data-dragging={isDragging || undefined}
      {...listeners}
      {...attributes}
      title={tool.latexPreview}
      type="button"
    >
      <span className="sidebar-tool-preview">
        <KatexView latex={tool.latexPreview} />
      </span>
      <span className="sidebar-tool-label">{tool.label}</span>
    </button>
  )
}
