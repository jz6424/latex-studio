import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { nanoid } from 'nanoid'
import type { Align, Block, BlockId, DocState, HeadingLevel, MatrixKind, NodeId, SlotId, ToolId } from './types'
import {
  cloneSlot,
  collectSlotsOfNode,
  createMatrixNode,
  deleteNodeDeep,
  findContainingSlot,
  instantiateTool,
  newSlot
} from './factory'

/**
 * The single source of truth for the document, as an immer-backed zustand
 * store: every action receives a mutable draft and edits it in place, and
 * immer turns that into the immutable update React needs.
 */

function makeInitialDoc(): DocState {
  return { title: 'Untitled Document', blocks: [], blocksById: {}, slots: {}, nodes: {} }
}

interface Store {
  doc: DocState

  setTitle: (title: string) => void
  /** Discards the current document and starts a fresh blank one — used by the
   * home screen's "+ Add New Project". */
  resetDocument: () => void
  /** Replaces the document wholesale with one loaded from disk — used when
   * opening a saved project from the home screen. */
  loadDocument: (doc: DocState) => void

  // Blocks
  addTextBlock: (afterBlockId?: BlockId) => void
  addMathBlock: (display: boolean, afterBlockId?: BlockId) => void
  addRawMathBlock: (display: boolean, afterBlockId?: BlockId) => void
  addHeadingBlock: (level: HeadingLevel, afterBlockId?: BlockId) => void
  removeBlock: (blockId: BlockId) => void
  duplicateBlock: (blockId: BlockId) => void
  moveBlock: (blockId: BlockId, toIndex: number) => void
  updateTextBlock: (blockId: BlockId, text: string) => void
  updateRawMathBlock: (blockId: BlockId, source: string) => void
  updateHeadingBlock: (blockId: BlockId, text: string) => void
  toggleBlockDisplay: (blockId: BlockId) => void
  toggleBlockCollapsed: (blockId: BlockId) => void
  setBlockAlign: (blockId: BlockId, align: Align) => void

  // Math nodes within a block
  dropToolIntoSlot: (toolId: ToolId, slotId: SlotId, index?: number) => void
  /** Places an M×N matrix whose dimensions were already collected at drop
   * time (see handleDrop.ts) — unlike dropToolIntoSlot, the shape isn't
   * something instantiateTool can derive from the tool id alone. */
  dropMatrixIntoSlot: (kind: MatrixKind, rows: number, cols: number, slotId: SlotId, index?: number) => void
  moveNode: (nodeId: NodeId, targetSlot: SlotId, index: number) => void
  removeNode: (nodeId: NodeId) => void
  updateTextNode: (nodeId: NodeId, value: string) => void
  createTextNodeInSlot: (slotId: SlotId, initialValue: string, index?: number) => NodeId
}

