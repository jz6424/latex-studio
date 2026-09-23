import { useState, type FormEvent } from 'react'

const MIN_DIMENSION = 1
const MAX_DIMENSION = 10
const DEFAULT_DIMENSION = 3

interface Props {
  onConfirm: (rows: number, cols: number) => void
  onCancel: () => void
}

function clampDimension(value: number): number {
  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, Math.trunc(value) || MIN_DIMENSION))
}

/** Asks for a matrix's row/column counts before it's created.
 *
 * A real modal rather than window.prompt() — Electron doesn't implement
 * prompt(), so calling it just returns null immediately with no dialog ever
 * shown, silently discarding the drop instead of asking anything. */
export default function MatrixDimensionsDialog({ onConfirm, onCancel }: Props): JSX.Element {
  const [rows, setRows] = useState(DEFAULT_DIMENSION)
  const [cols, setCols] = useState(DEFAULT_DIMENSION)

  function handleSubmit(e: FormEvent): void {
    e.preventDefault()
    onConfirm(clampDimension(rows), clampDimension(cols))
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
        }}
      >
        <span className="modal-title gradient-text">Matrix size</span>
        <div className="modal-field-row">
          <label className="modal-field">
            <span className="modal-field-label">Rows</span>
            <input
              className="modal-field-input"
              type="number"
              min={MIN_DIMENSION}
              max={MAX_DIMENSION}
              value={rows}
              autoFocus
              onChange={(e) => setRows(Number(e.target.value))}
            />
          </label>
          <span className="modal-field-sep">×</span>
          <label className="modal-field">
            <span className="modal-field-label">Columns</span>
            <input
              className="modal-field-input"
              type="number"
              min={MIN_DIMENSION}
              max={MAX_DIMENSION}
              value={cols}
              onChange={(e) => setCols(Number(e.target.value))}
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Create
          </button>
        </div>
      </form>
    </div>
  )
}
