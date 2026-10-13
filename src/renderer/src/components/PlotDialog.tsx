import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useDocStore } from '../model/store'
import { usePlotEditor } from '../model/plotEditor'
import { DEFAULT_WINDOW, compileSlot, fitRange, windowError, type PlotWindow } from '../model/plots'
import { MODAL_DROP_SCOPE_ATTR } from '../dnd/collision'
import type { BlockId, SlotId } from '../model/types'
import MathSlot from './MathSlot'
import KatexView from './KatexView'
import PlotChart from './PlotChart'

type Step = 'function' | 'window'

/** The window as typed — strings, so a half-typed "-" or "0." is allowed. */
type WindowFields = Record<keyof PlotWindow, string>

const toFields = (w: PlotWindow): WindowFields => ({
  xMin: String(w.xMin),
  xMax: String(w.xMax),
  yMin: String(w.yMin),
  yMax: String(w.yMax)
})

const fromFields = (f: WindowFields): PlotWindow => ({
  xMin: parseFloat(f.xMin),
  xMax: parseFloat(f.xMax),
  yMin: parseFloat(f.yMin),
  yMax: parseFloat(f.yMax)
})

/**
 * Creates or edits a plot in two steps: build f(x) from widgets, with a live
 * preview of the formula and its graph; then choose the domain and range.
 *
 * The function is edited in a scratch copy of the plot's slot, so Cancel
 * leaves an existing plot exactly as it was (and removes a brand-new one).
 *
 * The overlay leaves the sidebar uncovered, so widgets can be dragged from
 * it into the function — and while it's open, only drop targets inside the
 * dialog accept drops (see MODAL_DROP_SCOPE_ATTR).
 */
