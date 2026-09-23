import { nanoid } from 'nanoid'
import type { BigOp, DocState, MathNode, MatrixKind, NodeId, SlotId, ToolId } from './types'

/**
 * Construction, cloning, and deletion of math subtrees.
 *
 * Every function here mutates a `draft` — an immer draft of DocState owned by
 * the store, never live state — and returns the id of whatever it registered.
 */

const newId = (): string => nanoid(8)

export function newSlot(draft: DocState): SlotId {
  const id = newId()
  draft.slots[id] = []
  return id
}

function addNode(draft: DocState, node: MathNode): NodeId {
  draft.nodes[node.id] = node
  return node.id
}

/** `count` fresh empty slots, for widgets that need several at once. */
function newSlots(draft: DocState, count: number): SlotId[] {
  return Array.from({ length: count }, () => newSlot(draft))
}

function newMatrixRows(draft: DocState, rows: number, cols: number): SlotId[][] {
  return Array.from({ length: rows }, () => newSlots(draft, cols))
}

/** Creates a matrix node of an explicit shape and registers it in the draft.
 * Shared by the fixed-size sidebar tools (see MATRIX_SHAPES below) and by
 * the M×N tools, whose dimensions aren't known until drop time — see
 * dropMatrixIntoSlot in store.ts. */
export function createMatrixNode(
  draft: DocState,
  kind: MatrixKind,
  rows: number,
  cols: number,
  id: NodeId = newId()
): NodeId {
  return addNode(draft, { id, type: 'matrix', kind, rows: newMatrixRows(draft, rows, cols) })
}

// --- Tool templates ----------------------------------------------------------
// Tools whose only difference is a couple of constants live in these tables
// rather than as near-identical switch cases below.

/** Auto-sized delimiter pairs, as they appear after `\left` / `\right`. */
const GROUP_DELIMITERS: Record<string, { open: string; close: string }> = {
  paren: { open: '(', close: ')' },
  bracket: { open: '[', close: ']' },
  brace: { open: '\\{', close: '\\}' },
  abs: { open: '|', close: '|' }
}

const MATRIX_SHAPES: Record<string, { kind: MatrixKind; rows: number; cols: number }> = {
  pmatrix2: { kind: 'pmatrix', rows: 2, cols: 2 },
  bmatrix2: { kind: 'bmatrix', rows: 2, cols: 2 }
}

/** Big operators that take both a lower and an upper limit. `lim` is absent on
 * purpose — it only takes a subscript, and is handled separately below. */
const LIMIT_BEARING_BIGOPS: BigOp[] = ['sum', 'prod', 'int', 'oint']

/** Which script slots each script tool starts with. A null slot is how the
 * model records "this script isn't present", as distinct from "it's empty". */
const SCRIPT_SHAPES: Record<string, { sup: boolean; sub: boolean }> = {
  sup: { sup: true, sub: false },
  sub: { sup: false, sub: true },
  supsub: { sup: true, sub: true }
}

/** Splits `sym:\alpha` into `['sym', '\alpha']`. Only the first colon
 * separates, since the payload itself may contain one. */
function splitToolId(toolId: string): [prefix: string, payload: string] {
  const colon = toolId.indexOf(':')
  return colon === -1 ? [toolId, ''] : [toolId.slice(0, colon), toolId.slice(colon + 1)]
}

/** Creates the node subtree for a sidebar tool and registers it in the draft.
 * Returns the new top-level node id. */
export function instantiateTool(draft: DocState, toolId: ToolId): NodeId {
  const id = newId()
  const [prefix, payload] = splitToolId(toolId)

  // Parameterized tool families: the id itself carries the LaTeX, so adding a
  // new symbol or command needs no change here (see ToolId in types.ts).
  switch (prefix) {
    case 'sym':
    case 'fn':
      return addNode(draft, { id, type: 'text', value: payload })
    case 'cmddecl':
    case 'cmdfn':
      return addNode(draft, {
        id,
        type: 'cmdrun',
        cmd: payload,
        declare: prefix === 'cmddecl',
        slot: newSlot(draft)
      })
  }

  const scripts = SCRIPT_SHAPES[toolId]
  if (scripts) {
    return addNode(draft, {
      id,
      type: 'supsub',
      baseSlot: newSlot(draft),
      supSlot: scripts.sup ? newSlot(draft) : null,
      subSlot: scripts.sub ? newSlot(draft) : null
    })
  }

  if (LIMIT_BEARING_BIGOPS.includes(toolId as BigOp)) {
    return addNode(draft, {
      id,
      type: 'bigop',
      op: toolId as BigOp,
      subSlot: newSlot(draft),
      supSlot: newSlot(draft)
    })
  }

  const delimiters = GROUP_DELIMITERS[toolId]
  if (delimiters) {
    return addNode(draft, { id, type: 'group', ...delimiters, slot: newSlot(draft) })
  }

  const matrix = MATRIX_SHAPES[toolId]
  if (matrix) {
    return createMatrixNode(draft, matrix.kind, matrix.rows, matrix.cols, id)
  }

  switch (toolId) {
    case 'frac':
      return addNode(draft, { id, type: 'frac', numSlot: newSlot(draft), denSlot: newSlot(draft) })
    case 'sqrt':
      return addNode(draft, { id, type: 'sqrt', indexSlot: null, radSlot: newSlot(draft) })
    case 'nthroot':
      return addNode(draft, { id, type: 'sqrt', indexSlot: newSlot(draft), radSlot: newSlot(draft) })
    case 'lim': {
      // Pre-seeded with an arrow because a limit's subscript is almost always
      // of the form `x \to a`, and the arrow is fiddly to reach otherwise.
      // The arrow is read-only (see EditableTextLeaf) since typing into it
      // would corrupt it, so an empty text cell goes on each side of it —
      // the only way to fill in "x" and "a", since the slot's normal
      // trailing cell only ever appends after the last item, and only while
      // that last item isn't already plain text.
      const subSlot = newSlot(draft)
      const varId = addNode(draft, { id: newId(), type: 'text', value: '' })
      const arrowId = addNode(draft, { id: newId(), type: 'text', value: '\\to' })
      const targetId = addNode(draft, { id: newId(), type: 'text', value: '' })
      draft.slots[subSlot].push(varId, arrowId, targetId)
      return addNode(draft, { id, type: 'bigop', op: 'lim', subSlot, supSlot: null })
    }
    case 'text':
      return addNode(draft, { id, type: 'textrun', slot: newSlot(draft) })
    case 'math':
      return addNode(draft, { id, type: 'mathrun', slot: newSlot(draft) })
    case 'newline':
      return addNode(draft, { id, type: 'newline' })
    default:
      // Unrecognized tool id: an empty text leaf is inert and immediately
      // typeable, so a stale id degrades to a blank cell rather than nothing.
      return addNode(draft, { id, type: 'text', value: '' })
  }
}

