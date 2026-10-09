import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { nanoid } from 'nanoid'
import type {
  Align,
  Block,
  BlockId,
  DocState,
  HeadingLevel,
  ListItem,
  ListItemId,
  ListLabelFormat,
  ListNumbering,
  MatrixKind,
  ProofRelation,
  ProofStep,
  NodeId,
  SlotId,
  ToolId
} from './types'
import {
  collectSlotsOfNode,
  createMatrixNode,
  deleteNodeDeep,
  findContainingSlot,
  instantiateTool,
  newSlot
} from './factory'
import {
  cloneBlockDeep,
  deleteBlockDeep,
  deleteSlotDeep,
  depthAtPlacement,
  insertBlock,
  moveBlock as moveBlockInTree,
  removeBlock as removeBlockFromTree,
  type BlockPlacement
} from './blockTree'
import { defaultListStyle } from './lists'
import { DEFAULT_PROOF_RELATION } from './proofs'

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
  setSubtitle: (subtitle: string) => void
  setTitleOffset: (cm: number) => void
  /** Discards the current document and starts a fresh blank one — used by the
   * home screen's "+ Add New Project". */
  resetDocument: () => void
  /** Replaces the document wholesale with one loaded from disk — used when
   * opening a saved project from the home screen. */
  loadDocument: (doc: DocState) => void

  // Blocks. An omitted placement means the end of the page; see BlockPlacement.
  addTextBlock: (placement?: BlockPlacement) => void
  /** Returns the new block's id, so a drop can fill it in right away — or
   * null if the placement was refused. */
  addMathBlock: (display: boolean, placement?: BlockPlacement) => BlockId | null
  addRawMathBlock: (display: boolean, placement?: BlockPlacement) => void
  addHeadingBlock: (level: HeadingLevel, placement?: BlockPlacement) => void
  removeBlock: (blockId: BlockId) => void
  duplicateBlock: (blockId: BlockId) => void
  moveBlock: (blockId: BlockId, placement?: BlockPlacement) => void
  updateTextBlock: (blockId: BlockId, text: string) => void
  updateRawMathBlock: (blockId: BlockId, source: string) => void
  updateHeadingBlock: (blockId: BlockId, text: string) => void
  toggleBlockDisplay: (blockId: BlockId) => void
  toggleBlockCollapsed: (blockId: BlockId) => void
  setBlockAlign: (blockId: BlockId, align: Align) => void

  // Lists
  /** A new list starts with one item holding an empty text block, and with
   * LaTeX's default label style for the depth it lands at. */
  addListBlock: (placement?: BlockPlacement) => void
  /** Adds an item (with an empty text block) after `afterItemId`, or at the end. */
  addListItem: (listId: BlockId, afterItemId?: ListItemId) => void
  removeListItem: (listId: BlockId, itemId: ListItemId) => void
  /** Shifts an item one place up (-1) or down (+1) within its list. */
  moveListItem: (listId: BlockId, itemId: ListItemId, offset: -1 | 1) => void
  setListStyle: (listId: BlockId, numbering: ListNumbering, labelFormat: ListLabelFormat) => void

  // Proofs
  /** A new proof starts with one step: `[start] ≡ [step]`. */
  addProofBlock: (placement?: BlockPlacement) => void
  /** Adds a step after `afterStepId`, or at the end, using the same relation
   * as the step before it. */
  addProofStep: (proofId: BlockId, afterStepId?: string) => void
  /** Refuses to remove a proof's only step — a proof is at least one line. */
  removeProofStep: (proofId: BlockId, stepId: string) => void
  setProofStepRelation: (proofId: BlockId, stepId: string, relation: ProofRelation) => void
  setProofStepReason: (proofId: BlockId, stepId: string, reason: string) => void

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

    setSubtitle: (subtitle) =>
      set((s) => {
        s.doc.subtitle = subtitle
      }),

    setTitleOffset: (cm) =>
      set((s) => {
        s.doc.titleOffsetCm = cm
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

    addTextBlock: (placement) =>
      set((s) => {
        insertBlock(s.doc, newTextBlock(), placement)
      }),

    addMathBlock: (display, placement) => {
      // Generated up front so it can be returned synchronously, as in
      // createTextNodeInSlot below.
      const id = nanoid(8)
      let placed = false
      set((s) => {
        const rootSlot = newSlot(s.doc)
        const block: Block = { id, type: 'math', display, collapsed: false, rootSlot, align: 'center' }
        placed = insertBlock(s.doc, block, placement)
        if (!placed) delete s.doc.slots[rootSlot]
      })
      return placed ? id : null
    },

    addRawMathBlock: (display, placement) =>
      set((s) => {
        insertBlock(s.doc, { id: nanoid(8), type: 'rawmath', source: '', display, align: 'center' }, placement)
      }),

    addHeadingBlock: (level, placement) =>
      set((s) => {
        insertBlock(s.doc, { id: nanoid(8), type: 'heading', level, text: '', align: 'left' }, placement)
      }),

    removeBlock: (blockId) =>
      set((s) => {
        removeBlockFromTree(s.doc, blockId)
      }),

    duplicateBlock: (blockId) =>
      set((s) => {
        const copyId = cloneBlockDeep(s.doc, blockId)
        if (!copyId) return
        // The copy sits right after its original, in the same container.
        if (!insertBlock(s.doc, s.doc.blocksById[copyId], { afterBlockId: blockId })) deleteBlockDeep(s.doc, copyId)
      }),

    moveBlock: (blockId, placement) =>
      set((s) => {
        moveBlockInTree(s.doc, blockId, placement)
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
        if (block && block.type !== 'list' && block.type !== 'proof') block.align = align
      }),

    // --- Lists ---------------------------------------------------------------

    addListBlock: (placement) =>
      set((s) => {
        const item = newListItem(s.doc)
        const block: Block = {
          id: nanoid(8),
          type: 'list',
          ...defaultListStyle(depthAtPlacement(s.doc, placement) + 1),
          items: [item]
        }
        // The item's text block was registered by newListItem; if the list
        // itself is refused (nested too deep), take it back out.
        if (!insertBlock(s.doc, block, placement)) for (const id of item.blocks) deleteBlockDeep(s.doc, id)
      }),

    addListItem: (listId, afterItemId) =>
      set((s) => {
        const list = s.doc.blocksById[listId]
        if (list?.type !== 'list') return
        const after = afterItemId ? list.items.findIndex((i) => i.id === afterItemId) : -1
        list.items.splice(after === -1 ? list.items.length : after + 1, 0, newListItem(s.doc))
      }),

    removeListItem: (listId, itemId) =>
      set((s) => {
        const list = s.doc.blocksById[listId]
        if (list?.type !== 'list') return
        const index = list.items.findIndex((i) => i.id === itemId)
        if (index === -1) return
        for (const childId of list.items[index].blocks) deleteBlockDeep(s.doc, childId)
        list.items.splice(index, 1)
      }),

    moveListItem: (listId, itemId, offset) =>
      set((s) => {
        const list = s.doc.blocksById[listId]
        if (list?.type !== 'list') return
        const from = list.items.findIndex((i) => i.id === itemId)
        const to = from + offset
        if (from === -1 || to < 0 || to >= list.items.length) return
        const [item] = list.items.splice(from, 1)
        list.items.splice(to, 0, item)
      }),

    setListStyle: (listId, numbering, labelFormat) =>
      set((s) => {
        const list = s.doc.blocksById[listId]
        if (list?.type !== 'list') return
        list.numbering = numbering
        list.labelFormat = labelFormat
      }),

    // --- Proofs --------------------------------------------------------------

    addProofBlock: (placement) =>
      set((s) => {
        const startSlot = newSlot(s.doc)
        const step = newProofStep(s.doc, DEFAULT_PROOF_RELATION)
        const block: Block = { id: nanoid(8), type: 'proof', startSlot, steps: [step] }
        if (!insertBlock(s.doc, block, placement)) {
          deleteSlotDeep(s.doc, startSlot)
          deleteSlotDeep(s.doc, step.slot)
        }
      }),

    addProofStep: (proofId, afterStepId) =>
      set((s) => {
        const proof = s.doc.blocksById[proofId]
        if (proof?.type !== 'proof') return
        const found = afterStepId ? proof.steps.findIndex((st) => st.id === afterStepId) : -1
        const after = found === -1 ? proof.steps.length - 1 : found
        const relation = proof.steps[after]?.relation ?? DEFAULT_PROOF_RELATION
        proof.steps.splice(after + 1, 0, newProofStep(s.doc, relation))
      }),

    removeProofStep: (proofId, stepId) =>
      set((s) => {
        const proof = s.doc.blocksById[proofId]
        if (proof?.type !== 'proof' || proof.steps.length <= 1) return
        const index = proof.steps.findIndex((st) => st.id === stepId)
        if (index === -1) return
        deleteSlotDeep(s.doc, proof.steps[index].slot)
        proof.steps.splice(index, 1)
      }),

    setProofStepRelation: (proofId, stepId, relation) =>
      set((s) => {
        const proof = s.doc.blocksById[proofId]
        if (proof?.type !== 'proof') return
        const step = proof.steps.find((st) => st.id === stepId)
        if (step) step.relation = relation
      }),

    setProofStepReason: (proofId, stepId, reason) =>
      set((s) => {
        const proof = s.doc.blocksById[proofId]
        if (proof?.type !== 'proof') return
        const step = proof.steps.find((st) => st.id === stepId)
        if (step) step.reason = reason
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

function newTextBlock(): Block {
  return { id: nanoid(8), type: 'text', text: '', align: 'left' }
}

/** A fresh list item holding one empty text block, registered in the draft —
 * an item always starts with somewhere to type. */
function newListItem(doc: DocState): ListItem {
  const text = newTextBlock()
  doc.blocksById[text.id] = text
  return { id: nanoid(8), blocks: [text.id] }
}

/** A fresh, empty proof line, with its slot registered in the draft. */
function newProofStep(doc: DocState, relation: ProofRelation): ProofStep {
  return { id: nanoid(8), relation, slot: newSlot(doc), reason: '' }
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
