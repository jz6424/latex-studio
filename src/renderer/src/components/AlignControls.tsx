import type { Align } from '../model/types'

/** Single-letter labels keep the control compact enough to sit inside the
 * block menu row; the tooltip and aria-label carry the full meaning. */
const OPTIONS: { value: Align; label: string; title: string }[] = [
  { value: 'left', label: 'L', title: 'Align left' },
  { value: 'center', label: 'C', title: 'Align center' },
  { value: 'right', label: 'R', title: 'Align right' }
]

/** Left/center/right selector for a block's alignment. */
export default function AlignControls({
  align,
  onChange
}: {
  align: Align
  onChange: (align: Align) => void
}): JSX.Element {
  return (
    <div className="align-controls">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className="align-btn"
          data-active={align === opt.value || undefined}
          title={opt.title}
          aria-label={opt.title}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
