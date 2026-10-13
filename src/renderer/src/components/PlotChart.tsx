import { useId } from 'react'
import {
  PLOT_HEIGHT_CM,
  PLOT_WIDTH_CM,
  X_TICK_TARGET,
  Y_TICK_TARGET,
  axisPosition,
  formatTick,
  sampleCurve,
  ticks,
  toPlotCm,
  type PlotWindow
} from '../model/plots'
import type { PlotFn } from '../model/plotMath'

/** Screen pixels per PDF centimetre (before the SVG scales to fit). */
const PX_PER_CM = 40
const MARGIN = { left: 36, right: 26, top: 22, bottom: 26 }

/**
 * Draws a plot the way plotToLatex lays it out for the PDF — same grid, axes,
 * ticks and sampled curve, on a plot area of the same proportions — so the
 * preview is a faithful picture of what will compile. `fn` may be null while
 * the function is empty or invalid; the axes are still drawn.
 */
export default function PlotChart({ fn, window: w }: { fn: PlotFn | null; window: PlotWindow }): JSX.Element {
  // useId's colons aren't safe inside url(#…) references.
  const clipId = useId().replace(/:/g, '')
  const W = PLOT_WIDTH_CM * PX_PER_CM
  const H = PLOT_HEIGHT_CM * PX_PER_CM
  // Data → SVG pixels: the PDF layout in cm, scaled, with y flipped.
  const toPx = (x: number, y: number): { x: number; y: number } => {
    const p = toPlotCm(w, x, y)
    return { x: p.x * PX_PER_CM, y: H - p.y * PX_PER_CM }
  }

  const axis = axisPosition(w)
  const origin = toPx(axis.x, axis.y)
  const xt = ticks(w.xMin, w.xMax, X_TICK_TARGET)
  const yt = ticks(w.yMin, w.yMax, Y_TICK_TARGET)
  const atOrigin = axis.x === 0 && axis.y === 0
  const segments = fn ? sampleCurve(fn, w) : []

  return (
    <svg
      className="plot-chart"
      viewBox={`${-MARGIN.left} ${-MARGIN.top} ${W + MARGIN.left + MARGIN.right} ${H + MARGIN.top + MARGIN.bottom}`}
      role="img"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={W} height={H} />
        </clipPath>
        <marker id={`${clipId}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M 0 1 L 9 5 L 0 9" className="plot-arrowhead" />
        </marker>
      </defs>

      {xt.values.map((v) => (
        <line key={`gx${v}`} className="plot-grid" x1={toPx(v, 0).x} x2={toPx(v, 0).x} y1={0} y2={H} />
      ))}
      {yt.values.map((v) => (
        <line key={`gy${v}`} className="plot-grid" x1={0} x2={W} y1={toPx(0, v).y} y2={toPx(0, v).y} />
      ))}

      <line className="plot-axis" x1={0} x2={W + 12} y1={origin.y} y2={origin.y} markerEnd={`url(#${clipId}-arrow)`} />
      <line className="plot-axis" x1={origin.x} x2={origin.x} y1={H} y2={-12} markerEnd={`url(#${clipId}-arrow)`} />
      <text className="plot-axis-name" x={W + 16} y={origin.y + 4}>
        x
      </text>
      <text className="plot-axis-name" x={origin.x} y={-15} textAnchor="middle">
        y
      </text>

      {xt.values.map((v) =>
        atOrigin && v === 0 ? null : (
          <g key={`tx${v}`}>
            <line className="plot-axis" x1={toPx(v, 0).x} x2={toPx(v, 0).x} y1={origin.y - 3} y2={origin.y + 3} />
            <text className="plot-tick" x={toPx(v, 0).x} y={origin.y + 15} textAnchor="middle">
              {formatTick(v, xt.step)}
            </text>
          </g>
        )
      )}
      {yt.values.map((v) =>
        atOrigin && v === 0 ? null : (
          <g key={`ty${v}`}>
            <line className="plot-axis" x1={origin.x - 3} x2={origin.x + 3} y1={toPx(0, v).y} y2={toPx(0, v).y} />
            <text className="plot-tick" x={origin.x - 6} y={toPx(0, v).y + 4} textAnchor="end">
              {formatTick(v, yt.step)}
            </text>
          </g>
        )
      )}
      {atOrigin && (
        <text className="plot-tick" x={origin.x - 6} y={origin.y + 15} textAnchor="end">
          0
        </text>
      )}

      <g clipPath={`url(#${clipId})`}>
        {segments.map((segment, i) => (
          <polyline
            key={i}
            className="plot-curve"
            points={segment
              .map((pt) => {
                const p = toPx(pt.x, pt.y)
                return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
              })
              .join(' ')}
          />
        ))}
      </g>
    </svg>
  )
}
