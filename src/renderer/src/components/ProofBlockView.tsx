import { Fragment } from 'react'
import { useDocStore } from '../model/store'
import { proofToLatex } from '../model/generate'
import { PROOF_RELATIONS } from '../model/proofs'
import type { ProofBlock, ProofRelation } from '../model/types'
import MathSlot from './MathSlot'
import KatexView from './KatexView'
import BlockMenu from './BlockMenu'

/**
 * A step-by-step proof: a starting expression, then one line per step of
 * `<relation> <expression>` with an optional reason beside it.
 *
 * The rows are laid out as one CSS grid rather than a stack of flex rows, so
 * every relation picker shares a column (and lines up), as does every reason
 * field — mirroring the `&` / `&&` columns of the align* it generates. The
 * expression slots wrap, so a long expression continues on a new line inside
 * its own column instead of pushing the reasons off the block. The typeset
 * preview below shows the real result.
 */
export default function ProofBlockView({ block }: { block: ProofBlock }): JSX.Element {
  const addProofStep = useDocStore((s) => s.addProofStep)
  const removeProofStep = useDocStore((s) => s.removeProofStep)
  const setRelation = useDocStore((s) => s.setProofStepRelation)
  const setReason = useDocStore((s) => s.setProofStepReason)
  const duplicateBlock = useDocStore((s) => s.duplicateBlock)
  const removeBlock = useDocStore((s) => s.removeBlock)
  const latex = useDocStore((s) => proofToLatex(s.doc, block))

  const onlyStep = block.steps.length === 1

  return (
    <div className="block block-proof">
      <div className="block-toolbar">
        <BlockMenu onDuplicate={() => duplicateBlock(block.id)} onDelete={() => removeBlock(block.id)} />
      </div>

      <div className="list-header">
        <span className="list-tag">Proof</span>
      </div>

      <div className="proof-rows">
        {block.steps.map((step, index) => (
          <Fragment key={step.id}>
            <div className="proof-cell proof-start">
              {index === 0 && <MathSlot slotId={block.startSlot} empty wrap />}
            </div>
            <select
              className="list-style-select proof-relation"
              value={step.relation}
              title="Relation"
              onChange={(e) => setRelation(block.id, step.id, e.target.value as ProofRelation)}
            >
              {PROOF_RELATIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <div className="proof-cell">
              <MathSlot slotId={step.slot} empty wrap />
            </div>
            <input
              className="proof-reason"
              value={step.reason}
              placeholder="Step (optional)"
              onChange={(e) => setReason(block.id, step.id, e.target.value)}
            />
            <button
              type="button"
              className="list-icon-btn list-icon-btn-danger"
              disabled={onlyStep}
              onClick={() => removeProofStep(block.id, step.id)}
              title={onlyStep ? 'A proof needs at least one step' : 'Delete step'}
              aria-label="Delete step"
            >
              ×
            </button>
          </Fragment>
        ))}
      </div>

      <button type="button" className="list-btn proof-add-step" onClick={() => addProofStep(block.id)}>
        + Step
      </button>

      <div className="block-math-preview proof-preview">
        <KatexView latex={latex} display />
      </div>
    </div>
  )
}
