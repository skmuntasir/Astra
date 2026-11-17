import { registerObject, registerZone } from '@/engine/journey'
import { EarthBody } from './Earth'
import { MoonBody } from './Moon'
import { SunBody } from './Sun'
import { registerSolar } from './solar'
import { registerGalactic } from './galactic'
import { registerBlackHole } from './blackhole'
import { MOON_DIST, R_EARTH, R_MOON_M, R_SUN, SUN_DIR, SUN_DIST, SUN_COMPRESSION } from './common'

/**
 * THE JOURNEY, as it stands after Prompt 1: hero + Earth, and the Earth -> Moon placeholder zone.
 * Later prompts: add `registerZone({...})` / `registerObject({...})` here (or in new files imported below). No engine edits.
 */
registerObject({
  id: 'earth', name: 'Earth', position: [0, 0, 0], radius: R_EARTH, Component: EarthBody,
  focus: { distRadii: 3.7, litFrom: [SUN_DIR.x * SUN_DIST, SUN_DIR.y * SUN_DIST, SUN_DIR.z * SUN_DIST], swing: 32, elev: 10 }, info: { title: 'Earth', lines: ['Radius 6,371 km', 'The only place we know that has anyone on it.'] },
})
registerObject({
  id: 'moon', name: 'Moon', position: [MOON_DIST, 0, 0], radius: R_MOON_M, Component: MoonBody,
  focus: { distRadii: 3.6, azim: 250, elev: 8 }, info: { title: 'The Moon', lines: ['384,400 km from Earth', 'Light takes 1.28 seconds to arrive.'] },
})

registerObject({
  id: 'sun', name: 'Sun', position: [SUN_DIR.x * SUN_DIST, SUN_DIR.y * SUN_DIST, SUN_DIR.z * SUN_DIST], radius: R_SUN, Component: SunBody,
  focus: { distRadii: 4, litFrom: [0, 0, 0], swing: 25, elev: 8 }, info: { title: 'The Sun', lines: ['Radius 695,700 km: 109 Earths across', 'Light takes 8 min 20 s to reach us.', `Placed ${SUN_COMPRESSION}× closer than it really is; size is true.`] },
})

const RE = R_EARTH
const NOTE_IMG = 'Earth, Moon: NASA-derived imagery (exact source credit pending). Earth relief is derived from the imagery, not elevation data.'
const NOTE_SKY = 'Milky Way: procedural model, not a survey image. Stars: 136 real bright stars + simulated field.'
const moonX = MOON_DIST / RE // Earth radii

registerZone({
  id: 'earth', title: 'Earth', tick: 'Earth', budget: 250, unit: RE, scale: 'Planet scale',
  objects: ['earth', 'moon', 'sun'], stillT: 0.05, notes: [NOTE_IMG, NOTE_SKY],
  camera: [
    { t: 0, target: [-0.95, 0.12, 0], dist: 4.4, azim: 18, elev: 6, fov: 32 },
    { t: 0.5, target: [-0.35, 0.05, 0], dist: 3.1, azim: 40, elev: 10, fov: 32 },
    { t: 1, target: [6, 0.5, 0], dist: 14, azim: 62, elev: 12, fov: 35 },
  ],
  beats: [
    { id: 'hero', style: 'hero', kicker: 'ASTRA', title: 'WE ARE HERE.', body: 'Scroll. The camera never cuts.', w: [-0.02, 0, 0.18, 0.3], side: 'left' },
    { id: 'earth-1', title: 'Everyone you have ever known lived on this.', body: 'Radius 6,371 km. A thin blue edge of air, and the dark behind it.', w: [0.34, 0.44, 0.62, 0.74], side: 'left' },
    { id: 'earth-2', title: 'Now, pull back.', w: [0.8, 0.88, 0.96, 1.0], side: 'center' },
  ],
})

