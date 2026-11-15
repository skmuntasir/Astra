
/**
 * ASTRA v2 — real-world constants and the flat "cosmic frame" (ported from the old Cosmic Scale chapter).
 *
 * Everything is in METRES, in one flat 2D frame (x right, y up) whose origin is the soles of the human at the start.
 * The camera is a point (`centerAt`) plus a scale `s` = log10(metres per CSS pixel). Zooming out is just `s` rising,
 * 26.6 powers of ten in one scroll. All positions and sizes are TRUE (the chapter's claim is "true scale"); the only
 * liberties are the stated ones: a flat top-down projection, circular orbits, hand-placed directions, and the minimum
 * pixel size of dots standing in for bodies that are really sub-pixel.
 */

export const AU = 1.495978707e11
export const LY = 9.4607304725808e15
export const PC = 3.0856775814914e16
export const R_EARTH = 6.371e6
export const MOON_DIST = 3.844e8
/** The Sun is ~26,000 light-years from the galactic centre (rounded). */
export const GALAXY_DIST = 26000 * LY
/** Disc radius of the Milky Way, ~50,000 ly (the disc is ~100,000 ly across). */
export const GALAXY_R = 50000 * LY
/** Radius of the observable universe, ~46.5 billion ly (93 billion ly across). */
export const UNIVERSE_R = 46.5e9 * LY
export const HUMAN_H = 1.7

export type V2 = readonly [number, number]
const deg = Math.PI / 180

// ---- The frame ------------------------------------------------------------------------------------------------------
export const HUMAN: V2 = [0, 0]
/** Earth's centre: straight below the human's feet. */
export const EARTH: V2 = [0, -R_EARTH]
export const MOON: V2 = [EARTH[0] + MOON_DIST * Math.cos(32 * deg), EARTH[1] + MOON_DIST * Math.sin(32 * deg)]
/** Unit vector Earth → Sun in the frame (the Sun is to the left, so the human stands on the night side). */
export const SUN_DIR: V2 = [-Math.cos(18 * deg), -Math.sin(18 * deg)]
export const SUN: V2 = [EARTH[0] + AU * SUN_DIR[0], EARTH[1] + AU * SUN_DIR[1]]
const a1: V2 = [-SUN_DIR[0], -SUN_DIR[1]]
const a2: V2 = [-a1[1], a1[0]]

/** Position in the ecliptic (frame) of a body at `au` from the Sun, at heliocentric angle `theta` (0 = Earth's side). */
export function orbitPoint(au: number, thetaDeg: number): V2 {
  const r = au * AU
  const c = Math.cos(thetaDeg * deg)
  const s = Math.sin(thetaDeg * deg)
  return [SUN[0] + r * (c * a1[0] + s * a2[0]), SUN[1] + r * (c * a1[1] + s * a2[1])]
}

/** The Galactic centre, in the direction the Sun's orbit is not (up and to the right of us in the frame). */
export const GALAXY: V2 = [SUN[0] + GALAXY_DIST * Math.cos(52 * deg), SUN[1] + GALAXY_DIST * Math.sin(52 * deg)]
export const M31: V2 = [GALAXY[0] + 2.5e6 * LY * Math.cos(18 * deg), GALAXY[1] + 2.5e6 * LY * Math.sin(18 * deg)]
export const M33: V2 = [M31[0] + 0.8e6 * LY * Math.cos(70 * deg), M31[1] + 0.8e6 * LY * Math.sin(70 * deg)]
export const LMC: V2 = [GALAXY[0] + 160e3 * LY * Math.cos(-140 * deg), GALAXY[1] + 160e3 * LY * Math.sin(-140 * deg)]
export const SMC: V2 = [GALAXY[0] + 200e3 * LY * Math.cos(-158 * deg), GALAXY[1] + 200e3 * LY * Math.sin(-158 * deg)]

/** Nearby stars: name, RA (hours), Dec (degrees, unused in the flat map), distance (ly). Approximate catalogue values. */
export const NEAR_STARS = [
  { name: 'Proxima Centauri', ra: 14.495, dec: -62.68, ly: 4.246, size: 2.6, color: [1, 0.62, 0.45] },
  { name: 'Barnard’s Star', ra: 17.963, dec: 4.69, ly: 5.96, size: 2.0, color: [1, 0.62, 0.45] },
  { name: 'Wolf 359', ra: 10.94, dec: 7.01, ly: 7.86, size: 1.9, color: [1, 0.6, 0.42] },
  { name: 'Lalande 21185', ra: 11.055, dec: 35.97, ly: 8.3, size: 2.0, color: [1, 0.66, 0.5] },
  { name: 'Sirius', ra: 6.752, dec: -16.72, ly: 8.6, size: 3.6, color: [0.82, 0.9, 1] },
  { name: 'Epsilon Eridani', ra: 3.549, dec: -9.46, ly: 10.5, size: 2.4, color: [1, 0.8, 0.6] },
  { name: 'Procyon', ra: 7.655, dec: 5.22, ly: 11.5, size: 3.0, color: [1, 0.95, 0.85] },
  { name: '61 Cygni', ra: 21.115, dec: 38.75, ly: 11.4, size: 2.4, color: [1, 0.74, 0.5] },
  { name: 'Tau Ceti', ra: 1.734, dec: -15.94, ly: 11.9, size: 2.4, color: [1, 0.85, 0.65] },
  { name: 'Epsilon Indi', ra: 22.052, dec: -56.79, ly: 11.9, size: 2.3, color: [1, 0.78, 0.55] },
] as const

/**
 * Offset of a nearby star from the Sun, metres, in the frame. The bearing is the star's right ascension and the distance
 * is its TRUE distance, so a label that says "4.24 ly" sits exactly 4.24 ly from the Sun on the scale bar. (Declination is
 * dropped: a flat map cannot keep both bearing-in-3D and distance, and distance is what this chapter is about.)
 */
export function starOffset(s: { ra: number; dec: number; ly: number }): V2 {
  const a = s.ra * 15 * deg
  return [s.ly * LY * Math.cos(a), s.ly * LY * Math.sin(a)]
}
export const starPoint = (name: string): V2 => {
  const s = NEAR_STARS.find((n) => n.name === name)!
  const o = starOffset(s)
  return [SUN[0] + o[0], SUN[1] + o[1]]
}


/** Format a length in metres with the largest sensible real unit. */
export function formatLength(m: number): string {
  const a = Math.abs(m)
  const f = (v: number) => (v >= 100 ? Math.round(v).toLocaleString('en-US') : v >= 10 ? v.toFixed(1) : v.toFixed(2))
  if (a < 1) return `${f(a * 100)} cm`
  if (a < 1e3) return `${f(a)} m`
  if (a < 1e9) return `${f(a / 1e3)} km`
  if (a < 0.1 * AU) return `${f(a / 1e9)} million km`
  if (a < 0.1 * LY) return `${f(a / AU)} AU`
  if (a < 1e3 * LY) return `${f(a / LY)} light-years`
  if (a < 1e6 * LY) return `${f(a / (1e3 * LY))} thousand light-years`
  if (a < 1e9 * LY) return `${f(a / (1e6 * LY))} million light-years`
  return `${f(a / (1e9 * LY))} billion light-years`
}
export const R_SUN = 6.957e8
export const R_MOON = 1.7374e6
