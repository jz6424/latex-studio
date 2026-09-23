import { useRef } from 'react'
import { useDocStore } from '../model/store'
import type { Block } from '../model/types'
import { useAutoGrowTextarea } from '../hooks/useAutoGrowTextarea'
import BlockMenu from './BlockMenu'

/** A plain prose paragraph. The only block whose text wraps naturally when
 * compiled, which is why the overflow warnings elsewhere point back to it. */
export default function TextBlockView({ block }: { block: Extract<Block, { type: 'text' }> }): JSX.Element {
  const updateTextBlock = useDocStore((s) => s.updateTextBlock)
  const removeBlock = useDocStore((s) => s.removeBlock)
  const setBlockAlign = useDocStore((s) => s.setBlockAlign)
  const duplicateBlock = useDocStore((s) => s.duplicateBlock)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useAutoGrowTextarea(textareaRef, block.text)

  return (
    <div className="block block-text">
      <div className="block-toolbar">
        <BlockMenu
          align={block.align}
          onAlign={(align) => setBlockAlign(block.id, align)}
          onDuplicate={() => duplicateBlock(block.id)}
          onDelete={() => removeBlock(block.id)}
        />
      </div>
      <textarea
        ref={textareaRef}
        className={`block-textarea align-${block.align}`}
        value={block.text}
        placeholder="Write some text…"
        rows={1}
        onChange={(e) => updateTextBlock(block.id, e.target.value)}
      />
    </div>
  )
}
