import type { ToolDef, ToolId } from './types'

/**
 * The sidebar palette: every draggable tool, grouped into the categories the
 * sidebar renders as collapsible sections.
 *
 * Most entries are pure data — a symbol or command plus how to label it — so
 * adding one is a single line in the relevant table below, with no matching
 * change needed in the factory (see ToolId in types.ts for why).
 */

export interface ToolCategory {
  name: string
  tools: ToolDef[]
}

// --- Builders for the parameterized tool families ----------------------------

/** A symbol tool inserts a literal piece of LaTeX. Given `[label, tex]` pairs,
 * where the label is what the sidebar shows under the rendered preview. */
function symbolTools(category: string, entries: readonly (readonly [string, string])[]): ToolDef[] {
  return entries.map(([label, tex]) => ({
    id: `sym:${tex}` as ToolId,
    label,
    latexPreview: tex,
    category
  }))
}

/** Tools built from a command name, where the label is the command itself. */
function commandTools(
  category: string,
  prefix: 'fn' | 'cmddecl' | 'cmdfn',
  commands: readonly string[],
  preview: (cmd: string) => string,
  label: (cmd: string) => string
): ToolDef[] {
  return commands.map((cmd) => ({
    id: `${prefix}:${cmd}` as ToolId,
    label: label(cmd),
    latexPreview: preview(cmd),
    category
  }))
}

// --- Categories --------------------------------------------------------------

const structure: ToolDef[] = [
  { id: 'text', label: 'Text', latexPreview: '\\text{words}', category: 'Structure' },
  { id: 'math', label: 'Math', latexPreview: 'f(x)', category: 'Structure' },
  { id: 'frac', label: 'Fraction', latexPreview: '\\frac{a}{b}', category: 'Structure' },
  { id: 'sqrt', label: 'Square Root', latexPreview: '\\sqrt{x}', category: 'Structure' },
  { id: 'nthroot', label: 'Nth Root', latexPreview: '\\sqrt[n]{x}', category: 'Structure' },
  { id: 'sup', label: 'Superscript', latexPreview: 'x^{n}', category: 'Structure' },
  { id: 'sub', label: 'Subscript', latexPreview: 'x_{n}', category: 'Structure' },
  // Doubled ampersand: the sidebar renders labels as plain text, but a single
  // "&" reads as an alignment character if this label is ever fed to KaTeX.
  { id: 'supsub', label: 'Sup && Sub', latexPreview: 'x^{a}_{b}', category: 'Structure' },
  { id: 'newline', label: 'New Line', latexPreview: 'a \\\\ b', category: 'Structure' }
]

const bigops: ToolDef[] = [
  { id: 'sum', label: 'Sum', latexPreview: '\\sum_{i=0}^{n}', category: 'Big Operators' },
  { id: 'prod', label: 'Product', latexPreview: '\\prod_{i=0}^{n}', category: 'Big Operators' },
  { id: 'int', label: 'Integral', latexPreview: '\\int_{a}^{b}', category: 'Big Operators' },
  { id: 'oint', label: 'Contour Integral', latexPreview: '\\oint_{C}', category: 'Big Operators' },
  { id: 'lim', label: 'Limit', latexPreview: '\\lim_{x \\to a}', category: 'Big Operators' }
]

const brackets: ToolDef[] = [
  { id: 'paren', label: 'Parentheses', latexPreview: '(x)', category: 'Brackets & Matrices' },
  { id: 'bracket', label: 'Brackets', latexPreview: '[x]', category: 'Brackets & Matrices' },
  { id: 'brace', label: 'Braces', latexPreview: '\\{x\\}', category: 'Brackets & Matrices' },
  { id: 'abs', label: 'Absolute Value', latexPreview: '|x|', category: 'Brackets & Matrices' },
  {
    id: 'pmatrix2',
    label: '2×2 Matrix',
    latexPreview: '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}',
    category: 'Brackets & Matrices'
  },
  {
    id: 'bmatrix2',
    label: '2\u00d72 Bracket Matrix',
    latexPreview: '\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}',
    category: 'Brackets & Matrices'
  },
  {
    id: 'pmatrixN',
    label: 'M\u00d7N Matrix',
    latexPreview: '\\begin{pmatrix}a&\\cdots\\\\\\vdots&\\ddots\\end{pmatrix}',
    category: 'Brackets & Matrices'
  },
  {
    id: 'bmatrixN',
    label: 'M\u00d7N Bracket Matrix',
    latexPreview: '\\begin{bmatrix}a&\\cdots\\\\\\vdots&\\ddots\\end{bmatrix}',
    category: 'Brackets & Matrices'
  },
  // Plain symbols, same as any other \u2014 a matrix cell is just a slot, so
  // these drop into one like anything else. No \iddots (anti-diagonal):
  // it needs the mathdots package and KaTeX doesn't know it at all, so the
  // live preview would just show an error for a mark that's rarely used
  // anyway compared to the standard \ddots.
  ...symbolTools('Brackets & Matrices', [
    ['\u22ef', '\\cdots'],
    ['\u22ee', '\\vdots'],
    ['\u22f1', '\\ddots']
  ])
]