export default function PlotDialog({ blockId, isNew }: { blockId: BlockId; isNew: boolean }): JSX.Element | null {
  const block = useDocStore((s) => s.doc.blocksById[blockId])
  const doc = useDocStore((s) => s.doc)
  const close = usePlotEditor((s) => s.close)

  const [editSlot, setEditSlot] = useState<SlotId | null>(null)
  const committed = useRef(false)
  const [step, setStep] = useState<Step>('function')
  const [fields, setFields] = useState<WindowFields>(() =>
    toFields(block?.type === 'plot' ? block : DEFAULT_WINDOW)
  )
  const [showLabel, setShowLabel] = useState(block?.type === 'plot' ? block.showLabel : true)
  // A new plot gets its range fitted to the function the first time step 2
  // opens; after that, whatever the user typed stands.
  const rangeFitted = useRef(!isNew)

  // Made in an effect (not during render) so StrictMode's double mount can't
  // leak a second copy; the cleanup throws the copy away unless it was saved.
  useEffect(() => {
    const slot = useDocStore.getState().beginPlotEdit(blockId)
    committed.current = false
    setEditSlot(slot)
    return () => {
      if (slot && !committed.current) useDocStore.getState().discardSlot(slot)
    }
  }, [blockId])

  if (block?.type !== 'plot' || !editSlot) return null

  const compiled = compileSlot(doc, editSlot)
  const typedWindow = fromFields(fields)
  const problem = windowError(typedWindow)
  // Step 1 previews over the chosen domain with the range fitted to the
  // function, so its shape is visible before any range has been picked.
  const previewWindow: PlotWindow = (() => {
    const domain = windowError({ ...typedWindow, yMin: 0, yMax: 1 }) ? DEFAULT_WINDOW : typedWindow
    const fit = compiled.ok ? fitRange(compiled.fn, domain.xMin, domain.xMax) : null
    return { xMin: domain.xMin, xMax: domain.xMax, ...(fit ?? { yMin: DEFAULT_WINDOW.yMin, yMax: DEFAULT_WINDOW.yMax }) }
  })()

  function cancel(): void {
    if (isNew) useDocStore.getState().removeBlock(blockId)
    close()
  }

  function fitToFunction(): void {
    if (!compiled.ok || problem?.startsWith('Enter')) return
    const fit = fitRange(compiled.fn, typedWindow.xMin, typedWindow.xMax)
    if (fit) setFields((f) => ({ ...f, yMin: String(fit.yMin), yMax: String(fit.yMax) }))
  }

  function goToWindow(): void {
    if (!rangeFitted.current) {
      rangeFitted.current = true
      setFields((f) => ({ ...f, yMin: String(previewWindow.yMin), yMax: String(previewWindow.yMax) }))
    }
    setStep('window')
  }

  function save(e: FormEvent): void {
    e.preventDefault()
    if (step === 'function') {
      if (compiled.ok) goToWindow()
      return
    }
    if (problem || !editSlot) return
    committed.current = true
    useDocStore.getState().commitPlotEdit(blockId, editSlot, typedWindow, showLabel)
    close()
  }

  const field = (key: keyof PlotWindow, label: string): JSX.Element => (
    <label className="modal-field">
      <span className="modal-field-label">{label}</span>
      <input
        className="modal-field-input"
        inputMode="decimal"
        value={fields[key]}
        onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
      />
    </label>
  )

  return (
    <div className="plot-dialog-overlay">
      <form
        className="modal-card plot-dialog"
        {...{ [MODAL_DROP_SCOPE_ATTR]: '' }}
        onSubmit={save}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel()
        }}
      >
        <div className="plot-dialog-header">
          <span className="modal-title gradient-text">{isNew ? 'New plot' : 'Edit plot'}</span>
          <span className="plot-steps">
            <span data-active={step === 'function' || undefined}>1 · Function</span>
            <span data-active={step === 'window' || undefined}>2 · Domain &amp; range</span>
          </span>
        </div>

        {step === 'function' ? (
          <>
            <p className="plot-dialog-hint">
              Build <i>f(x)</i> by dragging widgets from the sidebar into the box, or type into it. Use <b>x</b> as
              the variable; <b>e</b> and <b>π</b> work too.
            </p>
            <div className="plot-builder">
              <span className="plot-builder-lhs">f(x) =</span>
              <MathSlot slotId={editSlot} className="plot-builder-slot" empty wrap />
            </div>
            <div className="plot-preview">
              <div className="plot-preview-formula">
                {compiled.latex ? <KatexView latex={`f(x) = ${compiled.latex}`} display /> : <span>f(x) = …</span>}
              </div>
              {compiled.latex && !compiled.ok && <div className="plot-error">{compiled.error}</div>}
              <PlotChart fn={compiled.ok ? compiled.fn : null} window={previewWindow} />
            </div>
          </>
        ) : (
          <>
            <p className="plot-dialog-hint">Choose the part of the graph to show.</p>
            <div className="plot-window-fields">
              <span className="plot-window-name">Domain (x)</span>
              {field('xMin', 'From')}
              <span className="modal-field-sep">to</span>
              {field('xMax', 'To')}
            </div>
            <div className="plot-window-fields">
              <span className="plot-window-name">Range (y)</span>
              {field('yMin', 'From')}
              <span className="modal-field-sep">to</span>
              {field('yMax', 'To')}
              <button type="button" className="btn btn-ghost plot-fit-btn" onClick={fitToFunction}>
                Fit to function
              </button>
            </div>
            <label className="plot-checkbox">
              <input type="checkbox" checked={showLabel} onChange={(e) => setShowLabel(e.target.checked)} />
              Show “f(x) = …” above the graph
            </label>
            <div className="plot-preview">
              {problem ? (
                <div className="plot-error">{problem}</div>
              ) : (
                <PlotChart fn={compiled.ok ? compiled.fn : null} window={typedWindow} />
              )}
            </div>
          </>
        )}

        <div className="modal-actions">
          {step === 'window' && (
            <button type="button" className="btn btn-ghost" onClick={() => setStep('function')}>
              ← Back
            </button>
          )}
          <span className="list-item-actions-spacer" />
          <button type="button" className="btn btn-ghost" onClick={cancel}>
            Cancel
          </button>
          {step === 'function' ? (
            <button type="submit" className="btn btn-primary" disabled={!compiled.ok}>
              Next →
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={Boolean(problem)}>
              {isNew ? 'Create plot' : 'Save'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
