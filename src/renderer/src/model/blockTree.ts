import { nanoid } from 'nanoid'
import type { Block, BlockId, DocState, ListBlock, ListItem, ListItemId, SlotId } from './types'
import { cloneSlot, deleteNodeDeep } from './factory'
import { MAX_LIST_DEPTH } from './lists'

/**
 * Where blocks sit, now that list items can hold blocks of their own.
 *
 * A block lives in exactly one ordered "container": the page's top-level
 * `DocState.blocks`, or one list item's `blocks`. Like math slots, nothing
 * stores a parent pointer, so finding a block's container is a scan.
 *
 * Every function here works on live state and on an immer draft alike; the
 * mutating ones are only ever handed a draft (see store.ts).
 */

/** Where to put a block. Omitted (undefined) means the end of the page. */
export type BlockPlacement =
  /** Directly after an existing block, in that block's container. */
  | { afterBlockId: BlockId }
  /** At an existing block's index, in its container — the drag-to-reorder
   * meaning of "dropped on that block". */
  | { atBlockId: BlockId }
  /** At the end of a list item. */
  | { itemId: ListItemId }

interface BlockLocation {
  container: BlockId[]
  index: number
  /** The list whose item holds `container`, or null for the page itself. */
  ownerListId: BlockId | null
}

function listBlocks(doc: DocState): ListBlock[] {
  return Object.values(doc.blocksById).filter((b): b is ListBlock => b.type === 'list')
}

export function findListItem(doc: DocState, itemId: ListItemId): { list: ListBlock; item: ListItem } | null {
  for (const list of listBlocks(doc)) {
    const item = list.items.find((i) => i.id === itemId)
    if (item) return { list, item }
  }
  return null
}

/** The list item directly holding a block, or null for a top-level block. */
function findParentItem(doc: DocState, blockId: BlockId): { list: ListBlock; item: ListItem } | null {
  for (const list of listBlocks(doc)) {
    const item = list.items.find((i) => i.blocks.includes(blockId))
    if (item) return { list, item }
  }
  return null
}

function findBlockLocation(doc: DocState, blockId: BlockId): BlockLocation | null {
  const topIndex = doc.blocks.indexOf(blockId)
  if (topIndex !== -1) return { container: doc.blocks, index: topIndex, ownerListId: null }
  const parent = findParentItem(doc, blockId)
  if (!parent) return null
  return { container: parent.item.blocks, index: parent.item.blocks.indexOf(blockId), ownerListId: parent.list.id }
}

/** How many lists enclose a block: 0 at the top level. */
export function listDepthOfBlock(doc: DocState, blockId: BlockId): number {
  let depth = 0
  let parent = findParentItem(doc, blockId)
  while (parent) {
    depth++
    parent = findParentItem(doc, parent.list.id)
  }
  return depth
}

/** Which `itemize` level a list is at, counting only bullet lists — LaTeX
 * picks a bullet's glyph by how many bullet lists enclose it, and numbered
 * lists in between don't count. */
export function bulletLevelOfList(doc: DocState, listId: BlockId): number {
  let level = 1
  let parent = findParentItem(doc, listId)
  while (parent) {
    if (parent.list.numbering === 'bullet') level++
    parent = findParentItem(doc, parent.list.id)
  }
  return level
}

/** How many levels of list a block spans: 0 for a non-list, 1 for a list with
 * no lists inside it, and so on. Takes the block itself rather than an id so
 * it also works on one that isn't registered yet. */
function listHeight(doc: DocState, block: Block): number {
  if (block.type !== 'list') return 0
  let deepestChild = 0
  for (const item of block.items) {
    for (const childId of item.blocks) {
      const child = doc.blocksById[childId]
      if (child) deepestChild = Math.max(deepestChild, listHeight(doc, child))
    }
  }
  return 1 + deepestChild
}

/** Resolves a placement into the container and index it refers to, or null
 * when it names a block or item that doesn't exist. */
function resolvePlacement(doc: DocState, placement: BlockPlacement | undefined): BlockLocation | null {
  if (!placement) return { container: doc.blocks, index: doc.blocks.length, ownerListId: null }
  if ('itemId' in placement) {
    const found = findListItem(doc, placement.itemId)
    if (!found) return null
    return { container: found.item.blocks, index: found.item.blocks.length, ownerListId: found.list.id }
  }
  const anchorId = 'afterBlockId' in placement ? placement.afterBlockId : placement.atBlockId
  const location = findBlockLocation(doc, anchorId)
  if (!location) return null
  return 'afterBlockId' in placement ? { ...location, index: location.index + 1 } : location
}

