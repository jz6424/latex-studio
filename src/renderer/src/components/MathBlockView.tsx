import { useDocStore } from '../model/store'
import type { Block } from '../model/types'
import { slotToLatex } from '../model/generate'
import MathSlot from './MathSlot'
import KatexView from './KatexView'
import BlockMenu from './BlockMenu'

/**
 * An equation assembled from widgets: the drag-and-drop builder on top, and a
 * live KaTeX rendering of what it produces below.
 *
 * Collapsing hides the builder and leaves only that rendering, so a finished
 * equation reads as part of the page rather than as an editing surface.
 * Double-clicking a collapsed block reopens it.
 */
export default function MathBlockView({ block }: { block: Extract<Block, { type: 'math' }> }): JSX.Element {
  const toggleDisplay = useDocStore((s) => s.toggleBlockDisplay)
  const toggleCollapsed = useDocStore((s) => s.toggleBlockCollapsed)
  const setBlockAlign = useDocStore((s) => s.setBlockAlign)
  const duplicateBlock = useDocStore((s) => s.duplicateBlock)
  const removeBlock = useDocStore((s) => s.removeBlock)

  const doc = useDocStore((s) => s.doc)
  const latex = slotToLatex(doc, block.rootSlot)
  const { collapsed, display } = block

  const blockClasses = [
    'block',
    'block-math',
    display ? 'block-math-display' : null,
    collapsed ? 'block-math-collapsed' : null
  ].filter(Boolean)

  const previewClasses = [
    'block-math-preview',
    `align-${block.align}`,
    collapsed ? 'block-math-preview-collapsed' : null
  ].filter(Boolean)

  return (
    <div
      className={blockClasses.join(' ')}
      // Only expands; double-clicking an open block would otherwise collapse it
      // mid-edit, since the builder is full of things worth double-clicking.
      onDoubleClick={() => collapsed && toggleCollapsed(block.id)}
    >
      <div className="block-toolbar">
        <button
          type="button"
          className="chip-toggle"
          onClick={() => toggleCollapsed(block.id)}
          title={collapsed ? 'Show the editable equation builder' : 'Minimize to just the typeset output'}
        >
          {collapsed ? '✎ Edit' : '⤡ Minimize'}
        </button>
        <BlockMenu
          align={block.align}
          onAlign={(align) => setBlockAlign(block.id, align)}
          display={display}
          onToggleDisplay={() => toggleDisplay(block.id)}
          onDuplicate={() => duplicateBlock(block.id)}
          onDelete={() => removeBlock(block.id)}
        />
      </div>

      {!collapsed && (
        <div className="block-math-canvas">
          <MathSlot slotId={block.rootSlot} className={`block-root-slot align-${block.align}`} />
        </div>
      )}

      <div className={previewClasses.join(' ')}>
        <KatexView latex={latex} display={display} />
      </div>
    </div>
  )
}
