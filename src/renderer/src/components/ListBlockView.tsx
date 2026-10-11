import { useDroppable } from '@dnd-kit/core'
import { useDocStore } from '../model/store'
import { bulletLevelOfList, listDepthOfBlock } from '../model/blockTree'
import {
  LIST_STYLE_OPTIONS,
  MAX_ALPHABETIC_ITEMS,
  MAX_LIST_DEPTH,
  listItemLabel
} from '../model/lists'
import type { ListBlock, ListItem, ListLabelFormat, ListNumbering } from '../model/types'
import { listItemDropId, type DropData } from '../dnd/dragData'
import { DraggableBlock } from './BlockView'
import BlockMenu from './BlockMenu'

/** Encodes a style as one <select> value, since a style is a pair of fields. */
const styleKey = (numbering: ListNumbering, labelFormat: ListLabelFormat): string => `${numbering}:${labelFormat}`

/**
 * A bulleted or numbered list — a "big widget" whose items each hold their own
 * run of ordinary blocks: text, equations, and further lists. Blocks can be
 * dragged into and out of items like anywhere else on the page, and a sidebar
 * tool dropped on an item starts a new equation inside it.
 */
export default function ListBlockView({ block }: { block: ListBlock }): JSX.Element {
  const setListStyle = useDocStore((s) => s.setListStyle)
  const addListItem = useDocStore((s) => s.addListItem)
  const duplicateBlock = useDocStore((s) => s.duplicateBlock)
  const removeBlock = useDocStore((s) => s.removeBlock)
  // 1 for a list on the page itself, 2 for one inside another list's item, ...
  const depth = useDocStore((s) => listDepthOfBlock(s.doc, block.id) + 1)
  const bulletLevel = useDocStore((s) => bulletLevelOfList(s.doc, block.id))

  const tooManyLetters =
    (block.numbering === 'alph' || block.numbering === 'Alph') && block.items.length > MAX_ALPHABETIC_ITEMS

  return (
    <div className="block block-list">
      <div className="block-toolbar">
        <BlockMenu onDuplicate={() => duplicateBlock(block.id)} onDelete={() => removeBlock(block.id)} />
      </div>

      <div className="list-header">
        <span className="list-tag">List</span>
        <select
          className="list-style-select"
          value={styleKey(block.numbering, block.labelFormat)}
          title="Label style"
          onChange={(e) => {
            const option = LIST_STYLE_OPTIONS.find((o) => styleKey(o.numbering, o.labelFormat) === e.target.value)
            if (option) setListStyle(block.id, option.numbering, option.labelFormat)
          }}
        >
          {LIST_STYLE_OPTIONS.map((o) => (
            <option key={styleKey(o.numbering, o.labelFormat)} value={styleKey(o.numbering, o.labelFormat)}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="list-items">
        {block.items.map((item, index) => (
          <ListItemView
            key={item.id}
            list={block}
            item={item}
            index={index}
            depth={depth}
            bulletLevel={bulletLevel}
            isLast={index === block.items.length - 1}
          />
        ))}
        {block.items.length === 0 && <div className="list-empty">No items — this list is left out of the PDF.</div>}
      </div>

      {tooManyLetters && (
        <div className="list-warning">
          Letter labels stop at z — LaTeX can&apos;t compile item {MAX_ALPHABETIC_ITEMS + 1} or later. Switch to
          numbers or roman numerals, or split the list.
        </div>
      )}

      <button type="button" className="list-btn list-add-item" onClick={() => addListItem(block.id)}>
        + Item
      </button>
    </div>
  )
}

/** One entry: its label, its blocks, and a hover row for adding content,
 * reordering, and deleting. The whole item is a drop target meaning "add to
 * the end of this item". */
function ListItemView({
  list,
  item,
  index,
  depth,
  bulletLevel,
  isLast
}: {
  list: ListBlock
  item: ListItem
  index: number
  depth: number
  bulletLevel: number
  isLast: boolean
}): JSX.Element {
  const blocksById = useDocStore((s) => s.doc.blocksById)
  const addTextBlock = useDocStore((s) => s.addTextBlock)
  const addMathBlock = useDocStore((s) => s.addMathBlock)
  const addListBlock = useDocStore((s) => s.addListBlock)
  const addProofBlock = useDocStore((s) => s.addProofBlock)
  const addCircuitBlock = useDocStore((s) => s.addCircuitBlock)
  const moveListItem = useDocStore((s) => s.moveListItem)
  const removeListItem = useDocStore((s) => s.removeListItem)

  const dropData: DropData = { origin: 'item', itemId: item.id }
  const drop = useDroppable({ id: listItemDropId(item.id), data: dropData })
  const placement = { itemId: item.id }

  return (
    <div className="list-item" ref={drop.setNodeRef} data-over={drop.isOver || undefined}>
      <span className="list-item-label">{listItemLabel(list.numbering, list.labelFormat, index, bulletLevel)}</span>
      <div className="list-item-body">
        {item.blocks.map((id) => {
          const child = blocksById[id]
          return child ? <DraggableBlock block={child} key={id} /> : null
        })}
        {item.blocks.length === 0 && <div className="list-item-empty">Empty item — add something below</div>}

        <div className="list-item-actions">
          <button type="button" className="list-btn" onClick={() => addTextBlock(placement)}>
            + Text
          </button>
          <button type="button" className="list-btn" onClick={() => addMathBlock(true, placement)}>
            + Equation
          </button>
          <button type="button" className="list-btn" onClick={() => addProofBlock(placement)}>
            + Proof
          </button>
          <button type="button" className="list-btn" onClick={() => addCircuitBlock(placement)}>
            + Circuit
          </button>
          {/* Hidden rather than refused on click: past this depth LaTeX
              can't compile the list at all (see MAX_LIST_DEPTH). */}
          {depth < MAX_LIST_DEPTH && (
            <button type="button" className="list-btn" onClick={() => addListBlock(placement)}>
              + List
            </button>
          )}
          <span className="list-item-actions-spacer" />
          <button
            type="button"
            className="list-icon-btn"
            disabled={index === 0}
            onClick={() => moveListItem(list.id, item.id, -1)}
            title="Move item up"
            aria-label="Move item up"
          >
            ↑
          </button>
          <button
            type="button"
            className="list-icon-btn"
            disabled={isLast}
            onClick={() => moveListItem(list.id, item.id, 1)}
            title="Move item down"
            aria-label="Move item down"
          >
            ↓
          </button>
          <button
            type="button"
            className="list-icon-btn list-icon-btn-danger"
            onClick={() => removeListItem(list.id, item.id)}
            title="Delete item"
            aria-label="Delete item"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}
