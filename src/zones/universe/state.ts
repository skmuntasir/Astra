import { ranges } from '@/engine/journey'
import { smooth } from '../galactic/units'

const caches = new Map<string, { t0: number; t1: number } | null>()
export function zoneLocal(zoneId: string, T: number): number {
  let c = caches.get(zoneId)
  if (c === undefined) {
    const z = ranges('main').find((r) => r.id === zoneId)
    c = z ? { t0: z.t0, t1: z.t1 } : null
    caches.set(zoneId, c)
  }
  return c ? (T - c.t0) / (c.t1 - c.t0) : -1
}
/** Black hole -> universe seam: 0 while the hole is drawn, 1 once it has dissolved (local t of 'universe' 0.02 .. 0.12). -1 when the zone does not exist. */
export function bhOut(T: number): number {
  const l = zoneLocal('universe', T)
  if (l < 0) return -1
  return smooth(0.02, 0.12, l)
}
/** per-frame numbers shared by the layers + HUD (plain object) */
export const uni = { sphereD: 0, webD: 0, mvProg: 0, hypo: 0 }
export { smooth }