/** Whether `block` may go into the container at `location`. */
function canHost(doc: DocState, location: BlockLocation, block: Block): boolean {
  if (location.ownerListId === null) return true
  // \section and friends inside an \item compile, but don't mean anything
  // sensible — a heading belongs to the page, not to a list entry.
  if (block.type === 'heading') return false
  // A list can't go inside itself or any of its own descendants — that would
  // detach the whole subtree from the page.
  let ancestor: BlockId | null = location.ownerListId
  while (ancestor) {
    if (ancestor === block.id) return false
    ancestor = findParentItem(doc, ancestor)?.list.id ?? null
  }
  const containerDepth = listDepthOfBlock(doc, location.ownerListId) + 1
  return containerDepth + listHeight(doc, block) <= MAX_LIST_DEPTH
}

/** The depth a block would have at a placement — used to pick a new list's
 * default label style before it exists. */
export function depthAtPlacement(doc: DocState, placement: BlockPlacement | undefined): number {
  const location = resolvePlacement(doc, placement)
  return location?.ownerListId ? listDepthOfBlock(doc, location.ownerListId) + 1 : 0
}

// --- Mutations (draft only) --------------------------------------------------

/** Registers a block and places it. Returns false, registering nothing, when
 * the placement is unknown or not allowed to hold this block. */
export function insertBlock(draft: DocState, block: Block, placement?: BlockPlacement): boolean {
  const location = resolvePlacement(draft, placement)
  if (!location || !canHost(draft, location, block)) return false
  draft.blocksById[block.id] = block
  location.container.splice(location.index, 0, block.id)
  return true
}

/** Moves an existing block. Within one container this keeps the page's
 * original reorder behaviour: the target index is read before the block is
 * removed, so it lands where the target block was. */
export function moveBlock(draft: DocState, blockId: BlockId, placement?: BlockPlacement): void {
  const block = draft.blocksById[blockId]
  const from = findBlockLocation(draft, blockId)
  if (!block || !from) return
  if (placement && 'atBlockId' in placement && placement.atBlockId === blockId) return

  const to = resolvePlacement(draft, placement)
  if (!to || !canHost(draft, to, block)) return

  from.container.splice(from.index, 1)
  to.container.splice(Math.min(to.index, to.container.length), 0, blockId)
}

/** Unlinks a block from its container and deletes it with everything it owns. */
export function removeBlock(draft: DocState, blockId: BlockId): void {
  const location = findBlockLocation(draft, blockId)
  if (location) location.container.splice(location.index, 1)
  deleteBlockDeep(draft, blockId)
}

/** Deletes a block and everything it owns — an equation's node tree, or a
 * list's items and their blocks. Does not unlink it from its container. */
export function deleteBlockDeep(draft: DocState, blockId: BlockId): void {
  const block = draft.blocksById[blockId]
  if (!block) return
  if (block.type === 'math') deleteSlotDeep(draft, block.rootSlot)
  if (block.type === 'list') {
    for (const item of block.items) for (const childId of item.blocks) deleteBlockDeep(draft, childId)
  }
  if (block.type === 'proof') {
    for (const slotId of [block.startSlot, ...block.steps.map((step) => step.slot)]) deleteSlotDeep(draft, slotId)
  }
  delete draft.blocksById[blockId]
}

/** Deletes a slot and every node beneath it. */
export function deleteSlotDeep(draft: DocState, slotId: SlotId): void {
  for (const id of draft.slots[slotId] ?? []) deleteNodeDeep(draft, id)
  delete draft.slots[slotId]
}

/** Deep-copies a block under fresh ids and registers it, without placing it.
 * Returns the copy's id, or null if the source doesn't exist. */
export function cloneBlockDeep(draft: DocState, sourceId: BlockId): BlockId | null {
  const source = draft.blocksById[sourceId]
  if (!source) return null
  const id = nanoid(8)

  switch (source.type) {
    case 'math':
      // The root slot must be deep-copied, or the copy would share the
      // original's nodes and the two would edit as one.
      draft.blocksById[id] = { ...source, id, rootSlot: cloneSlot(draft, source.rootSlot) }
      break
    case 'list':
      draft.blocksById[id] = {
        ...source,
        id,
        items: source.items.map((item) => ({
          id: nanoid(8),
          blocks: item.blocks.map((childId) => cloneBlockDeep(draft, childId)).filter((c): c is BlockId => c !== null)
        }))
      }
      break
    case 'proof':
      draft.blocksById[id] = {
        ...source,
        id,
        startSlot: cloneSlot(draft, source.startSlot),
        steps: source.steps.map((step) => ({ ...step, id: nanoid(8), slot: cloneSlot(draft, step.slot) }))
      }
      break
    default:
      draft.blocksById[id] = { ...source, id }
  }
  return id
}
