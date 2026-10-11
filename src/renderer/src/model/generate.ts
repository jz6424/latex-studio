import type { Align, BigOp, Block, DocState, ListBlock, NodeId, ProofBlock, SlotId } from './types'
import { enumerateLabelSpec } from './lists'
import { escapeProofReason, proofRelationTex } from './proofs'
import { CIRCUIT_PREAMBLE, circuitToLatex } from './circuits'

/**
 * Turns the document model into LaTeX source.
 *
 * Most of the length here is comments: several of the constructs below look
 * needlessly roundabout until you know which straightforward alternative was
 * tried first and how it failed against a real pdflatex compile. Those notes
 * sit directly above the code they explain.
 */

// --- Math nodes --------------------------------------------------------------

const BIGOP_CMD: Record<BigOp, string> = {
  sum: '\\sum',
  prod: '\\prod',
  int: '\\int',
  oint: '\\oint',
  lim: '\\lim'
}

/** Concatenates a slot's nodes into one horizontal run. */
export function slotToLatex(doc: DocState, slotId: SlotId | null): string {
  if (!slotId) return ''
  return (doc.slots[slotId] ?? []).map((id) => nodeToLatex(doc, id)).join(' ')
}

/** True when a slot exists and holds at least one node — the test for whether
 * an optional script is worth emitting at all. */
function slotHasContent(doc: DocState, slotId: SlotId | null): boolean {
  return slotId !== null && (doc.slots[slotId]?.length ?? 0) > 0
}

export function nodeToLatex(doc: DocState, nodeId: NodeId): string {
  const node = doc.nodes[nodeId]
  if (!node) return ''

  switch (node.type) {
    case 'text':
      return node.value

    case 'frac':
      return `\\frac{${slotToLatex(doc, node.numSlot)}}{${slotToLatex(doc, node.denSlot)}}`

    case 'sqrt':
      return node.indexSlot
        ? `\\sqrt[${slotToLatex(doc, node.indexSlot)}]{${slotToLatex(doc, node.radSlot)}}`
        : `\\sqrt{${slotToLatex(doc, node.radSlot)}}`

    case 'supsub': {
      const base = slotToLatex(doc, node.baseSlot)
      // A single character needs no braces; anything longer does, or the
      // script would attach to just the last token of the base.
      let out = base.length === 1 ? base : `{${base}}`
      if (node.supSlot) out += `^{${slotToLatex(doc, node.supSlot)}}`
      if (node.subSlot) out += `_{${slotToLatex(doc, node.subSlot)}}`
      return out
    }

    case 'bigop': {
      // \lim's "limit" is a subscript in both display and inline math, and it
      // has no superscript form at all, so it doesn't follow the pattern below.
      if (node.op === 'lim') {
        const sub = slotToLatex(doc, node.subSlot)
        return sub ? `\\lim_{${sub}}` : '\\lim'
      }
      let out = BIGOP_CMD[node.op]
      // Empty limits are skipped rather than emitted as `_{}` — harmless to
      // compile, but it leaves the source cluttered with empty braces.
      if (slotHasContent(doc, node.subSlot)) out += `_{${slotToLatex(doc, node.subSlot)}}`
      if (slotHasContent(doc, node.supSlot)) out += `^{${slotToLatex(doc, node.supSlot)}}`
      return out
    }

    case 'group':
      // \left…\right grows the delimiters to fit whatever is between them.
      return `\\left${node.open}${slotToLatex(doc, node.slot)}\\right${node.close}`

    case 'matrix': {
      const body = node.rows
        .map((row) => row.map((cellSlot) => slotToLatex(doc, cellSlot)).join(' & '))
        .join(' \\\\ ')
      return `\\begin{${node.kind}}${body}\\end{${node.kind}}`
    }

    case 'textrun':
      return `\\text{${slotToLatex(doc, node.slot)}}`

    case 'mathrun':
      return `{${slotToLatex(doc, node.slot)}}`

    case 'cmdrun':
      // A declaration applies to the rest of its enclosing group, so it needs
      // braces around both the command and its content; a function takes its
      // content as an argument instead. See MathNode's `declare` field.
      return node.declare
        ? `{\\${node.cmd} ${slotToLatex(doc, node.slot)}}`
        : `\\${node.cmd}{${slotToLatex(doc, node.slot)}}`

    case 'newline':
      return '\\\\'
  }
}

