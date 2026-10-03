import { useDroppable } from '@dnd-kit/core'
import { useDocStore } from '../model/store'
import { PAGE_END_DROP_ID, type DropData } from '../dnd/dragData'
import { DraggableBlock } from './BlockView'

/** The editable document: every block in order, plus the drop zone below them
 * that turns a dropped tool into a new equation. */
export default function Page(): JSX.Element {
  const blocks = useDocStore((s) => s.doc.blocks)
  const blocksById = useDocStore((s) => s.doc.blocksById)
  const addTextBlock = useDocStore((s) => s.addTextBlock)
  const addMathBlock = useDocStore((s) => s.addMathBlock)
  const addListBlock = useDocStore((s) => s.addListBlock)

  const pageEndDropData: DropData = { origin: 'page' }
  const pageEnd = useDroppable({ id: PAGE_END_DROP_ID, data: pageEndDropData })

  return (
    <div className="page-viewport">
      <div className="paper" id="paper-root">
        <div className="paper-body">
          {blocks.map((blockId) => {
            const block = blocksById[blockId]
            return block ? <DraggableBlock block={block} key={block.id} /> : null
          })}
          <div ref={pageEnd.setNodeRef} className="page-end-drop" data-over={pageEnd.isOver || undefined}>
            Drop a tool here to start a new equation
          </div>
        </div>
      </div>
      <div className="page-add-row">
        <button type="button" className="btn" onClick={() => addTextBlock()}>
          + Text
        </button>
        <button type="button" className="btn" onClick={() => addMathBlock(true)}>
          + Equation (display)
        </button>
        <button type="button" className="btn" onClick={() => addMathBlock(false)}>
          + Equation (inline)
        </button>
        <button type="button" className="btn" onClick={() => addListBlock()}>
          + List
        </button>
      </div>
    </div>
  )
}
