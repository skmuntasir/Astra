import { registerObject, registerZone, type CameraKey } from '@/engine/journey'
import { registerFocusGroup } from '@/engine/focusGroups'
import { R_SUN } from '../common'
import { OWN_BODIES, BODY } from './bodies'
import { makePlanet } from './Planet'
import { SolarFx } from './Fx'
import { ZONE_ID } from './state'
import { SUN_POS, U, posAtU, sunU, azimSunSide } from './layout'
import { MOONS } from './satellites'
import { makeSatellite } from './Satellite'

/**
 * THE SOLAR SYSTEM zone (Prompt 4). Registered after the Sun zone and continuous with it: the first camera key is the Sun zone's
 * last key (target Sun, 5 solar radii, azimuth 135.6, elevation 8). Unit = U, the compressed Earth-Sun distance (1.87e10 m).
 * Objects: the eight planets + Pluto + Ceres (Earth is the SAME 'earth' object as in the Earth zone), 'ss-fx' (orbits, belts,
 * heliopause, halo, click targets, labels) and the Sun, which is the one registered in the Sun zone.
 */
export function registerSolar() {
// focus camera: on the sunward side (so the lit face is toward the viewer), distance chosen so the body (and its rings) fill the view like the Earth hero
const FOCUS_DIST: Record<string, number> = { saturn: 7, uranus: 6.4, jupiter: 4.3 }
const FOCUS_ELEV: Record<string, number> = { saturn: 14, uranus: 6, jupiter: 8 }
for (const b of OWN_BODIES) {
  registerObject({ id: b.id, name: b.name, position: [0, 0, 0], radius: b.radius, Component: makePlanet(b), focus: { distRadii: FOCUS_DIST[b.id] ?? 4.2, litFrom: [...SUN_POS], swing: 32, elev: FOCUS_ELEV[b.id] ?? 12 }, info: b.info })
}
for (const m of MOONS) {
  registerObject({ id: m.id, name: m.name, position: [0, 0, 0], radius: m.radius, Component: makeSatellite(m), focus: { distRadii: 4.2, litFrom: [...SUN_POS], swing: 32, elev: 10 }, info: { title: m.name, lines: [] } })
}
registerObject({ id: 'ss-fx', name: 'Solar System layer', position: [...SUN_POS], radius: U, Component: SolarFx })

const sun = sunU()
const lerp3 = (a: [number, number, number], b: [number, number, number], f: number): [number, number, number] => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
const FOV = 35
// where the flyby targets will be when the camera gets there (orbital time is tied to scroll, so these are exact)
const U_SAT = 0.6, U_NEP = 0.8
const sat = posAtU('saturn', U_SAT), nep = posAtU('neptune', U_NEP)
const aSat = azimSunSide('saturn', U_SAT, 50), aNep = azimSunSide('neptune', U_NEP, 45), aEnd = aNep + 60 // the camera ends outside the system, 60 deg round from the Neptune view
const key = (t: number, target: [number, number, number], dist: number, azim: number, elev: number, hold?: boolean): CameraKey => ({ t, target, dist, azim, elev, fov: FOV, hold })

const NOTE = 'Sizes true relative to each other · distances compressed (Neptune at 5.5× Earth’s distance in this picture; really 30×)'
registerZone({
  id: ZONE_ID, title: 'The Solar System', tick: 'Planets', budget: 500, unit: U, scale: 'Solar System scale',
  objects: [...OWN_BODIES.map((b) => b.id), ...MOONS.map((m) => m.id), 'earth', 'sun', 'ss-fx'], stillT: 0.38,
  // portrait phones: the overview (and the Saturn close-up) need a wider view; 1 at both seams so the joins stay exact (see Zone.framing)
  framing: (l, aspect) => {
    if (aspect >= 1.6) return 1
    const k = Math.min(2.3, 1.6 / aspect), kS = Math.min(1.5, 1 / (aspect * 1.05))
    const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
    return (1 + (k - 1) * ss(0.08, 0.22, l) * (1 - ss(0.44, 0.56, l))) * (1 + (Math.max(1, kS) - 1) * ss(0.42, 0.5, l) * (1 - ss(0.64, 0.72, l)))
  },
  notes: [
    NOTE,
    'Positions: approximate orbital elements for 8 Nov 2026; time runs with your scroll (30 days across this flight). Rotation ×1000.',
    'Textures, belts (simulated populations) and heliopause (schematic): procedural. Labels and markers are enlarged; bodies are to scale.',
  ],
  camera: [
    key(0, sun, (5 * R_SUN) / U, 135.6, 8),
    key(0.1, sun, 0.9, 120, 18), // the camera now swings steadily DOWN in azimuth (135.6 -> Saturn's view -> Neptune's)
    key(0.24, sun, 7, aSat + 97, 38),
    key(0.33, sun, 17, aSat + 45, 55, true), // every planet in view, labelled
    key(0.43, sun, 17, aSat + 45, 55, true),
    key(0.5, lerp3(sun, sat, 0.55), 3.2, aSat + 15, 26),
    key(U_SAT, sat, 0.045, aSat, 12, true), // Saturn, rings and their shadows
    key(0.63, sat, 0.045, aSat, 12, true),
    key(0.72, lerp3(sat, nep, 0.7), 0.9, (aSat + aNep) / 2, 14),
    key(U_NEP, nep, 0.016, aNep, 8, true), // Neptune
    key(0.83, nep, 0.016, aNep, 8, true),
    key(0.87, nep, 0.25, aNep + 8, 9), // back away first (distance grows before the target moves)
    key(0.92, lerp3(nep, sun, 0.3), 2.6, aNep + 22, 12),
    key(0.97, sun, 22, aNep + 48, 14), // outside the heliopause (11 U), looking back
    key(1, sun, 40, aEnd, 18),
  ],
  beats: [
    { id: 'ss-1', kicker: 'Order is true', title: 'Eight planets, and the dark between them.', body: 'Distances here are squeezed; sizes are not.', w: [0.1, 0.17, 0.26, 0.31], side: 'left' },
    { id: 'ss-2', kicker: 'Every planet', title: 'Everything we have ever sent a probe to.', w: [0.34, 0.37, 0.41, 0.44], side: 'center' },
    { id: 'ss-3', kicker: 'Saturn', title: 'Rings thinner than a house.', body: 'The planet shades the rings. The rings shade the planet.', w: [0.55, 0.59, 0.64, 0.7], side: 'left' },
    { id: 'ss-4', kicker: 'Neptune', title: 'Sunlight takes four hours to get here.', w: [0.76, 0.79, 0.84, 0.88], side: 'left' },
    { id: 'ss-5', kicker: 'The heliopause', title: 'Where the Sun’s wind gives out.', body: 'Two probes have crossed it, about 120 times Earth’s distance from the Sun.', w: [0.92, 0.95, 0.99, 1.01], side: 'left' },
  ],
})
}
// arrow-key order while focused: the Sun, then every planet in distance order (Moon after Earth, Ceres after Mars, Pluto last), each followed by its moons
registerFocusGroup('solar', ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'ceres', 'jupiter', 'io', 'europa', 'ganymede', 'callisto', 'saturn', 'titan', 'enceladus', 'uranus', 'neptune', 'triton', 'pluto', 'charon'])
void BODY
