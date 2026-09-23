import { useLayoutEffect, useRef, useState } from 'react'

interface Props {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  onBlur?: () => void
  className?: string
  minWidthPx?: number
  /** Renders a wrapping, auto-growing-height <textarea> instead of a
   * single-line auto-growing-width <input>. An <input> can never wrap onto
   * multiple lines regardless of CSS — this is the only way prose-length
   * content (the Text/Math widgets) can actually break onto new lines
   * instead of growing sideways forever. */
  wrap?: boolean
  /** Blocks typing into the field — for a dropped command/symbol (e.g.
   * "\sin"), where editing individual characters would corrupt it into
   * something that isn't a valid LaTeX command at all. Still focusable,
   * selectable, draggable, and deletable — just not directly editable. */
  readOnly?: boolean
}

/**
 * A text field that sizes itself to its content rather than a fixed box.
 * Default mode: single-line <input>, auto-width via an offscreen mirror span
 * (measuring actual rendered width, not an approximation from character
 * count, which overestimates for proportional fonts). Wrap mode: multi-line
 * <textarea>, sized via a CSS grid overlaid with an invisible mirror span —
 * a <textarea>'s own intrinsic size comes from its `cols`/`rows` attributes,
 * not its text, so relying on the textarea alone (even with `cols` tied to
 * the value's length) only ever approximates real glyph widths and drifts
 * from the font's actual metrics. The mirror is a plain span with the same
 * text, so its natural size (and its own wrapping once space runs out) is
 * exactly what real text would do; the grid takes its size from whichever
 * of the two is larger, so the ancestor widget shrink-wraps to accurate
 * content size and the textarea's height grows to match automatically.
 */
export default function AutoWidthTextInput({
  value,
  onChange,
  onBlur,
  className,
  minWidthPx = 8,
  wrap = false,
  readOnly = false
}: Props): JSX.Element {
  const mirrorRef = useRef<HTMLSpanElement>(null)
  const [width, setWidth] = useState(minWidthPx)

  useLayoutEffect(() => {
    if (wrap || !mirrorRef.current) return
    setWidth(Math.max(minWidthPx, mirrorRef.current.offsetWidth + 4))
  }, [value, minWidthPx, wrap])

  if (wrap) {
    const cellClassName = className ? `${className} text-cell-wrap` : 'text-cell-wrap'
    return (
      <span className="text-cell-wrap-container">
        <span className={`${cellClassName} text-cell-wrap-mirror`} aria-hidden="true">
          {value || ' '}
        </span>
        <textarea
          className={cellClassName}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          readOnly={readOnly}
          rows={1}
          // Without this the textarea's own default cols=20 (~380px)
          // intrinsic width competes with the mirror's for the grid cell's
          // size — for short content that default wins, leaving a huge
          // reserved-but-invisible gap after it. Pinning cols to 1 makes the
          // mirror the sole sizing authority, as intended.
          cols={1}
        />
      </span>
    )
  }

  return (
    <span className="autowidth-wrap">
      <span ref={mirrorRef} className={`autowidth-mirror${className ? ` ${className}` : ''}`} aria-hidden="true">
        {value || ' '}
      </span>
      <input
        className={className}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        readOnly={readOnly}
        style={{ width }}
      />
    </span>
  )
}
