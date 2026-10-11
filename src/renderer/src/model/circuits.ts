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

/** Gates whose input count can change. XOR/XNOR are fixed at two: TikZ's US
 * xor shape quietly ignores `inputs=` and only ever has two. */
export const VARIABLE_INPUT_KINDS: GateKind[] = ['and', 'or', 'nand', 'nor']
export const MIN_INPUTS = 2
export const MAX_INPUTS = 4

export const GATE_KINDS: { kind: GateKind; label: string }[] = [
  { kind: 'input', label: 'Input' },
  { kind: 'output', label: 'Output' },
  { kind: 'and', label: 'AND' },
  { kind: 'or', label: 'OR' },
  { kind: 'not', label: 'NOT' },
  { kind: 'nand', label: 'NAND' },
  { kind: 'nor', label: 'NOR' },
  { kind: 'xor', label: 'XOR' },
  { kind: 'xnor', label: 'XNOR' }
]

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

type Family = 'and' | 'or' | 'xor' | 'not' | 'terminal'

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
    default:
      return 'terminal'
  }
}

function isInverting(kind: GateKind): boolean {
  return kind === 'nand' || kind === 'nor' || kind === 'xnor' || kind === 'not'
}

function bodyMetrics(gate: CircuitGate): BodyMetrics {
  const n = Math.min(MAX_INPUTS, Math.max(MIN_INPUTS, gate.inputs))
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

export const CIRCUIT_PREAMBLE = ['\\usepackage{tikz}', '\\usetikzlibrary{circuits.logic.US,calc}']

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000)

function inputsSpec(count: number): string {
  return 'n'.repeat(count)
}

function inputAnchor(gate: CircuitGate, index: number): string {
  if (gate.kind === 'output') return 'center'
  if (gate.kind === 'not') return 'input'
  return `input ${index + 1}`
}

function outputAnchor(gate: CircuitGate): string {
  return gate.kind === 'input' ? 'center' : 'output'
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
      `  \\coordinate (a) at (${names.get(from.id)}.${outputAnchor(from)});` +
        ` \\coordinate (b) at (${names.get(to.id)}.${inputAnchor(to, wire.input)});` +
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
