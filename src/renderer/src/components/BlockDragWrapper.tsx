import type { ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { blockDragId, blockDropId, type DragData, type DropData } from '../dnd/dragData'

/**
 * Makes a page block reorderable: a hover-revealed handle drags it, and the
 * whole block is a drop target meaning "move the dragged block here".
 *
 * Only the handle starts a drag, not the block body — the body is full of
 * inputs and buttons that need their own pointer events.
 */
export default function BlockDragWrapper({
  blockId,
  children
}: {
  blockId: string
  children: ReactNode
}): JSX.Element {
  const dragData: DragData = { origin: 'block', blockId }
  const dropData: DropData = { origin: 'block', blockId }

  const drag = useDraggable({ id: blockDragId(blockId), data: dragData })
  const drop = useDroppable({ id: blockDropId(blockId), data: dropData })

  return (
    <div className="block-drag-wrapper" ref={drop.setNodeRef} data-over={drop.isOver || undefined}>
      <button
        type="button"
        className="block-drag-handle"
        ref={drag.setNodeRef}
        {...drag.listeners}
        {...drag.attributes}
        aria-label="Drag to reorder"
        title="Drag to reorder"
      />
      {/* Kept mounted (not removed) so the wrapper keeps its natural height —
          just hidden — while the placeholder below visually marks the spot. */}
      <div className="block-drag-content" data-hidden={drag.isDragging || undefined}>
        {children}
      </div>
      {drag.isDragging && <div className="block-drag-placeholder" />}
    </div>
  )
}
