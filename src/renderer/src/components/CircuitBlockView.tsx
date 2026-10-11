import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useDocStore } from '../model/store'
import {
  GATE_KINDS,
  MAX_INPUTS,
  MIN_INPUTS,
  UNIT_PX,
  VARIABLE_INPUT_KINDS,
  bubble,
  defaultInputCount,
  gateExtent,
  gateKindLabel,
  gateOutlinePath,
  hasOutput,
  inputOffset,
  outputOffset,
  wireRoute
} from '../model/circuits'
import type { CircuitBlock, CircuitGate, GateKind } from '../model/types'
import BlockMenu from './BlockMenu'
import KatexView from './KatexView'

/** One end of a would-be wire: a gate's output, or one of its inputs. */
type PortRef = { gateId: string; side: 'out' } | { gateId: string; side: 'in'; input: number }

type Selection = { type: 'gate'; id: string } | { type: 'wire'; id: string } | null

interface Point {
  x: number
  y: number
}

/** How close (in grid units) the pointer must be to a port to connect to it. */
const PORT_SNAP = 0.7
/** Below this many pixels of movement, a press on a palette button is a
 * click (add somewhere free) rather than a drag (add where dropped). */
const CLICK_SLOP_PX = 4
const MIN_CANVAS_UNITS = { width: 30, height: 12 }

/** Positions snap to half-units: fine enough that any input can be lined up
 * with any output, coarse enough that lining them up is easy. */
const snap = (v: number): number => Math.round(v * 2) / 2

const px = (units: number): number => units * UNIT_PX

/**
 * A logic-circuit editor: a grid canvas holding gates and input/output pins.
 *
 * Drag a gate from the palette onto the canvas (or click it to drop it in a
 * free spot), drag gates to move them, and drag from one connection dot to
 * another to wire them — output to input, either direction. Click a gate or
 * wire to select it; Delete removes it. The same layout is what goes into the
 * PDF as a TikZ picture (see circuits.ts).
 *
 * All the dragging here is plain pointer events, separate from the app's
 * dnd-kit block/tool dragging, which only starts from block handles and
 * sidebar tools. A drag starts on the element pressed, then follows the
 * pointer through window-level listeners, so it keeps tracking (and always
 * sees the release) wherever the pointer goes.
 */
