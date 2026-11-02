import { useCallback, useEffect, useState, type RefObject } from 'react'

/**
 * Lifecycle of a pinned chapter's WebGL canvas, shared by every cinematic chapter.
 *
 *  - `near`    mount the scene shortly before it is needed (within one viewport of the track), and tear it down again
 *              once it is far away (beyond 2.5 viewports). Every chapter owns a canvas; with a sixth-of-a-page of
 *              scroll between them, keeping all of them alive would hold several WebGL contexts and a few hundred MB
 *              of textures for nothing. Textures are HTTP-cached and the Moon relief is shared, so re-entry is quick.
 *  - `visible` idle the render loop whenever the chapter is off-screen.
 *  - `ready`   fade the canvas in once textures are on the GPU; reset when the scene is torn down.
 */
export function useStageLifecycle(track: RefObject<HTMLElement | null>) {
  const [near, setNear] = useState(false)
  const [visible, setVisible] = useState(false)
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])

  useEffect(() => {
    const el = track.current
    if (!el) return
    const soon = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '100% 0px' })
    const far = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) {
          setNear(false)
          setReady(false)
        }
      },
      { rootMargin: '250% 0px' },
    )
    const on = new IntersectionObserver(([e]) => setVisible(e.isIntersecting))
    soon.observe(el)
    far.observe(el)
    on.observe(el)
    return () => {
      soon.disconnect()
      far.disconnect()
      on.disconnect()
    }
  }, [track])

  return { near, visible, ready, onReady }
}
