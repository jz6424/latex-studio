import type { DocState, PlotBlock, SlotId } from './types'
import { slotToLatex } from './generate'
import { PlotParseError, compileFunction, type PlotFn } from './plotMath'

/**
 * Function plots: the visible window, axis ticks, sampling the curve, and
 * the TikZ picture.
 *
 * The curve is sampled here and written into the PDF as plain coordinates,
 * rather than handed to pgfplots (not part of every TeX install) or to
 * TikZ's own expression parser (different syntax, and it would need the
 * function translated). The editor preview draws the very same samples, so
 * what's on screen is what compiles.
 */

export interface PlotWindow {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

export const DEFAULT_WINDOW: PlotWindow = { xMin: -5, xMax: 5, yMin: -5, yMax: 5 }

/** Size of the plotting area in the PDF, in cm — comfortably inside the
 * article class's ~12cm text width, with room for tick labels. */
export const PLOT_WIDTH_CM = 9
export const PLOT_HEIGHT_CM = 6

const SAMPLES = 400

export type CompiledPlot = { ok: true; fn: PlotFn; latex: string } | { ok: false; error: string; latex: string }

/** Reads a plot's function out of its slot and compiles it. */
export function compileSlot(doc: DocState, slotId: SlotId): CompiledPlot {
  return compileLatex(slotToLatex(doc, slotId))
}

export function compileLatex(source: string): CompiledPlot {
  const latex = source.trim()
  try {
    return { ok: true, fn: compileFunction(latex), latex }
  } catch (e) {
    return { ok: false, error: e instanceof PlotParseError ? e.message : 'Could not read this function', latex }
  }
}

export function windowError(w: PlotWindow): string | null {
  const values = [w.xMin, w.xMax, w.yMin, w.yMax]
  if (values.some((v) => !Number.isFinite(v))) return 'Enter a number in every box'
  if (w.xMin >= w.xMax) return 'The domain’s lower end must be below its upper end'
  if (w.yMin >= w.yMax) return 'The range’s lower end must be below its upper end'
  return null
}

// --- Ticks ---------------------------------------------------------------------

/** A round step (1, 2 or 5 × 10ⁿ) giving about `target` ticks across a span. */
function niceStep(span: number, target: number): number {
  const raw = span / target
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)))
  const scaled = raw / magnitude
  const nice = scaled < 1.5 ? 1 : scaled < 3.5 ? 2 : scaled < 7.5 ? 5 : 10
  return nice * magnitude
}

export interface Ticks {
  values: number[]
  step: number
}

export function ticks(min: number, max: number, target: number): Ticks {
  const step = niceStep(max - min, target)
  const values: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
    values.push(Math.abs(v) < step * 1e-9 ? 0 : v)
  }
  return { values, step }
}

/** A tick label with only as many decimals as the step needs. */
export function formatTick(value: number, step: number): string {
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9))
  return value.toFixed(decimals).replace(/^-(0\.?0*)$/, '$1')
}

export const X_TICK_TARGET = 8
export const Y_TICK_TARGET = 6

// --- Sampling ----------------------------------------------------------------------

/**
 * The curve as connected runs of points. A run breaks wherever the function
 * is undefined (√ of a negative, 1/0) or leaps across the window between
 * neighbouring samples — an asymptote, as in tan x — so those aren't joined
 * by a bogus near-vertical line.
 */
export function sampleCurve(fn: PlotFn, w: PlotWindow): { x: number; y: number }[][] {
  const span = w.yMax - w.yMin
  const segments: { x: number; y: number }[][] = []
  let current: { x: number; y: number }[] = []
  let prevY: number | null = null
  for (let i = 0; i <= SAMPLES; i++) {
    const x = w.xMin + ((w.xMax - w.xMin) * i) / SAMPLES
    let y: number
    try {
      y = fn(x)
    } catch {
      y = NaN
    }
    const jump = prevY !== null && Number.isFinite(y) && Math.abs(y - prevY) > span * 1.5
    if (!Number.isFinite(y) || jump) {
      if (current.length > 1) segments.push(current)
      current = []
    }
    if (Number.isFinite(y)) {
      // Far off-window values are pulled in to a window-height beyond the
      // edge: still clipped from view, but keeps TikZ well inside the
      // coordinate sizes it can handle.
      current.push({ x, y: Math.min(w.yMax + span, Math.max(w.yMin - span, y)) })
    }
    prevY = Number.isFinite(y) ? y : null
  }
  if (current.length > 1) segments.push(current)
  return segments
}

/** A y-range that fits the function over the domain: the middle 96% of its
 * values (so an asymptote doesn't flatten everything else), padded and
 * rounded out to tick marks. */
