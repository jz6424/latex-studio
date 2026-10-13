import type { CircuitBlock, CircuitGate, GateKind } from './types'

/**
 * Logic-circuit geometry and TikZ output.
 *
 * Positions are in grid units, where one unit is 4mm in the PDF (`x=4mm`,
 * `y=-4mm`, so y grows downward as on screen) and UNIT_PX on screen. A gate's
 * (x, y) is its center, which is exactly what TikZ's `at (x, y)` places, so
 * the editor and the compiled PDF agree on where everything is.
 *
 * The shape measurements below were read off TikZ itself (circuits.logic.US
 * with `logic gate input sep=4mm`) — TikZ sizes each gate from its input
 * count and ignores any size you ask for, so the editor copies its sizes
 * rather than the other way round.
 */

export const UNIT_PX = 20

/** Shapes that stand in for an unknown gate — drawn by us rather than by
 * TikZ's circuit library, so they can have any number of inputs. */
export const PLACEHOLDER_KINDS: GateKind[] = ['diamond', 'box', 'circle', 'hexagon']

export function isPlaceholder(kind: GateKind): boolean {
  return PLACEHOLDER_KINDS.includes(kind)
}

/** Kinds that carry a LaTeX label: pin names and placeholder text. */
export function hasLabel(kind: GateKind): boolean {
  return kind === 'input' || kind === 'output' || isPlaceholder(kind)
}

export const MAX_INPUTS = 4

/** How many inputs a kind may have, or null if it's fixed. XOR/XNOR are
 * fixed at two: TikZ's US xor shape quietly ignores `inputs=` and only ever
 * has two. A placeholder can have as few as one. */
export function inputRange(kind: GateKind): { min: number; max: number } | null {
  if (kind === 'and' || kind === 'or' || kind === 'nand' || kind === 'nor') return { min: 2, max: MAX_INPUTS }
  if (isPlaceholder(kind)) return { min: 1, max: MAX_INPUTS }
  return null
}

export const GATE_KINDS: { kind: GateKind; label: string }[] = [
  { kind: 'input', label: 'Input' },
  { kind: 'output', label: 'Output' },
  { kind: 'and', label: 'AND' },
  { kind: 'or', label: 'OR' },
  { kind: 'not', label: 'NOT' },
  { kind: 'nand', label: 'NAND' },
  { kind: 'nor', label: 'NOR' },
  { kind: 'xor', label: 'XOR' },
  { kind: 'xnor', label: 'XNOR' },
  { kind: 'diamond', label: '\u25c7 Diamond' },
  { kind: 'box', label: '\u25a1 Box' },
  { kind: 'circle', label: '\u25cb Circle' },
  { kind: 'hexagon', label: '\u2b21 Hexagon' }
]

/** The text a new placeholder starts with. */
export const PLACEHOLDER_DEFAULT_LABEL = '?'

export function gateKindLabel(kind: GateKind): string {
  return GATE_KINDS.find((g) => g.kind === kind)?.label ?? kind
}

export function defaultInputCount(kind: GateKind): number {
  if (kind === 'input') return 0
  if (kind === 'not' || kind === 'output') return 1
  return 2
}

// --- Shapes ------------------------------------------------------------------

/** Measured from TikZ, relative to the gate's center: `w` the back edge, `e`
 * the front of the body (before any bubble), `h` the half-height. */
interface BodyMetrics {
  w: number
  e: number
  h: number
}

const AND_BODY: Record<number, BodyMetrics> = {
  2: { w: -1.768, e: 2.018, h: 1.518 },
  3: { w: -2.351, e: 2.684, h: 2.018 },
  4: { w: -2.934, e: 3.351, h: 2.518 }
}

const OR_BODY: Record<number, BodyMetrics> = {
  2: { w: -1.366, e: 2.368, h: 1.507 },
  3: { w: -1.815, e: 3.151, h: 2.004 },
  4: { w: -2.264, e: 3.934, h: 2.5 }
}

/** XOR is the two-input OR body plus a second back curve half a unit behind
 * it, which is where its inputs attach. */
const XOR_EXTRA_BACK = 0.5

const NOT_BODY: BodyMetrics = { w: -0.851, e: 1.586, h: 0.784 }

