/**
 * Spin frame of the Kerr M87* (pure math, no three.js: tested in Node by tests/kerrframe.test.ts).
 *
 * The journey's "jet frame" (frame.ts: EX, EY, EZ) has z = the APPROACHING jet, which points toward us (17 deg off the line of sight).
 * EHT 2019 (paper V) favours a hole whose spin / angular momentum points AWAY from Earth (disc rotating clockwise on the sky). The
 * Kerr tracer needs the spin along +z with a > 0, so the spin frame is the jet frame turned 180 deg about x:
 *      KX = EX,  KY = -EY,  KZ = -EZ         (still right-handed: KX x KY = KZ)
 * KZ is the angular-momentum axis; the jet cones are symmetric about it, so the bright approaching jet is on the -KZ side (toward us).
 * Both renderers (Kerr for the approach, Schwarzschild for the infall) use this frame, so the disc plane and its sense of rotation agree.
 */
export type V3 = [number, number, number]
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

export interface SpinFrame { KX: V3; KY: V3; KZ: V3 }
export function spinFrame(EX: V3, EY: V3, EZ: V3): SpinFrame {
  return { KX: [EX[0], EX[1], EX[2]], KY: [-EY[0], -EY[1], -EY[2]], KZ: [-EZ[0], -EZ[1], -EZ[2]] }
}
/** jet-frame hole-local vector -> spin-frame hole-local vector (rotation by 180 deg about x) */
export const jetToSpin = (v: readonly number[]): V3 => [v[0], -v[1], -v[2]]

/**
 * Kerr view numbers from the observer position (spin frame, units r_g) and the camera axes (world vectors x right, y up, z back):
 * camRot is column-major: column j = camera axis j as components on the observer's local (r-hat, theta-hat, phi-hat), as BlackHoleRenderer expects.
 */
export function kerrObserver(posK: V3, axes: [V3, V3, V3], f: SpinFrame): { r0: number; mu0: number; phi0: number; camRot: number[] } {
  const [x, y, z] = posK
  const r = Math.hypot(x, y, z), mu = z / r, st = Math.sqrt(Math.max(0, 1 - mu * mu)), phi = Math.atan2(y, x)
  const cp = Math.cos(phi), sp = Math.sin(phi)
  const rh: V3 = [st * cp, st * sp, mu], th: V3 = [mu * cp, mu * sp, -st], ph: V3 = [-sp, cp, 0]
  const camRot: number[] = []
  for (const a of axes) {
    const ak: V3 = [dot(a, f.KX), dot(a, f.KY), dot(a, f.KZ)]
    camRot.push(dot(rh, ak), dot(th, ak), dot(ph, ak))
  }
  return { r0: r, mu0: mu, phi0: phi, camRot }
}
