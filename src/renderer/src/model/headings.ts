import type { HeadingLevel } from './types'

/**
 * Section/subsection/subsubsection get their own dedicated block type (see
 * HeadingBlockView) rather than a plain text block pre-filled with literal
 * `\section{...}` — that used to leave raw LaTeX syntax sitting visibly in
 * the editor instead of something that reads as an actual heading.
 *
 * This map is the single source of both the sidebar's insert buttons and the
 * level tag shown on a heading block, so the two can't disagree. Declaration
 * order is the order the sidebar lists them in: outermost level first.
 */
export const HEADING_LABELS: Record<HeadingLevel, string> = {
  section: 'Section',
  subsection: 'Subsection',
  subsubsection: 'Subsubsection'
}

export interface HeadingLevelOption {
  level: HeadingLevel
  label: string
}

export const HEADING_LEVELS: HeadingLevelOption[] = (
  Object.keys(HEADING_LABELS) as HeadingLevel[]
).map((level) => ({ level, label: HEADING_LABELS[level] }))