/** Diameter of the inverting bubble on NAND/NOR/XNOR/NOT. */
const BUBBLE = 0.323

/** An OR-style back edge is a parabola: inputs further from the middle sit
 * further back. Fitted to TikZ's input anchors (it matches all three sizes). */
const OR_BACK_CURVE = 0.256

function orBackX(w: number, h: number, y: number): number {
  return w - (OR_BACK_CURVE * y * y) / h
}

type Family = 'and' | 'or' | 'xor' | 'not' | 'terminal' | 'placeholder'

function family(kind: GateKind): Family {
  switch (kind) {
    case 'and':
    case 'nand':
      return 'and'
    case 'or':
    case 'nor':
      return 'or'
    case 'xor':
    case 'xnor':
      return 'xor'
    case 'not':
      return 'not'
    case 'input':
    case 'output':
      return 'terminal'
    default:
      return 'placeholder'
  }
}

function isInverting(kind: GateKind): boolean {
  return kind === 'nand' || kind === 'nor' || kind === 'xnor' || kind === 'not'
}

/** Half-width `a` and half-height `h` of a placeholder shape. Tall enough
 * that every input (one unit apart) meets its left edge; the pointed shapes
 * are a unit wider so their inputs don't crowd the tips. */
function placeholderSize(gate: CircuitGate): { a: number; h: number } {
  const h = Math.max(1, gate.inputs / 2 + 0.5)
  switch (gate.kind) {
    case 'box':
      return { a: 1.5, h }
    case 'circle':
      return { a: h, h }
    default:
      return { a: h + 0.5, h }
  }
}

/** Where a placeholder's left edge is at height y (|y| < h). */
function placeholderLeftX(gate: CircuitGate, y: number): number {
  const { a, h } = placeholderSize(gate)
  switch (gate.kind) {
    case 'box':
      return -a
    case 'circle':
      return -Math.sqrt(Math.max(0, a * a - y * y))
    case 'diamond':
      return -a * (1 - Math.abs(y) / h)
    default:
      // Hexagon with points left and right, its slanted sides meeting the
      // top and bottom edges halfway in.
      return -a + (a / 2) * (Math.abs(y) / h)
  }
}

/** The outline's corners (for polygons) in grid units, relative to center. */
function placeholderPolygon(gate: CircuitGate): { x: number; y: number }[] | null {
  const { a, h } = placeholderSize(gate)
  switch (gate.kind) {
    case 'box':
      return [
        { x: -a, y: -h },
        { x: a, y: -h },
        { x: a, y: h },
        { x: -a, y: h }
      ]
    case 'diamond':
      return [
        { x: -a, y: 0 },
        { x: 0, y: -h },
        { x: a, y: 0 },
        { x: 0, y: h }
      ]
    case 'hexagon':
      return [
        { x: -a, y: 0 },
        { x: -a / 2, y: -h },
        { x: a / 2, y: -h },
        { x: a, y: 0 },
        { x: a / 2, y: h },
        { x: -a / 2, y: h }
      ]
    default:
      return null
  }
}

function bodyMetrics(gate: CircuitGate): BodyMetrics {
  const n = Math.min(MAX_INPUTS, Math.max(2, gate.inputs))
  switch (family(gate.kind)) {
    case 'and':
      return AND_BODY[n]
    case 'or':
      return OR_BODY[n]
    case 'xor':
      return OR_BODY[2]
    case 'not':
      return NOT_BODY
    case 'terminal':
      return { w: 0, e: 0, h: 0.5 }
    case 'placeholder': {
      const { a, h } = placeholderSize(gate)
      return { w: -a, e: a, h }
    }
  }
}

/** Where wires attach, in grid units, relative to the gate's center. */
export function outputOffset(gate: CircuitGate): { x: number; y: number } {
  if (gate.kind === 'input') return { x: 0, y: 0 }
  const { e } = bodyMetrics(gate)
  return { x: e + (isInverting(gate.kind) ? BUBBLE : 0), y: 0 }
}

