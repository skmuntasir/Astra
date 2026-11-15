import { getObject, type V3 } from '@/engine/journey'
import { timeline } from '@/engine/timeline'
import { st } from '@/engine/store'
import { MOON_DIST } from '../common'
import { BODY } from './bodies'
import { poleOf } from './layout'

/**
 * THE MOONS of the Solar System zone (final series, step 1): Jupiter's four Galilean moons, Saturn's Titan and Enceladus, Neptune's
 * Triton, Pluto's Charon, as ordinary registered objects that orbit their planet. Real radii and real orbital radii (so they are far
 * smaller than a pixel until you fly to them), orbits in the planet's equatorial plane (IAU pole), tidally locked.
 *
 * TIME: orbits run at MOON_SPEEDUP x real time, driven by the page clock (not by scroll). The HUD / panel says so. Reduced motion: still.
 * Numbers typed from memory (NASA / JPL satellite data), rounded: // VERIFY radii, semi-major axes and periods below.
 */
export const MOON_SPEEDUP = 8000 // 1 real day = 10.8 s on screen: Io laps Jupiter in 19 s, Callisto in 3 min
export interface MoonSpec {
  id: string
  name: string
  parent: 'jupiter' | 'saturn' | 'neptune' | 'pluto'
  /** metres */
  radius: number
  /** semi-major axis, metres */
  a: number
  /** orbital period, days */
  periodD: number
  retro?: boolean
  map: string
  /** initial phase, rad (arbitrary) */
  phase: number
}
const km = (x: number) => x * 1000
export const MOONS: MoonSpec[] = [
  { id: 'io', name: 'Io', parent: 'jupiter', radius: km(1821.6), a: km(421700), periodD: 1.769, map: 'io', phase: 0.4 },
  { id: 'europa', name: 'Europa', parent: 'jupiter', radius: km(1560.8), a: km(671100), periodD: 3.551, map: 'europa', phase: 2.1 },
  { id: 'ganymede', name: 'Ganymede', parent: 'jupiter', radius: km(2634.1), a: km(1070400), periodD: 7.155, map: 'ganymede', phase: 4.0 },
  { id: 'callisto', name: 'Callisto', parent: 'jupiter', radius: km(2410.3), a: km(1882700), periodD: 16.689, map: 'callisto', phase: 5.3 },
  { id: 'titan', name: 'Titan', parent: 'saturn', radius: km(2574.7), a: km(1221900), periodD: 15.945, map: 'titan', phase: 1.0 },
  { id: 'enceladus', name: 'Enceladus', parent: 'saturn', radius: km(252.1), a: km(238000), periodD: 1.370, map: 'enceladus', phase: 3.3 },
  { id: 'triton', name: 'Triton', parent: 'neptune', radius: km(1353.4), a: km(354800), periodD: 5.877, retro: true, map: 'triton', phase: 0.9 },
  { id: 'charon', name: 'Charon', parent: 'pluto', radius: km(606), a: km(19596), periodD: 6.387, map: 'charon', phase: 2.6 },
]
export const MOON_BY_ID = new Map(MOONS.map((m) => [m.id, m]))

/** Current orbit angle of a moon (rad, measured about the planet's north pole; decreasing for a retrograde orbit). */
export function moonAngle(m: MoonSpec): number {
  const clock = st().motion === 'reduced' ? 0 : timeline.clock
  const turns = (clock * MOON_SPEEDUP) / (m.periodD * 86400)
  return m.phase + (m.retro ? -1 : 1) * turns * Math.PI * 2
}

// per-planet orbit basis, computed once
const basis = new Map<string, { e1: V3; e2: V3 }>()
function basisOf(parent: MoonSpec['parent']) {
  let b = basis.get(parent)
  if (b) return b
  const s = BODY.get(parent)!
  const n = poleOf(s.pole[0], s.pole[1])
  const ref: V3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  const cr = (a: V3, c: V3): V3 => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]]
  const nrm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
  const e1 = nrm(cr(n, ref))
  const e2 = cr(n, e1)
  b = { e1, e2 }
  basis.set(parent, b)
  return b
}
/** Offset of a moon from its planet, metres. */
export function moonOffset(m: MoonSpec, out: V3 = [0, 0, 0]): V3 {
  const { e1, e2 } = basisOf(m.parent)
  const th = moonAngle(m)
  const c = Math.cos(th) * m.a, s = Math.sin(th) * m.a
  out[0] = e1[0] * c + e2[0] * s; out[1] = e1[1] * c + e2[1] * s; out[2] = e1[2] * c + e2[2] * s
  return out
}

const tmp: V3 = [0, 0, 0]
/** Called at the end of stepSolar(): writes every moon's global position (and keeps Earth's Moon with Earth). */
export function stepMoons() {
  for (const m of MOONS) {
    const p = getObject(m.parent), o = getObject(m.id)
    if (!p || !o) continue
    moonOffset(m, tmp)
    o.position[0] = p.position[0] + tmp[0]; o.position[1] = p.position[1] + tmp[1]; o.position[2] = p.position[2] + tmp[2]
  }
  // Earth's Moon keeps its place relative to Earth (Earth drifts along its orbit across the Solar System zone; the Moon zones assume Earth at the origin,
  // where this is exactly the old fixed position)
  const e = getObject('earth'), mo = getObject('moon')
  if (e && mo) { mo.position[0] = e.position[0] + MOON_DIST; mo.position[1] = e.position[1]; mo.position[2] = e.position[2] }
}
