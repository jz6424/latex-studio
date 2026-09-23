import type { ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { useDocStore } from '../model/store'
import { nodeDropId, type DragData, type DropData } from '../dnd/dragData'
import NodeDeleteButton from './NodeDeleteButton'

interface Props {
  nodeId: string
  /** The slot holding this node — carried in the drag payload so a drop knows
   * where the node came from and where a sibling drop should land. */
  slotId: string
  children: ReactNode
  className?: string
  /** False hides the delete tab — for a node that's a fixed part of its
   * parent widget's skeleton (e.g. the \to inside a limit) rather than
   * freely-added content. Still draggable and droppable either way. */
  deletable?: boolean
}

/**
 * Wraps a structural math widget to make it draggable, droppable, and
 * deletable. It is both at once: dragging it moves the whole subtree, while
 * dropping onto it inserts at its position within the parent slot.
 *
 * Text leaves use EditableTextLeaf instead — they must stay droppable but not
 * draggable, since dragging would fight with selecting text inside the input.
 */
export default function NodeWrapper({ nodeId, slotId, children, className, deletable = true }: Props): JSX.Element {
  const removeNode = useDocStore((s) => s.removeNode)
  const dragData: DragData = { origin: 'node', nodeId, slotId }
  const dropData: DropData = { origin: 'node', nodeId, slotId }

  const drag = useDraggable({ id: nodeId, data: dragData })
  const drop = useDroppable({ id: nodeDropId(nodeId), data: dropData })

  // One element serves as both drag source and drop target, so both refs point
  // at it.
  const setRefs = (el: HTMLElement | null): void => {
    drag.setNodeRef(el)
    drop.setNodeRef(el)
  }

  return (
    <span
      ref={setRefs}
      className={`node-wrap${className ? ` ${className}` : ''}`}
      data-dragging={drag.isDragging || undefined}
      data-over={drop.isOver || undefined}
      data-deletable={deletable ? undefined : 'false'}
      data-draggable
      {...drag.listeners}
      {...drag.attributes}
    >
      {children}
      {deletable && <NodeDeleteButton onDelete={() => removeNode(nodeId)} />}
    </span>
  )
}
