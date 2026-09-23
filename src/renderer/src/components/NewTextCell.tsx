import type { ChangeEvent } from 'react'
import { useDocStore } from '../model/store'
import type { DocState, MathNode, NodeId } from '../model/types'
import AutoWidthTextInput from './AutoWidthTextInput'

/** Reads a node's text, or '' for a missing or non-text node. */
function textValueOf(nodes: DocState['nodes'], nodeId: NodeId | null): string {
  if (!nodeId) return ''
  const node: MathNode | undefined = nodes[nodeId]
  return node?.type === 'text' ? node.value : ''
}

interface Props {
  slotId: string
  /** The node this cell created and is currently editing, or null when it is
   * still an empty invitation to type. Owned by the parent SlotBox, which
   * needs it to avoid rendering that node twice. */
  trailingId: string | null
  setTrailingId: (id: string | null) => void
  wrap?: boolean
  /** Where to insert the freshly-created node — undefined appends at the true
   * end of the slot's array (the normal case). When this cell represents the
   * end of one visual "line" within a multi-line slot (see MathSlot's
   * newline-splitting), that's a specific position in the middle of the array
   * — right before the newline marker that ends the line — not its actual end. */
  insertIndex?: number
}

/**
 * The empty "type here" cell at the end of a slot. It has no node behind it
 * until the first keystroke, at which point it creates one and keeps editing
 * it in place — so starting to type never costs a re-mount or a lost focus.
 */
export default function NewTextCell({ slotId, trailingId, setTrailingId, wrap, insertIndex }: Props): JSX.Element {
  const createTextNodeInSlot = useDocStore((s) => s.createTextNodeInSlot)
  const updateTextNode = useDocStore((s) => s.updateTextNode)
  const removeNode = useDocStore((s) => s.removeNode)
  const value = useDocStore((s) => textValueOf(s.doc.nodes, trailingId))

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    const next = e.target.value
    if (trailingId) {
      updateTextNode(trailingId, next)
      return
    }
    // Only truly empty (e.g. backspacing an already-empty box) skips creation
    // — a lone space is real content and must not be dropped just because it
    // trims down to "".
    if (next === '') return
    setTrailingId(createTextNodeInSlot(slotId, next, insertIndex))
  }

  function handleBlur(): void {
    if (!trailingId) return
    // Discard a node the user started but left empty, so abandoned cells don't
    // accumulate in the slot.
    if (!textValueOf(useDocStore.getState().doc.nodes, trailingId)) removeNode(trailingId)
    setTrailingId(null)
  }

  return (
    <AutoWidthTextInput
      className="text-cell text-cell-ghost"
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      minWidthPx={6}
      wrap={wrap}
    />
  )
}
