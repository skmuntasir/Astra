/**
 * ASTRA v2 — black-hole constants (ported; the old scroll camera, beats and notes were dropped with the old chapter).
 *
 * Units: distances in Schwarzschild radii (rs = 2GM/c²). The hole is a non-spinning 10-solar-mass black hole, so
 * 1 rs = 29.53 km. Every radius quoted in the UI derives from RS_M.
 */

export const MASS_SUN = 10
export const RS_M = 2953.25 * MASS_SUN // metres
export const R_PHOTON = 1.5 // photon sphere
export const R_ISCO = 3 // innermost stable circular orbit
export const R_DISC_OUT = 12 // outer edge drawn (the real disc is larger and fades out)
export const B_SHADOW = (3 * Math.sqrt(3)) / 2 // critical impact parameter, 2.598 rs
/** Apparent lateral position (impact parameter) of a disc point at radius r seen edge-on from far away. */
export const lateralB = (r: number) => r / Math.sqrt(1 - 1 / r)


/** Horizon radius by mass: kept from the old chapter. */
export const LADDER: ReadonlyArray<{ name: string; mass: string; radius: string }> = [
  { name: 'The Sun, if squeezed', mass: '1 M☉', radius: '2.95 km' },
  { name: 'Sagittarius A*', mass: '4.3 million M☉', radius: '12.7 million km · 0.085 AU' },
  { name: 'M87*', mass: '6.5 billion M☉', radius: '19 billion km · 128 AU' },
]
/** M87*: the destination black hole of the main path. Event Horizon Telescope 2019: 6.5e9 M☉, ~16.8 Mpc (55 million ly). */
export const M87 = {
  massSun: 6.5e9,
  rsM: 2953.25 * 6.5e9, // Schwarzschild radius, metres (about 1.92e13 m = 128 AU)
  distanceLy: 55e6,
  shadowRs: B_SHADOW * 2, // apparent shadow diameter in rs
} as const
