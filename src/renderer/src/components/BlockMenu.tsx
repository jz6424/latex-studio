import { useEffect, useRef, useState, type ReactNode } from 'react'
import AlignControls from './AlignControls'
import type { Align } from '../model/types'

interface Props {
  /** Current alignment. Together with onAlign, omitted by lists, whose
   * children each keep their own alignment instead. */
  align?: Align
  onAlign?: (align: Align) => void
  /** Current display/inline state. Together with onToggleDisplay, omitted by
   * block types that have no such distinction (text, headings). */
  display?: boolean
  onToggleDisplay?: () => void
  onDuplicate: () => void
  onDelete: () => void
}

/** The per-block "⋮" menu: alignment, display/inline, duplicate, delete. */
export default function BlockMenu({
  align,
  onAlign,
  display,
  onToggleDisplay,
  onDuplicate,
  onDelete
}: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Dismiss on a click anywhere outside the menu. Listening on mousedown rather
  // than click means the menu is already gone by the time the click lands, so
  // it can't swallow the click on whatever was pressed.
  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  return (
    <div className="block-menu" ref={rootRef}>
      <button
        type="button"
        className="block-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="Block options"
        aria-expanded={open}
      >
        ⋮
      </button>

      {open && (
        <div className="block-menu-panel">
          {/* Alignment stays inline rather than becoming menu items — it's a
              three-way choice with a current value, not an action. */}
          {align && onAlign && (
            <div className="block-menu-row">
              <span className="block-menu-label">Align</span>
              <AlignControls align={align} onChange={onAlign} />
            </div>
          )}

          {onToggleDisplay && (
            <MenuItem onSelect={onToggleDisplay} close={() => setOpen(false)}>
              Switch to {display ? 'Inline' : 'Display'}
            </MenuItem>
          )}
          <MenuItem onSelect={onDuplicate} close={() => setOpen(false)}>
            ⧉ Duplicate
          </MenuItem>
          <MenuItem danger onSelect={onDelete} close={() => setOpen(false)}>
            🗑 Delete
          </MenuItem>
        </div>
      )}
    </div>
  )
}

/** A menu action. Every one of them closes the menu after running. */
function MenuItem({
  children,
  onSelect,
  close,
  danger
}: {
  children: ReactNode
  onSelect: () => void
  close: () => void
  danger?: boolean
}): JSX.Element {
  return (
    <button
      type="button"
      className={`block-menu-item${danger ? ' block-menu-item-danger' : ''}`}
      onClick={() => {
        onSelect()
        close()
      }}
    >
      {children}
    </button>
  )
}