export function fitRange(fn: PlotFn, xMin: number, xMax: number): { yMin: number; yMax: number } | null {
  const ys: number[] = []
  for (let i = 0; i <= SAMPLES; i++) {
    const y = fn(xMin + ((xMax - xMin) * i) / SAMPLES)
    if (Number.isFinite(y)) ys.push(y)
  }
  if (ys.length === 0) return null
  ys.sort((a, b) => a - b)
  let lo = ys[Math.floor(ys.length * 0.02)]
  let hi = ys[Math.ceil(ys.length * 0.98) - 1]
  if (hi - lo < 1e-9) {
    lo -= 1
    hi += 1
  }
  const pad = (hi - lo) * 0.1
  const step = niceStep(hi - lo + 2 * pad, Y_TICK_TARGET)
  return { yMin: Math.floor((lo - pad) / step) * step, yMax: Math.ceil((hi + pad) / step) * step }
}

// --- Layout shared by the SVG preview and the TikZ output -----------------------------

/** Maps data coordinates to the plot area, in cm from its bottom-left. */
export function toPlotCm(w: PlotWindow, x: number, y: number): { x: number; y: number } {
  return {
    x: ((x - w.xMin) / (w.xMax - w.xMin)) * PLOT_WIDTH_CM,
    y: ((y - w.yMin) / (w.yMax - w.yMin)) * PLOT_HEIGHT_CM
  }
}

/** Where the axes cross: at zero when it's in view, otherwise along the
 * nearest edge. */
export function axisPosition(w: PlotWindow): { x: number; y: number } {
  return {
    x: Math.min(w.xMax, Math.max(w.xMin, 0)),
    y: Math.min(w.yMax, Math.max(w.yMin, 0))
  }
}

// --- TikZ ------------------------------------------------------------------------------

const cm = (n: number): string => String(Math.round(n * 1000) / 1000)

export function plotToLatex(doc: DocState, block: PlotBlock): string {
  const w: PlotWindow = block
  if (windowError(w)) return ''
  const compiled = compileSlot(doc, block.fnSlot)
  const W = PLOT_WIDTH_CM
  const H = PLOT_HEIGHT_CM
  const axis = axisPosition(w)
  const origin = toPlotCm(w, axis.x, axis.y)
  const xt = ticks(w.xMin, w.xMax, X_TICK_TARGET)
  const yt = ticks(w.yMin, w.yMax, Y_TICK_TARGET)
  // Zero is skipped where the axes cross at the origin — it would sit on
  // top of both axis lines.
  const atOrigin = axis.x === 0 && axis.y === 0

  const lines: string[] = ['\\begin{tikzpicture}']
  if (block.showLabel && compiled.latex) {
    // High enough to clear the y-axis arrow and its "y" label.
    lines.push(`  \\node[above] at (${cm(W / 2)}, ${cm(H + 0.8)}) {$f(x) = ${compiled.latex}$};`)
  }
  for (const v of xt.values) {
    const p = toPlotCm(w, v, 0)
    lines.push(`  \\draw[gray!25, very thin] (${cm(p.x)}, 0) -- (${cm(p.x)}, ${cm(H)});`)
  }
  for (const v of yt.values) {
    const p = toPlotCm(w, 0, v)
    lines.push(`  \\draw[gray!25, very thin] (0, ${cm(p.y)}) -- (${cm(W)}, ${cm(p.y)});`)
  }
  lines.push(`  \\draw[->] (0, ${cm(origin.y)}) -- (${cm(W + 0.3)}, ${cm(origin.y)}) node[right] {$x$};`)
  lines.push(`  \\draw[->] (${cm(origin.x)}, 0) -- (${cm(origin.x)}, ${cm(H + 0.3)}) node[above] {$y$};`)
  for (const v of xt.values) {
    if (atOrigin && v === 0) continue
    const p = toPlotCm(w, v, 0)
    lines.push(
      `  \\draw (${cm(p.x)}, ${cm(origin.y - 0.06)}) -- (${cm(p.x)}, ${cm(origin.y + 0.06)}) node[below=3pt, font=\\scriptsize] {$${formatTick(v, xt.step)}$};`
    )
  }
  for (const v of yt.values) {
    if (atOrigin && v === 0) continue
    const p = toPlotCm(w, 0, v)
    lines.push(
      `  \\draw (${cm(origin.x - 0.06)}, ${cm(p.y)}) -- (${cm(origin.x + 0.06)}, ${cm(p.y)}) node[left=3pt, font=\\scriptsize] {$${formatTick(v, yt.step)}$};`
    )
  }
  if (atOrigin) lines.push(`  \\node[below left, font=\\scriptsize] at (${cm(origin.x)}, ${cm(origin.y)}) {$0$};`)

  if (compiled.ok) {
    lines.push('  \\begin{scope}')
    lines.push(`    \\clip (0, 0) rectangle (${cm(W)}, ${cm(H)});`)
    for (const segment of sampleCurve(compiled.fn, w)) {
      const points = segment.map((pt) => {
        const p = toPlotCm(w, pt.x, pt.y)
        return `(${cm(p.x)},${cm(p.y)})`
      })
      lines.push(`    \\draw[thick, blue!70!black, line join=round] plot coordinates {${points.join(' ')}};`)
    }
    lines.push('  \\end{scope}')
  }
  lines.push('\\end{tikzpicture}')
  return lines.join('\n')
}
