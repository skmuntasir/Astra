/**
 * Chapter 05 — Black Holes: data and pure maths (no three.js, no React).
 *
 * Units: distances in Schwarzschild radii (rs = 2GM/c²). The hole is a non-spinning 10-solar-mass black hole, so
 * 1 rs = 29.53 km. Every radius quoted in the UI derives from RS_M.
 */
import { smooth } from '@/lib/cosmicScale'

export const MASS_SUN = 10
export const RS_M = 2953.25 * MASS_SUN // metres
export const R_PHOTON = 1.5 // photon sphere
export const R_ISCO = 3 // innermost stable circular orbit
export const R_DISC_OUT = 12 // outer edge drawn (the real disc is larger and fades out)
export const B_SHADOW = (3 * Math.sqrt(3)) / 2 // critical impact parameter, 2.598 rs
/** Apparent lateral position (impact parameter) of a disc point at radius r seen edge-on from far away. */
export const lateralB = (r: number) => r / Math.sqrt(1 - 1 / r)

export const FOV_HALF_TAN = Math.tan((34 * Math.PI) / 360) // 34° vertical field of view
export const ROLL = 0.11 // radians; a slight tilt of the horizon
const deg = Math.PI / 180

/** Camera path: scroll progress → distance (rs, log-interpolated), elevation above the disc plane, azimuth. */
const D_KNOTS: ReadonlyArray<readonly [number, number]> = [
  [0, 3000],
  [0.16, 1400],
  [0.3, 260],
  [0.44, 70],
  [0.56, 56],
  [0.68, 38],
  [0.78, 25],
  [0.88, 17],
  [1, 14],
]
const E_KNOTS: ReadonlyArray<readonly [number, number]> = [
  [0, 5],
  [0.3, 7],
  [0.5, 5],
  [0.62, 11],
  [0.75, 14],
  [0.88, 20],
  [1, 24],
]
const lerpKnots = (k: ReadonlyArray<readonly [number, number]>, p: number, log: boolean) => {
  const x = Math.min(1, Math.max(0, p))
  for (let i = 1; i < k.length; i++) {
    if (x <= k[i][0]) {
      const t = (x - k[i - 1][0]) / (k[i][0] - k[i - 1][0])
      const a = log ? Math.log(k[i - 1][1]) : k[i - 1][1]
      const b = log ? Math.log(k[i][1]) : k[i][1]
      return a + (b - a) * t
    }
  }
  return log ? Math.log(k[k.length - 1][1]) : k[k.length - 1][1]
}
export interface CamTarget {
  logD: number
  elev: number
  azim: number
}
export function cameraAt(p: number, out: CamTarget = { logD: 0, elev: 0, azim: 0 }): CamTarget {
  out.logD = lerpKnots(D_KNOTS, p, true)
  out.elev = lerpKnots(E_KNOTS, p, false) * deg
  out.azim = (25 + 95 * smooth(0, 1, p) * 0.6 + 95 * p * 0.4) * deg
  return out
}
/** Progress used for the single still frame under reduced motion. */
export const P_STILL = 0.68

export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US')
export const fmtRs = (d: number) => (d >= 100 ? fmtInt(d) : d >= 10 ? d.toFixed(1) : d.toFixed(2))

