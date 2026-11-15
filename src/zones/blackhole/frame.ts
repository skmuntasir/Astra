import type { V3 } from '@/engine/journey'
import { M87D } from '../galactic/data'
import { eqDir, mul3, add3, sub3, dot3, cross3, norm3, aeToDir, dirToAE } from '../galactic/units'
import { skyBasis } from '../galactic/Galaxy'
import { M87_G } from '../galactic/M87'
import { rgOf, M87_MASS_SUN } from '@/lib/bh/infall'
import { WORLD_TO_GAL } from '@/lib/frames'
import { spinFrame, jetToSpin, type SpinFrame } from './kerrFrame'

/**
 * The hole's frame in the world. z = spin / jet axis, pointing to the side of the approaching jet (toward the Sun, 17 deg from the line of sight,
 * the same axis M87.tsx draws the schematic jet along). x is the projection of the Sun direction on the equatorial plane. The hole is NON-ROTATING in
 * the model (spin not measured), so only the disc plane and the jet use the axis.
 * Final series 5a: this is the JET frame (used for the camera path, HUD and tests). The renderers use the SPIN frame (K*, kerrFrame.ts): the same
 * axes turned 180 deg about x, so the angular momentum points away from us as EHT 2019 favours.
 */
export const RG = rgOf(M87_MASS_SUN) // metres: GM/c^2 for 6.5e9 Msun  // VERIFY mass (EHT 2019)
export const HOLE_G: V3 = M87_G
const d = eqDir(M87D.ra, M87D.dec) // Sun -> M87
const { u, e } = skyBasis(d)
const PA = (M87D.jetPA * Math.PI) / 180, INC = (M87D.jetInc * Math.PI) / 180
const mj = add3(mul3(u, Math.cos(PA)), mul3(e, Math.sin(PA)))
export const EZ: V3 = norm3(add3(mul3(d, -Math.cos(INC)), mul3(mj, Math.sin(INC))))
const toSun = mul3(d, -1)
export const EX: V3 = norm3(sub3(toSun, mul3(EZ, dot3(toSun, EZ))))
export const EY: V3 = cross3(EZ, EX)

/** world vector (metres or unit) -> hole-local components */
export const toHole = (v: V3): V3 => [dot3(v, EX), dot3(v, EY), dot3(v, EZ)]
/** hole-local -> world */
export const fromHole = (v: V3): V3 => add3(add3(mul3(EX, v[0]), mul3(EY, v[1])), mul3(EZ, v[2]))
/** camera direction (hole -> camera) for colatitude theta and longitude phi in the hole frame, as the engine's azimuth / elevation (deg) */
export function camAngles(thetaDeg: number, phiDeg: number): { azim: number; elev: number } {
  const t = (thetaDeg * Math.PI) / 180, p = (phiDeg * Math.PI) / 180
  return dirToAE(fromHole([Math.sin(t) * Math.cos(p), Math.sin(t) * Math.sin(p), Math.cos(t)]))
}
/** hole -> galactic cartesian, column-major 3x3 (for THREE.Matrix3.fromArray) */
export function holeToGalactic(): number[] {
  const H = [EX, EY, EZ] // columns
  const W = WORLD_TO_GAL // row-major
  const out: number[] = new Array(9).fill(0)
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) out[3 * j + i] = W[3 * i] * H[j][0] + W[3 * i + 1] * H[j][1] + W[3 * i + 2] * H[j][2]
  return out
}
export { aeToDir }

/** Observer position relative to the hole, hole-local, in r_g (double precision; the target is the hole itself, so no large-number subtraction is needed). */
export function observerRg(pose: { target: V3; dist: number; azim: number; elev: number }): { pos: V3; r: number; er: V3 } {
  const o = aeToDir(pose.azim, pose.elev)
  const w: V3 = [pose.target[0] - HOLE_G[0] + o[0] * pose.dist, pose.target[1] - HOLE_G[1] + o[1] * pose.dist, pose.target[2] - HOLE_G[2] + o[2] * pose.dist]
  const h = toHole(w)
  const r = Math.hypot(h[0], h[1], h[2]) / RG
  return { pos: [h[0] / RG, h[1] / RG, h[2] / RG], r, er: [h[0] / (r * RG), h[1] / (r * RG), h[2] / (r * RG)] }
}

/** the spin frame (z = angular momentum, pointing away from us) used by BOTH renderers */
export const SPIN: SpinFrame = spinFrame(EX, EY, EZ)
export { jetToSpin }
/** hole(spin frame) -> galactic cartesian, column-major 3x3 */
export function holeToGalacticSpin(): number[] {
  const H = [SPIN.KX, SPIN.KY, SPIN.KZ]
  const W = WORLD_TO_GAL
  const out: number[] = new Array(9).fill(0)
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) out[3 * j + i] = W[3 * i] * H[j][0] + W[3 * i + 1] * H[j][1] + W[3 * i + 2] * H[j][2]
  return out
}
