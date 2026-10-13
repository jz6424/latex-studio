import { useMemo } from 'react'
import { useDocStore } from '../model/store'
import { usePlotEditor } from '../model/plotEditor'
import { compileLatex } from '../model/plots'
import { slotToLatex } from '../model/generate'
import type { PlotBlock } from '../model/types'
import BlockMenu from './BlockMenu'
import KatexView from './KatexView'
import PlotChart from './PlotChart'

/**
 * A finished plot on the page: the graph as it will compile, with "Edit"
 * (or a double-click) reopening the plot dialog to change the function or
 * the window.
 */
export default function PlotBlockView({ block }: { block: PlotBlock }): JSX.Element {
  const setBlockAlign = useDocStore((s) => s.setBlockAlign)
  const duplicateBlock = useDocStore((s) => s.duplicateBlock)
  const removeBlock = useDocStore((s) => s.removeBlock)
  const openEditor = usePlotEditor((s) => s.open)
  // Selects the LaTeX string (stable between renders) and compiles from
  // that, rather than selecting a freshly built object on every store change.
  const latex = useDocStore((s) => slotToLatex(s.doc, block.fnSlot))
  const compiled = useMemo(() => compileLatex(latex), [latex])

  return (
    <div className="block block-plot" onDoubleClick={() => openEditor(block.id, false)}>
      <div className="block-toolbar">
        <button
          type="button"
          className="chip-toggle"
          onClick={() => openEditor(block.id, false)}
          title="Change the function, domain or range"
        >
          ✎ Edit
        </button>
        <BlockMenu
          align={block.align}
          onAlign={(align) => setBlockAlign(block.id, align)}
          onDuplicate={() => duplicateBlock(block.id)}
          onDelete={() => removeBlock(block.id)}
        />
      </div>

      <div className="list-header">
        <span className="list-tag">Plot</span>
      </div>

      <figure className={`plot-figure align-${block.align}`}>
        {block.showLabel && compiled.latex && (
          <div className="plot-figure-label">
            <KatexView latex={`f(x) = ${compiled.latex}`} />
          </div>
        )}
        <PlotChart fn={compiled.ok ? compiled.fn : null} window={block} />
      </figure>

      {!compiled.ok && (
        <div className="list-warning">
          {compiled.latex ? compiled.error : 'No function yet'} — click Edit to fix it. Only the axes are drawn until then.
        </div>
      )}
    </div>
  )
}