// --- Math blocks -------------------------------------------------------------

/** Splits a slot's node ids into one segment per visual line, breaking at each
 * top-level newline node (the newline nodes themselves are consumed as
 * separators, not included in either segment). */
function splitOnNewlines(doc: DocState, slotId: SlotId): NodeId[][] {
  const segments: NodeId[][] = [[]]
  for (const id of doc.slots[slotId] ?? []) {
    if (doc.nodes[id]?.type === 'newline') segments.push([])
    else segments[segments.length - 1].push(id)
  }
  return segments
}

/**
 * `\[...\]` (display math) computes its own horizontal placement via glue
 * baked into how display math is typeset — centered by default — which is
 * completely independent of `\leftskip`/`\rightskip`, the mechanism
 * flushleft/flushright/center actually control. Wrapping `\[...\]` in one of
 * those environments therefore does nothing to a display equation, even though
 * it correctly left/right-aligns plain paragraph text.
 *
 * The standard workaround: for non-center alignment, use inline math styled
 * with `\displaystyle` instead — same large operators and fraction sizing as
 * real display math, but it flows as part of the paragraph and genuinely
 * respects flushleft/flushright. Center alignment keeps plain `\[...\]`, since
 * that's already exactly what it does natively (and looks better — proper
 * display spacing above and below — than forcing it inline).
 */
export function wrapMath(source: string, display: boolean, align: Align = 'center'): string {
  if (!display) return `$${source}$`
  if (align !== 'center') return `$\\displaystyle ${source}$`
  return `\\[\n  ${source}\n\\]`
}

export function mathBlockToLatex(doc: DocState, rootSlot: SlotId, display: boolean, align: Align = 'center'): string {
  const segments = splitOnNewlines(doc, rootSlot)

  if (segments.length === 1) return wrapMath(slotToLatex(doc, rootSlot), display, align)

  // A multi-line block still needs each line to independently respect the
  // block's alignment. gather* (the obvious choice for "\\-separated lines")
  // turned out to have exactly the same problem as plain \[...\] — it computes
  // its own per-line centering internally, ignoring flushleft/flushright
  // entirely (confirmed against a real compile). The fix is the same trick as
  // wrapMath above: split into one \displaystyle-styled *inline* math
  // expression per line, joined by a plain text-mode \\ (a normal paragraph
  // line break, valid inside flushleft/center/flushright) instead of a
  // math-mode one. Each line is then genuinely part of the paragraph and
  // respects its alignment, uniformly across all three — so this replaces
  // gather* even for center, rather than keeping two different mechanisms.
  return segments
    .map((ids) => ids.map((id) => nodeToLatex(doc, id)).join(' '))
    .map((line) => `$\\displaystyle ${line}$`)
    .join(' \\\\\n')
}

// --- Text blocks -------------------------------------------------------------

/**
 * A run of non-whitespace this long has no space for TeX's line-breaker to
 * use, so it just sticks out past the margin (a genuine Overfull \hbox) —
 * confirmed against a real pdflatex compile. \seqsplit (from the seqsplit
 * package) allows breaking at any character, which is the standard LaTeX fix
 * for accidental super-long unbroken runs. Applied only to plain text blocks,
 * never to generated math or raw LaTeX, since blindly wrapping a "token" there
 * could just as easily be a real command like \int_{0}^{\infty} and corrupt it.
 */
const LONG_TOKEN_THRESHOLD = 40

function protectLongTokens(text: string): string {
  return text
    .split(/(\s+)/)
    .map((token) => (token.length > LONG_TOKEN_THRESHOLD ? `\\seqsplit{${token}}` : token))
    .join('')
}

// --- Alignment ---------------------------------------------------------------

const ALIGN_ENV: Record<Align, string> = { left: 'flushleft', center: 'center', right: 'flushright' }

/**
 * Applies a block's chosen alignment as a real LaTeX environment. Needed
 * (rather than just CSS in the widget/preview panels) for the alignment to
 * actually take effect once the source is compiled by a real LaTeX engine.
 * Note this only affects plain paragraph text and the \displaystyle-based math
 * from wrapMath — a bare \[...\] ignores it entirely; see wrapMath.
 */
