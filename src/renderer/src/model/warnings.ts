/**
 * LaTeX math mode (`\[...\]`, `$...$`) never auto-wraps `\text{}` or bare math
 * content — it's treated as one unbreakable run, unlike a plain paragraph.
 * There's no reliable fix for that (short of not putting long prose in math
 * mode), so the best we can do is warn before it surprises someone in the
 * compiled PDF.
 *
 * This is a rough character-count heuristic, not a measurement of actual
 * rendered width — real LaTeX line capacity depends on font, margins, and what
 * else shares the line — so treat it as "probably risky" rather than a precise
 * prediction.
 */
export const LONG_LINE_WARNING_THRESHOLD = 70

export function isLikelyToOverflowLine(latex: string): boolean {
  return latex.trim().length > LONG_LINE_WARNING_THRESHOLD
}

/** Shown as the tooltip on the warning badge; see OverflowWarningBadge. */
export const LONG_LINE_WARNING_MESSAGE =
  "This won't wrap when compiled — math mode treats \\text{} and bare math as one unbreakable line, so long content can run off the page. Consider a plain Text block instead (that wraps normally), or shortening this."
