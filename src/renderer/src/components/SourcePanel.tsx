import { useState } from 'react'
import { useDocStore } from '../model/store'
import { documentToLatex } from '../model/generate'

const COPIED_CONFIRMATION_MS = 1500

/** Side panel showing the generated .tex source, regenerated on every document
 * change so it always reflects what would be compiled right now. */
export default function SourcePanel({ onClose }: { onClose: () => void }): JSX.Element {
  const doc = useDocStore((s) => s.doc)
  const [copied, setCopied] = useState(false)
  const source = documentToLatex(doc)

  async function handleCopy(): Promise<void> {
    await navigator.clipboard.writeText(source)
    setCopied(true)
    setTimeout(() => setCopied(false), COPIED_CONFIRMATION_MS)
  }

  return (
    <aside className="source-panel">
      <div className="source-panel-header">
        <span className="gradient-text source-panel-title">LaTeX Source</span>
        <div className="source-panel-actions">
          <button type="button" className="btn" onClick={handleCopy}>
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <pre className="source-panel-code">{source}</pre>
    </aside>
  )
}
