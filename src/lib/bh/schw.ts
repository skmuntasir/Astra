/**
 * Schwarzschild planar ray tracer for an observer in RADIAL FREE FALL (or at rest), valid on both sides of the horizon. CPU reference of the GLSL in
 * schwShader.ts (same equations, same step rule: read both together). Units G = c = M = 1 (r in r_g = GM/c^2, horizon r = 2).
 *
 * Why this works inside the horizon: a Schwarzschild null geodesic is planar and has two constants, E = -p_t and L = p_phi, which are the same in
 * Schwarzschild and in Painleve-Gullstrand / ingoing Eddington-Finkelstein coordinates (the coordinates differ by a function of r times dt only).
 * The radial equation (dr/ds)^2 = E^2 - L^2 (1 - 2/r)/r^2 and dphi/ds = L/r^2 are regular for all r > 0. The observer is a radial geodesic with
 * energy E_o and speed P = |dr/dtau| = sqrt(E_o^2 - (1 - 2/r)) (E_o = 1, P = sqrt(2/r) is the Painleve-Gullstrand "rain" frame).
 *
 * Camera frame: the look direction n makes angle psi with the OUTWARD radial direction. For a photon of observed frequency 1 that arrives from n:
 *      E = E_o + P cos(psi)         (Killing energy = frequency seen at infinity; the sky is shifted by g = 1/E)
 *      L = r sin(psi)
 *      dr/ds (backward) = P + E_o cos(psi)
 * The ray is integrated backwards from the observer in the affine parameter s with r'' = L^2 (r - 3)/r^4, phi' = L/r^2 (phi = angle swept in the ray's plane).
 * Rules (all derived from the sign of E, r and r'):
 *   E <= 0                      -> the light would have to come from the other asymptotic region (nothing there for a collapsed star): dark
 *   r < 3 and r' < 0            -> falls to the singularity when followed backwards = comes out of the past horizon: dark ("captured", the shadow)
 *   r > 3 and r' > 0            -> escapes (the potential barrier is behind it): the sky
 *   equatorial plane crossing   -> the thin disc, if rIn <= r <= rOut
 */
export type V3 = [number, number, number]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

export interface SchwInput {
  r0: number
  /** observer energy and speed (see above); static observer: Eo = sqrt(1 - 2/r0), P = 0 */
  Eo: number; P: number
  /** unit vector from the hole to the observer, hole-local cartesian (z = spin / disc axis) */
  er: V3
  /** look direction, unit, hole-local cartesian */
  look: V3
  rIn: number; rOut: number
  maxSteps?: number; eps?: number
}
export type SchwKind = 'captured' | 'escaped' | 'disc' | 'lost'
export interface SchwResult {
  kind: SchwKind
  steps: number
  rMin: number
  rHit: number; phiHit: number; tHit: number
  /** escaped: direction (unit, hole-local) of the source at infinity */
  sky: V3
  /** disc hit: nu_obs / nu_em; escaped: nu_obs / nu_inf = 1 / E */
  g: number
  E: number; L: number
  crossings: number
}
export const SCHW_EPS = 0.1
export const SCHW_R_STOP = 300

