import { useDocStore } from '../model/store'
import { HEADING_LABELS } from '../model/headings'
import type { Block } from '../model/types'
import BlockMenu from './BlockMenu'

/** A \section/\subsection/\subsubsection heading. The input is styled to look
 * like the finished heading, so a small tag names the level instead. */
export default function HeadingBlockView({ block }: { block: Extract<Block, { type: 'heading' }> }): JSX.Element {
  const updateHeadingBlock = useDocStore((s) => s.updateHeadingBlock)
  const setBlockAlign = useDocStore((s) => s.setBlockAlign)
  const duplicateBlock = useDocStore((s) => s.duplicateBlock)
  const removeBlock = useDocStore((s) => s.removeBlock)
  const label = HEADING_LABELS[block.level]

  return (
    <div className={`block block-heading block-heading-${block.level}`}>
      <div className="block-toolbar">
        <BlockMenu
          align={block.align}
          onAlign={(align) => setBlockAlign(block.id, align)}
          onDuplicate={() => duplicateBlock(block.id)}
          onDelete={() => removeBlock(block.id)}
        />
      </div>
      <span className="heading-level-tag">{label}</span>
      <input
        className={`heading-input align-${block.align}`}
        value={block.text}
        onChange={(e) => updateHeadingBlock(block.id, e.target.value)}
        placeholder={`${label} heading`}
      />
    </div>
  )
}
