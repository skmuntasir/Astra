import { st } from './store'
import { timeline } from './timeline'

/**
 * The opening sequence, run once when loading finishes: the dark lifts off the scene, the camera drifts in from a little further out
 * and settles, the title emerges, and the interface fades in last, one piece after another. All times in ms from startIntro().
 */
export const intro = { t0: -1, cam: true }
export const INTRO = { veil: 4600, camera: 9000, titleFrom: 2600, titleTo: 4800, hud: 3000, scrollHint: 5600 }
const clamp = (u: number) => Math.min(1, Math.max(0, u))
const sm = (u: number) => { u = clamp(u); return u * u * (3 - 2 * u) }

export const introMs = () => (intro.t0 < 0 ? -1 : performance.now() - intro.t0)
const reduced = () => st().motion === 'reduced'

/** 0..1 smooth ramp between two moments of the opening (0 before it starts; 1 for reduced motion once started) */
export function introRamp(from: number, to: number) {
  if (intro.t0 < 0) return 0
  if (reduced()) return 1
  return sm((introMs() - from) / (to - from))
}
/** 1 = the dark still covers the scene, 0 = fully revealed */
export const introVeil = () => (intro.t0 < 0 ? 1 : reduced() ? 1 - clamp(introMs() / 500) : 1 - sm(introMs() / INTRO.veil))
/** 1 at the very start of the camera drift, easing to 0 (a long, soft landing) */
export function introCamK() {
  if (!intro.cam) return 0
  if (reduced()) return 0
  if (intro.t0 < 0) return 1
  const u = clamp(introMs() / INTRO.camera)
  if (u >= 1) { intro.cam = false; return 0 }
  return Math.pow(1 - u, 3)
}

export function startIntro() {
  if (intro.t0 >= 0) return
  intro.t0 = performance.now()
  intro.cam = !reduced() && timeline.t < 0.01 // a shared link into the middle of the journey skips the camera drift
  const doc = document.documentElement
  setTimeout(() => doc.classList.remove('astra-intro'), reduced() ? 150 : INTRO.hud)
}