// --- Traversal ---------------------------------------------------------------

const compact = (slots: (SlotId | null)[]): SlotId[] => slots.filter((s): s is SlotId => s !== null)

/** Every slot id a node owns directly. Null script/index slots are dropped —
 * they mean the script isn't present at all. */
export function collectSlotsOfNode(draft: DocState, nodeId: NodeId): SlotId[] {
  const node = draft.nodes[nodeId]
  if (!node) return []

  switch (node.type) {
    case 'text':
    case 'newline':
      return []
    case 'frac':
      return [node.numSlot, node.denSlot]
    case 'sqrt':
      return compact([node.radSlot, node.indexSlot])
    case 'supsub':
      return compact([node.baseSlot, node.supSlot, node.subSlot])
    case 'bigop':
      return compact([node.subSlot, node.supSlot])
    case 'group':
    case 'textrun':
    case 'mathrun':
    case 'cmdrun':
      return [node.slot]
    case 'matrix':
      return node.rows.flat()
  }
}

/** Recursively removes a node and everything it owns (nested slots and their
 * nodes) from the draft. Does not unlink the node from its containing slot —
 * see the store's `removeNode` for that. */
export function deleteNodeDeep(draft: DocState, nodeId: NodeId): void {
  for (const slotId of collectSlotsOfNode(draft, nodeId)) {
    for (const childId of draft.slots[slotId] ?? []) deleteNodeDeep(draft, childId)
    delete draft.slots[slotId]
  }
  delete draft.nodes[nodeId]
}

/** The slot currently holding a node, or null if it isn't placed anywhere.
 * Slots are stored flat with no parent pointers, so this is a scan. */
export function findContainingSlot(draft: DocState, nodeId: NodeId): SlotId | null {
  for (const [slotId, ids] of Object.entries(draft.slots)) {
    if (ids.includes(nodeId)) return slotId
  }
  return null
}

// --- Cloning -----------------------------------------------------------------

/** Deep-clones a slot's whole node subtree under fresh ids and registers it in
 * the draft. */
export function cloneSlot(draft: DocState, sourceSlotId: SlotId): SlotId {
  const newSlotId = newSlot(draft)
  for (const nodeId of draft.slots[sourceSlotId] ?? []) {
    const clonedId = cloneNode(draft, nodeId)
    // Skip dangling references instead of copying them forward — pushing an id
    // with no node behind it would leave the clone permanently broken.
    if (clonedId) draft.slots[newSlotId].push(clonedId)
  }
  return newSlotId
}

/** Deep-clones a single node (and any child slots it owns) under fresh ids and
 * registers it in the draft. Returns null if the source node doesn't exist. */
export function cloneNode(draft: DocState, sourceNodeId: NodeId): NodeId | null {
  const source = draft.nodes[sourceNodeId]
  if (!source) return null

  const id = newId()
  // Clones a slot, passing null through for scripts that aren't present.
  const copy = (slotId: SlotId | null): SlotId | null => (slotId ? cloneSlot(draft, slotId) : null)

  switch (source.type) {
    case 'text':
    case 'newline':
      // No child slots, so spreading the source copies it completely.
      return addNode(draft, { ...source, id })
    case 'frac':
      return addNode(draft, {
        ...source,
        id,
        numSlot: cloneSlot(draft, source.numSlot),
        denSlot: cloneSlot(draft, source.denSlot)
      })
    case 'sqrt':
      return addNode(draft, {
        ...source,
        id,
        indexSlot: copy(source.indexSlot),
        radSlot: cloneSlot(draft, source.radSlot)
      })
    case 'supsub':
      return addNode(draft, {
        ...source,
        id,
        baseSlot: cloneSlot(draft, source.baseSlot),
        supSlot: copy(source.supSlot),
        subSlot: copy(source.subSlot)
      })
    case 'bigop':
      return addNode(draft, { ...source, id, subSlot: copy(source.subSlot), supSlot: copy(source.supSlot) })
    case 'group':
    case 'textrun':
    case 'mathrun':
    case 'cmdrun':
      return addNode(draft, { ...source, id, slot: cloneSlot(draft, source.slot) })
    case 'matrix':
      return addNode(draft, {
        ...source,
        id,
        rows: source.rows.map((row) => row.map((cellSlot) => cloneSlot(draft, cellSlot)))
      })
  }
}