function wrapAlign(content: string, align: Align): string {
  const env = ALIGN_ENV[align]
  return `\\begin{${env}}\n${content}\n\\end{${env}}`
}

/**
 * Sectioning commands (\section, \subsection, ...) are fundamentally
 * incompatible with list-derived environments like flushleft/center/flushright
 * — confirmed against a real compile: two such blocks in a row produces
 * "LaTeX Error: Something's wrong--perhaps a missing \item." at the second
 * one's \end{flushleft}, even though a single one often slips through
 * unnoticed.
 */
const STRUCTURE_COMMAND = /^\s*\\(?:title|section|subsection|subsubsection|paragraph|maketitle)\b/

const STRUCTURE_ALIGN_DECLARATION: Record<Align, string | null> = {
  // \section already renders flush-left by default — no wrapping needed, and
  // wrapping in a plain group would be a no-op anyway.
  left: null,
  center: 'centering',
  right: 'raggedleft'
}

/**
 * Center/right alignment for a heading still needs *some* mechanism, just not
 * an environment: \centering and \raggedleft are declarations (they set
 * \leftskip/\rightskip directly), not list-based like their center/flushright
 * environment counterparts, so they don't trigger the \item conflict —
 * confirmed against a real compile, including two centered sections stacked
 * back to back (the exact case that broke before). This is also the standard,
 * widely-documented way to align a single heading in LaTeX, for this reason.
 */
function wrapStructureAlign(content: string, align: Align): string {
  const declaration = STRUCTURE_ALIGN_DECLARATION[align]
  if (!declaration) return content
  return `{\\${declaration}\n${content}\n\\par}`
}

// --- Lists -------------------------------------------------------------------

const LIST_ALIGN_DECLARATION: Record<Align, string | null> = {
  left: null,
  center: 'centering',
  right: 'raggedleft'
}

/**
 * Alignment inside a list item can't use wrapAlign's environments or
 * wrapStructureAlign's bare declarations — confirmed against a real compile,
 * both drag the item's label along with the content: a centered first
 * paragraph puts "b)" in the middle of the line with it. A top-aligned
 * minipage the width of the item keeps the label at the left margin, lines
 * its first baseline up with the label, and still wraps long text inside it.
 * Left is the natural flow inside an item, so it needs no wrapper at all.
 */
function wrapListAlign(content: string, align: Align): string {
  const declaration = LIST_ALIGN_DECLARATION[align]
  if (!declaration) return content
  return `\\begin{minipage}[t]{\\linewidth}\\${declaration}\n${content}\n\\end{minipage}`
}

function listToLatex(doc: DocState, list: ListBlock): string {
  // An item-less list is a compile error ("Something's wrong--perhaps a
  // missing \item"), so it emits nothing until it has an item.
  if (list.items.length === 0) return ''

  const spec = enumerateLabelSpec(list.numbering, list.labelFormat)
  const env = spec ? 'enumerate' : 'itemize'
  // The enumerate package swaps the counter letter in `[a)]` for the live
  // counter, at any nesting depth — no \labelenumi/\labelenumii juggling.
  const options = spec ? `[${spec}]` : ''

  const items = list.items.map((item) => {
    const content = item.blocks
      .map((id) => doc.blocksById[id])
      .filter((block): block is Block => Boolean(block))
      .map((block) => blockToLatex(doc, block, true))
      .filter((latex) => latex.trim() !== '')
      .join('\n\n')
    return content ? `\\item ${content}` : '\\item'
  })
  return `\\begin{${env}}${options}\n${items.join('\n')}\n\\end{${env}}`
}

// --- Proofs ------------------------------------------------------------------

/**
 * One `align*` row per step. The `&` before each relation is the column every
 * relation lines up on; the `&&` before a reason starts a further,
 * left-aligned column, so the reasons line up with each other too. Only the
 * first row has anything left of its relation — the starting expression.
 * align* is display math with its own centering, so like a list the proof has
 * no alignment setting.
 */