export default function CircuitBlockView({ block }: { block: CircuitBlock }): JSX.Element {
  const store = useDocStore.getState
  const setBlockAlign = useDocStore((s) => s.setBlockAlign)
  const duplicateBlock = useDocStore((s) => s.duplicateBlock)
  const removeBlock = useDocStore((s) => s.removeBlock)

  const svgRef = useRef<SVGSVGElement>(null)
  const [selected, setSelected] = useState<Selection>(null)
  // A gate being moved: its live position, committed to the store on release
  // so a drag is one edit rather than one per pointer move.
  const [moving, setMoving] = useState<{ gateId: string; offset: Point; at: Point } | null>(null)
  const [wiring, setWiring] = useState<{ from: PortRef; pointer: Point } | null>(null)
  const [paletteDrag, setPaletteDrag] = useState<{
    kind: GateKind
    start: Point
    client: Point
    moved: boolean
  } | null>(null)

  const gates = block.gates.map((g) => (moving?.gateId === g.id ? { ...g, x: moving.at.x, y: moving.at.y } : g))
  const gatesById = new Map(gates.map((g) => [g.id, g]))

  // --- Geometry helpers ------------------------------------------------------

  function toUnits(clientX: number, clientY: number): Point {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (clientX - rect.left) / UNIT_PX, y: (clientY - rect.top) / UNIT_PX }
  }

  function portPoint(port: PortRef): Point | null {
    const gate = gatesById.get(port.gateId)
    if (!gate) return null
    const offset = port.side === 'out' ? outputOffset(gate) : inputOffset(gate, port.input)
    return { x: gate.x + offset.x, y: gate.y + offset.y }
  }

  /** Keeps a gate's whole body on the canvas. */
  function clampToCanvas(gate: Pick<CircuitGate, 'kind' | 'inputs' | 'label' | 'id'>, at: Point): Point {
    const extent = gateExtent({ ...gate, x: 0, y: 0 })
    return { x: Math.max(snap(extent.left), snap(at.x)), y: Math.max(snap(extent.half + 0.5), snap(at.y)) }
  }

  /** The port nearest `point` that `from` could connect to, if any is close. */
  function connectableNear(from: PortRef, point: Point): PortRef | null {
    let best: { port: PortRef; dist: number } | null = null
    for (const gate of gates) {
      if (gate.id === from.gateId) continue
      const candidates: PortRef[] =
        from.side === 'out'
          ? Array.from({ length: gate.inputs }, (_, input) => ({ gateId: gate.id, side: 'in' as const, input }))
          : hasOutput(gate)
            ? [{ gateId: gate.id, side: 'out' as const }]
            : []
      for (const port of candidates) {
        const p = portPoint(port)
        if (!p) continue
        const dist = Math.hypot(p.x - point.x, p.y - point.y)
        if (dist <= PORT_SNAP && (!best || dist < best.dist)) best = { port, dist }
      }
    }
    return best?.port ?? null
  }

  /** Somewhere visible and unoccupied for a gate added by click: pins in
   * columns at the left and right, gates in between, stacked downward. */
  function freeSpot(kind: GateKind): Point {
    const rightmost = Math.max(0, ...gates.map((g) => g.x + gateExtent(g).right))
    const x = kind === 'input' ? 2 : kind === 'output' ? Math.max(22, snap(rightmost + 3)) : 9
    for (let y = 2; ; y += 3) {
      const clash = gates.some((g) => Math.abs(g.x - x) < 5 && Math.abs(g.y - y) < 2.5)
      if (!clash) return { x, y }
    }
  }

  function addGate(kind: GateKind, at: Point): void {
    const pos = clampToCanvas({ id: '', kind, inputs: defaultInputCount(kind), label: '' }, at)
    const id = store().addCircuitGate(block.id, kind, pos.x, pos.y)
    setSelected({ type: 'gate', id })
    svgRef.current?.focus()
  }

  // --- Palette ---------------------------------------------------------------

  function onPalettePointerDown(kind: GateKind, e: ReactPointerEvent<HTMLButtonElement>): void {
    // Keeps the browser from starting a text selection or native drag.
    e.preventDefault()
    setPaletteDrag({ kind, start: { x: e.clientX, y: e.clientY }, client: { x: e.clientX, y: e.clientY }, moved: false })
  }

  function finishPaletteDrag(e: PointerEvent): void {
    if (!paletteDrag) return
    const { kind, moved } = paletteDrag
    setPaletteDrag(null)
    if (!moved) {
      addGate(kind, freeSpot(kind))
      return
    }
    const rect = svgRef.current?.getBoundingClientRect()
    const inside =
      rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom
    if (inside) addGate(kind, toUnits(e.clientX, e.clientY))
  }

  // --- Canvas pointer handling -------------------------------------------------

  function startMove(gate: CircuitGate, e: ReactPointerEvent): void {
    e.stopPropagation()
    e.preventDefault()
    svgRef.current?.focus()
    const pointer = toUnits(e.clientX, e.clientY)
    setSelected({ type: 'gate', id: gate.id })
    setMoving({ gateId: gate.id, offset: { x: pointer.x - gate.x, y: pointer.y - gate.y }, at: { x: gate.x, y: gate.y } })
  }

  function startWire(port: PortRef, e: ReactPointerEvent): void {
    e.stopPropagation()
    e.preventDefault()
    svgRef.current?.focus()
    setWiring({ from: port, pointer: toUnits(e.clientX, e.clientY) })
  }

  function onWindowPointerMove(e: PointerEvent): void {
    if (paletteDrag) {
      const moved =
        paletteDrag.moved ||
        Math.hypot(e.clientX - paletteDrag.start.x, e.clientY - paletteDrag.start.y) > CLICK_SLOP_PX
      setPaletteDrag({ ...paletteDrag, client: { x: e.clientX, y: e.clientY }, moved })
      return
    }
    const pointer = toUnits(e.clientX, e.clientY)
    if (moving) {
      const gate = block.gates.find((g) => g.id === moving.gateId)
      if (!gate) return
      const at = clampToCanvas(gate, { x: pointer.x - moving.offset.x, y: pointer.y - moving.offset.y })
      if (at.x !== moving.at.x || at.y !== moving.at.y) setMoving({ ...moving, at })
    } else if (wiring) {
      setWiring({ ...wiring, pointer })
    }
  }

  function onWindowPointerUp(e: PointerEvent): void {
    finishPaletteDrag(e)
    if (moving) {
      const original = block.gates.find((g) => g.id === moving.gateId)
      if (original && (original.x !== moving.at.x || original.y !== moving.at.y)) {
        store().moveCircuitGate(block.id, moving.gateId, moving.at.x, moving.at.y)
      }
      setMoving(null)
    }
    if (wiring) {
      const target = connectableNear(wiring.from, toUnits(e.clientX, e.clientY))
      if (target) {
        const [out, inp] = wiring.from.side === 'out' ? [wiring.from, target] : [target, wiring.from]
        if (inp.side === 'in') store().connectCircuit(block.id, out.gateId, inp.gateId, inp.input)
      }
      setWiring(null)
    }
  }

  // Always-on window listeners that defer to whichever handlers the latest
  // render produced (via the ref), so they see current state without being
  // re-registered on every change. Idle, they do nothing.
  const handlers = useRef({ move: onWindowPointerMove, up: onWindowPointerUp })
  handlers.current = { move: onWindowPointerMove, up: onWindowPointerUp }
  useEffect(() => {
    const move = (e: PointerEvent): void => handlers.current.move(e)
    const up = (e: PointerEvent): void => handlers.current.up(e)
    const cancel = (): void => {
      setPaletteDrag(null)
      setMoving(null)
      setWiring(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [])

  function deleteSelected(): void {
    if (!selected) return
    if (selected.type === 'gate') store().removeCircuitGate(block.id, selected.id)
    else store().removeCircuitWire(block.id, selected.id)
    setSelected(null)
  }

  // --- Sizing ------------------------------------------------------------------

  const widthUnits = Math.max(MIN_CANVAS_UNITS.width, ...gates.map((g) => g.x + gateExtent(g).right + 4))
  const heightUnits = Math.max(MIN_CANVAS_UNITS.height, ...gates.map((g) => g.y + gateExtent(g).half + 3))

  const selectedGate = selected?.type === 'gate' ? gatesById.get(selected.id) : undefined
  const selectedWire = selected?.type === 'wire' ? block.wires.find((w) => w.id === selected.id) : undefined
  const wiringFrom = wiring ? portPoint(wiring.from) : null
  const wiringTarget = wiring ? connectableNear(wiring.from, wiring.pointer) : null

  return (
    <div className="block block-circuit">
      <div className="block-toolbar">
        <BlockMenu
          align={block.align}
          onAlign={(align) => setBlockAlign(block.id, align)}
          onDuplicate={() => duplicateBlock(block.id)}
          onDelete={() => removeBlock(block.id)}
        />
      </div>

      <div className="list-header circuit-palette">
        <span className="list-tag">Circuit</span>
        {GATE_KINDS.map(({ kind, label }) => (
          <button
            type="button"
            key={kind}
            className="list-btn circuit-palette-btn"
            title={`Drag onto the canvas, or click to add a ${label} ${kind === 'input' || kind === 'output' ? 'pin' : 'gate'}`}
            onPointerDown={(e) => onPalettePointerDown(kind, e)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="circuit-canvas-scroll">
        <svg
          ref={svgRef}
          className="circuit-canvas"
          width={px(widthUnits)}
          height={px(heightUnits)}
          tabIndex={0}
          onPointerDown={() => setSelected(null)}
          onKeyDown={(e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
              e.preventDefault()
              deleteSelected()
            } else if (e.key === 'Escape') {
              setSelected(null)
            }
          }}
        >
          <defs>
            <pattern id={`grid-${block.id}`} width={UNIT_PX} height={UNIT_PX} patternUnits="userSpaceOnUse">
              <circle cx={0.5} cy={0.5} r={0.9} className="circuit-grid-dot" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#grid-${block.id})`} />

          {block.wires.map((wire) => {
            const a = portPoint({ gateId: wire.from, side: 'out' })
            const b = portPoint({ gateId: wire.to, side: 'in', input: wire.input })
            if (!a || !b) return null
            const points = wireRoute(a, b)
              .map((p) => `${px(p.x)},${px(p.y)}`)
              .join(' ')
            const isSelected = selected?.type === 'wire' && selected.id === wire.id
            return (
              <g key={wire.id}>
                <polyline points={points} className={`circuit-wire${isSelected ? ' circuit-selected' : ''}`} />
                <polyline
                  points={points}
                  className="circuit-wire-hit"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    svgRef.current?.focus()
                    setSelected({ type: 'wire', id: wire.id })
                  }}
                />
              </g>
            )
          })}

          {gates.map((gate) => (
            <GateView
              key={gate.id}
              gate={gate}
              selected={selected?.type === 'gate' && selected.id === gate.id}
              highlightPort={wiringTarget?.gateId === gate.id ? wiringTarget : null}
              onBodyDown={(e) => startMove(gate, e)}
              onPortDown={startWire}
            />
          ))}

          {wiring && wiringFrom && (
            <line
              className="circuit-wire-pending"
              x1={px(wiringFrom.x)}
              y1={px(wiringFrom.y)}
              x2={px(wiring.pointer.x)}
              y2={px(wiring.pointer.y)}
            />
          )}

          {gates.length === 0 && (
            <text x={px(widthUnits / 2)} y={px(heightUnits / 2)} className="circuit-empty-hint" textAnchor="middle">
              Drag gates and pins here from the bar above
            </text>
          )}
        </svg>
      </div>

      <div className="circuit-inspector">
        {selectedGate ? (
          <>
            <span className="circuit-inspector-kind">{gateKindLabel(selectedGate.kind)}</span>
            {VARIABLE_INPUT_KINDS.includes(selectedGate.kind) && (
              <span className="circuit-inspector-field">
                Inputs
                <button
                  type="button"
                  className="list-icon-btn"
                  disabled={selectedGate.inputs <= MIN_INPUTS}
                  onClick={() => store().setCircuitGateInputs(block.id, selectedGate.id, selectedGate.inputs - 1)}
                  aria-label="Fewer inputs"
                >
                  −
                </button>
                <span className="circuit-inspector-count">{selectedGate.inputs}</span>
                <button
                  type="button"
                  className="list-icon-btn"
                  disabled={selectedGate.inputs >= MAX_INPUTS}
                  onClick={() => store().setCircuitGateInputs(block.id, selectedGate.id, selectedGate.inputs + 1)}
                  aria-label="More inputs"
                >
                  +
                </button>
              </span>
            )}
            {(selectedGate.kind === 'input' || selectedGate.kind === 'output') && (
              <label className="circuit-inspector-field">
                Name
                <input
                  className="proof-reason circuit-name-input"
                  value={selectedGate.label}
                  placeholder="LaTeX, e.g. x_1"
                  onChange={(e) => store().setCircuitGateLabel(block.id, selectedGate.id, e.target.value)}
                />
              </label>
            )}
            <span className="list-item-actions-spacer" />
            <button type="button" className="list-btn circuit-delete" onClick={deleteSelected}>
              Delete
            </button>
          </>
        ) : selectedWire ? (
          <>
            <span className="circuit-inspector-kind">Wire</span>
            <span className="list-item-actions-spacer" />
            <button type="button" className="list-btn circuit-delete" onClick={deleteSelected}>
              Delete
            </button>
          </>
        ) : (
          <span className="circuit-hint">
            Drag from a dot on one gate to a dot on another to connect them. Click anything to select it; Delete
            removes it.
          </span>
        )}
      </div>

      {paletteDrag?.moved && (
        <div className="circuit-drag-ghost" style={{ left: paletteDrag.client.x, top: paletteDrag.client.y }}>
          {gateKindLabel(paletteDrag.kind)}
        </div>
      )}
    </div>
  )
}

/** One gate or pin: its outline, its name (for pins), and its connection
 * dots. Positioned by translating to its center. */
function GateView({
  gate,
  selected,
  highlightPort,
  onBodyDown,
  onPortDown
}: {
  gate: CircuitGate
  selected: boolean
  highlightPort: PortRef | null
  onBodyDown: (e: ReactPointerEvent) => void
  onPortDown: (port: PortRef, e: ReactPointerEvent) => void
}): JSX.Element {
  const isPin = gate.kind === 'input' || gate.kind === 'output'
  const extent = gateExtent(gate)
  const out = outputOffset(gate)
  const dot = bubble(gate)
  const highlighted = (port: PortRef): boolean =>
    highlightPort !== null &&
    highlightPort.side === port.side &&
    (port.side === 'out' || (highlightPort.side === 'in' && highlightPort.input === port.input))

  return (
    <g
      transform={`translate(${px(gate.x)} ${px(gate.y)})`}
      className={`circuit-gate${selected ? ' circuit-selected' : ''}`}
    >
      {/* Generous invisible grab area, so a gate is easy to pick up by its
          middle and a pin by its name as well as its dot. */}
      <rect
        className="circuit-gate-hit"
        x={-px(extent.left) + (isPin && gate.kind === 'output' ? px(1.5) : 0)}
        y={-px(extent.half)}
        width={px(isPin ? 2.5 : extent.left + extent.right)}
        height={px(extent.half * 2)}
        onPointerDown={onBodyDown}
      />
      {isPin ? (
        <>
          <circle r={4} className="circuit-pin" onPointerDown={onBodyDown} />
          <foreignObject
            x={gate.kind === 'input' ? -px(5) - 8 : 8}
            y={-14}
            width={px(5)}
            height={28}
            pointerEvents="none"
          >
            <div className={`circuit-pin-label circuit-pin-label-${gate.kind}`}>
              <KatexView latex={gate.label} />
            </div>
          </foreignObject>
        </>
      ) : (
        <>
          <path d={gateOutlinePath(gate)} className="circuit-gate-body" onPointerDown={onBodyDown} />
          {dot && <circle cx={dot.cx} cy={0} r={dot.r} className="circuit-gate-body" onPointerDown={onBodyDown} />}
        </>
      )}

      {Array.from({ length: gate.inputs }, (_, input) => {
        const p = inputOffset(gate, input)
        const port: PortRef = { gateId: gate.id, side: 'in', input }
        return (
          <circle
            key={input}
            cx={px(p.x)}
            cy={px(p.y)}
            r={5}
            className={`circuit-port${highlighted(port) ? ' circuit-port-target' : ''}`}
            onPointerDown={(e) => onPortDown(port, e)}
          />
        )
      })}
      {hasOutput(gate) && (
        <circle
          cx={px(out.x)}
          cy={px(out.y)}
          r={5}
          className={`circuit-port${highlighted({ gateId: gate.id, side: 'out' }) ? ' circuit-port-target' : ''}`}
          onPointerDown={(e) => onPortDown({ gateId: gate.id, side: 'out' }, e)}
        />
      )}
    </g>
  )
}
