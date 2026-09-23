import { useMemo } from 'react'
import katex from 'katex'

interface Props {
  latex: string
  /** Display math (`\[…\]`-style: larger operators, own line) vs inline. */
  display?: boolean
  className?: string
}

/**
 * Typesets a LaTeX string with KaTeX.
 *
 * `throwOnError: false` makes KaTeX render its own inline red error text for
 * anything it can't parse, which is what should normally be shown — the source
 * is being edited live, so it is invalid most of the time it is being typed.
 * The catch below is only for KaTeX failing outright rather than reporting a
 * parse error, and falls back to showing the raw source as plain text.
 */
export default function KatexView({ latex, display = false, className }: Props): JSX.Element {
  const rendered = useMemo<{ html: string } | { failed: true } | null>(() => {
    if (!latex.trim()) return null
    try {
      return {
        html: katex.renderToString(latex, { displayMode: display, throwOnError: false, strict: 'ignore' })
      }
    } catch {
      return { failed: true }
    }
  }, [latex, display])

  // A non-breaking space keeps an empty preview from collapsing to zero height
  // and making the surrounding layout jump as content is typed.
  if (!rendered) {
    return (
      <span className={className} style={{ opacity: 0.35 }}>
        {' '}
      </span>
    )
  }

  // Rendered as a text node, not markup, so unparseable source can't inject
  // anything into the page.
  if ('failed' in rendered) {
    return (
      <span className={className} style={{ color: '#f87171' }}>
        {latex}
      </span>
    )
  }

  // KaTeX's output is HTML it generated itself from the source above, so this
  // is the intended way to mount it.
  return <span className={className} dangerouslySetInnerHTML={{ __html: rendered.html }} />
}
