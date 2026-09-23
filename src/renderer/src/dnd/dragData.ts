import type { Active, Over } from '@dnd-kit/core'
import type { BlockId, NodeId, SlotId, ToolId } from '../model/types'

/**
 * Every drag-and-drop payload in the app, in one place.
 *
 * dnd-kit types `data.current` as an untyped bag, so each consumer used to
 * re-declare the shape it expected as an inline cast — which meant the
 * producer (a `useDraggable`/`useDroppable` call in some component) and the
 * consumer (App's drag handlers) could drift apart with nothing to catch it.
 * Declaring the unions here once makes both sides check against the same
 * definition, and keeps the droppable id formats next to the data they carry.
 */

/** What is being picked up. */
export type DragData =
  /** A tool template from the sidebar; dropping it creates a fresh node. */
  | { origin: 'sidebar'; toolId: ToolId }
  /** An existing math node being moved between slots. */
  | { origin: 'node'; nodeId: NodeId; slotId: SlotId }
  /** A whole page block being reordered. */
  | { origin: 'block'; blockId: BlockId }

/** What is being dropped onto. */
export type DropData =
  /** A slot, or one visual line within a newline-split slot (see MathSlot). */
  | { origin: 'slot'; slotId: SlotId; insertIndex?: number }
  /** A node, meaning "insert at this node's position". */
  | { origin: 'node'; nodeId: NodeId; slotId: SlotId }
  /** The empty area below the last block. */
  | { origin: 'page' }
  /** A block, meaning "move the dragged block to this block's position". */
  | { origin: 'block'; blockId: BlockId }

// --- Droppable/draggable ids -------------------------------------------------
// Ids must be unique across the whole DndContext, so each kind of target gets
// its own prefix. Only PAGE_END_DROP_ID is ever compared against directly; the
// rest are built here purely so the format lives in one file.

export const PAGE_END_DROP_ID = 'page-end'

export const sidebarToolDragId = (toolId: ToolId): string => `sidebar:${toolId}`
export const blockDragId = (blockId: BlockId): string => `block:${blockId}`
export const blockDropId = (blockId: BlockId): string => `blockover:${blockId}`
export const nodeDropId = (nodeId: NodeId): string => `nodeover:${nodeId}`
export const slotDropId = (slotId: SlotId): string => `slot:${slotId}`
export const slotLineDropId = (slotId: SlotId, lineIndex: number): string =>
  `slot:${slotId}:line:${lineIndex}`

/** Reads the typed payload off a dnd-kit active/over object, if it has one. */
export function readDragData(active: Active): DragData | undefined {
  return active.data.current as DragData | undefined
}

export function readDropData(over: Over): DropData | undefined {
  return over.data.current as DropData | undefined
}
