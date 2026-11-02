import { useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * Scroll progress (0 → 1) through a tall "track" element that pins a sticky "stage" child.
 * 0 = the stage has just pinned, 1 = it is about to unpin.
 *
 * No React state: the value lives in the returned ref (read it from `useFrame`) and is mirrored to a
 * `--p` CSS variable on the track, so DOM text can be driven with CSS `calc()` at zero render cost.
 * When `enabled` is false (reduced motion) progress is pinned at 1: the finished composition.
 *
 * `mirror` (optional): also publish the value on <html> under this CSS variable name (e.g. `--solar-p`), so a
 * neighbouring chapter's CSS can react to it. Only while enabled, so a reduced-motion page never triggers hand-offs.
 */
export function useSectionProgress(
  track: RefObject<HTMLElement | null>,
  stage: RefObject<HTMLElement | null>,
  enabled: boolean,
  mirror?: string,
) {
  const progress = useRef(enabled ? 0 : 1)

  useLayoutEffect(() => {
    const t = track.current
    const s = stage.current
    if (!t || !s) return
    if (!enabled) {
      progress.current = 1
      t.style.setProperty('--p', '1')
      return
    }
    const update = () => {
      // Heights, not innerHeight: the mobile URL bar changes innerHeight mid-scroll.
      const range = Math.max(1, t.offsetHeight - s.offsetHeight)
      const p = Math.min(1, Math.max(0, -t.getBoundingClientRect().top / range))
      progress.current = p
      t.style.setProperty('--p', p.toFixed(4))
      if (mirror) document.documentElement.style.setProperty(mirror, p.toFixed(4))
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      if (mirror) document.documentElement.style.removeProperty(mirror)
    }
  }, [track, stage, enabled, mirror])

  return progress
}