export function proofToLatex(doc: DocState, proof: ProofBlock): string {
  const rows = proof.steps.map((step, index) => {
    const left = index === 0 ? `${slotToLatex(doc, proof.startSlot)} ` : ''
    const reason = step.reason.trim()
    const note = reason ? ` && \\text{${escapeProofReason(reason)}}` : ''
    // align* never breaks a long row by itself. A New Line inside a step's
    // expression is the manual break: each further segment becomes its own
    // row, indented past the relation column, with the reason kept on the
    // step's first row.
    const [first, ...rest] = splitOnNewlines(doc, step.slot).map((ids) =>
      ids.map((id) => nodeToLatex(doc, id)).join(' ')
    )
    const continuations = rest.map((segment) => ` \\\\\n  &\\quad ${segment}`).join('')
    return `  ${left}&${proofRelationTex(step.relation)} ${first}${note}${continuations}`
  })
  return `\\begin{align*}\n${rows.join(' \\\\\n')}\n\\end{align*}`
}

// --- Whole document ----------------------------------------------------------

/**
 * `inList` is set for blocks inside a list item, which align with
 * wrapListAlign instead of environments. Their math also always takes
 * wrapMath's `\displaystyle` path (by passing it a non-center alignment):
 * a `\[...\]` as an item's content starts a new line, leaving the item's
 * label stranded alone on the line above it.
 */
function blockToLatex(doc: DocState, block: Block, inList = false): string {
  const wrap = inList ? wrapListAlign : wrapAlign
  switch (block.type) {
    case 'text': {
      const processed = protectLongTokens(block.text)
      // Defensive fallback for anyone who manually types a structure command
      // into a plain text block — the normal path is the dedicated 'heading'
      // block type below, which sidesteps needing to detect this at all.
      return STRUCTURE_COMMAND.test(block.text)
        ? wrapStructureAlign(processed, block.align)
        : wrap(processed, block.align)
    }
    case 'heading':
      return wrapStructureAlign(`\\${block.level}{${block.text}}`, block.align)
    case 'rawmath':
      return wrap(wrapMath(block.source, block.display, inList ? 'left' : block.align), block.align)
    case 'math':
      return wrap(mathBlockToLatex(doc, block.rootSlot, block.display, inList ? 'left' : block.align), block.align)
    case 'list':
      return listToLatex(doc, block)
    case 'proof':
      return proofToLatex(doc, block)
    case 'circuit': {
      // An empty circuit emits nothing, rather than an empty alignment
      // environment around nothing.
      const picture = circuitToLatex(block)
      return picture ? wrap(picture, block.align) : ''
    }
  }
}

/**
 * The \title argument, with the optional top offset and subtitle folded in.
 * \maketitle sets the title inside a centered tabular, so a \vspace at its
 * start shifts the whole title block (negative moves it up), and a \\ starts
 * the subtitle on its own line beneath it. Done here rather than with the
 * titling package's \droptitle, which isn't part of every TeX install.
 */
function titleArgument(doc: DocState): string {
  const offset = doc.titleOffsetCm ?? 0
  const subtitle = doc.subtitle?.trim()
  let out = doc.title || 'Untitled Document'
  if (offset !== 0) out = `\\vspace{${offset}cm}${out}`
  if (subtitle) out += `\\\\[0.4em]\\large ${subtitle}`
  return out
}

const PREAMBLE_PACKAGES = ['amsmath', 'amssymb', 'amsfonts', 'seqsplit', 'enumerate']

/** Full standalone .tex document source for the whole page. */
export function documentToLatex(doc: DocState): string {
  const body = doc.blocks
    .map((blockId) => {
      const block = doc.blocksById[blockId]
      return block ? blockToLatex(doc, block) : ''
    })
    .join('\n\n')

  return [
    '\\documentclass{article}',
    ...PREAMBLE_PACKAGES.map((pkg) => `\\usepackage{${pkg}}`),
    // TikZ is slow to load, so it's only pulled in when there's a circuit.
    ...(Object.values(doc.blocksById).some((b) => b.type === 'circuit') ? CIRCUIT_PREAMBLE : []),
    '',
    `\\title{${titleArgument(doc)}}`,
    // An empty \date suppresses the automatic "today" that \maketitle would
    // otherwise print under the title.
    '\\date{}',
    '',
    '\\begin{document}',
    '\\maketitle',
    '',
    body,
    '',
    '\\end{document}',
    ''
  ].join('\n')
}