export interface Beat {
  label: string
  title: string
  line: string
  /** [in start, in end, out start, out end] in chapter progress. The last beat has no out. */
  w: number[]
}
export const BEATS: Beat[] = [
  {
    label: 'Ten solar masses',
    title: 'Dark, and not empty.',
    line: 'A star ten times the Sun’s mass has collapsed into a sphere about sixty kilometres across. We cannot see it. We can only see what its gravity does.',
    w: [0.09, 0.13, 0.21, 0.25],
  },
  {
    label: 'Gravitational lensing',
    title: 'Light, bent.',
    line: 'Mass curves space, and light follows the curve. Stars behind the hole are smeared into arcs, and a few appear twice.',
    w: [0.25, 0.29, 0.39, 0.43],
  },
  {
    label: 'Accretion disc',
    title: 'Where the gas piles up.',
    line: 'Falling gas cannot drop straight in. It spirals, flattens and heats until it shines. Colour here is a stand-in: a disc this hot glows mainly in X-rays, which no eye could see.',
    w: [0.43, 0.47, 0.54, 0.58],
  },
  {
    label: 'Relativistic beaming',
    title: 'One side bright, one side dim.',
    line: 'Near the inner edge the gas moves at half the speed of light. The side turning toward us is brightened and shifted blue; the side turning away fades and reddens.',
    w: [0.57, 0.61, 0.66, 0.7],
  },
  {
    label: 'Photon sphere · 1.5 rs',
    title: 'The photon ring.',
    line: 'At 1.5 rs light can orbit the hole. Rays that skim this radius circle it before escaping, and draw a thin bright ring around the dark.',
    w: [0.69, 0.73, 0.77, 0.8],
  },
  {
    label: 'Event horizon · 1 rs',
    title: 'The edge of no return.',
    line: 'Inside r = 2GM/c², 29.5 km for this hole, every path leads inward. Nothing, light included, can reach us again. It is not a surface: a traveller falling through would feel nothing special. The dark disc we see is the shadow, 2.6 times wider than the horizon itself.',
    w: [0.78, 0.81, 0.855, 0.875],
  },
  {
    label: 'Singularity',
    title: 'Where the theory stops.',
    line: 'General relativity says the infalling matter ends in a point of infinite density. That is a sign the equations break down, not a measurement. Describing the centre needs a theory of quantum gravity, and nobody has one yet.',
    w: [0.865, 0.89, 0.93, 0.945],
  },
  {
    label: 'Scale',
    title: 'Size follows mass.',
    line: 'A horizon’s radius grows in step with the mass inside it. At this one’s edge, tidal stretching across a two-metre body would be about 20 million g. At the edge of a giant, it would be gentle.',
    w: [0.935, 0.955],
  },
]

/** Horizon radius by mass: a ladder that makes the point of the last beat. */
export const LADDER: ReadonlyArray<{ name: string; mass: string; radius: string }> = [
  { name: 'Earth, if squeezed', mass: '1 M⊕', radius: '8.9 mm' },
  { name: 'The Sun, if squeezed', mass: '1 M☉', radius: '2.95 km' },
  { name: 'This black hole', mass: '10 M☉', radius: '29.5 km' },
  { name: 'Sagittarius A*', mass: '4.3 million M☉', radius: '12.7 million km · 0.085 AU' },
  { name: 'M87*', mass: '6.5 billion M☉', radius: '19 billion km · 128 AU' },
]

export type NoteKind = 'lens' | 'outer' | 'approach' | 'recede' | 'isco' | 'ring' | 'shadow' | 'singularity'
export interface Note {
  id: string
  kind: NoteKind
  name: string
  data: string
  /** Leader offset in px from the anchor to the text. */
  dx: number
  dy: number
  /** Fade window in chapter progress. */
  fade: number[]
  phone?: boolean
}
export const NOTES: Note[] = [
  { id: 'lens', kind: 'lens', name: 'Lensed starlight', data: 'Background stars stretched into arcs', dx: -46, dy: -34, fade: [0.3, 0.34, 0.42, 0.46] },
  { id: 'outer', kind: 'outer', name: 'Outer disc', data: 'Drawn to 12 rs · the real disc fades out further', dx: -40, dy: -40, fade: [0.46, 0.5, 0.56, 0.6] },
  { id: 'approach', kind: 'approach', name: 'Approaching side', data: 'Brighter, shifted blue', dx: 0, dy: -46, fade: [0.58, 0.62, 0.67, 0.71], phone: true },
  { id: 'recede', kind: 'recede', name: 'Receding side', data: 'Dimmer, shifted red', dx: 0, dy: 46, fade: [0.58, 0.62, 0.67, 0.71], phone: true },
  { id: 'isco', kind: 'isco', name: 'Inner edge of the disc', data: 'Innermost stable orbit · 3 rs · 88.6 km', dx: 48, dy: 52, fade: [0.7, 0.74, 0.83, 0.86] },
  { id: 'ring', kind: 'ring', name: 'Photon ring', data: 'Light that has circled the hole', dx: 52, dy: -52, fade: [0.72, 0.76, 0.79, 0.83], phone: true },
  { id: 'shadow', kind: 'shadow', name: 'Shadow', data: '5.2 rs across · 153 km', dx: -60, dy: -8, fade: [0.79, 0.83, 0.93, 0.95] },
  { id: 'singularity', kind: 'singularity', name: 'Singularity', data: 'Predicted at the centre · never visible', dx: -44, dy: 44, fade: [0.88, 0.91, 0.94, 0.96], phone: true },
]
/** The dashed "horizon if light went straight" circle. */
export const HORIZON_FADE = [0.8, 0.83, 0.935, 0.955]
