import { SUN_DIR, SUN_DIST, R_SUN } from '../common'
import { AU_M, DEG, J2000, jdOf, helioAU, orbitAt, orbitPoint, kepler, eclToWorld, poleWorld, type BodyId } from '@/lib/ephemeris'
import type { V3 } from '@/engine/journey'

/**
 * THE SOLAR SYSTEM LAYOUT (pure numbers; no three.js objects besides the SUN_DIR constant).
 *
 * TRUE:   order, body sizes (relative to each other and to the Sun), directions of every planet from the Sun (Standish elements),
 *         orbital eccentricities / inclinations, axial poles (IAU), the Sun.
 * COMPRESSED: heliocentric DISTANCES. A body at r AU is drawn at  U * sqrt(r / rEarth)  metres from the Sun, where U = SUN_DIST is
 *         the (already compressed, 8x) Earth-Sun distance of the Earth/Moon/Sun zones. So Earth sits exactly where the earlier zones
 *         put it, Neptune is 5.5 U (really 30 U_true) and Mercury 0.62 U. The HUD says so.
 *
 * DATE. JOURNEY_DATE is chosen so the Earth's heliocentric direction is (within ~1 deg) the one the Sun/Earth zones were already lit
 * with (-SUN_DIR, i.e. the Sun at ecliptic longitude ~225.6 deg: early November). The residual is removed by rotating the whole system
 * about the Sun by YAW (printed by tests/ephemeris.test.ts), so Earth never moves relative to the earlier zones.
 *
 * TIME. Orbital time is tied to scroll, not to the wall clock: days = SIM_DAYS * (zone progress). Then the camera keys below can be
 * aimed at where each planet WILL be, and a planet never drifts out of a close-up. Earth is moved along its orbit like the others
 * (relative to its start place, which is the origin, so the earlier zones are untouched).
 */
export const JOURNEY_DATE = new Date(Date.UTC(2026, 10, 8)) // 2026-11-08 00:00 UTC
export const J0 = jdOf(JOURNEY_DATE)
/** Simulated days that elapse across the whole zone (a third of Mercury's 88-day year, ~1 deg of Jupiter's). */
export const SIM_DAYS = 30
/** Metres per zone unit: the compressed Earth-Sun distance. */
export const U = SUN_DIST
export const SUN_POS: V3 = [SUN_DIR.x * SUN_DIST, SUN_DIR.y * SUN_DIST, SUN_DIR.z * SUN_DIST]

const earth0 = helioAU('earth', J0)
export const R_EARTH_AU0 = Math.hypot(earth0[0], earth0[1], earth0[2])
const ew = eclToWorld(earth0)
/** Rotation (about world Y, 2D convention in the x-z plane) that puts the Earth's direction exactly at -SUN_DIR. */
export const YAW = Math.atan2(-SUN_DIR.z, -SUN_DIR.x) - Math.atan2(ew[2], ew[0])
const cy = Math.cos(YAW), sy = Math.sin(YAW)
const rotY = (v: V3): V3 => [v[0] * cy - v[2] * sy, v[1], v[0] * sy + v[2] * cy]

/** Compressed heliocentric distance, metres, for a true distance of r AU. */
export const compress = (rAU: number) => U * Math.sqrt(rAU / R_EARTH_AU0)

/** Direction (unit, world) and compressed distance (m) of an ecliptic AU vector, rotated by YAW. */
export function placeVec(v: [number, number, number]): V3 {
  const r = Math.hypot(v[0], v[1], v[2])
  const w = eclToWorld(v)
  const d = compress(r) / r // metres per AU-length along this direction
  return rotY([w[0] * d, w[1] * d, w[2] * d])
}

/** Position relative to the Sun, metres. */
export function relSun(id: BodyId, days: number): V3 {
  return placeVec(helioAU(id, J0 + days))
}
/** Global position, metres. Earth is expressed relative to its J0 place so it starts exactly at the origin. */
export function bodyPos(id: BodyId, days: number, out: V3 = [0, 0, 0]): V3 {
  const r = relSun(id, days)
  if (id === 'earth') {
    const r0 = relSun('earth', 0)
    out[0] = r[0] - r0[0]; out[1] = r[1] - r0[1]; out[2] = r[2] - r0[2]
    return out
  }
  out[0] = SUN_POS[0] + r[0]; out[1] = SUN_POS[1] + r[1]; out[2] = SUN_POS[2] + r[2]
  return out
}
/** Sun's offset from Earth when Earth has moved: the Sun is fixed, Earth is not. */
export const sunPosition = (): V3 => SUN_POS

/** Orbit polyline for a body at J0 (metres relative to the Sun, YAW applied). n points, closed by the caller. */
export function orbitLine(id: BodyId, n: number): V3[] {
  const o = orbitAt(id, J0)
  const pts: V3[] = []
  for (let i = 0; i < n; i++) pts.push(placeVec(orbitPoint(o, (i / n) * 2 * Math.PI)))
  return pts
}

/** Mean motion, radians per day, of a circular orbit at r AU (for the belts' slow drift). */
export const meanMotion = (rAU: number) => (2 * Math.PI) / (Math.pow(rAU, 1.5) * 365.25636)

/** World pole of a body (unit vector), YAW applied. */
export function poleOf(ra: number, dec: number): V3 { return rotY(poleWorld(ra, dec)) }

// ---- the three scales the HUD / zone talk about
export const HELIOPAUSE_AU = 120 // Voyager 1 crossed at ~121 AU, Voyager 2 at ~119 AU (// VERIFY); schematic sphere
export const HELIOPAUSE_U = compress(HELIOPAUSE_AU) / U
export const NEPTUNE_U = compress(30.07) / U

// ---- unit-direction helper used by the camera keys
const unit = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
/** Camera azimuth (deg) such that the camera sits on the horizontal side `dir` of its target (azim 0 = +Z, positive toward +X). */
export const azimOf = (dir: V3) => Math.atan2(dir[0], dir[2]) / DEG

/** Zone keys in zone units (U metres), target and a body's position at zone progress u (0..1). */
export const toU = (p: V3): V3 => [p[0] / U, p[1] / U, p[2] / U]
export const posAtU = (id: BodyId, u: number): V3 => toU(bodyPos(id, SIM_DAYS * u))
export const sunU = (): V3 => toU(SUN_POS)

/** Camera azimuth that looks at `id` at progress u from the Sun side, swung `swing` degrees around it (a gibbous / crescent, not full face). */
export function azimSunSide(id: BodyId, u: number, swing: number): number {
  const p = bodyPos(id, SIM_DAYS * u)
  return azimOf(unit([SUN_POS[0] - p[0], 0, SUN_POS[2] - p[2]])) + swing
}
/** Azimuth of the camera lying outside the system along `id`'s heliocentric direction. */
export function azimOutward(id: BodyId, u: number): number {
  const p = bodyPos(id, SIM_DAYS * u)
  return azimOf(unit([p[0] - SUN_POS[0], 0, p[2] - SUN_POS[2]]))
}
export { R_SUN, AU_M, J2000, kepler }