registerZone({
  id: 'moon', title: 'The Moon', tick: 'Moon', budget: 250, unit: RE, scale: 'Earth–Moon scale',
  objects: ['earth', 'moon', 'sun'], stillT: 0.99,
  notes: ['Sizes true · Earth–Moon distance true · Sun placed 8× closer', NOTE_IMG, NOTE_SKY],
  camera: [
    { t: 0, target: [6, 0.5, 0], dist: 14, azim: 62, elev: 12, fov: 35 },
    { t: 0.45, target: [moonX / 2, 0, 0], dist: 112, azim: 90, elev: 20, fov: 35 },
    { t: 1, target: [moonX, 0, 0], dist: 1.25, azim: 250, elev: 8, fov: 32 },
  ],
  beats: [
    { id: 'moon-1', kicker: '384,400 km', title: 'Thirty Earths fit in the gap.', body: 'Light needs 1.28 seconds to cross it.', w: [0.14, 0.24, 0.4, 0.5], side: 'left' },
    { id: 'moon-2', kicker: 'The Moon', title: 'Our nearest neighbour is a quarter our width.', body: 'Tidally locked: the same face always looks at Earth. Radius 1,737 km.', w: [0.74, 0.84, 1.0, 1.01], side: 'left' },
  ],
})

// ---- The Sun. Continuous with the end of the Moon zone (same target, distance, angles). Unit: solar radii.
const moonR = MOON_DIST / R_SUN
const sunP = [SUN_DIR.x * SUN_DIST / R_SUN, SUN_DIR.y * SUN_DIST / R_SUN, SUN_DIR.z * SUN_DIST / R_SUN] as [number, number, number]
registerZone({
  id: 'sun', title: 'The Sun', tick: 'Sun', budget: 200, unit: R_SUN, scale: 'Star scale',
  objects: ['earth', 'moon', 'sun'], stillT: 0.95,
  notes: [`Sizes true · Earth–Sun distance compressed ${SUN_COMPRESSION}× (true: 149.6 million km)`, 'Sun surface: procedural simulation; granules exaggerated ~5×, corona schematic.', NOTE_SKY],
  camera: [
    { t: 0, target: [moonR, 0, 0], dist: (1.25 * RE) / R_SUN, azim: 250, elev: 8, fov: 32 },
    { t: 0.3, target: [moonR * 0.4, 0, 0.2], dist: 1.6, azim: 205, elev: 24, fov: 35 },
    { t: 0.68, target: [sunP[0] * 0.5, 0, sunP[2] * 0.5], dist: 16, azim: 150, elev: 14, fov: 35 },
    { t: 1, target: sunP, dist: 5, azim: 135.6, elev: 8, fov: 35 },
  ],
  beats: [
    { id: 'sun-1', kicker: '149.6 million km', title: 'Now the light we have been steering by.', body: 'Sunlight left it 8 minutes 20 seconds ago.', w: [0.1, 0.2, 0.4, 0.5], side: 'left' },
    { id: 'sun-2', kicker: 'The Sun', title: '109 Earths across. 1.3 million would fit inside.', body: 'Surface about 5,770 K. It holds 99.86 % of the Solar System’s mass.', w: [0.7, 0.8, 1.0, 1.01], side: 'left' },
  ],
})

// ---- The Solar System (Prompt 4): planets, belts, heliopause, labels, click targets. Called LAST so it follows the Sun zone it continues from.
registerSolar()

// ---- Prompt 5: beyond the system, Milky Way, Local Group, nearby galaxies (ends on a dive into M87). Called after the Solar System zone it continues from.
registerGalactic()
import { registerContent } from './content'
registerContent()

// ---- Final series step 3: M87* approach (300 svh) + the infall branch. Called after the zone it continues from.
registerBlackHole()

// ---- Final series step 4: universe (400 svh) + multiverse (300 svh). Called after the black-hole approach whose "No" branch continues here. The multiverse is the LAST zone: the journey ends there (end card in universe/Hud.tsx).
import { registerUniverse } from './universe'
registerUniverse()
