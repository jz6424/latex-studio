import { useDocStore } from '../model/store'
import type { Block, DocState } from '../model/types'
import { proofToLatex, slotToLatex } from '../model/generate'
import { bulletLevelOfList } from '../model/blockTree'
import { listItemLabel } from '../model/lists'
import KatexView from './KatexView'

/** Non-interactive visual snapshot of a block, used as the DragOverlay content
 * so the actual box appears to be picked up and moved, not just a small label. */
export default function BlockPreview({ block }: { block: Block }): JSX.Element {
  const doc = useDocStore((s) => s.doc)
  // Lists have no alignment of their own; their preview reads left to right.
  // A proof's align* centers itself.
  const align = block.type === 'list' ? 'left' : block.type === 'proof' ? 'center' : block.align
  return <div className={`block-drag-preview align-${align}`}>{blockContent(block, doc)}</div>
}

/** Placeholder text stands in for an empty block so the dragged card still has
 * a visible body to grab onto. */
function blockContent(block: Block, doc: DocState): JSX.Element {
  switch (block.type) {
    case 'text':
      return <div className="block-drag-preview-text">{block.text || 'Empty text block'}</div>
    case 'heading':
      return <div className="block-drag-preview-text">{block.text || 'Empty heading'}</div>
    case 'rawmath':
      return <KatexView latex={block.source} display={block.display} />
    case 'math':
      return <KatexView latex={slotToLatex(doc, block.rootSlot)} display={block.display} />
    case 'plot':
      return <div className="block-drag-preview-text">Plot of f(x) = {slotToLatex(doc, block.fnSlot) || '…'}</div>
    case 'circuit':
      return (
        <div className="block-drag-preview-text">
          Logic circuit · {block.gates.length} {block.gates.length === 1 ? 'element' : 'elements'}
        </div>
      )
    case 'proof':
      return <KatexView latex={proofToLatex(doc, block)} display />
    case 'list': {
      const bulletLevel = bulletLevelOfList(doc, block.id)
      if (block.items.length === 0) return <div className="block-drag-preview-text">Empty list</div>
      return (
        <div className="block-drag-preview-list">
          {block.items.map((item, index) => (
            <div className="block-drag-preview-list-item" key={item.id}>
              <span className="list-item-label">{listItemLabel(block.numbering, block.labelFormat, index, bulletLevel)}</span>
              <div>
                {item.blocks.map((id) => {
                  const child = doc.blocksById[id]
                  return child ? <div key={id}>{blockContent(child, doc)}</div> : null
                })}
              </div>
            </div>
          ))}
        </div>
      )
    }
  }
}
