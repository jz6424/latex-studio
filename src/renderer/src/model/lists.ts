import type { ListLabelFormat, ListNumbering } from './types'

/**
 * Label styles for list blocks, shared by the editor (which draws the labels
 * itself) and the LaTeX generator (which hands them to the `enumerate`
 * package), so the two can't disagree about what "a)" means.
 */

/**
 * LaTeX allows at most four nested `enumerate`s and four nested `itemize`s,
 * and six lists of any mix — past that it stops with "Too deeply nested".
 * Capping every mix at four keeps any combination under both limits.
 */
export const MAX_LIST_DEPTH = 4

/** The glyphs `itemize` uses at each of its levels, so bullets in the editor
 * match the compiled PDF. Indexed by bullet level (see bulletLevelOfList),
 * not overall list depth. */
const BULLETS = ['•', '–', '∗', '·']

/** The counter letter the `enumerate` package substitutes in a label spec. */
const COUNTER_TOKEN: Record<Exclude<ListNumbering, 'bullet'>, string> = {
  arabic: '1',
  alph: 'a',
  Alph: 'A',
  roman: 'i',
  Roman: 'I'
}

function applyFormat(counter: string, format: ListLabelFormat): string {
  switch (format) {
    case 'period':
      return `${counter}.`
    case 'paren':
      return `${counter})`
    case 'parens':
      return `(${counter})`
  }
}

/** The style a new list starts with at a given depth — LaTeX's own default
 * sequence for nested `enumerate`s: 1., (a), i., A. */
export function defaultListStyle(depth: number): { numbering: ListNumbering; labelFormat: ListLabelFormat } {
  const defaults = [
    { numbering: 'arabic', labelFormat: 'period' },
    { numbering: 'alph', labelFormat: 'parens' },
    { numbering: 'roman', labelFormat: 'period' },
    { numbering: 'Alph', labelFormat: 'period' }
  ] as const
  return defaults[Math.min(depth, defaults.length) - 1] ?? defaults[0]
}

/** The label shown beside item `index` (0-based). `bulletLevel` only matters
 * for bullets: 1 for a bullet list inside no other bullet list, and so on. */
export function listItemLabel(
  numbering: ListNumbering,
  labelFormat: ListLabelFormat,
  index: number,
  bulletLevel: number
): string {
  if (numbering === 'bullet') return BULLETS[Math.min(bulletLevel, BULLETS.length) - 1] ?? BULLETS[0]
  return applyFormat(counterText(numbering, index + 1), labelFormat)
}

function counterText(numbering: Exclude<ListNumbering, 'bullet'>, n: number): string {
  switch (numbering) {
    case 'arabic':
      return String(n)
    case 'alph':
      return alphabetic(n)
    case 'Alph':
      return alphabetic(n).toUpperCase()
    case 'roman':
      return toRoman(n).toLowerCase()
    case 'Roman':
      return toRoman(n)
  }
}

/** LaTeX's `\alph` only goes up to z — the 27th item is a "Counter too large"
 * compile error. Past that the editor shows "?" so the problem is visible
 * before compiling. */
export const MAX_ALPHABETIC_ITEMS = 26

function alphabetic(n: number): string {
  return n >= 1 && n <= MAX_ALPHABETIC_ITEMS ? String.fromCharCode(96 + n) : '?'
}

const ROMAN_NUMERALS: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I']
]

function toRoman(n: number): string {
  let out = ''
  for (const [value, numeral] of ROMAN_NUMERALS) {
    while (n >= value) {
      out += numeral
      n -= value
    }
  }
  return out
}

/** The `enumerate` package's label spec, e.g. `a)` or `(i)` — it replaces the
 * counter letter with the live counter. Null for bullets, which use plain
 * `itemize` with its default glyphs. */
export function enumerateLabelSpec(numbering: ListNumbering, labelFormat: ListLabelFormat): string | null {
  if (numbering === 'bullet') return null
  return applyFormat(COUNTER_TOKEN[numbering], labelFormat)
}

// --- Style picker options ----------------------------------------------------

export interface ListStyleOption {
  numbering: ListNumbering
  labelFormat: ListLabelFormat
  /** Sample of the first few labels, e.g. "a)  b)  c)". */
  label: string
}

const FORMATS: ListLabelFormat[] = ['period', 'paren', 'parens']

/** Every selectable style: bullets, then each counter in each format. Kept
 * below the label helpers: it calls them while this module loads, before any
 * constant declared later in the file would exist. */
export const LIST_STYLE_OPTIONS: ListStyleOption[] = [
  { numbering: 'bullet', labelFormat: 'period', label: '•  Bullets' },
  ...(Object.keys(COUNTER_TOKEN) as Exclude<ListNumbering, 'bullet'>[]).flatMap((numbering) =>
    FORMATS.map((labelFormat) => ({
      numbering,
      labelFormat,
      label: [0, 1, 2].map((i) => listItemLabel(numbering, labelFormat, i, 1)).join('  ')
    }))
  )
]
