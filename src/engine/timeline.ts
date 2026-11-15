import { ranges, totalBudget, zoneAt } from './journey'
import { st, useStore } from './store'

/**
 * The master timeline. Scroll (or a jump) sets `target` in 0..1; `t` follows it through a critically-damped smoother
 * (exact analytic integration, frame-rate independent) so the camera is silky and can never jump.
 */
const OMEGA = 6.0 // rad/s (was 8.5): ~0.65 s to settle, no overshoot (critical damping); with Lenis lerp 0.085 a notch of the wheel arrives in ~0.9 s
export const timeline = {
  target: 0,
  t: 0,
  v: 0,
  frozen: false,
  /** Seconds-based clock for ambient motion (page-wide, never restarts). */
  clock: 0,
  update(dt: number) {
    dt = Math.min(dt, 0.1)
    this.clock += dt
    if (this.frozen) return
    const d = this.t - this.target
    const tmp = (this.v + OMEGA * d) * dt
    const e = Math.exp(-OMEGA * dt)
    this.t = this.target + (d + tmp) * e
    this.v = (this.v - OMEGA * tmp) * e
    if (Math.abs(this.t - this.target) < 1e-7 && Math.abs(this.v) < 1e-6) { this.t = this.target; this.v = 0 }
  },
  /** Cut: no smoothing (used under a cross-fade, on branch enter/exit and for reduced motion). */
  snap(T: number) {
    this.target = this.t = Math.min(1, Math.max(0, T))
    this.v = 0
  },
}

/** Publishes the active zone into the store when it changes (cheap; called every frame). */
export function publishZone() {
  const s = st()
  const z = zoneAt(timeline.t, s.timelineId)
  if (!z) return
  if (z.zone.id !== s.zoneId) useStore.setState({ zoneId: z.zone.id, zoneTitle: z.zone.title, zoneScale: z.zone.scale, zoneIndex: z.zone.index })
}

export const zoneRanges = ranges
export const budget = totalBudget
