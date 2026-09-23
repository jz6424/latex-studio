import { LONG_LINE_WARNING_MESSAGE } from '../model/warnings'

/** Flags content that probably won't fit on one line once compiled. Advisory
 * only — see warnings.ts for why this can't be an exact prediction. Renders
 * nothing when there's nothing to warn about, so callers can pass the
 * condition straight through rather than branching around it. */
export default function OverflowWarningBadge({
  show,
  className
}: {
  show: boolean
  className?: string
}): JSX.Element | null {
  if (!show) return null
  return (
    <span
      className={`overflow-warning-badge${className ? ` ${className}` : ''}`}
      title={LONG_LINE_WARNING_MESSAGE}
      aria-label="May run off the page when compiled"
    >
      ⚠
    </span>
  )
}
