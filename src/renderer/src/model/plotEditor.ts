import { create } from 'zustand'
import type { BlockId } from './types'

/**
 * Which plot the plot dialog is open for, if any. Kept apart from the
 * document store because it's UI state — it isn't saved, and opening the
 * dialog isn't an edit. `isNew` means the plot was just added, so cancelling
 * removes it again rather than leaving an empty graph behind.
 */
interface PlotEditorState {
  editing: { blockId: BlockId; isNew: boolean } | null
  open: (blockId: BlockId, isNew: boolean) => void
  close: () => void
}

export const usePlotEditor = create<PlotEditorState>()((set) => ({
  editing: null,
  open: (blockId, isNew) => set({ editing: { blockId, isNew } }),
  close: () => set({ editing: null })
}))
