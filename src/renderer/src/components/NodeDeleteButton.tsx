/**
 * The red-tinted tab that removes a math node, shown attached to its
 * wrapper's right edge on hover.
 *
 * Both pointerdown and click are stopped from propagating: the wrapper around
 * this button is itself a drag handle, so without that a click on it would
 * start dragging the very node it is about to delete.
 */
export default function NodeDeleteButton({ onDelete }: { onDelete: () => void }): JSX.Element {
  return (
    <button
      type="button"
      className="node-delete"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onDelete()
      }}
      aria-label="Delete"
    >
      🗑
    </button>
  )
}
