import { useDroppable } from '@dnd-kit/core'
import { useDocStore } from '../model/store'
import type { MathNode } from '../model/types'
import { nodeDropId, type DropData } from '../dnd/dragData'
import AutoWidthTextInput from './AutoWidthTextInput'
import NodeDeleteButton from './NodeDeleteButton'

/**
 * A text node rendered as a live input, so typed content is edited in place
 * rather than through a separate field.
 *
 * Unlike NodeWrapper this is droppable but deliberately not draggable — a drag
 * gesture starting inside the input would fight with selecting text in it.
 */
export default function EditableTextLeaf({
  nodeId,
  slotId,
  wrap,
  deletable = true
}: {
  nodeId: string
  slotId: string
  /** Passed through to AutoWidthTextInput; see its `wrap` prop. */
  wrap?: boolean
  /** False hides the delete tab — see NodeWrapper's identical prop. */
  deletable?: boolean
}): JSX.Element {
  const value = useDocStore(
    (s) => (s.doc.nodes[nodeId] as Extract<MathNode, { type: 'text' }> | undefined)?.value ?? ''
  )
  const updateTextNode = useDocStore((s) => s.updateTextNode)
  const removeNode = useDocStore((s) => s.removeNode)

  const dropData: DropData = { origin: 'node', nodeId, slotId }
  const drop = useDroppable({ id: nodeDropId(nodeId), data: dropData })

  // A dropped command/symbol/operator (\sin, \cdot, \to, ...) reads as one
  // atomic unit — editing individual characters inside it would corrupt it
  // into something that isn't a valid LaTeX command at all (e.g. "\to"
  // typed into becomes "\tob"). Plain typed prose has no leading backslash
  // and stays freely editable.
  const isCommand = value.trimStart().startsWith('\\')

  return (
    <span
      className="node-wrap node-wrap-text"
      ref={drop.setNodeRef}
      data-over={drop.isOver || undefined}
      data-empty={value === '' || undefined}
      data-deletable={deletable ? undefined : 'false'}
    >
      <AutoWidthTextInput
        className="text-cell"
        value={value}
        wrap={wrap}
        readOnly={isCommand}
        onChange={(e) => updateTextNode(nodeId, e.target.value)}
      />
      {deletable && <NodeDeleteButton onDelete={() => removeNode(nodeId)} />}
    </span>
  )
}