/** Input 0 is the top one, matching TikZ's `input 1`. */
export function inputOffset(gate: CircuitGate, index: number): { x: number; y: number } {
  if (gate.kind === 'output' || gate.kind === 'not') {
    return { x: gate.kind === 'not' ? NOT_BODY.w : 0, y: 0 }
  }
  const y = index - (gate.inputs - 1) / 2
  const { w, h } = bodyMetrics(gate)
  switch (family(gate.kind)) {
    case 'placeholder':
      return { x: placeholderLeftX(gate, y), y }
    case 'or':
      return { x: orBackX(w, h, y), y }
    case 'xor':
      return { x: orBackX(w - XOR_EXTRA_BACK, h, y), y }
    default:
      return { x: w, y }
  }
}

export function hasOutput(gate: CircuitGate): boolean {
  return gate.kind !== 'output'
}

/** SVG path data for a gate's outline, in pixels relative to its center. */
export function gateOutlinePath(gate: CircuitGate): string {
  const { w, e, h } = bodyMetrics(gate)
  const p = (x: number, y: number): string => `${(x * UNIT_PX).toFixed(1)} ${(y * UNIT_PX).toFixed(1)}`
  switch (family(gate.kind)) {
    case 'and': {
      // Flat back, flat top and bottom, and a half-circle front of radius h.
      const r = h * UNIT_PX
      return `M ${p(w, -h)} L ${p(e - h, -h)} A ${r} ${r} 0 0 1 ${p(e - h, h)} L ${p(w, h)} Z`
    }
    case 'or':
    case 'xor': {
      const backTop = orBackX(w, h, -h)
      const body =
        `M ${p(backTop, -h)} Q ${p(w + (e - w) * 0.55, -h)} ${p(e, 0)} ` +
        `Q ${p(w + (e - w) * 0.55, h)} ${p(backTop, h)} ` +
        // Quadratic control point that makes the curve pass through (w, 0).
        `Q ${p(w + OR_BACK_CURVE * h, 0)} ${p(backTop, -h)} Z`
      if (family(gate.kind) === 'or') return body
      const xw = w - XOR_EXTRA_BACK
      const extra = `M ${p(orBackX(xw, h, -h), -h)} Q ${p(xw + OR_BACK_CURVE * h, 0)} ${p(orBackX(xw, h, h), h)}`
      return `${body} ${extra}`
    }
    case 'not':
      return `M ${p(w, -h)} L ${p(e, 0)} L ${p(w, h)} Z`
    case 'terminal':
      return ''
    case 'placeholder': {
      const corners = placeholderPolygon(gate)
      if (corners) return `M ${corners.map((c) => p(c.x, c.y)).join(' L ')} Z`
      const r = h * UNIT_PX
      return `M ${p(-h, 0)} A ${r} ${r} 0 1 1 ${p(h, 0)} A ${r} ${r} 0 1 1 ${p(-h, 0)} Z`
    }
  }
}

/** Center and radius (px) of the inverting bubble, or null for gates
 * without one. */
export function bubble(gate: CircuitGate): { cx: number; r: number } | null {
  if (!isInverting(gate.kind)) return null
  const { e } = bodyMetrics(gate)
  return { cx: (e + BUBBLE / 2) * UNIT_PX, r: (BUBBLE / 2) * UNIT_PX }
}

/** Half-extents in grid units, for sizing the canvas and spacing new gates. */
export function gateExtent(gate: CircuitGate): { left: number; right: number; half: number } {
  if (family(gate.kind) === 'terminal') return { left: 2, right: 2, half: 0.5 }
  const { w, h } = bodyMetrics(gate)
  const back = family(gate.kind) === 'xor' ? w - XOR_EXTRA_BACK : w
  return { left: -back + 0.5, right: outputOffset(gate).x + 0.5, half: h }
}

/** The orthogonal route both the editor and TikZ draw for a wire: across to
 * the midpoint's x, then up or down, then across into the input. */
export function wireRoute(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number }[] {
  const midX = (from.x + to.x) / 2
  return [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to]
}

// --- Labels ------------------------------------------------------------------

const INPUT_LABELS = ['p', 'q', 'r', 's', 't', 'u', 'v', 'w']
const OUTPUT_LABELS = ['f', 'g', 'h', 'k']

