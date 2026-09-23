import { useEffect, type RefObject } from 'react'

/**
 * Keeps a <textarea> exactly as tall as its content, so it reads as flowing
 * page text rather than a fixed box with its own scrollbar.
 *
 * Height is reset to 'auto' before measuring because scrollHeight can only
 * report a value at or above the current height — without the reset the
 * textarea would grow but never shrink back when text is deleted.
 */
export function useAutoGrowTextarea(ref: RefObject<HTMLTextAreaElement>, value: string): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [ref, value])
}
