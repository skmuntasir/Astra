import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { groups } from './world'
import { st } from './store'

/**
 * Adaptive render resolution. The quality tier sets a pixel-ratio CAP (high = 2). On a weak GPU or a very dense screen that cap can cost more fill-rate
 * than the card has, and the whole page (every object, every zone) stutters. This watches the real frame time and, when it is SUSTAINED slow, lowers the
 * pixel ratio in small steps (never below 1); after a long stable stretch it probes one step back up, and a step that failed is not retried for a while.
 * It never runs while loading, while the black hole is drawn (that has its own guard, and a canvas resize would reallocate its targets), or when the
 * cap is already 1 (low tier / ordinary screens: nothing to lower).
 */
const STEP = 0.25
const SLOW_MS = 23 // mean frame time above this for ~2 s = sustained slow (below ~43 fps)
const FAST_MS = 18.5 // at or below this the GPU is keeping up with a 60 Hz display
const WINDOW = 90 // frames per decision
const BH_ID = 'bh-m87'

export function AdaptiveRes() {
  const setDpr = useThree((s) => s.setDpr)
  const s = useRef({ sum: 0, n: 0, slow: 0, stable: 0, level: 0, cap: 0, maxOk: 0, blockedUntil: 0 })
  useFrame((_, dt) => {
    const a = s.current
    const cap = Math.min(st().settings.dprCap, typeof devicePixelRatio === 'number' ? Math.max(1, devicePixelRatio) : 1)
    if (a.cap !== cap) { a.cap = cap; a.level = cap; a.maxOk = cap; a.sum = 0; a.n = 0; a.slow = 0; a.stable = 0 } // quality changed (or first frame): start over at the cap
    if (cap <= 1 || st().phase !== 'ready' || document.hidden) { a.sum = 0; a.n = 0; return }
    if (groups.get(BH_ID)?.visible) { a.sum = 0; a.n = 0; return }
    if (dt <= 0 || dt > 0.25) return // a hitch or a hidden tab is not a measurement of the GPU
    a.sum += dt * 1000; a.n++
    if (a.n < WINDOW) return
    const mean = a.sum / a.n
    a.sum = 0; a.n = 0
    const now = performance.now()
    if (mean > SLOW_MS) {
      a.stable = 0
      if (++a.slow >= 2 && a.level > 1) { // two slow windows in a row
        a.slow = 0
        a.level = Math.max(1, a.level - STEP)
        a.maxOk = a.level // do not climb back to what just failed
        a.blockedUntil = now + 45_000
        setDpr(a.level)
      }
    } else {
      a.slow = 0
      if (mean <= FAST_MS) a.stable++; else a.stable = 0
      // after ~12 s of keeping up, probe one step up (once the 45 s block on a failed level has passed)
      if (a.stable >= 8 && a.level < cap && now > a.blockedUntil) {
        a.stable = 0
        a.maxOk = Math.min(cap, a.maxOk + STEP)
        if (a.level < a.maxOk) { a.level = Math.min(cap, a.level + STEP); setDpr(a.level) }
      }
    }
  })
  return null
}
