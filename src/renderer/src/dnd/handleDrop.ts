import type { DragEndEvent } from '@dnd-kit/core'
import { useDocStore } from '../model/store'
import type { BlockId, DocState, MatrixKind, SlotId, ToolId } from '../model/types'
import { readDragData, readDropData, type DragData, type DropData } from './dragData'

/** An M×N matrix drop that's waiting on the user to answer a dimensions
 * dialog before anything is actually created — see MatrixDimensionsDialog. */
export interface PendingMatrixDrop {
  kind: MatrixKind
  target: DropData
}

/**
 * Everything that happens when a drag is released.
 *
 * This lives outside App as plain functions over the store rather than React
 * state: a drop is a one-shot command against the document, and nothing here
 * needs to re-run on render. `useDocStore.getState()` reads the latest document
 * directly, which matters because a couple of steps below act on state that an
 * earlier step in the same drop has only just created.
 *
 * Returns a pending matrix request when the drop needs a dimensions dialog
 * first — Electron doesn't implement window.prompt(), so that has to be a
 * real React modal (rendered by App) rather than something resolved
 * synchronously in here. Every other kind of drop is handled inline and
 * returns nothing.
 */
export function applyDrop(event: DragEndEvent): PendingMatrixDrop | undefined {
  const { active, over } = event
  if (!over) return undefined

  const dragged = readDragData(active)
  const target = readDropData(over)
  if (!dragged || !target) return undefined

  if (dragged.origin === 'block') {
    reorderBlock(dragged.blockId, target)
    return undefined
  }
  if (dragged.origin === 'sidebar' && isMatrixNTool(dragged.toolId)) {
    return { kind: dragged.toolId === 'pmatrixN' ? 'pmatrix' : 'bmatrix', target }
  }
  if (target.origin === 'page') {
    startNewEquation(dragged)
    return undefined
  }
  insertIntoSlot(dragged, target)
  return undefined
}

function isMatrixNTool(toolId: ToolId): toolId is 'pmatrixN' | 'bmatrixN' {
  return toolId === 'pmatrixN' || toolId === 'bmatrixN'
}

/** Places a matrix of an explicit shape wherever a PendingMatrixDrop's tool
 * was originally dropped — the empty area below the document (a new
 * equation), an existing slot, or beside an existing node. Called once the
 * dimensions dialog is confirmed; nothing was created before this point, so
 * cancelling the dialog just discards the pending request untouched. */
export function placeMatrix(kind: MatrixKind, rows: number, cols: number, target: DropData): void {
  const store = useDocStore.getState()

  if (target.origin === 'page') {
    store.addMathBlock(true)
    // Re-read: the block created above only exists in the store's next state.
    const doc = useDocStore.getState().doc
    const newBlock = doc.blocksById[doc.blocks[doc.blocks.length - 1]]
    if (newBlock?.type === 'math') store.dropMatrixIntoSlot(kind, rows, cols, newBlock.rootSlot)
    return
  }

  const destination = resolveDestination(target, store.doc.slots)
  if (!destination) return
  store.dropMatrixIntoSlot(kind, rows, cols, destination.slotId, destination.index)
}

/** Moves a block to the position of whatever it was dropped on, or to the end
 * of the document when dropped on the empty area past the last block. */
function reorderBlock(blockId: BlockId, target: DropData): void {
  const store = useDocStore.getState()

  if (target.origin === 'page') {
    store.moveBlock(blockId, store.doc.blocks.length)
    return
  }
  // Dropping a block on itself is a no-op, not a move to index 0.
  if (target.origin !== 'block' || target.blockId === blockId) return

  const targetIndex = store.doc.blocks.indexOf(target.blockId)
  if (targetIndex !== -1) store.moveBlock(blockId, targetIndex)
}

/** A sidebar tool dropped on the empty area below the document creates a
 * display equation and lands inside it, so starting a new equation takes one
 * gesture instead of "add a block, then drag into it". Dragging an existing
 * node there does nothing — it is already placed somewhere. */
function startNewEquation(dragged: DragData): void {
  if (dragged.origin !== 'sidebar') return

  const store = useDocStore.getState()
  store.addMathBlock(true)

  // Re-read: the block created above only exists in the store's next state.
  const doc = useDocStore.getState().doc
  const newBlock = doc.blocksById[doc.blocks[doc.blocks.length - 1]]
  if (newBlock?.type === 'math') store.dropToolIntoSlot(dragged.toolId, newBlock.rootSlot)
}

/** Places a tool or an existing node into a slot, at the position implied by
 * whatever it was dropped on. */
function insertIntoSlot(dragged: DragData, target: DropData): void {
  const store = useDocStore.getState()
  const destination = resolveDestination(target, store.doc.slots)
  if (!destination) return

  const { slotId, index } = destination

  if (dragged.origin === 'sidebar') {
    store.dropToolIntoSlot(dragged.toolId, slotId, index)
    return
  }
  if (dragged.origin === 'node') {
    // Dropping a node onto itself would remove and reinsert it at its own
    // index — visually a no-op, but it still churns the document.
    if (target.origin === 'node' && target.nodeId === dragged.nodeId) return
    store.moveNode(dragged.nodeId, slotId, index ?? store.doc.slots[slotId]?.length ?? 0)
  }
}

/** Translates a drop target into a slot plus an insert position. An undefined
 * index means "append to this line", which is not always the underlying
 * array's end — see MathSlot on newline-split slots. */
function resolveDestination(
  target: DropData,
  slots: DocState['slots']
): { slotId: SlotId; index?: number } | null {
  if (target.origin === 'slot') {
    // Only set when the target is one visual "line" within a multi-line slot.
    return { slotId: target.slotId, index: target.insertIndex }
  }
  if (target.origin === 'node') {
    // Insert at the hovered node's position, pushing it to the right.
    const index = slots[target.slotId]?.indexOf(target.nodeId) ?? -1
    return { slotId: target.slotId, index: index >= 0 ? index : undefined }
  }
  return null
}
