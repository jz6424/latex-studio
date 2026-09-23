// Normalized document model.
//
// A document is a flat list of *blocks* (paragraphs, headings, equations).
// An equation block owns a tree built from two alternating kinds of thing:
//   - a "slot" is an ordered sequence of node ids — a horizontal run of math
//     content, and the only thing you can drop into;
//   - a "node" is either a text leaf or a structural widget (fraction, root,
//     matrix, ...) that owns one or more child slots.
//
// Slots and nodes are stored flat in `DocState`, keyed by id, rather than
// nested inline — so any node can be found, moved, or deleted without walking
// the tree to locate its parent first.

// --- Ids ---------------------------------------------------------------------

export type SlotId = string
export type NodeId = string
export type BlockId = string

// --- Math tree ---------------------------------------------------------------

export type BigOp = 'sum' | 'prod' | 'int' | 'oint' | 'lim'

export type MatrixKind = 'pmatrix' | 'bmatrix' | 'vmatrix' | 'Bmatrix'

export type MathNode =
  /** A literal run of LaTeX: typed prose, a symbol like `\alpha`, or `\sin`. */
  | { id: NodeId; type: 'text'; value: string }
  | { id: NodeId; type: 'frac'; numSlot: SlotId; denSlot: SlotId }
  /** `indexSlot` is null for a plain square root, set for an nth root. */
  | { id: NodeId; type: 'sqrt'; indexSlot: SlotId | null; radSlot: SlotId }
  /** Either script may be null, covering sup-only, sub-only, and both. */
  | { id: NodeId; type: 'supsub'; baseSlot: SlotId; supSlot: SlotId | null; subSlot: SlotId | null }
  | { id: NodeId; type: 'bigop'; op: BigOp; subSlot: SlotId | null; supSlot: SlotId | null }
  /** Auto-sized delimiter pair (`\left(` … `\right)`). */
  | { id: NodeId; type: 'group'; open: string; close: string; slot: SlotId }
  | { id: NodeId; type: 'matrix'; kind: MatrixKind; rows: SlotId[][] }
  /** Prose inside math mode — emits `\text{…}`. */
  | { id: NodeId; type: 'textrun'; slot: SlotId }
  /** A plain `{…}` group, used to scope content without changing its look. */
  | { id: NodeId; type: 'mathrun'; slot: SlotId }
  /**
   * A LaTeX command applied to its contents. `declare` picks the calling
   * convention: a declaration scoped by a group (`{\large …}`, as font-size
   * commands work), versus an argument-taking function (`\textbf{…}`).
   */
  | { id: NodeId; type: 'cmdrun'; cmd: string; declare: boolean; slot: SlotId }
  /** A line break within an equation — emits `\`. */
  | { id: NodeId; type: 'newline' }

// --- Blocks ------------------------------------------------------------------

export type Align = 'left' | 'center' | 'right'

export type HeadingLevel = 'section' | 'subsection' | 'subsubsection'

export type Block =
  | { id: BlockId; type: 'text'; text: string; align: Align }
  /** An equation built from widgets. `collapsed` hides the builder, leaving
   * only the typeset preview. `display` picks `\[…\]` over `$…$`. */
  | { id: BlockId; type: 'math'; display: boolean; collapsed: boolean; rootSlot: SlotId; align: Align }
  /** An equation typed as raw LaTeX rather than assembled from widgets. */
  | { id: BlockId; type: 'rawmath'; source: string; display: boolean; align: Align }
  | { id: BlockId; type: 'heading'; level: HeadingLevel; text: string; align: Align }

export interface DocState {
  title: string
  /** Block order on the page. */
  blocks: BlockId[]
  blocksById: Record<BlockId, Block>
  slots: Record<SlotId, NodeId[]>
  nodes: Record<NodeId, MathNode>
}

// --- Sidebar tool templates --------------------------------------------------

/**
 * Identifies what a sidebar tool inserts. The fixed ids map to a specific
 * widget shape; the four prefixed families are parameterized by the LaTeX
 * they carry, so a new symbol or command is just another entry in tools.ts
 * with no matching case needed in the factory:
 *   `sym:`     — a literal symbol, e.g. `sym:\alpha`
 *   `fn:`      — a named operator, e.g. `fn:\sin`
 *   `cmddecl:` — a declaration-style command, e.g. `cmddecl:large`
 *   `cmdfn:`   — an argument-taking command, e.g. `cmdfn:textbf`
 */
export type ToolId =
  | 'frac'
  | 'sqrt'
  | 'nthroot'
  | 'sup'
  | 'sub'
  | 'supsub'
  | 'sum'
  | 'prod'
  | 'int'
  | 'oint'
  | 'lim'
  | 'paren'
  | 'bracket'
  | 'brace'
  | 'abs'
  | 'pmatrix2'
  | 'bmatrix2'
  /** Prompts for row/column counts at drop time — see handleDrop.ts. */
  | 'pmatrixN'
  | 'bmatrixN'
  | 'text'
  | 'math'
  | 'newline'
  | `sym:${string}`
  | `fn:${string}`
  | `cmddecl:${string}`
  | `cmdfn:${string}`

export interface ToolDef {
  id: ToolId
  label: string
  /** Rendered by KaTeX for the sidebar swatch and the drag overlay. */
  latexPreview: string
  category: string
}