/** The first conventional name not already used by a terminal of this kind. */
export function nextTerminalLabel(circuit: CircuitBlock, kind: 'input' | 'output'): string {
  const used = new Set(circuit.gates.filter((g) => g.kind === kind).map((g) => g.label))
  const pool = kind === 'input' ? INPUT_LABELS : OUTPUT_LABELS
  const free = pool.find((label) => !used.has(label))
  if (free) return free
  const base = kind === 'input' ? 'x' : 'y'
  let i = 1
  while (used.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}

// --- TikZ ----------------------------------------------------------------------

export const CIRCUIT_TIKZ_LIBRARIES = '\\usetikzlibrary{circuits.logic.US,calc}'

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000)

function inputsSpec(count: number): string {
  return 'n'.repeat(count)
}

/** A TikZ point for a wire end. Library gates and pins are referred to by
 * anchor; placeholders are drawn as plain paths with no anchors, so their
 * ports are given as coordinates, computed the same way as on screen. */
function inputPoint(gate: CircuitGate, name: string, index: number): string {
  if (isPlaceholder(gate.kind)) return absolute(gate, inputOffset(gate, index))
  if (gate.kind === 'output') return `(${name}.center)`
  if (gate.kind === 'not') return `(${name}.input)`
  return `(${name}.input ${index + 1})`
}

function outputPoint(gate: CircuitGate, name: string): string {
  if (isPlaceholder(gate.kind)) return absolute(gate, outputOffset(gate))
  return gate.kind === 'input' ? `(${name}.center)` : `(${name}.output)`
}

function absolute(gate: CircuitGate, offset: { x: number; y: number }): string {
  return `(${fmt(gate.x + offset.x)}, ${fmt(gate.y + offset.y)})`
}

/** A placeholder: its outline as a closed path, and its label centered. */
function placeholderToLatex(gate: CircuitGate): string {
  const corners = placeholderPolygon(gate)
  const outline = corners
    ? `${corners.map((c) => absolute(gate, c)).join(' -- ')} -- cycle`
    : `(${fmt(gate.x)}, ${fmt(gate.y)}) circle[radius=${fmt(placeholderSize(gate).h)}]`
  const label = gate.label.trim()
  const text = label ? `\n  \\node at (${fmt(gate.x)}, ${fmt(gate.y)}) {$${label}$};` : ''
  return `  \\draw ${outline};${text}`
}

/**
 * A tikzpicture for the circuit, or '' while it has no gates. Terminals are
 * small dots with their name beside them, so the wire end is exactly the
 * point the editor shows. Each wire goes through a named coordinate for each
 * end, because calc's `!0.5!` can't parse an anchor with a space in it
 * (`input 1`) directly.
 */
export function circuitToLatex(circuit: CircuitBlock): string {
  if (circuit.gates.length === 0) return ''
  const names = new Map(circuit.gates.map((g, i) => [g.id, `g${i + 1}`]))

  const nodes = circuit.gates.map((gate) => {
    const name = names.get(gate.id)
    const at = `(${fmt(gate.x)}, ${fmt(gate.y)})`
    if (isPlaceholder(gate.kind)) return placeholderToLatex(gate)
    if (gate.kind === 'input' || gate.kind === 'output') {
      const side = gate.kind === 'input' ? 'left' : 'right'
      const label = gate.label.trim() ? `, label=${side}:{$${gate.label.trim()}$}` : ''
      return `  \\node[terminal${label}] (${name}) at ${at} {};`
    }
    const inputs = gate.kind === 'not' ? '' : `, inputs=${inputsSpec(gate.inputs)}`
    return `  \\node[${gate.kind} gate${inputs}] (${name}) at ${at} {};`
  })

  const byId = new Map(circuit.gates.map((g) => [g.id, g]))
  const wires = circuit.wires.flatMap((wire) => {
    const from = byId.get(wire.from)
    const to = byId.get(wire.to)
    if (!from || !to) return []
    return [
      `  \\coordinate (a) at ${outputPoint(from, names.get(from.id) ?? '')};` +
        ` \\coordinate (b) at ${inputPoint(to, names.get(to.id) ?? '', wire.input)};` +
        ' \\draw (a) -| ($(a)!0.5!(b)$) |- (b);'
    ]
  })

  return [
    '\\begin{tikzpicture}[circuit logic US, x=4mm, y=-4mm, logic gate input sep=4mm,',
    '  terminal/.style={circle, fill, inner sep=1.2pt}]',
    ...nodes,
    ...wires,
    '\\end{tikzpicture}'
  ].join('\n')
}
