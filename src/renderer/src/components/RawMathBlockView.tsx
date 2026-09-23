import { useRef } from 'react'
import { useDocStore } from '../model/store'
import type { Block } from '../model/types'
import { isLikelyToOverflowLine } from '../model/warnings'
import { useAutoGrowTextarea } from '../hooks/useAutoGrowTextarea'
import BlockMenu from './BlockMenu'
import KatexView from './KatexView'
import OverflowWarningBadge from './OverflowWarningBadge'

/** An equation typed as raw LaTeX, with a live KaTeX preview beneath — the
 * escape hatch for anything the widget builder can't express. */
export default function RawMathBlockView({ block }: { block: Extract<Block, { type: 'rawmath' }> }): JSX.Element {
  const updateRawMathBlock = useDocStore((s) => s.updateRawMathBlock)
  const toggleDisplay = useDocStore((s) => s.toggleBlockDisplay)
  const setBlockAlign = useDocStore((s) => s.setBlockAlign)
  const duplicateBlock = useDocStore((s) => s.duplicateBlock)
  const removeBlock = useDocStore((s) => s.removeBlock)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  useAutoGrowTextarea(textareaRef, block.source)

  // Split on explicit line breaks first — someone who's already managing their
  // own \\ breaks (e.g. inside an array or matrix) shouldn't get warned just
  // because the *whole* source is long; only a single unbroken segment matters.
  const hasRiskySegment = block.source.split(/\\\\|\n/).some(isLikelyToOverflowLine)

  return (
    <div className="block block-rawmath">
      <OverflowWarningBadge show={hasRiskySegment} className="overflow-warning-badge-corner" />
      <div className="block-toolbar">
        <BlockMenu
          align={block.align}
          onAlign={(align) => setBlockAlign(block.id, align)}
          display={block.display}
          onToggleDisplay={() => toggleDisplay(block.id)}
          onDuplicate={() => duplicateBlock(block.id)}
          onDelete={() => removeBlock(block.id)}
        />
      </div>
      <textarea
        ref={textareaRef}
        className={`rawmath-input align-${block.align}`}
        value={block.source}
        placeholder="Type raw LaTeX math here, e.g. f(x) = 3x^2 + 1"
        rows={1}
        spellCheck={false}
        onChange={(e) => updateRawMathBlock(block.id, e.target.value)}
      />
      <div className={`block-math-preview align-${block.align}`}>
        <KatexView latex={block.source} display={block.display} />
      </div>
    </div>
  )
}
