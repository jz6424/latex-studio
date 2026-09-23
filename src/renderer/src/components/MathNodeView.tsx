import { useDocStore } from '../model/store'
import { slotToLatex } from '../model/generate'
import { isLikelyToOverflowLine } from '../model/warnings'
import type { BigOp } from '../model/types'
import NodeWrapper from './NodeWrapper'
import MathSlot from './MathSlot'
import OverflowWarningBadge from './OverflowWarningBadge'

/** Plain-text stand-ins for the big operator glyphs. The widget canvas draws
 * its own approximation of the notation rather than typesetting it — the exact
 * KaTeX rendering is what the preview below each block is for. */
const BIGOP_GLYPH: Record<BigOp, string> = {
  sum: '∑',
  prod: '∏',
  int: '∫',
  oint: '∮',
  lim: 'lim'
}

/**
 * Draws one structural math widget: an editable approximation of the notation,
 * built from nested MathSlots that content can be dropped into.
 *
 * Text leaves never reach here — MathSlot routes those to EditableTextLeaf.
 */
export default function MathNodeView({
  nodeId,
  slotId,
  deletable = true
}: {
  nodeId: string
  slotId: string
  /** Passed through to this node's own NodeWrapper — see its identical prop. */
  deletable?: boolean
}): JSX.Element | null {
  const doc = useDocStore((s) => s.doc)
  const node = doc.nodes[nodeId]
  if (!node) return null

  switch (node.type) {
    case 'frac':
      return (
        <NodeWrapper nodeId={nodeId} slotId={slotId} className="widget widget-frac" deletable={deletable}>
          <span className="frac-col">
            <MathSlot slotId={node.numSlot} className="frac-num" empty />
            <span className="frac-bar" />
            <MathSlot slotId={node.denSlot} className="frac-den" empty />
          </span>
        </NodeWrapper>
      )

    case 'sqrt':
      return (
        <NodeWrapper nodeId={nodeId} slotId={slotId} className="widget widget-sqrt" deletable={deletable}>
          {node.indexSlot && <MathSlot slotId={node.indexSlot} className="sqrt-index" empty />}
          {/* The tick and the radicand share one border-top, so the bar is a
              single continuous line instead of two pieces trying to align. */}
          <span className="sqrt-body">
            <span className="sqrt-symbol">√</span>
            <span className="sqrt-radicand-wrap">
              <MathSlot slotId={node.radSlot} className="sqrt-radicand" empty />
            </span>
          </span>
        </NodeWrapper>
      )

    case 'supsub':
      return (
        <NodeWrapper nodeId={nodeId} slotId={slotId} className="widget widget-supsub" deletable={deletable}>
          <MathSlot slotId={node.baseSlot} className="supsub-base" empty />
          {/* An absent script still reserves its half of the stack, so a
              sub-only widget's base sits at the same height as a sup-only
              one's rather than jumping up. */}
          <span className="supsub-stack">
            {node.supSlot ? (
              <MathSlot slotId={node.supSlot} className="supsub-sup" empty />
            ) : (
              <span className="supsub-spacer" />
            )}
            {node.subSlot ? (
              <MathSlot slotId={node.subSlot} className="supsub-sub" empty />
            ) : (
              <span className="supsub-spacer" />
            )}
          </span>
        </NodeWrapper>
      )

    case 'bigop':
      return (
        <NodeWrapper nodeId={nodeId} slotId={slotId} className="widget widget-bigop" deletable={deletable}>
          <span className="bigop-stack">
            {node.supSlot && <MathSlot slotId={node.supSlot} className="bigop-sup" empty />}
            <span className="bigop-glyph">{BIGOP_GLYPH[node.op]}</span>
            {/* A limit's "x \to a" is a fixed skeleton (see factory.ts),
                not freely-added content — locked keeps its three pieces
                from being individually deleted. */}
            {node.subSlot && (
              <MathSlot slotId={node.subSlot} className="bigop-sub" empty locked={node.op === 'lim'} />
            )}
          </span>
        </NodeWrapper>
      )

    case 'group':
      // The model stores LaTeX-escaped delimiters (`\{`); strip the escape for
      // display, since this is showing the brace, not the source.
      return (
        <NodeWrapper nodeId={nodeId} slotId={slotId} className="widget widget-group" deletable={deletable}>
          <span className="group-delim">{unescapeDelimiter(node.open)}</span>
          <MathSlot slotId={node.slot} className="group-inner" empty />
          <span className="group-delim">{unescapeDelimiter(node.close)}</span>
        </NodeWrapper>
      )

    // Text and Math runs are the two widgets that hold prose, so they wrap and
    // are the ones that can realistically grow long enough to overflow a line.
    case 'textrun':
      return (
        <NodeWrapper nodeId={nodeId} slotId={slotId} className="widget widget-textrun" deletable={deletable}>
          <MathSlot slotId={node.slot} className="textrun-inner" empty wrap />
          <OverflowWarningBadge show={isLikelyToOverflowLine(slotToLatex(doc, node.slot))} />
        </NodeWrapper>
      )

    case 'mathrun':
      return (
        <NodeWrapper nodeId={nodeId} slotId={slotId} className="widget widget-mathrun" deletable={deletable}>
          <MathSlot slotId={node.slot} className="mathrun-inner" empty wrap />
          <OverflowWarningBadge show={isLikelyToOverflowLine(slotToLatex(doc, node.slot))} />
        </NodeWrapper>
      )

    case 'cmdrun':
      // The cmd-* class is what lets the canvas mimic the command's effect
      // (e.g. cmd-Large scales its contents up); see widgets.css.
      return (
        <NodeWrapper
          nodeId={nodeId}
          slotId={slotId}
          className={`widget widget-cmdrun cmd-${node.cmd}`}
          deletable={deletable}
        >
          <MathSlot slotId={node.slot} className="cmdrun-inner" empty />
        </NodeWrapper>
      )

    case 'matrix': {
      const columns = node.rows[0]?.length ?? 1
      return (
        <NodeWrapper nodeId={nodeId} slotId={slotId} className="widget widget-matrix" deletable={deletable}>
          <span className="matrix-delim">{node.kind === 'bmatrix' ? '[' : '('}</span>
          {/* Cells are laid out by the grid itself, so they're rendered as one
              flat list rather than nested row elements. */}
          <span
            className="matrix-grid"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(28px, auto))` }}
          >
            {node.rows.flat().map((cellSlot) => (
              <MathSlot key={cellSlot} slotId={cellSlot} className="matrix-cell" empty />
            ))}
          </span>
          <span className="matrix-delim">{node.kind === 'bmatrix' ? ']' : ')'}</span>
        </NodeWrapper>
      )
    }

    // 'text' and 'newline' are handled by MathSlot, never routed here.
    default:
      return null
  }
}

function unescapeDelimiter(delimiter: string): string {
  return delimiter.startsWith('\\') ? delimiter.slice(1) : delimiter
}