export const useDocStore = create<Store>()(
  immer((set) => ({
    doc: makeInitialDoc(),

    setTitle: (title) =>
      set((s) => {
        s.doc.title = title
      }),

    resetDocument: () =>
      set((s) => {
        s.doc = makeInitialDoc()
      }),

    loadDocument: (doc) =>
      set((s) => {
        s.doc = doc
      }),

    // --- Blocks --------------------------------------------------------------

    addTextBlock: (afterBlockId) =>
      set((s) => {
        insertBlock(s.doc, { id: nanoid(8), type: 'text', text: '', align: 'left' }, afterBlockId)
      }),

    addMathBlock: (display, afterBlockId) =>
      set((s) => {
        const rootSlot = newSlot(s.doc)
        const block: Block = {
          id: nanoid(8),
          type: 'math',
          display,
          collapsed: false,
          rootSlot,
          align: 'center'
        }
        insertBlock(s.doc, block, afterBlockId)
      }),

    addRawMathBlock: (display, afterBlockId) =>
      set((s) => {
        insertBlock(s.doc, { id: nanoid(8), type: 'rawmath', source: '', display, align: 'center' }, afterBlockId)
      }),

    addHeadingBlock: (level, afterBlockId) =>
      set((s) => {
        insertBlock(s.doc, { id: nanoid(8), type: 'heading', level, text: '', align: 'left' }, afterBlockId)
      }),

    removeBlock: (blockId) =>
      set((s) => {
        const block = s.doc.blocksById[blockId]
        if (!block) return
        // Only widget-built math owns a node subtree; the other block types
        // hold their content inline and need no extra cleanup.
        if (block.type === 'math') {
          for (const id of s.doc.slots[block.rootSlot] ?? []) deleteNodeDeep(s.doc, id)
          delete s.doc.slots[block.rootSlot]
        }
        delete s.doc.blocksById[blockId]
        s.doc.blocks = s.doc.blocks.filter((id) => id !== blockId)
      }),

    duplicateBlock: (blockId) =>
      set((s) => {
        const block = s.doc.blocksById[blockId]
        if (!block) return
        const id = nanoid(8)
        // A math block's rootSlot must be deep-copied, or the duplicate would
        // share the original's nodes and the two would edit as one.
        const copy: Block =
          block.type === 'math' ? { ...block, id, rootSlot: cloneSlot(s.doc, block.rootSlot) } : { ...block, id }
        insertBlock(s.doc, copy, blockId)
      }),

    moveBlock: (blockId, toIndex) =>
      set((s) => {
        const from = s.doc.blocks.indexOf(blockId)
        if (from === -1) return
        s.doc.blocks.splice(from, 1)
        s.doc.blocks.splice(clampIndex(toIndex, s.doc.blocks), 0, blockId)
      }),

    updateTextBlock: (blockId, text) =>
      set((s) => {
        const block = s.doc.blocksById[blockId]
        if (block?.type === 'text') block.text = text
      }),

    updateRawMathBlock: (blockId, source) =>
      set((s) => {
        const block = s.doc.blocksById[blockId]
        if (block?.type === 'rawmath') block.source = source
      }),

    updateHeadingBlock: (blockId, text) =>
      set((s) => {
        const block = s.doc.blocksById[blockId]
        if (block?.type === 'heading') block.text = text
      }),

    toggleBlockDisplay: (blockId) =>
      set((s) => {
        const block = s.doc.blocksById[blockId]
        if (block?.type === 'math' || block?.type === 'rawmath') block.display = !block.display
      }),

    toggleBlockCollapsed: (blockId) =>
      set((s) => {
        const block = s.doc.blocksById[blockId]
        if (block?.type === 'math') block.collapsed = !block.collapsed
      }),

    setBlockAlign: (blockId, align) =>
      set((s) => {
        const block = s.doc.blocksById[blockId]
        if (block) block.align = align
      }),

    // --- Math nodes ----------------------------------------------------------

    dropToolIntoSlot: (toolId, slotId, index) =>
      set((s) => {
        if (!s.doc.slots[slotId]) return
        const nodeId = instantiateTool(s.doc, toolId)
        const slot = s.doc.slots[slotId]
        // Undefined index means append; see createTextNodeInSlot on why that
        // isn't always the array's true end.
        slot.splice(index === undefined ? slot.length : clampIndex(index, slot), 0, nodeId)
      }),

    dropMatrixIntoSlot: (kind, rows, cols, slotId, index) =>
      set((s) => {
        if (!s.doc.slots[slotId]) return
        const nodeId = createMatrixNode(s.doc, kind, rows, cols)
        const slot = s.doc.slots[slotId]
        slot.splice(index === undefined ? slot.length : clampIndex(index, slot), 0, nodeId)
      }),

    moveNode: (nodeId, targetSlot, index) =>
      set((s) => {
        if (!s.doc.slots[targetSlot]) return
        // A node can't be dropped into a slot it itself owns — that would
        // detach the whole subtree from the document and leak it.
        if (collectAllDescendantSlots(s.doc, nodeId).includes(targetSlot)) return

        const sourceSlot = findContainingSlot(s.doc, nodeId)
        if (sourceSlot) {
          s.doc.slots[sourceSlot] = s.doc.slots[sourceSlot].filter((id) => id !== nodeId)
        }
        const slot = s.doc.slots[targetSlot]
        slot.splice(clampIndex(index, slot), 0, nodeId)
      }),

    removeNode: (nodeId) =>
      set((s) => {
        const slotId = findContainingSlot(s.doc, nodeId)
        if (slotId) s.doc.slots[slotId] = s.doc.slots[slotId].filter((id) => id !== nodeId)
        deleteNodeDeep(s.doc, nodeId)
      }),

    updateTextNode: (nodeId, value) =>
      set((s) => {
        const node = s.doc.nodes[nodeId]
        if (node?.type === 'text') node.value = value
      }),

    createTextNodeInSlot: (slotId, initialValue, index) => {
      // The id is generated up front so it can be returned synchronously —
      // the caller (NewTextCell) needs it to keep editing the node it just
      // created, before any re-render has happened.
      const id = nanoid(8)
      set((s) => {
        const slot = s.doc.slots[slotId]
        if (!slot) return
        s.doc.nodes[id] = { id, type: 'text', value: initialValue }
        // Undefined means "append at the end" — but once a slot is split into
        // multiple visual lines by newline markers, "the end" of a given line
        // is a specific position in the middle of the array (right before its
        // terminating newline), not the array's true end.
        if (index === undefined) slot.push(id)
        else slot.splice(clampIndex(index, slot), 0, id)
      })
      return id
    }
  }))
)

// --- Helpers -----------------------------------------------------------------

/** Keeps a caller-supplied position inside the array's valid insert range,
 * where inserting at `length` (append) is legal but anything beyond isn't. */
function clampIndex(index: number, array: unknown[]): number {
  return Math.max(0, Math.min(index, array.length))
}

/** Registers a block and places it in the page order — directly after
 * `afterBlockId`, or at the end when that is absent or unknown. */
function insertBlock(doc: DocState, block: Block, afterBlockId?: BlockId): void {
  doc.blocksById[block.id] = block
  const after = afterBlockId ? doc.blocks.indexOf(afterBlockId) : -1
  if (after === -1) doc.blocks.push(block.id)
  else doc.blocks.splice(after + 1, 0, block.id)
}

/** Every slot beneath a node, at any depth — used to reject drops that would
 * make a node a descendant of itself. */
function collectAllDescendantSlots(doc: DocState, nodeId: NodeId): SlotId[] {
  const direct = collectSlotsOfNode(doc, nodeId)
  const all = [...direct]
  for (const slotId of direct) {
    for (const childId of doc.slots[slotId] ?? []) {
      all.push(...collectAllDescendantSlots(doc, childId))
    }
  }
  return all
}
