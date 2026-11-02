import { solarTints } from '@/lib/tokens'

/**
 * Chapter 04 — Cosmic Scale: the world, the timeline and the number formatting. Pure data and maths; no three.js, so the
 * section can import it without pulling the scene out of its lazy chunk.
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

// Same table as lib/solarSystem.ts (au, theta, colour). Duplicated on purpose: that file imports three.js.
export const PLANET_DOTS = [
  { id: 'mercury', au: 0.387, theta: -52, size: 2.0, color: solarTints.mercury },
  { id: 'venus', au: 0.723, theta: -112, size: 2.2, color: solarTints.venus },
  { id: 'mars', au: 1.524, theta: 118, size: 2.1, color: solarTints.mars },
  { id: 'jupiter', au: 5.203, theta: -62, size: 3.0, color: solarTints.jupiter },
  { id: 'saturn', au: 9.537, theta: 158, size: 2.8, color: solarTints.saturn },
  { id: 'uranus', au: 19.19, theta: 52, size: 2.4, color: solarTints.uranus },
  { id: 'neptune', au: 30.07, theta: 14, size: 2.4, color: solarTints.neptune },
] as const
export const ORBIT_AU = [0.387, 0.723, 1.0, 1.524, 5.203, 9.537, 19.19, 30.07] as const

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

// ---- Timeline -------------------------------------------------------------------------------------------------------
/** s = log10(metres per CSS pixel). −2.3: a 1.7 m person is ~340 px tall. 24.3: the observable universe is ~500 px across. */
export const S_START = -2.3
export const S_END = 24.3
/** Where the reduced-motion still sits: the Milky Way. */
export const S_STILL = 18.4

/** Scroll progress → s, piecewise linear. Segment length ∝ how much there is to look at, not how many decades it spans. */
const KNOTS: ReadonlyArray<readonly [number, number]> = [
  [0, S_START],
  [0.05, S_START], // hold on the human
  [0.26, 4.4], // → Earth as a globe
  [0.33, 6.2], // → the Moon's orbit
  [0.45, 8.8], // → Earth's orbit, 1 AU
  [0.53, 10.3], // → Neptune
  [0.65, 13.8], // → the Oort cloud
  [0.7, 14.7], // → the stellar neighbourhood
  [0.8, 18.3], // → the whole Milky Way
  [0.86, 20.3], // → the Local Group
  [0.92, 22.6], // → the cosmic web
  [0.98, S_END], // → the observable universe
  [1, S_END],
]

export function scaleAt(p: number): number {
  const q = Math.min(1, Math.max(0, p))
  for (let i = 1; i < KNOTS.length; i++) {
    const [p1, s1] = KNOTS[i]
    if (q <= p1) {
      const [p0, s0] = KNOTS[i - 1]
      return p1 === p0 ? s1 : s0 + ((s1 - s0) * (q - p0)) / (p1 - p0)
    }
  }
  return S_END
}

