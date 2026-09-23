import { DragOverlay } from '@dnd-kit/core'
import { useDocStore } from '../model/store'
import { ALL_TOOLS } from '../model/tools'
import { nodeToLatex } from '../model/generate'
import type { DocState } from '../model/types'
import type { DragData } from '../dnd/dragData'
import KatexView from './KatexView'
import BlockPreview from './BlockPreview'

interface Props {
  /** What is currently being dragged, or null when nothing is. */
  dragging: DragData | null
  /** Whether the pointer is over a valid drop target — the chip shrinks and
   * fades so the highlighted target underneath stays visible rather than being
   * covered by the thing being dropped onto it. */
  overDropZone: boolean
}

/** The visual that follows the cursor during a drag: a small typeset chip for
 * tools and math nodes, and a full-size card for whole blocks. */
export default function DragPreviewOverlay({ dragging, overDropZone }: Props): JSX.Element {
  const doc = useDocStore((s) => s.doc)
  return <DragOverlay>{dragging && dragPreview(dragging, doc, overDropZone)}</DragOverlay>
}

function dragPreview(drag: DragData, doc: DocState, overDropZone: boolean): JSX.Element | null {
  switch (drag.origin) {
    case 'sidebar': {
      const tool = ALL_TOOLS.find((t) => t.id === drag.toolId)
      return tool ? <Chip latex={tool.latexPreview} shrink={overDropZone} /> : null
    }
    case 'node':
      return <Chip latex={nodeToLatex(doc, drag.nodeId)} shrink={overDropZone} />
    case 'block': {
      const block = doc.blocksById[drag.blockId]
      return block ? <BlockPreview block={block} /> : null
    }
  }
}

function Chip({ latex, shrink }: { latex: string; shrink: boolean }): JSX.Element {
  return (
    <div className="drag-overlay-chip" data-shrink={shrink || undefined}>
      <KatexView latex={latex} />
    </div>
  )
}
