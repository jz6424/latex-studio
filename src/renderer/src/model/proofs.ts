import type { ProofRelation } from './types'

/**
 * The signs a proof line can start with. `label` is what the relation picker
 * shows; `tex` is what goes into the generated `align*`.
 */
export const PROOF_RELATIONS: { value: ProofRelation; label: string; tex: string }[] = [
  { value: 'equiv', label: '≡', tex: '\\equiv' },
  { value: 'eq', label: '=', tex: '=' },
  // \Leftrightarrow rather than \iff: \iff carries its own wide spacing,
  // which looks out of place next to = and \equiv in the same column.
  { value: 'iff', label: '⇔', tex: '\\Leftrightarrow' }
]

export const DEFAULT_PROOF_RELATION: ProofRelation = 'equiv'

export function proofRelationTex(relation: ProofRelation): string {
  return PROOF_RELATIONS.find((r) => r.value === relation)?.tex ?? '='
}

/**
 * A reason goes inside `\text{}` in an `align*` row, where a stray `&` would
 * start a new alignment column and `%` or `#` would break the compile — none
 * of which anyone means when typing a step name, so they're escaped.
 */
export function escapeProofReason(reason: string): string {
  return reason.replace(/[&%#]/g, (c) => `\\${c}`)
}