// Labelled with the glyph itself rather than the command name — the arrow is
// more recognizable at a glance than "\leftrightarrow".
const arrows = symbolTools('Arrows', [
  ['→', '\\to'],
  ['←', '\\leftarrow'],
  ['↔', '\\leftrightarrow'],
  ['⇒', '\\Rightarrow'],
  ['⇐', '\\Leftarrow'],
  ['⇔', '\\Leftrightarrow'],
  ['↦', '\\mapsto']
])

const relations = symbolTools('Operators & Relations', [
  ['=', '='],
  ['\u2260', '\\neq'],
  ['\u2264', '\\leq'],
  ['\u2265', '\\geq'],
  ['\u2248', '\\approx'],
  ['\u00b1', '\\pm'],
  ['\u00d7', '\\times'],
  ['\u00b7', '\\cdot'],
  ['\u00f7', '\\div'],
  ['\u221e', '\\infty'],
  ['\u2202', '\\partial'],
  ['\u2207', '\\nabla'],
  ['\u2208', '\\in'],
  ['\u2282', '\\subset'],
  ['\u2200', '\\forall'],
  ['\u2203', '\\exists']
])

// Labelled by connective name rather than glyph: ∧ and ∨ are easy to mix up
// at a glance, and "and"/"xor" is what someone searching would type.
// Implication (→, ⇒, ⇔) isn't repeated here — it's already under Arrows, and
// a tool can only appear once, since its id doubles as its drag id.
const logic = symbolTools('Logic', [
  ['And', '\\land'],
  ['Or', '\\lor'],
  ['Not', '\\neg'],
  ['XOR', '\\oplus'],
  ['XOR (alt)', '\\veebar'],
  ['Equivalent', '\\equiv'],
  ['True', '\\top'],
  ['False', '\\bot'],
  ['Proves', '\\vdash'],
  ['Models', '\\models'],
  ['Therefore', '\\therefore']
])

// Labelled by command name, since the rendered preview above it already shows
// the glyph and the name is what someone searching would type.
const greek = symbolTools(
  'Greek Letters',
  ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'mu', 'pi', 'sigma', 'phi', 'omega'].map(
    (name) => [`\\${name}`, `\\${name}`] as const
  )
)

const functions = commandTools(
  'Functions',
  'fn',
  ['\\sin', '\\cos', '\\tan', '\\log', '\\ln', '\\exp', '\\min', '\\max'],
  (cmd) => cmd,
  (cmd) => cmd
)

// Both common notations. No \arcsec/\arccsc/\arccot: they aren't standard
// LaTeX commands, so pdflatex would reject them even though KaTeX draws them.
// The ⁻¹ forms are read as the inverse (not a reciprocal) when graphed.
const inverseTrig = commandTools(
  'Inverse Trig',
  'fn',
  ['\\arcsin', '\\arccos', '\\arctan', '\\sin^{-1}', '\\cos^{-1}', '\\tan^{-1}'],
  (cmd) => cmd,
  (cmd) => cmd.replace('\\', '').replace('^{-1}', '\u207b\u00b9')
)

// Font-size declarations and text-style commands — these ARE valid inline
// within math/text (unlike \section etc.) and KaTeX supports all of them, so
// they work as ordinary draggable widgets with a live preview. "Aa" is just
// sample content so the preview shows the effect rather than an empty box.
const textSizes = commandTools(
  'Text Styles',
  'cmddecl',
  ['tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize', 'large', 'Large', 'LARGE', 'huge', 'Huge'],
  (cmd) => `{\\${cmd} Aa}`,
  (cmd) => cmd
)

const STYLE_FN_LABELS: Record<string, string> = {
  textbf: 'Bold',
  textit: 'Italic',
  underline: 'Underline',
  emph: 'Emphasis'
}

const styleFns = commandTools(
  'Text Styles',
  'cmdfn',
  Object.keys(STYLE_FN_LABELS),
  (cmd) => `\\${cmd}{Aa}`,
  (cmd) => STYLE_FN_LABELS[cmd]
)

// LaTeX's opening double quote is two backticks, not a straight ". It's wrapped
// in \text because in math mode `` renders as two literal backticks.
const quotes = symbolTools('Text Styles', [['“ Open Quote', '\\text{``}']])

export const TOOL_CATEGORIES: ToolCategory[] = [
  { name: 'Structure', tools: structure },
  { name: 'Big Operators', tools: bigops },
  { name: 'Arrows', tools: arrows },
  { name: 'Brackets & Matrices', tools: brackets },
  { name: 'Operators & Relations', tools: relations },
  { name: 'Logic', tools: logic },
  { name: 'Text Styles', tools: [...textSizes, ...styleFns, ...quotes] },
  { name: 'Greek Letters', tools: greek },
  { name: 'Functions', tools: functions },
  { name: 'Inverse Trig', tools: inverseTrig }
]

/** Flat lookup list, for resolving a dragged tool id back to its definition. */
export const ALL_TOOLS: ToolDef[] = TOOL_CATEGORIES.flatMap((category) => category.tools)