export function traceSchw(inp: SchwInput): SchwResult {
  const { r0, Eo, P, er, look } = inp
  const res: SchwResult = { kind: 'lost', steps: 0, rMin: r0, rHit: 0, phiHit: 0, tHit: 0, sky: [0, 0, 1], g: 0, E: 0, L: 0, crossings: 0 }
  const cps = dot(look, er)
  let nt: V3 = [look[0] - cps * er[0], look[1] - cps * er[1], look[2] - cps * er[2]]
  const sps = Math.hypot(nt[0], nt[1], nt[2])
  let et: V3
  if (sps > 1e-7) et = [nt[0] / sps, nt[1] / sps, nt[2] / sps]
  else { const ax: V3 = Math.abs(er[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]; et = norm(cross(er, ax)) }
  const E = Eo + P * cps
  const L = Math.max(r0 * sps, 1e-6)
  res.E = E; res.L = L
  if (E <= 1e-9) { res.kind = 'captured'; return res }
  let rd = P + Eo * cps
  const A = er[2], B = et[2]
  const phin = Math.atan2(-A, B)
  const Nz = cross(er, et)[2]
  const L2 = L * L
  const rdd = (r: number) => (L2 * (r - 3)) / (r * r * r * r)
  const dphi = (r: number) => L / (r * r)
  const dT = (r: number, v: number) => { const b = Math.sqrt(2 / r); return -(E * E + (2 / r) * (L2 / (r * r))) / Math.max(E + b * v, 1e-4) }
  let r = r0, phi = 0, T = 0
  const rStop = Math.max(r0, SCHW_R_STOP)
  const maxSteps = inp.maxSteps ?? 400, eps = inp.eps ?? SCHW_EPS
  for (let it = 0; it < maxSteps; it++) {
    res.steps = it
    const rate = Math.max(Math.abs(rd) / r, 0.5 * Math.sqrt(Math.abs(rdd(r)) / r)) + 0.5 * dphi(r) + 1e-4 / r
    const h = Math.min(eps / rate, 0.5 * r)
    const f = (rr: number, v: number): [number, number, number, number] => [v, rdd(rr), dphi(rr), dT(rr, v)]
    const k1 = f(r, rd)
    const k2 = f(r + 0.5 * h * k1[0], rd + 0.5 * h * k1[1])
    const k3 = f(r + 0.5 * h * k2[0], rd + 0.5 * h * k2[1])
    const k4 = f(r + h * k3[0], rd + h * k3[1])
    const pr = r, pv = rd, pp = phi, pT = T
    r += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
    rd += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
    phi += (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])
    T += (h / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3])
    if (r < res.rMin) res.rMin = r
    // ---- equatorial plane: the ray's plane meets z = 0 along a line, at phi = phin + k pi
    const kp = Math.floor((pp - phin) / Math.PI), kn = Math.floor((phi - phin) / Math.PI)
    if (kn !== kp) {
      res.crossings++
      const phc = phin + kn * Math.PI
      const x = (phc - pp) / (phi - pp)
      const x2 = x * x, x3 = x2 * x
      const h00 = 2 * x3 - 3 * x2 + 1, h10 = x3 - 2 * x2 + x, h01 = -2 * x3 + 3 * x2, h11 = x3 - x2
      const rh = h00 * pr + h10 * pv * h + h01 * r + h11 * rd * h
      if (rh >= inp.rIn && rh <= inp.rOut) {
        const u: V3 = [Math.cos(phc) * er[0] + Math.sin(phc) * et[0], Math.cos(phc) * er[1] + Math.sin(phc) * et[1], 0]
        const ut = 1 / Math.sqrt(1 - 3 / rh), Om = Math.pow(rh, -1.5)
        res.kind = 'disc'; res.rHit = rh; res.phiHit = Math.atan2(u[1], u[0]); res.tHit = pT + x * (T - pT)
        res.g = 1 / (ut * (E + Om * L * Nz))
        return res
      }
    }
    if (r < 3 && rd < 0) { res.kind = 'captured'; return res }
    if (r > rStop && rd > 0) {
      const f2 = Math.sqrt(1 - 2 / r)
      const ur: V3 = [Math.cos(phi) * er[0] + Math.sin(phi) * et[0], Math.cos(phi) * er[1] + Math.sin(phi) * et[1], Math.cos(phi) * er[2] + Math.sin(phi) * et[2]]
      const up: V3 = [-Math.sin(phi) * er[0] + Math.cos(phi) * et[0], -Math.sin(phi) * er[1] + Math.cos(phi) * et[1], -Math.sin(phi) * er[2] + Math.cos(phi) * et[2]]
      const a = rd / f2, b = L / r
      res.sky = norm([a * ur[0] + b * up[0], a * ur[1] + b * up[1], a * ur[2] + b * up[2]])
      res.g = 1 / E
      res.kind = 'escaped'
      return res
    }
  }
  return res
}

/** Observer frame for a faller released from rest at ri (Infinity: from infinity) or a static observer (P = 0, Eo = sqrt(1 - 2/r)). */
export const staticFrame = (r: number) => ({ Eo: Math.sqrt(Math.max(0, 1 - 2 / r)), P: 0 })
export const fallFrame = (ri: number, r: number) => {
  const E = Number.isFinite(ri) ? Math.sqrt(Math.max(0, 1 - 2 / ri)) : 1
  return { Eo: E, P: Math.sqrt(Math.max(0, E * E - (1 - 2 / r))) }
}
