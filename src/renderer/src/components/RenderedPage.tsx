import { useCallback, useEffect, useRef, useState } from 'react'
import { useDocStore } from '../model/store'
import { documentToLatex } from '../model/generate'

type CompileState = { status: 'compiling' } | { status: 'success'; url: string } | { status: 'error'; log: string }

/** A true rendered page: sends the generated .tex source to the main process,
 * which compiles it with a real pdflatex, and shows the resulting PDF —
 * as opposed to Page.tsx's editable widget canvas, which is a KaTeX-based
 * approximation of the same document.
 *
 * This went through a pdf.js canvas-rendering implementation first, for
 * exact control over fit-to-width scaling — reverted after confirming (via
 * an explicit timeout, not just a guess) that pdf.js's worker hangs and
 * never completes its startup handshake in this Electron+dev-server setup,
 * even though the same code worked in a production build. Back to embedding
 * the PDF directly and letting Chromium's built-in viewer render it. */
export default function RenderedPage(): JSX.Element {
  const [state, setState] = useState<CompileState>({ status: 'compiling' })
  const urlRef = useRef<string | null>(null)

  const compile = useCallback(async (): Promise<void> => {
    setState({ status: 'compiling' })
    const source = documentToLatex(useDocStore.getState().doc)
    const result = await window.api.compileLatex(source)

    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }

    if (result.success && result.pdfBase64) {
      const bytes = Uint8Array.from(atob(result.pdfBase64), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      setState({ status: 'success', url })
    } else {
      setState({ status: 'error', log: result.log ?? 'Compilation failed.' })
    }
  }, [])

  useEffect(() => {
    compile()
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [compile])

  return (
    <div className="rendered-viewport">
      <div className="rendered-toolbar">
        <span className="rendered-toolbar-label">
          {state.status === 'compiling' && 'Compiling with pdflatex…'}
          {state.status === 'success' && 'Compiled with pdflatex — this is the real document'}
          {state.status === 'error' && 'pdflatex failed to compile'}
        </span>
        <button type="button" className="btn" onClick={compile} disabled={state.status === 'compiling'}>
          {state.status === 'compiling' ? 'Compiling…' : 'Recompile'}
        </button>
      </div>

      {state.status === 'success' && (
        // Both "fit" keywords (view=FitH, zoom=page-width) turned out
        // imprecise for a blob: URL — close enough that short lines (the
        // title) looked fine while the longest lines of body text still
        // clipped a few characters. zoom=100 is unambiguous (actual size,
        // no "fit" computation for the viewer to get slightly wrong) and,
        // combined with this panel's minimum width, leaves real margin —
        // the page renders a bit smaller than the frame instead of filling
        // it edge-to-edge, but nothing gets cut off.
        <iframe title="Compiled document" className="compiled-pdf-frame" src={`${state.url}#zoom=100`} />
      )}

      {state.status === 'compiling' && <div className="rendered-paper rendered-placeholder">Compiling…</div>}

      {state.status === 'error' && (
        <div className="rendered-paper rendered-error">
          <div className="rendered-error-title">pdflatex failed to compile this document</div>
          <pre className="rendered-error-log">{state.log}</pre>
        </div>
      )}
    </div>
  )
}
