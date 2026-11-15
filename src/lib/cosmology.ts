/**
 * Flat ΛCDM, the standard model of the expanding universe. One small, dependency-free module shared by Chapter 13 (Galaxies:
 * look-back time) and Chapter 14 (Universe: timeline, contents, horizons). Everything here is computed, not typed in.
 *
 * Parameters are Planck 2018 (TT,TE,EE+lowE+lensing): H0 = 67.4 km/s/Mpc, Ωm = 0.315. The local distance ladder prefers a
 * higher H0 (≈ 73), the "Hubble tension"; the chapter says so. Radiation (Ωr, photons + neutrinos) is included because it
 * sets the early-universe clock. Spatial curvature is taken as zero, which the data support to within a fraction of a percent.
 *
 * Integrals are over the scale factor a = 1 / (1 + z), where every integrand is smooth, with composite Simpson's rule.
 */
export const H0 = 67.4 // km/s/Mpc
export const OMEGA_M = 0.315
export const OMEGA_B = 0.0493 // ordinary (baryonic) matter
export const OMEGA_C = OMEGA_M - OMEGA_B // cold dark matter
export const OMEGA_R = 9.2e-5
export const OMEGA_L = 1 - OMEGA_M - OMEGA_R
export const T_CMB = 2.725 // K, today

const MPC_KM = 3.0856775814913673e19
const GYR_S = 3.15576e16
/** 1/H0 in billions of years; equally c/H0 in billions of light-years. */
export const HUBBLE_TIME_GYR = MPC_KM / H0 / GYR_S
export const HUBBLE_RADIUS_GLY = HUBBLE_TIME_GYR

function simpson(f: (x: number) => number, a: number, b: number, n = 2000): number {
  if (b === a) return 0
  const m = n % 2 === 0 ? n : n + 1
  const h = (b - a) / m
  let s = f(a) + f(b)
  for (let i = 1; i < m; i++) s += f(a + i * h) * (i % 2 ? 4 : 2)
  return (s * h) / 3
}

const aOf = (z: number) => 1 / (1 + z)

/** Expansion rate relative to today, E(z) = H(z)/H0. */
export function E(z: number): number {
  const x = 1 + z
  return Math.sqrt(OMEGA_M * x ** 3 + OMEGA_R * x ** 4 + OMEGA_L)
}

/** Age of the universe at scale factor a, in Gyr. */
function ageAtA(a: number): number {
  if (a <= 0) return 0
  return HUBBLE_TIME_GYR * simpson((x) => (x <= 0 ? 0 : 1 / Math.sqrt(OMEGA_M / x + OMEGA_R / (x * x) + OMEGA_L * x * x)), 0, a, 4000)
}

export const AGE_NOW_GYR = ageAtA(1)

/** Cosmic age (Gyr after the Big Bang) at redshift z. */
export const ageAtZ = (z: number) => ageAtA(aOf(z))
/** Light-travel ("look-back") time to redshift z, Gyr. */
export const lookbackGyr = (z: number) => AGE_NOW_GYR - ageAtZ(z)

/** Comoving distance (what a tape measure would read today), billions of light-years, from redshift z to us. */
export function comovingGly(z: number): number {
  return HUBBLE_RADIUS_GLY * simpson((a) => 1 / Math.sqrt(OMEGA_M * a + OMEGA_R + OMEGA_L * a ** 4), aOf(z), 1, 4000)
}
/** How far away the source was when it emitted the light we now see. */
export const emissionDistanceGly = (z: number) => comovingGly(z) / (1 + z)

/** Particle horizon today (comoving): the farthest matter whose light could ever have reached us. ≈ 46.5 Gly. */
export const PARTICLE_HORIZON_GLY = HUBBLE_RADIUS_GLY * simpson((a) => 1 / Math.sqrt(OMEGA_M * a + OMEGA_R + OMEGA_L * a ** 4), 0, 1, 4000)
/** Cosmic event horizon today (comoving): light emitted from beyond this, today, will never reach us. */
export const EVENT_HORIZON_GLY =
  HUBBLE_RADIUS_GLY * simpson((u) => 1 / Math.sqrt(OMEGA_M * u ** 3 + OMEGA_R * u ** 4 + OMEGA_L), 0, 1, 4000)

/** Present recession speed of something at proper distance D (Gly), in units of c. Hubble's law, v = H0 D. */
export const recessionOverC = (distanceGly: number) => distanceGly / HUBBLE_RADIUS_GLY

/** CMB temperature at redshift z, kelvin. */
export const tempAtZ = (z: number) => T_CMB * (1 + z)

/** Redshift at which the universe had a given age (Gyr). Bisection on the monotone age(z). */
export function zAtAge(gyr: number): number {
  let lo = 0
  let hi = 1e5
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (ageAtZ(mid) > gyr) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export interface Fractions {
  radiation: number
  matterOrdinary: number
  matterDark: number
  darkEnergy: number
}
/** Share of the total energy density in each component at redshift z. Sums to 1. */
export function fractionsAtZ(z: number): Fractions {
  const x = 1 + z
  const r = OMEGA_R * x ** 4
  const b = OMEGA_B * x ** 3
  const c = OMEGA_C * x ** 3
  const l = OMEGA_L
  const t = r + b + c + l
  return { radiation: r / t, matterOrdinary: b / t, matterDark: c / t, darkEnergy: l / t }
}

/** Redshift of matter–radiation equality, and of the switch from slowing to accelerating expansion. */
export const Z_EQUALITY = OMEGA_M / OMEGA_R - 1
export const Z_ACCELERATION = (2 * OMEGA_L / OMEGA_M) ** (1 / 3) - 1
