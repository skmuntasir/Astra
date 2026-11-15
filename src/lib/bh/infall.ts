/**
 * Free fall into a NON-ROTATING (Schwarzschild) black hole: all the formulas the infall HUD and the renderer use. Pure numbers, no three.js.
 * Units: G = c = M = 1, so lengths are in r_g = GM/c^2 and times in GM/c^3. (Horizon at r = 2, photon sphere r = 3, ISCO r = 6.)
 *
 * The infaller is released from rest at r_i (E = sqrt(1 - 2/r_i), L = 0): the radial geodesic is a cycloid,
 *   r = (r_i/2)(1 + cos eta),   tau = sqrt(r_i^3/8) (eta + sin eta),   eta = 0 at release, pi at the singularity,
 * and the coordinate (distant-observer) time follows from dt/dtau = E/(1 - 2/r) (diverges at r = 2).
 * Local frame: u = (E, -P) with P = |dr/dtau| = sqrt(E^2 - (1 - 2/r)) (valid on both sides of the horizon); a photon of local frequency w that
 * travels at angle xi from the outward radial direction has Killing energy E_ph = w (E - P cos xi) and angular momentum L = r w sin xi.
 */
import { C_SI, G_SI, MSUN_KG } from './kerr'

export const M87_MASS_SUN = 6.5e9 // EHT 2019 (ApJL 875 L6) // VERIFY
export const STELLAR_MASS_SUN = 10
export const HORIZON = 2
export const G_EARTH = 9.80665

/** r_g in metres and GM/c^3 in seconds for a mass in solar masses */
export const rgOf = (massSun: number) => (G_SI * massSun * MSUN_KG) / (C_SI * C_SI)
export const tgOf = (massSun: number) => rgOf(massSun) / C_SI

export interface Faller {
  /** release radius (r_g); Infinity = from rest at infinity */
  ri: number
  /** conserved energy per unit mass */
  E: number
}
export const faller = (ri: number): Faller => ({ ri, E: Number.isFinite(ri) ? Math.sqrt(Math.max(0, 1 - 2 / ri)) : 1 })

/** P(r) = |dr/dtau| */
export const speedP = (f: Faller, r: number) => Math.sqrt(Math.max(0, f.E * f.E - (1 - 2 / r)))
/** speed relative to a static observer (r > 2 only; -> 1 at the horizon) */
export const betaStatic = (f: Faller, r: number) => (r > 2 ? Math.sqrt(Math.max(0, 1 - (1 - 2 / r) / (f.E * f.E))) : 1)

/** cycloid parameter eta (0..pi) at radius r (for r <= r_i) */
export const etaAt = (f: Faller, r: number) => {
  if (!Number.isFinite(f.ri)) throw new Error('etaAt: finite release radius needed')
  return Math.acos(Math.min(1, Math.max(-1, (2 * r) / f.ri - 1)))
}
const scale = (f: Faller) => Math.sqrt((f.ri * f.ri * f.ri) / 8)

/** proper time from release to radius r (GM/c^3) */
export function properSinceRelease(f: Faller, r: number): number {
  if (!Number.isFinite(f.ri)) return NaN
  const e = etaAt(f, r)
  return scale(f) * (e + Math.sin(e))
}
/** proper time remaining until r = 0 (GM/c^3) */
export function properRemaining(f: Faller, r: number): number {
  if (!Number.isFinite(f.ri)) return (2 / 3) * Math.pow(r, 1.5) / Math.SQRT2
  const e = etaAt(f, r)
  return scale(f) * (Math.PI - e - Math.sin(e))
}
/** proper time spent INSIDE the horizon (horizon -> singularity) for this faller. Maximum over all radial geodesics: pi (GM/c^3), r_i = 2. */
export const properInside = (f: Faller) => properRemaining(f, 2)

/**
 * Coordinate time (the time a distant observer assigns) elapsed since release, r > 2. Diverges logarithmically as r -> 2.
 * Closed form: dt/deta = E sqrt(r_i/2) (r + 2 + 4/(r - 2)).
 */
export function coordSinceRelease(f: Faller, r: number): number {
  if (!(r > 2)) return Infinity
  const ri = f.ri
  const e = etaAt(f, r)
  const ah = Math.acos(4 / ri - 1) // eta at the horizon
  const sa = Math.sin(ah)
  const pole = (8 / ri) * (1 / sa) * Math.log(Math.sin((ah + e) / 2) / Math.sin((ah - e) / 2))
  return f.E * Math.sqrt(ri / 2) * ((ri / 2) * (e + Math.sin(e)) + 2 * e + pole)
}

/** tidal acceleration difference across `lengthM` metres along the radial direction, m/s^2: 2 G M L / r^3 */
export function tidalAccel(massSun: number, rRg: number, lengthM = 2): number {
  const rg = rgOf(massSun)
  return (2 * C_SI * C_SI * lengthM) / (rg * rg * rRg * rRg * rRg)
}

/** Local direction constants for a LOOK direction at angle psi from the OUTWARD radial direction (the photon travels the other way): E_ph and L for w = 1 */
export const photonConstants = (f: Faller, r: number, cosPsi: number) => {
  const P = speedP(f, r)
  const sinPsi = Math.sqrt(Math.max(0, 1 - cosPsi * cosPsi))
  return { E: f.E + P * cosPsi, L: r * sinPsi, rdot: P + f.E * cosPsi /* dr/d(-lambda): the backward ray's radial rate */ }
}

/** Aberration: a direction at angle thetaS from the motion direction in the static frame appears at thetaF for an observer moving at beta. */
export const aberrate = (thetaS: number, beta: number) => Math.acos((Math.cos(thetaS) + beta) / (1 + beta * Math.cos(thetaS)))
/** the static observer's shadow half-angle from the inward direction (r > 3 ... any r > 2 for the escaping branch) */
export const staticShadowAngle = (r: number) => {
  const f = 1 - 2 / r
  const s = (3 * Math.sqrt(3) * Math.sqrt(f)) / r
  return r > 3 ? Math.asin(Math.min(1, s)) : Math.PI - Math.asin(Math.min(1, s))
}

/** Human-readable duration from seconds */
export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec)) return 'unbounded'
  const a = Math.abs(sec)
  if (a < 1) return `${(sec * 1000).toFixed(0)} ms`
  if (a < 90) return `${sec.toFixed(1)} s`
  if (a < 5400) return `${(sec / 60).toFixed(1)} min`
  if (a < 172800) return `${(sec / 3600).toFixed(1)} h`
  if (a < 3.156e7 * 2) return `${(sec / 86400).toFixed(1)} days`
  return `${(sec / 3.15576e7).toFixed(1)} years`
}