/** Inverse of `scaleAt`: the first progress at which scale `s` is reached (used to place text beats). */
export function pAt(s: number): number {
  for (let i = 1; i < KNOTS.length; i++) {
    const [p0, s0] = KNOTS[i - 1]
    const [p1, s1] = KNOTS[i]
    if (s1 > s0 && s >= s0 && s <= s1) return p0 + ((p1 - p0) * (s - s0)) / (s1 - s0)
  }
  return s < S_START ? 0 : 1
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
/** Window [in0, in1, out0, out1] in scale units → 0…1 (or just [in0, in1] for fade-in only). */
export function fadeAt(s: number, w: readonly number[]): number {
  const up = smooth(w[0], w[1], s)
  return w.length > 3 ? up * (1 - smooth(w[2], w[3], s)) : up
}

const mix2 = (a: V2, b: V2, t: number): V2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
/** Camera centre (metres) at scale s: the person → Earth → the Sun → the galactic centre. Smooth, never a cut. */
export function centerAt(s: number): V2 {
  let c: V2 = [0, HUMAN_H / 2]
  c = mix2(c, EARTH, smooth(2.6, 4.8, s))
  c = mix2(c, SUN, smooth(7.6, 9.4, s))
  c = mix2(c, GALAXY, smooth(16.6, 18.4, s))
  return c
}

// ---- Text beats and annotations -------------------------------------------------------------------------------------
export interface Milestone {
  /** Scale window [in0, in1, out0, out1] (omit the out values for the last one). `p` overrides with scroll progress. */
  s?: readonly number[]
  p?: readonly number[]
  scale: string
  title: string
  line: string
}

// Figures are rounded textbook values (PROJECT_STATUS.md §10): verify before treating as authoritative.
export const MILESTONES: Milestone[] = [
  { p: [0.012, 0.035, 0.075, 0.105], scale: '1.7 m', title: 'This is you.', line: 'Every step outward is ten times wider than the last. There are twenty-six of them.' },
  { s: [3.7, 4.2, 4.9, 5.4], scale: '12,742 km', title: 'The ground is a world.', line: 'All of humanity lives on this surface: a thin film of rock, water and air.' },
  { s: [5.9, 6.2, 6.9, 7.4], scale: '384,400 km', title: 'The Moon. Thirty Earths fit in the gap.', line: 'The farthest any person has ever been from home is this far.' },
  { s: [8.5, 8.9, 9.5, 9.9], scale: '149.6 million km · 1 AU', title: 'Light takes eight minutes to reach you.', line: 'About 1.3 million Earths would fit inside the Sun.' },
  { s: [10.0, 10.3, 10.8, 11.3], scale: '30 AU', title: 'Neptune is four hours away at the speed of light.', line: 'Voyager 1, launched in 1977, is only about 170 AU out.' },
  { s: [12.6, 13.1, 13.6, 14.1], scale: '1.6 light-years', title: 'Where the Sun’s reach fades.', line: 'Far beyond the planets: a theorised shell of icy bodies, the Oort cloud. Never seen directly.' },
  { s: [14.3, 14.7, 15.2, 15.8], scale: '4.24 light-years', title: 'The nearest star is 40 trillion kilometres away.', line: 'Proxima Centauri. Its light needs more than four years to arrive.' },
  { s: [17.6, 18.0, 18.6, 19.2], scale: '100,000 light-years', title: 'The Milky Way.', line: 'Hundreds of billions of stars. The Sun circles the centre once every 230 million years.' },
  { s: [19.8, 20.2, 20.8, 21.4], scale: '2.5 million light-years', title: 'Andromeda is the nearest large galaxy.', line: 'It may one day merge with ours, billions of years from now.' },
  { s: [22.0, 22.5, 23.1, 23.6], scale: 'about 500 million light-years', title: 'Galaxies gather in filaments around enormous voids.', line: 'Zoom out far enough and even this structure smooths into grain.' },
  { s: [24.0, 24.25], scale: '93 billion light-years', title: 'The observable universe.', line: 'Everything whose light has had time to reach us. Somewhere in it, one dot: the one you started on.' },
]

/** Progress window of a milestone, as [in0, in1, out0?, out1?]. */
export function milestoneWindow(m: Milestone): number[] {
  if (m.p) return [...m.p]
  return m.s!.map(pAt)
}

export interface Note {
  id: string
  /** Position in the frame, metres. */
  at: V2
  /** Scale window (see `fadeAt`). */
  fade: readonly number[]
  name: string
  data: string
  /** Leader end relative to the point, px. */
  dx: number
  dy: number
  /** A hollow ring at the point (bodies); points on a limb or an edge go without. */
  ring?: boolean
  /** Shown on phones too. */
  phone?: boolean
}

const onLimb = (c: V2, r: number, a: number): V2 => [c[0] + r * Math.cos(a * deg), c[1] + r * Math.sin(a * deg)]

export const NOTES: Note[] = [
  { id: 'human', at: [0, HUMAN_H], fade: [-2.4, -2.3, -0.5, 0.5], name: 'Human', data: '1.7 m', dx: 54, dy: -4, phone: true },
  { id: 'earth', at: onLimb(EARTH, R_EARTH, 38), fade: [3.6, 4.1, 5.6, 6.4], name: 'Earth', data: '12,742 km', dx: 58, dy: 34, phone: true },
  { id: 'geo', at: onLimb(EARTH, 4.2164e7, -52), fade: [4.9, 5.3, 6.0, 6.6], name: 'Geostationary orbit', data: '35,786 km up', dx: 40, dy: -34 },
  { id: 'moon', at: MOON, fade: [5.9, 6.3, 7.4, 8.0], name: 'Moon', data: '384,400 km', dx: 40, dy: -26, ring: true, phone: true },
  { id: 'sun', at: SUN, fade: [8.2, 8.7, 12.6, 13.6], name: 'Sun', data: '1.39 million km', dx: -34, dy: -56, ring: true, phone: true },
  { id: 'earth-orbit', at: EARTH, fade: [8.4, 8.9, 9.7, 10.2], name: 'Earth', data: '1 AU', dx: 40, dy: 34, ring: true },
  { id: 'jupiter', at: orbitPoint(5.203, -62), fade: [9.6, 10.0, 11.4, 12.0], name: 'Jupiter', data: '5.2 AU', dx: -40, dy: -30, ring: true },
  { id: 'neptune', at: orbitPoint(30.07, 14), fade: [10.0, 10.4, 11.7, 12.3], name: 'Neptune', data: '30.1 AU', dx: 40, dy: -30, ring: true, phone: true },
  { id: 'heliopause', at: onLimb(SUN, 120 * AU, 112), fade: [10.5, 10.9, 12.2, 12.9], name: 'Heliopause', data: '~120 AU', dx: -32, dy: 30 },
  { id: 'oort', at: onLimb(SUN, 1e5 * AU, 38), fade: [12.8, 13.3, 14.0, 14.6], name: 'Oort cloud, outer edge', data: '~100,000 AU', dx: 40, dy: -26, phone: true },
  { id: 'proxima', at: starPoint('Proxima Centauri'), fade: [14.2, 14.6, 15.8, 16.4], name: 'Proxima Centauri', data: '4.24 ly', dx: -40, dy: 30, ring: true, phone: true },
  { id: 'sirius', at: starPoint('Sirius'), fade: [14.6, 15.0, 16.0, 16.8], name: 'Sirius', data: '8.6 ly', dx: 40, dy: -26, ring: true },
  { id: 'galactic-centre', at: GALAXY, fade: [17.3, 17.8, 19.4, 20.0], name: 'Galactic centre', data: '26,000 ly', dx: -44, dy: -36, ring: true },
  { id: 'milky-way', at: onLimb(GALAXY, GALAXY_R, -28), fade: [17.6, 18.0, 19.4, 20.0], name: 'Milky Way', data: '~100,000 ly across', dx: 36, dy: 30, phone: true },
  { id: 'lmc', at: LMC, fade: [18.8, 19.2, 20.0, 20.6], name: 'Large Magellanic Cloud', data: '160,000 ly', dx: -36, dy: -22, ring: true },
  { id: 'andromeda', at: M31, fade: [19.4, 19.9, 21.4, 22.0], name: 'Andromeda', data: '2.5 million ly', dx: 40, dy: -30, ring: true, phone: true },
  { id: 'web', at: onLimb(GALAXY, 1.4e25, 150), fade: [21.8, 22.3, 23.2, 23.8], name: 'Cosmic web', data: 'filaments and voids', dx: -30, dy: -26 },
  { id: 'edge', at: onLimb(GALAXY, UNIVERSE_R, 38), fade: [23.7, 24.1], name: 'Edge of the observable universe', data: '46.5 billion ly away', dx: -36, dy: 34, phone: true },
]

/** The persistent "you are here" mark, fading in as the person becomes too small to see and staying to the end. */
export const YOU = { at: HUMAN, fade: [0.2, 1.4] as const }

// ---- Formatting -----------------------------------------------------------------------------------------------------
interface Unit {
  name: string
  m: number
  /** Use this unit for lengths from this many metres up. */
  from: number
}
const LADDER: Unit[] = [
  { name: 'm', m: 1, from: 0 },
  { name: 'km', m: 1e3, from: 1e3 },
  { name: 'AU', m: AU, from: 3e10 },
  { name: 'ly', m: LY, from: 2.8e15 },
  { name: 'million ly', m: LY * 1e6, from: LY * 1e6 },
  { name: 'billion ly', m: LY * 1e9, from: LY * 1e9 },
]
const unitFor = (m: number) => {
  let u = LADDER[0]
  for (const x of LADDER) if (m >= x.from) u = x
  return u
}
const sig = (v: number, digits: number) => Number(v.toPrecision(digits)).toLocaleString('en-US', { maximumFractionDigits: 6 })

/** "12,700 km", "1.5 AU", "93 billion ly". Three significant figures. */
export function formatLength(m: number): string {
  const u = unitFor(m)
  return `${sig(m / u.m, 3)} ${u.name}`
}

/** A round length close to `targetM`: { label, metres } with the digit 1, 2 or 5 (×10ⁿ) in a natural unit. */
export function niceBar(targetM: number): { label: string; metres: number } {
  const u = unitFor(targetM)
  const v = targetM / u.m
  const e = Math.floor(Math.log10(v))
  const base = Math.pow(10, e)
  const f = v / base
  const nice = (f >= 5 ? 5 : f >= 2 ? 2 : 1) * base
  return { label: `${sig(nice, 2)} ${u.name}`, metres: nice * u.m }
}
