import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useDocStore } from '../model/store'
import type { DocState, NodeId } from '../model/types'
import { slotDropId, slotLineDropId, type DropData } from '../dnd/dragData'
import EditableTextLeaf from './EditableTextLeaf'
import NewTextCell from './NewTextCell'
import MathNodeView from './MathNodeView'
import NodeWrapper from './NodeWrapper'

/** Stable reference for a missing slot, so the selector below doesn't hand
 * zustand a fresh array on every store change and force a re-render. */
const NO_NODES: NodeId[] = []

interface Props {
  slotId: string
  className?: string
  /** Marks the slot as one that should show a visible placeholder box while it
   * holds no content — a nested slot inside a widget, rather than an equation's
   * top-level canvas. */
  empty?: boolean
  /** Lets leaf text cells in this slot wrap onto multiple lines (a <textarea>)
   * instead of growing sideways forever (a single-line <input>) — meant for
   * prose-holding widgets like Text/Math, not compact inline math slots. */
  wrap?: boolean
  /** Hides every direct child's delete tab — for a slot that's a fixed part
   * of its parent widget's skeleton (e.g. a limit's "x \to a") rather than
   * freely-added content. Still droppable/typeable either way. */
  locked?: boolean
}

/**
 * Renders one slot: the horizontal run of nodes that is the app's only drop
 * target for math content.
 *
 * A slot containing newline nodes is drawn as several stacked line boxes, each
 * separately droppable, so content can be aimed at a specific line. Everything
 * still lives in one flat array in the model — the split is purely visual, and
 * `insertIndex` is what translates a line back to a position in that array.
 */
export default function MathSlot({ slotId, className, empty, wrap, locked }: Props): JSX.Element {
  const nodeIds = useDocStore((s) => s.doc.slots[slotId] ?? NO_NODES)
  const nodesById = useDocStore((s) => s.doc.nodes)
  const lines = splitIntoLines(nodeIds, nodesById)

  if (lines.length === 1) {
    const classes = [
      'math-slot',
      className,
      empty ? 'math-slot-empty' : null,
      wrap ? 'math-slot-wrap' : null
    ].filter(Boolean)
    return (
      <SlotBox
        slotId={slotId}
        ids={nodeIds}
        droppableId={slotDropId(slotId)}
        wrap={wrap}
        locked={locked}
        className={classes.join(' ')}
      />
    )
  }

  return (
    <span className={`math-slot-lines${className ? ` ${className}` : ''}`}>
      {lines.map((line, i) => (
        <span className="math-slot-line-row" key={i}>
          <SlotBox
            slotId={slotId}
            ids={line.ids}
            insertIndex={line.insertIndex}
            droppableId={slotLineDropId(slotId, i)}
            wrap={wrap}
            locked={locked}
            className={`math-slot math-slot-line${wrap ? ' math-slot-wrap' : ''}`}
          />
          {line.newlineId && <NewlineDivider nodeId={line.newlineId} slotId={slotId} />}
        </span>
      ))}
    </span>
  )
}

interface SlotLine {
  ids: NodeId[]
  /** Where new content typed at the end of this line should be inserted in the
   * slot's flat array: the terminating newline's own position, so the content
   * lands just before the break. Undefined on the final line, which has no
   * terminating newline and so appends at the array's true end. */
  insertIndex?: number
  /** The newline node that ends this line, if any — rendered as a divider. */
  newlineId?: NodeId
}

/** Groups a slot's flat node list into visual lines, breaking at each newline
 * node. Always returns at least one line, so a slot with no newlines comes
 * back as a single line holding everything. */
function splitIntoLines(nodeIds: NodeId[], nodesById: DocState['nodes']): SlotLine[] {
  const lines: SlotLine[] = []
  let current: NodeId[] = []

  nodeIds.forEach((id, index) => {
    if (nodesById[id]?.type === 'newline') {
      lines.push({ ids: current, insertIndex: index, newlineId: id })
      current = []
    } else {
      current.push(id)
    }
  })
  lines.push({ ids: current })

  return lines
}

/** One droppable, typeable sequence of nodes — either a whole (non-split) slot,
 * or a single line within a newline-split one. */
function SlotBox({
  slotId,
  ids,
  insertIndex,
  droppableId,
  className,
  wrap,
  locked
}: {
  slotId: string
  ids: NodeId[]
  insertIndex?: number
  droppableId: string
  className: string
  wrap?: boolean
  locked?: boolean
}): JSX.Element {
  const dropData: DropData = { origin: 'slot', slotId, insertIndex }
  const drop = useDroppable({ id: droppableId, data: dropData })

  // While the trailing "type here" cell is actively editing a freshly-created
  // node, that node must not also be rendered through the normal per-node list
  // below — otherwise its value shows up twice until the cell blurs.
  const [trailingId, setTrailingId] = useState<string | null>(null)
  const visibleIds = trailingId ? ids.filter((id) => id !== trailingId) : ids

  // The trailing cell is only needed to start something new: when the slot is
  // empty, or when the last item is a symbol/command (its own input can't
  // safely be extended by typing — that would corrupt e.g. "\to" into "\tob").
  // Ordinary typed text already has its own live input, so once a slot ends
  // with plain prose there's no need for a second place to type — clicking
  // back into that text keeps extending it.
  const lastValue = useDocStore((s) => {
    const lastId = visibleIds[visibleIds.length - 1]
    const node = lastId ? s.doc.nodes[lastId] : undefined
    return node?.type === 'text' ? node.value : null
  })
  const endsWithPlainProse = lastValue !== null && !lastValue.trimStart().startsWith('\\')
  const showTrailingCell = trailingId !== null || visibleIds.length === 0 || !endsWithPlainProse

  return (
    <span ref={drop.setNodeRef} className={className} data-over={drop.isOver || undefined}>
      {visibleIds.map((nodeId) => (
        <SlotNode key={nodeId} nodeId={nodeId} slotId={slotId} wrap={wrap} locked={locked} />
      ))}
      {showTrailingCell && (
        <NewTextCell
          slotId={slotId}
          trailingId={trailingId}
          setTrailingId={setTrailingId}
          wrap={wrap}
          insertIndex={insertIndex}
        />
      )}
    </span>
  )
}

/** Dispatches a node to its editor: text leaves are inline inputs, everything
 * else is a structural widget. */
function SlotNode({
  nodeId,
  slotId,
  wrap,
  locked
}: {
  nodeId: string
  slotId: string
  wrap?: boolean
  locked?: boolean
}): JSX.Element | null {
  const node = useDocStore((s) => s.doc.nodes[nodeId])
  if (!node) return null
  if (node.type === 'text') return <EditableTextLeaf nodeId={nodeId} slotId={slotId} wrap={wrap} deletable={!locked} />
  return <MathNodeView nodeId={nodeId} slotId={slotId} deletable={!locked} />
}

/** The visible marker for a newline node, sitting between two line boxes.
 * Wrapped like any other node so it can be dragged and deleted. */
function NewlineDivider({ nodeId, slotId }: { nodeId: string; slotId: string }): JSX.Element {
  return (
    <NodeWrapper nodeId={nodeId} slotId={slotId} className="newline-divider">
      <span className="newline-divider-label">↵ New Line</span>
    </NodeWrapper>
  )
}
