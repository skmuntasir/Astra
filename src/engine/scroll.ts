import Lenis from 'lenis'
import { totalBudget, ranges } from './journey'
import { st, useStore } from './store'
import { timeline } from './timeline'

/**
 * Scroll driver. One tall native-scroll page whose height comes from the zone budgets; Lenis normalises wheel/touch.
 * T = scrollY / scrollable height. In reduced-motion mode there is NO tall page: navigation is by zone stills.
 */
let lenis: Lenis | null = null
let spacer: HTMLDivElement | null = null
const saved: { y: number; id: string }[] = []

export function initScroll() {
  spacer = document.createElement('div')
  spacer.id = 'scroll-space'
  spacer.setAttribute('aria-hidden', 'true')
  spacer.style.cssText = 'position:relative;width:1px;pointer-events:none'
  document.body.appendChild(spacer)
  applyMode()
}

function applyMode() {
  const s = st()
  lenis?.destroy()
  lenis = null
  if (!spacer) return
  if (s.motion === 'reduced') {
    spacer.style.height = '100svh'
    document.documentElement.classList.add('reduced')
    window.scrollTo(0, 0)
    return
  }
  document.documentElement.classList.remove('reduced')
  spacer.style.height = `${totalBudget(s.timelineId) + 100}svh`
  // lerp 0.085 (was 0.14) and wheelMultiplier 0.8 (was 0.9): a softer start and stop for every wheel notch (tests/scroll_smooth.test.ts: peak jerk -50 %)
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.8, touchMultiplier: 1.4, syncTouch: false })
  lenis.on('scroll', (l: Lenis) => {
    if (st().focusPhase !== 'idle' || st().gate) return
    const limit = l.limit || 1
    timeline.target = Math.min(1, Math.max(0, l.scroll / limit))
  })
  const limit = lenis.limit || 1
  timeline.target = Math.min(1, Math.max(0, lenis.scroll / limit))
}

export const setMotion = (m: 'full' | 'reduced') => {
  useStore.setState({ motion: m })
  applyMode()
  timeline.snap(m === 'reduced' ? stillOf(st().zoneIndex) : timeline.t)
}
export const stillOf = (index: number) => {
  const z = ranges(st().timelineId)[index]
  return z ? z.t0 + (z.stillT ?? 0.5) * (z.t1 - z.t0) : 0
}

export const raf = (time: number) => lenis?.raf(time)
export const lock = () => lenis?.stop()
export const unlock = () => lenis?.start()
export const scrollY = () => (lenis ? lenis.scroll : window.scrollY)
export const scrollLimit = () => lenis?.limit ?? 1

/** Move the scroll position to T (0..1). `cut` = immediate, no smoothing (the caller cross-fades). */
export function scrollToT(T: number, cut: boolean) {
  T = Math.min(1, Math.max(0, T))
  if (st().motion === 'reduced' || !lenis) { timeline.snap(T); return }
  const y = T * (lenis.limit || 1)
  if (cut) { lenis.scrollTo(y, { immediate: true, force: true }); timeline.snap(T) }
  // ease-in-out (was ease-out): ease-out starts at full speed, an instant velocity jump; this starts and ends at rest
  else lenis.scrollTo(y, { duration: 2, easing: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2), force: true })
}

/** Branch support: remember the exact main scroll position, switch the page to the branch height, and back. */
export function enterBranchScroll(id: string) {
  saved.push({ y: scrollY(), id: st().timelineId })
  useStore.setState({ timelineId: id })
  if (st().motion === 'full' && spacer) {
    spacer.style.height = `${totalBudget(id) + 100}svh`
    lenis?.resize()
    lenis?.scrollTo(0, { immediate: true, force: true })
  }
  timeline.snap(0)
}
export function exitBranchScroll(returnT?: number) {
  const prev = saved.pop()
  if (!prev) return
  useStore.setState({ timelineId: prev.id })
  if (st().motion === 'full' && spacer) {
    spacer.style.height = `${totalBudget(prev.id) + 100}svh`
    lenis?.resize()
    lenis?.scrollTo(prev.y, { immediate: true, force: true })
    const limit = lenis?.limit || 1
    timeline.snap(returnT ?? prev.y / limit)
    if (returnT !== undefined) lenis?.scrollTo(returnT * limit, { immediate: true, force: true })
  } else timeline.snap(returnT ?? 0)
}
export const branchDepth = () => saved.length
