import TextBlockView from './TextBlockView'
import MathBlockView from './MathBlockView'
import RawMathBlockView from './RawMathBlockView'
import HeadingBlockView from './HeadingBlockView'
import ListBlockView from './ListBlockView'
import ProofBlockView from './ProofBlockView'
import CircuitBlockView from './CircuitBlockView'
import PlotBlockView from './PlotBlockView'
import BlockDragWrapper from './BlockDragWrapper'
import type { Block } from '../model/types'

/** Picks the editor for a block's type. Shared by the page and by list items,
 * which hold blocks of their own. */
export default function BlockView({ block }: { block: Block }): JSX.Element {
  switch (block.type) {
    case 'text':
      return <TextBlockView block={block} />
    case 'rawmath':
      return <RawMathBlockView block={block} />
    case 'math':
      return <MathBlockView block={block} />
    case 'heading':
      return <HeadingBlockView block={block} />
    case 'list':
      return <ListBlockView block={block} />
    case 'proof':
      return <ProofBlockView block={block} />
    case 'circuit':
      return <CircuitBlockView block={block} />
    case 'plot':
      return <PlotBlockView block={block} />
  }
}

/** A block plus its drag handle — one entry in the page or in a list item. */
export function DraggableBlock({ block }: { block: Block }): JSX.Element {
  return (
    <BlockDragWrapper blockId={block.id}>
      <BlockView block={block} />
    </BlockDragWrapper>
  )
}
