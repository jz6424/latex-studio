import { useDocStore } from '../model/store'
import type { Block, DocState } from '../model/types'
import { slotToLatex } from '../model/generate'
import KatexView from './KatexView'

/** Non-interactive visual snapshot of a block, used as the DragOverlay content
 * so the actual box appears to be picked up and moved, not just a small label. */
export default function BlockPreview({ block }: { block: Block }): JSX.Element {
  const doc = useDocStore((s) => s.doc)
  return <div className={`block-drag-preview align-${block.align}`}>{blockContent(block, doc)}</div>
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
  }
}
