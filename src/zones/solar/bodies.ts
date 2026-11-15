import type { BodyId } from '@/lib/ephemeris'
import { solarTints } from '@/lib/tokens'

/**
 * Physical data for the bodies of the Solar System zone. All numbers recalled from the IAU / NASA fact-sheet values: // VERIFY each.
 * radius: equatorial, metres. flat: flattening (a - c) / a. pole: IAU north pole RA / Dec J2000 (deg). spinH: sidereal rotation period,
 * hours, NEGATIVE = retrograde. Rotation on screen is sped up by SPIN_SPEEDUP (the HUD note says so).
 */
export const SPIN_SPEEDUP = 1000

export interface BodySpec {
  id: BodyId
  name: string
  radius: number
  flat: number
  pole: [number, number]
  spinH: number
  /** manifest ids */
  map: string
  normal?: string
  tint: string
  /** limb haze colour + strength (0 = none) */
  rim: [number, number, number, number]
  /** terminator softness (0 = hard rock, ~0.2 = thick atmosphere / gas) */
  wrap: number
  /** albedo multiplier (exposure) */
  gain: number
  ring?: { tex: string; r0: number; r1: number; inner: number; outer: number; strength: number }
  info: { title: string; lines: string[] }
}

const km = (x: number) => x * 1000
export const BODIES: BodySpec[] = [
  { id: 'mercury', name: 'Mercury', radius: km(2439.7), flat: 0, pole: [281.01, 61.45], spinH: 1407.6, map: 'mercury-albedo', normal: 'mercury-normal', tint: solarTints.mercury, rim: [0, 0, 0, 0], wrap: 0, gain: 1.0,
    info: { title: 'Mercury', lines: ['Radius 2,440 km · 0.39 AU from the Sun', 'A year lasts 88 Earth days.'] } },
  { id: 'venus', name: 'Venus', radius: km(6051.8), flat: 0, pole: [272.76, 67.16], spinH: -96, map: 'venus-clouds', tint: solarTints.venus, rim: [1.0, 0.86, 0.55, 0.9], wrap: 0.25, gain: 1.05,
    info: { title: 'Venus', lines: ['Radius 6,052 km · 0.72 AU from the Sun', 'Seen here: cloud tops (procedural map). The clouds circle the planet in about 4 days; the ground turns once in 243.'] } },
  { id: 'earth', name: 'Earth', radius: km(6371), flat: 0, pole: [0, 90], spinH: 24, map: '', tint: solarTints.earth, rim: [0, 0, 0, 0], wrap: 0, gain: 1,
    info: { title: 'Earth', lines: ['Radius 6,371 km · 1.00 AU from the Sun', 'The same Earth as at the start of the journey.'] } },
  { id: 'mars', name: 'Mars', radius: km(3396.2), flat: 0.00589, pole: [317.68, 52.89], spinH: 24.623, map: 'mars-albedo', normal: 'mars-normal', tint: solarTints.mars, rim: [0.85, 0.6, 0.45, 0.18], wrap: 0.04, gain: 1.0,
    info: { title: 'Mars', lines: ['Radius 3,396 km · 1.52 AU from the Sun', 'A year lasts 687 Earth days.'] } },
  { id: 'jupiter', name: 'Jupiter', radius: km(71492), flat: 0.06487, pole: [268.06, 64.5], spinH: 9.925, map: 'jupiter', tint: solarTints.jupiter, rim: [0.8, 0.72, 0.6, 0.12], wrap: 0.14, gain: 1.0,
    ring: { tex: 'jupiter-ring', r0: km(90000), r1: km(230000), inner: km(92000), outer: km(226000), strength: 0.7 },
    info: { title: 'Jupiter', lines: ['Radius 71,492 km · 5.2 AU from the Sun', 'More than twice the mass of all the other planets together.'] } },
  { id: 'saturn', name: 'Saturn', radius: km(60268), flat: 0.09796, pole: [40.59, 83.54], spinH: 10.56, map: 'saturn', tint: solarTints.saturn, rim: [0.85, 0.78, 0.6, 0.1], wrap: 0.14, gain: 1.0,
    ring: { tex: 'saturn-rings', r0: km(66900), r1: km(140300), inner: km(66900), outer: km(140300), strength: 1 },
    info: { title: 'Saturn', lines: ['Radius 60,268 km · 9.5 AU from the Sun', 'The rings are brighter than the planet’s clouds, and only metres thick.'] } },
  { id: 'uranus', name: 'Uranus', radius: km(25559), flat: 0.02293, pole: [257.31, -15.18], spinH: -17.24, map: 'uranus', tint: solarTints.uranus, rim: [0.55, 0.85, 0.9, 0.22], wrap: 0.12, gain: 1.0,
    ring: { tex: 'uranus-rings', r0: km(37000), r1: km(52500), inner: km(37000), outer: km(52500), strength: 0.8 },
    info: { title: 'Uranus', lines: ['Radius 25,559 km · 19.2 AU from the Sun', 'Tipped on its side: its axis lies 98° from vertical.'] } },
  { id: 'neptune', name: 'Neptune', radius: km(24764), flat: 0.01708, pole: [299.36, 43.46], spinH: 16.11, map: 'neptune', tint: solarTints.neptune, rim: [0.35, 0.55, 1.0, 0.28], wrap: 0.12, gain: 1.05,
    info: { title: 'Neptune', lines: ['Radius 24,764 km · 30.1 AU from the Sun', 'Light takes about 4 hours to arrive from the Sun.'] } },
  { id: 'pluto', name: 'Pluto', radius: km(1188.3), flat: 0, pole: [132.99, -6.16], spinH: -153.29, map: 'pluto', tint: '#C9B49A', rim: [0.5, 0.6, 0.9, 0.08], wrap: 0.02, gain: 1.0,
    info: { title: 'Pluto', lines: ['Radius 1,188 km · 39.5 AU on average', 'A dwarf planet; its orbit is tilted 17° and crosses Neptune’s.'] } },
  { id: 'ceres', name: 'Ceres', radius: km(482.1), flat: 0.075, pole: [291.42, 66.76], spinH: 9.074, map: 'ceres', tint: '#A8A29A', rim: [0, 0, 0, 0], wrap: 0, gain: 1.0,
    info: { title: 'Ceres', lines: ['Radius ~470 km · 2.77 AU from the Sun', 'The largest object in the asteroid belt; its position here is approximate.'] } },
]
export const BODY = new Map(BODIES.map((b) => [b.id, b]))
/** Bodies that get their own component (Earth is the existing object). */
export const OWN_BODIES = BODIES.filter((b) => b.id !== 'earth')
