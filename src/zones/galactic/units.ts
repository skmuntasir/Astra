import { GAL_TO_WORLD, EQ_TO_GAL, galToWorld } from '@/lib/frames'
import { SUN_POS } from '../solar/layout'
import type { V3 } from '@/engine/journey'

/**
 * Units and frames shared by the Prompt 5 zones (beyond the system, Milky Way, Local Group, nearby galaxies).
 * Everything is authored in global METRES (doubles) with the Sun at SUN_POS (the Sun object of the Sun / Solar System zones), and
 * directions come from real coordinates: equatorial (RA, Dec) J2000 -> ecliptic -> the app's y-up world, via the same matrices as the
 * sky backdrop (src/lib/frames.ts), so a star or galaxy sits exactly where the backdrop would put its direction.
 */
export const LY = 9.4607304725808e15
export const KLY = 1e3 * LY
export const MLY = 1e6 * LY
export const PC = 3.0856775814914e16
export const KPC = 1e3 * PC
export const MPC = 1e6 * PC
export const AU = 1.495978707e11
export const SUN_G: V3 = [SUN_POS[0], SUN_POS[1], SUN_POS[2]]
const DEG = Math.PI / 180

type M3 = number[]
const mul = (a: M3, b: M3): M3 => {
  const o = new Array<number>(9).fill(0)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j]
  return o
}
/** equatorial J2000 -> world (galactic->world after equatorial->galactic) */
const EQ_TO_WORLD = mul(GAL_TO_WORLD, EQ_TO_GAL)
const apply = (m: M3, v: V3): V3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]

export const norm3 = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
export const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const mul3 = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
export const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2])

/** Unit vector in the world frame toward (RA, Dec), degrees, J2000. */
export function eqDir(raDeg: number, decDeg: number): V3 {
  const a = raDeg * DEG, d = decDeg * DEG
  return norm3(apply(EQ_TO_WORLD, [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]))
}
/** (h, m, s) -> degrees of RA; (sign, d, m, s) -> degrees of Dec */
export const ra = (h: number, m: number, s: number) => (h + m / 60 + s / 3600) * 15
export const dec = (d: number, m: number, s: number) => { const sg = d < 0 || Object.is(d, -0) ? -1 : 1; return sg * (Math.abs(d) + m / 60 + s / 3600) }

/** Global position (metres) of a thing at RA/Dec and a distance from the Sun. */
export const eqPos = (raDeg: number, decDeg: number, distM: number): V3 => add3(SUN_G, mul3(eqDir(raDeg, decDeg), distM))
export const galDir = (l: number, b: number): V3 => norm3(galToWorld(l, b))
/** Global position of a point at Sun-centred galactic Cartesian (x toward the Galactic Centre, y toward l = 90 deg, z toward the north galactic pole), in light-years. */
export function galXYZ(x: number, y: number, z: number): V3 {
  const w = apply(GAL_TO_WORLD, [x, y, z])
  return [SUN_G[0] + w[0] * LY, SUN_G[1] + w[1] * LY, SUN_G[2] + w[2] * LY]
}
/** Same, but in light-years relative to the Sun, in WORLD axes (what a Sun-origin layer wants for vertex positions). */
export const galToWorldLy = (x: number, y: number, z: number): V3 => apply(GAL_TO_WORLD, [x, y, z])

/** Camera angles (the engine's convention) for a camera sitting in unit direction `d` from its target. */
export function dirToAE(d: V3): { azim: number; elev: number } {
  const n = norm3(d)
  return { azim: (Math.atan2(n[0], n[2]) * 180) / Math.PI, elev: (Math.asin(Math.max(-1, Math.min(1, n[1]))) * 180) / Math.PI }
}
export const aeToDir = (azim: number, elev: number): V3 => {
  const a = azim * DEG, e = elev * DEG
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)]
}

export const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1))); return t * t * (3 - 2 * t) }
