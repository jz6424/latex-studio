import { pointerWithin, type Collision, type CollisionDetection } from '@dnd-kit/core'

/** Marks an open dialog that accepts drops (see PlotDialog). */
export const MODAL_DROP_SCOPE_ATTR = 'data-modal-drop-scope'

/**
 * Matching is by on-screen rectangles, not by what's visible at the pointer,
 * so blocks hidden behind a dialog's backdrop would still catch drops. While
 * a drop-accepting dialog is open, only droppables inside it count.
 */
function withinModalScope(args: Parameters<CollisionDetection>[0], matches: Collision[]): Collision[] {
  const scope = document.querySelector(`[${MODAL_DROP_SCOPE_ATTR}]`)
  if (!scope) return matches
  return matches.filter((match) => {
    const node = args.droppableContainers.find((c) => c.id === match.id)?.node.current
    return node ? scope.contains(node) : false
  })
}

/**
 * Widgets nest droppables inside droppables of the same on-screen size (a
 * superscript's own slot sits inside its parent NodeWrapper's "reorder
 * whole node" drop target, which sits inside the equation's root slot).
 * dnd-kit's built-in strategies compare rect *centers* — the dragged chip's
 * center vs. each droppable's center — which has nothing to do with where
 * the pointer actually is, so a small nested box easily loses to a much
 * larger enclosing one. This picks whichever droppable both contains the
 * pointer AND is the smallest (most specific) match, so nested targets like
 * a sup/sub box win over their parent widget.
 *
 * Deliberately no closestCenter (or other "nearest anything") fallback: that
 * always matches *something* as soon as any droppable exists, however far
 * away, which made `over` become truthy the instant a drag started rather
 * than only once the pointer genuinely reached a target — breaking both drop
 * accuracy and the "shrink while over a target" drag-preview effect. Every
 * real target (including the equation canvas itself) already spans its full
 * droppable area, so an empty match here means the pointer truly isn't over
 * anything yet.
 */
export const nestedAwareCollisionDetection: CollisionDetection = (args) => {
  const pointerMatches = withinModalScope(args, pointerWithin(args))
  if (pointerMatches.length === 0) return []

  let best = pointerMatches[0]
  let bestArea = Infinity
  for (const match of pointerMatches) {
    const rect = args.droppableRects.get(match.id)
    if (!rect) continue
    const area = rect.width * rect.height
    if (area < bestArea) {
      bestArea = area
      best = match
    }
  }
  return [best]
}
