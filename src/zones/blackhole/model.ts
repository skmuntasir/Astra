import { faller, speedP, betaStatic, tidalAccel, M87_MASS_SUN, STELLAR_MASS_SUN, G_EARTH, properInside, tgOf, formatDuration } from '@/lib/bh/infall'

/** Constants of the black-hole zone and of the infall (all pure numbers; the zone, the HUD and the tests share them). */
export const R_APPROACH_START = 2000 // r_g: 1,000 Schwarzschild radii (the end of the galaxy dive)
export const R_RELEASE = 60 // r_g: the approach ends here and the observer is released from rest
export const R_END = 0.01 // r_g: where the infall stops (the equations are not trusted below this, see the ending text)
/** Spin of the rendered Kerr M87*: a MODEL CHOICE. EHT 2019 (paper V) favours spin pointing away from Earth (disc clockwise on the sky) and does NOT measure |a*|;
 *  0.9 is in the GRMHD-favoured range and is the value of Tamburini et al. 2020 (MNRAS 492 L22, a twisted-light method, not an EHT result). // VERIFY */
export const KERR_SPIN = 0.9
/** seconds of the Kerr -> Schwarzschild cross-fade at the start of the infall branch */
export const HANDOFF_S = 1.2
export const GATE_FROM = 0.94 // local t of the approach zone from which the choice appears (inside the final hold: the pose is constant there)
export const FALLER = faller(R_RELEASE)

/** the infall's stages: [id, budget svh, r at start, r at end]. Distance is log-linear inside a stage (equal scroll per factor of r). */
export const STAGES = [
  { id: 'fall-1', budget: 120, r0: R_RELEASE, r1: 24 },
  { id: 'fall-2', budget: 140, r0: 24, r1: 7 },
  { id: 'fall-3', budget: 130, r0: 7, r1: 2.6 },
  { id: 'fall-4', budget: 120, r0: 2.6, r1: 1.5 },
  { id: 'fall-5', budget: 220, r0: 1.5, r1: 0.2 },
  { id: 'fall-6', budget: 170, r0: 0.2, r1: R_END },
] as const
export const INFALL_BUDGET = STAGES.reduce((s, z) => s + z.budget, 0)

/**
 * Where the camera looks, degrees away from straight ahead (toward the hole), as a function of the radius.
 * Outside: it turns gently (0 at r = 30, 40 deg by r = 3) so the disc and ring slide past instead of the view being filled by the shadow.
 * Inside: straight ahead is dark (no light can come from there), so it turns to just past the edge of the dark cone, acos(E/P) + 22 deg,
 * where the outside sky is squeezed into a bright band; the angle is continuous across r = 2 (40 deg on both sides).
 */
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
export const darkConeDeg = (r: number) => (r < 2 ? (Math.acos(Math.min(1, FALLER.E / Math.max(FALLER.E, speedP(FALLER, r)))) * 180) / Math.PI : 0)
export const infallYawDeg = (r: number) => (r >= 2 ? 40 * (1 - sm(Math.log(3), Math.log(30), Math.log(Math.min(Math.max(r, 3), 30)))) : Math.min(150, Math.max(40, darkConeDeg(r) + 22)))

/** opacity of the black-hole image at the end of the infall (fade to black before the return) */
export const infallFade = (T: number) => 1 - sm(0.965, 0.998, T)

// ---------------- text numbers (formulas, not constants)
const g = (a: number) => a / G_EARTH
export const tidalM87Horizon = g(tidalAccel(M87_MASS_SUN, 2))
export const tidalStellarHorizon = g(tidalAccel(STELLAR_MASS_SUN, 2))
export const sci = (x: number) => { const e = Math.floor(Math.log10(Math.abs(x))); const m = x / Math.pow(10, e); return `${m.toFixed(1)}×10${String(e).replace(/-/g, '⁻').replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+d])}` }
export const insideSeconds = properInside(FALLER) * tgOf(M87_MASS_SUN)
export const maxInsideSeconds = Math.PI * tgOf(M87_MASS_SUN)
export const betaAt = (r: number) => betaStatic(FALLER, r)
export { speedP, formatDuration, tgOf, M87_MASS_SUN }
