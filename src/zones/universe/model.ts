import { PARTICLE_HORIZON_GLY, comovingGly, ageAtZ, H0, OMEGA_M, OMEGA_L, EVENT_HORIZON_GLY } from '@/lib/cosmology'
import { LY } from '../galactic/units'

/**
 * Numbers of the universe + multiverse zones. Everything that is a cosmological quantity is COMPUTED from src/lib/cosmology.ts
 * (flat LCDM, Planck 2018: H0 = 67.4, Omega_m = 0.315). Distances are COMOVING ("what a tape measure would read today"), the usual convention
 * for "the observable universe is about 93 billion light-years across".
 */
export const GLY = 1e9 * LY
/** redshift of last scattering, Planck 2018 (z* = 1089.92) // VERIFY */
export const Z_REC = 1089.92
export const R_U_GLY = PARTICLE_HORIZON_GLY // 46.5
export const R_U = R_U_GLY * GLY // metres: radius of the observable universe (comoving)
export const R_CMB_GLY = comovingGly(Z_REC) // comoving distance to the surface of last scattering
export const CMB_FRAC = R_CMB_GLY / R_U_GLY
export const T_REC_YR = ageAtZ(Z_REC) * 1e9 // years after the Big Bang at last scattering (this model; commonly quoted ~ 380,000)
export const DIAMETER_GLY = 2 * R_U_GLY
export const round = (x: number, n: number) => Math.round(x / n) * n
export const fmt = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 0 })

export const LANIAKEA = {
  /** diameter ~ 500 million ly (160 Mpc), ~100,000 galaxies, ~10^17 Msun: Tully et al. 2014, Nature 513, 71 */
  diameterMly: 520, galaxies: 100000,
  /** The Great Attractor: direction of the Norma cluster (A3627), RA 16h15m Dec -60.9 deg; ~ 65 Mpc = 210 Mly // VERIFY */
  gaRa: 243.75, gaDec: -60.9, gaMly: 214,
  /** Shapley Concentration: RA 13h30m Dec -31 deg, ~ 200 Mpc = 650 Mly // VERIFY */
  shRa: 202.5, shDec: -31, shMly: 650,
  /** Perseus-Pisces: Perseus cluster RA 3h19m Dec +41.5, ~ 72 Mpc = 235 Mly // VERIFY */
  ppRa: 49.7, ppDec: 41.5, ppMly: 235,
  /** Coma cluster RA 12h59.8m Dec +27.98, ~ 99 Mpc = 320 Mly // VERIFY */
  comaRa: 194.95, comaDec: 27.98, comaMly: 320,
  /** supergalactic north pole, galactic (l, b) = (47.37, 6.32) // VERIFY */
  sgpL: 47.37, sgpB: 6.32,
}
/** the web box shown as a ball of this radius, in Gly (the box is a periodic unit cube = 2 x WEB_R_GLY on a side) */
export const WEB_R_GLY = 1.0

export const TEXT = {
  hypothesis: 'Hypothesis. Not observed.',
  webNote: 'Cosmic web: schematic, based on large-scale structure surveys (a simulated look-alike, not a survey map).',
  cmbNote: 'CMB: simulated map in the style of Planck.',
  sphereNote: 'Flat ΛCDM, Planck 2018 values; comoving distances.',
}
export const COSMO_NUMBERS = { H0, OMEGA_M, OMEGA_L, EVENT_HORIZON_GLY }
