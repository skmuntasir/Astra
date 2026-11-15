import * as THREE from 'three'
import { getObject, ranges, registryVersion, type V3 } from '@/engine/journey'
import { cam } from '@/engine/world'
import { timeline } from '@/engine/timeline'
import { st } from '@/engine/store'
import type { BodyId } from '@/lib/ephemeris'
import { BODIES, BODY } from './bodies'
import { SIM_DAYS, SUN_POS, U, bodyPos } from './layout'
import { bodyTime } from './bodyMaterial'
import { stepMoons } from './satellites'
import { SUN_DIR } from '../common'

/** Shared, per-frame state of the Solar System zone (plain object: read it in useFrame, never in React state). */
export const ZONE_ID = 'solar-system'
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1))); return t * t * (3 - 2 * t) }
export const smooth = sm

export const solar = {
  /** progress through the zone, 0..1, and the simulated days that corresponds to */
  u: 0,
  days: 0,
  /** raw position inside the zone (can be < 0 or > 1) */
  a: -1,
  /** 0..1 fade of everything that is not an opaque planet (orbits, belts, labels, halo) */
  fade: 0,
  /** how "overview" the camera is (labels for every planet), 0..1 */
  overview: 0,
  /** camera distance from the Sun, zone units */
  camSunU: 0,
  /** CSS pixel height of the viewport and device pixel ratio (written by <SolarFx/>) */
  viewH: 720,
  dpr: 1,
  hover: null as string | null,
  sunDir: new Map<BodyId, THREE.Vector3>(),
  /** unit vector Moon -> Sun, world space (drives the scene's directional light, which only lights the Moon) */
  moonSunDir: SUN_DIR.clone(),
}
// every body starts with its real start-of-journey direction; Earth's is exactly SUN_DIR (Earth is at the origin at days = 0), so the
// Earth/Moon hero looks identical to the old constant, even on the frames before the first stepSolar()
for (const b of BODIES) solar.sunDir.set(b.id, b.id === 'earth' ? SUN_DIR.clone() : new THREE.Vector3(0, 0, 1))

let cache = { ver: -1, t0: 0, t1: 1 }
function zoneRange() {
  const v = registryVersion()
  if (cache.ver !== v) {
    const z = ranges('main').find((r) => r.id === ZONE_ID)
    cache = { ver: v, t0: z?.t0 ?? 0, t1: z?.t1 ?? 1 }
  }
  return cache
}

/**
 * Advance the zone's simulation from the master timeline (called every frame BEFORE the Driver, at priority -5, using the previous
 * frame's smoothed t: one frame of lag in a quantity that moves ~0.3 deg/s is invisible, and the Driver then places objects from
 * positions that are already up to date). Writes every body's global position (metres) into its registered object.
 */
export function stepSolar() {
  const z = zoneRange()
  const T = timeline.t
  const a = (T - z.t0) / (z.t1 - z.t0)
  solar.a = a
  solar.u = Math.min(1, Math.max(0, a))
  solar.days = SIM_DAYS * solar.u
  const main = st().timelineId === 'main'
  solar.fade = main ? sm(-0.07, 0.03, a) * (1 - sm(0.97, 1.07, a)) : 0
  const dx = cam.pos[0] - SUN_POS[0], dy = cam.pos[1] - SUN_POS[1], dz = cam.pos[2] - SUN_POS[2]
  solar.camSunU = Math.hypot(dx, dy, dz) / U
  solar.overview = sm(2.6, 8, solar.camSunU) * (1 - sm(24, 34, solar.camSunU))
  for (const b of BODIES) {
    const o = getObject(b.id)
    if (!o) continue
    bodyPos(b.id, solar.days, o.position)
    const d = solar.sunDir.get(b.id)!
    d.set(SUN_POS[0] - o.position[0], SUN_POS[1] - o.position[1], SUN_POS[2] - o.position[2]).normalize()
  }
  bodyTime.value = st().motion === 'reduced' ? 0 : timeline.clock
  stepMoons()
  const mo = getObject('moon')
  if (mo) solar.moonSunDir.set(SUN_POS[0] - mo.position[0], SUN_POS[1] - mo.position[1], SUN_POS[2] - mo.position[2]).normalize()
}

/** On-screen radius of a body's true disc, CSS pixels (camera sits at the origin of the render space; global metres here). */
export function pxRadius(id: BodyId, fovDeg: number): number {
  const o = getObject(id)
  if (!o) return 0
  const d = Math.hypot(o.position[0] - cam.pos[0], o.position[1] - cam.pos[1], o.position[2] - cam.pos[2])
  return ((BODY.get(id)!.radius / d) * (solar.viewH / 2)) / Math.tan((fovDeg * Math.PI) / 360)
}
/** Distance camera -> body, metres. */
export function distTo(p: V3): number {
  return Math.hypot(p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2])
}
