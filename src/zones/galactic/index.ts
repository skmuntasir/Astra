import { registerObject, registerZone, ranges, type CameraKey, type V3 } from '@/engine/journey'
import { registerFocusGroup } from '@/engine/focusGroups'
import { GALAXIES, M87D, R0_LY } from './data'
import { GC_G, MilkyWayLayer } from './MilkyWay'
import { NearLayer } from './Beyond'
import { FieldsLayer, VirgoLayer } from './Fields'
import { makeGalaxy, gPos, focusAngles } from './Galaxy'
import { M87Body, M87_G, M87_R } from './M87'
import { KLY, LY, MLY, SUN_G, add3, aeToDir, cross3, dirToAE, eqDir, galDir, mul3, norm3, sub3 } from './units'

/**
 * Prompt 5 zones: beyond-the-system (300 svh) -> Milky Way (300) -> Local Group (250) -> nearby galaxies (250).
 * Every zone's origin is the Sun (global SUN_G); units are 1 ly, 1,000 ly, 1 Mly, 1 Mly. Keys are authored in GLOBAL METRES here and
 * converted per zone; the first key of each zone is COPIED from the last key of the previous zone, so the joins are exact by construction.
 */
export const M87_END_DIST = 1000 * M87D.rs // 1,000 Schwarzschild radii, metres (1.92e16 m ~ 2 ly)

interface GKey { t: number; target: V3; dist: number; azim: number; elev: number; fov?: number; hold?: boolean }
const conv = (unit: number) => (k: GKey): CameraKey => ({
  t: k.t, target: [(k.target[0] - SUN_G[0]) / unit, (k.target[1] - SUN_G[1]) / unit, (k.target[2] - SUN_G[2]) / unit],
  dist: k.dist / unit, azim: k.azim, elev: k.elev, fov: k.fov ?? 35, hold: k.hold,
})
/** The last camera key of an already-registered zone, in global metres. */
function lastKeyOf(zoneId: string): GKey {
  const z = ranges('main').find((r) => r.id === zoneId)
  if (!z) throw new Error('zone ' + zoneId + ' is not registered yet')
  const o = z.origin ?? [0, 0, 0]
  const k = z.camera[z.camera.length - 1]
  return { t: 0, target: [o[0] + k.target[0] * z.unit, o[1] + k.target[1] * z.unit, o[2] + k.target[2] * z.unit], dist: k.dist * z.unit, azim: k.azim, elev: k.elev, fov: k.fov ?? 35 }
}
const ae = (d: V3) => dirToAE(d)
const lerp3 = (a: V3, b: V3, f: number): V3 => add3(a, mul3(sub3(b, a), f))

export function registerGalactic() {
  // ---------------- objects
  registerObject({ id: 'gx-near', name: 'Nearby stars and the Oort cloud', position: [...SUN_G], radius: LY, Component: NearLayer })
  registerObject({ id: 'gx-mw', name: 'Milky Way', position: [...SUN_G], radius: LY, Component: MilkyWayLayer })
  registerObject({ id: 'gx-fx', name: 'Galaxy labels and dwarf swarm', position: [...SUN_G], radius: LY, Component: FieldsLayer })
  registerObject({ id: 'gx-virgo', name: 'Virgo Cluster', position: [...M87_G], radius: MLY, Component: VirgoLayer })
  for (const g of GALAXIES) {
    const a = focusAngles(g)
    registerObject({
      id: g.id, name: g.name, position: [...gPos.get(g.id)!], radius: g.radiusLy * LY, Component: makeGalaxy(g),
      focus: { distRadii: 3.2, azim: a.azim, elev: a.elev },
      info: { title: g.name, lines: [g.kind, ...g.facts, g.imageNote] },
    })
  }
  const dM = norm3(sub3(SUN_G, M87_G)) // from M87 toward the Sun
  const a87 = ae(dM)
  registerObject({
    id: M87D.id, name: 'M87', position: [...M87_G], radius: M87_R, Component: M87Body,
    focus: { distRadii: 3.2, azim: a87.azim, elev: a87.elev },
    info: { title: 'M87 (Virgo A)', lines: ['Giant elliptical galaxy · about 55 million light-years away', 'Black hole M87*: 6.5 billion Suns (EHT 2019)', 'Its jet is visible for about 5,000 light-years // VERIFY', 'Picture: a procedural illustration, NOT a Hubble or Webb photograph. The jet and the stars near the core are schematic.'] },
  })

  // arrow-key order while focused: the galaxies in list order (Local Group first, then the nearby ones), M87 last
  registerFocusGroup('galaxies', [...GALAXIES.map((g) => g.id), M87D.id])

  const LG_SET = ['gx-mw', 'gx-fx', 'gx-m31', 'gx-m33', 'gx-lmc', 'gx-smc']
  const NEAR_SET = [...GALAXIES.filter((g) => g.zone === 'nearby').map((g) => g.id), M87D.id, 'gx-virgo']
  const N = galDir(0, 90), Q = galDir(180, 0)
  const tilt = (deg: number): V3 => norm3(add3(mul3(N, Math.cos((deg * Math.PI) / 180)), mul3(Q, Math.sin((deg * Math.PI) / 180))))

  // ---------------- 1. beyond the system (unit: 1 ly)
  const prev = lastKeyOf('solar-system')
  const a0 = prev.azim
  const dirMW0 = ae(tilt(75))
  const L = (x: number) => x * LY
  const beyondKeys: GKey[] = [
    { ...prev, t: 0 },
    { t: 0.16, target: SUN_G, dist: L(0.0016), azim: a0 + 20, elev: 22 },
    { t: 0.34, target: SUN_G, dist: L(0.12), azim: a0 + 55, elev: 26 },
    { t: 0.5, target: SUN_G, dist: L(5), azim: a0 + 85, elev: 28, hold: true }, // the Oort cloud as a whole
    { t: 0.6, target: SUN_G, dist: L(5.5), azim: a0 + 92, elev: 28, hold: true },
    { t: 0.7, target: SUN_G, dist: L(14), azim: a0 + 110, elev: 30 },
    { t: 0.8, target: SUN_G, dist: L(36), azim: a0 + 135, elev: 34, hold: true }, // the neighbourhood, labelled
    { t: 0.88, target: SUN_G, dist: L(40), azim: a0 + 145, elev: 35, hold: true },
    { t: 1, target: SUN_G, dist: L(110), azim: dirMW0.azim, elev: dirMW0.elev },
  ]
  const NOTE_REAL = 'Stars: real positions and distances (Hipparcos / Gaia values, rounded; to be re-checked). Oort cloud: simulated, never observed.'
  registerZone({
    id: 'beyond', title: 'Beyond the Solar System', tick: 'Stars', budget: 300, unit: LY, origin: SUN_G, scale: 'Interstellar scale',
    objects: ['sun', 'gx-near'], stillT: 0.82,
    notes: ['From here on every distance is to scale (the planets were compressed).', NOTE_REAL],
    camera: beyondKeys.map(conv(LY)),
    beats: [
      { id: 'by-1', kicker: 'The Oort cloud', title: 'Perhaps a trillion icy bodies that nobody has seen.', body: 'Inferred from long-period comets. Drawn here as a hint, out to about 100,000 AU.', w: [0.34, 0.4, 0.58, 0.66], side: 'left' },
      { id: 'by-2', kicker: 'Nearest stars', title: 'Four light-years of nothing, then Alpha Centauri.', body: 'At Voyager 1’s speed, Proxima Centauri is about 75,000 years away.', w: [0.7, 0.75, 0.82, 0.86], side: 'left' },
      { id: 'by-3', kicker: 'Real positions', title: 'Every labelled star is where it really is.', body: 'Most are dim red dwarfs, too faint to see by eye.', w: [0.88, 0.92, 0.98, 1.01], side: 'left' },
    ],
  })

  // ---------------- 2. Milky Way (unit: 1,000 ly)
  const mwStart = lastKeyOf('beyond')
  const toGC = sub3(GC_G, SUN_G)
  const K = (x: number) => x * KLY
  const mwKeys: GKey[] = [
    { ...mwStart, t: 0 },
    { t: 0.2, target: SUN_G, dist: K(1.5), azim: ae(tilt(70)).azim, elev: ae(tilt(70)).elev },
    { t: 0.45, target: add3(SUN_G, mul3(toGC, 0.35)), dist: K(30), azim: ae(tilt(50)).azim, elev: ae(tilt(50)).elev },
    { t: 0.72, target: add3(SUN_G, mul3(toGC, 0.85)), dist: K(190), azim: ae(tilt(14)).azim, elev: ae(tilt(14)).elev, hold: true }, // the whole galaxy
    { t: 0.8, target: add3(SUN_G, mul3(toGC, 0.88)), dist: K(200), azim: ae(tilt(16)).azim, elev: ae(tilt(16)).elev, hold: true },
    { t: 1, target: GC_G, dist: K(450), azim: ae(tilt(35)).azim, elev: ae(tilt(35)).elev },
  ]
  registerZone({
    id: 'milky-way', title: 'The Milky Way', tick: 'Galaxy', budget: 300, unit: KLY, origin: SUN_G, scale: 'Galactic scale',
    objects: ['gx-near', 'gx-mw', ...LG_SET.filter((i) => i !== 'gx-mw'), 'gx-fx'], stillT: 0.76,
    notes: ['Milky Way: a particle model (~ 150,000 points for ~ 10^11 stars) following the sky model’s arms; schematic, not a map.', 'Sun–centre distance: 8,275 pc (GRAVITY 2021). The faint underlay is an artist’s concept (procedural image).'],
    camera: mwKeys.map(conv(KLY)),
    beats: [
      { id: 'mw-1', kicker: 'The Milky Way', title: `About ${Math.round(R0_LY / 1000)},000 light-years from the centre.`, body: 'The Sun rides in a small spur, between two spiral arms.', w: [0.14, 0.22, 0.38, 0.46], side: 'left' },
      { id: 'mw-2', kicker: 'Structure', title: 'A bar, two major arms, minor arms, and a warp.', body: 'The arms in this model are stylised; the real ones are still being mapped.', w: [0.66, 0.72, 0.84, 0.9], side: 'left' },
      { id: 'mw-3', kicker: 'Orion Spur', title: 'Home is a spur about 10,000 light-years long.', w: [0.5, 0.55, 0.62, 0.68], side: 'left' },
    ],
  })

  // ---------------- 3. Local Group (unit: 1 Mly)
  const lgStart = lastKeyOf('milky-way')
  const m31 = gPos.get('gx-m31')!
  const B = lerp3(GC_G, m31, 0.5)
  const axis = norm3(sub3(m31, GC_G))
  const side = norm3(cross3(axis, N))
  const dLG = ae(norm3(add3(mul3(N, 0.5), mul3(side, 0.87))))
  const M = (x: number) => x * MLY
  // The view direction turns slowly and evenly from the Milky Way zone's end (azim -130) to the M87 approach direction (looking from the
  // Sun's side, azim 92 = -268): about 140 deg over the two zones (<= 0.5 deg per svh), never a swing.
  const A = (az: number, el: number) => ({ azim: az, elev: el })
  const kLG = [A(-130, 27.6), A(-140, 28), A(-160, 22), A(-166, 22), A(-185, 18)]
  const lgKeys: GKey[] = [
    { ...lgStart, t: 0 },
    { t: 0.3, target: lerp3(GC_G, m31, 0.08), dist: M(1.0), ...kLG[1] },
    { t: 0.56, target: B, dist: M(4.2), ...kLG[2], hold: true }, // Milky Way, Andromeda, Triangulum
    { t: 0.72, target: B, dist: M(4.5), ...kLG[3], hold: true },
    { t: 1, target: B, dist: M(16), ...kLG[4] },
  ]
  void axis; void side; void dLG
  registerZone({
    id: 'local-group', title: 'The Local Group', tick: 'Local Group', budget: 250, unit: MLY, origin: SUN_G, scale: 'Local Group scale',
    objects: [...LG_SET, ...NEAR_SET], stillT: 0.84, // menu landing: pulled back from 0.64 (~4.4 Mly) to ~7 Mly so the whole Local Group is in view
    notes: ['Galaxy positions and distances are real (to be re-checked); the pictures are procedural illustrations, not Hubble or Webb photographs.', 'Dwarf swarm: 44 real galaxies, a subset of the 80–100+ known.'],
    camera: lgKeys.map(conv(MLY)),
    beats: [
      { id: 'lg-1', kicker: 'Magellanic Clouds', title: 'Our two biggest satellites, 160,000 and 200,000 light-years away.', body: 'Click a label to fly to a galaxy.', w: [0.1, 0.16, 0.28, 0.36], side: 'left' },
      { id: 'lg-2', kicker: 'The Local Group', title: 'Two giants, a few mid-size spirals, and dozens of dwarfs.', body: 'Andromeda is 2.5 million light-years away.', w: [0.5, 0.56, 0.66, 0.72], side: 'left' },
      { id: 'lg-3', kicker: 'The collision', title: 'Will the Milky Way and Andromeda merge? Not settled.', body: 'Sawala et al. 2025: about even odds within 10 billion years. Wu et al. 2026, newer Gaia motions: about 90%. Approach speed ~ 110 km/s.', w: [0.7, 0.76, 0.9, 0.96], side: 'left' },
    ],
  })

  // ---------------- 4. nearby galaxies -> M87 (unit: 1 Mly)
  const nbStart = lastKeyOf('local-group')
  const T1 = lerp3(SUN_G, M87_G, 0.4)
  const dFin = A(a87.azim - 360, a87.elev) // looking at M87 from the Sun's side
  const nbKeys: GKey[] = [
    { ...nbStart, t: 0 },
    { t: 0.22, target: T1, dist: M(110), azim: -205, elev: 14, hold: true }, // overview: every labelled galaxy
    { t: 0.36, target: T1, dist: M(105), azim: -212, elev: 12, hold: true },
    { t: 0.5, target: lerp3(SUN_G, M87_G, 0.9), dist: M(40), azim: -235, elev: 4 },
    { t: 0.62, target: M87_G, dist: M(3), azim: -262, elev: -8 },
    { t: 0.74, target: M87_G, dist: M(0.15), azim: dFin.azim, elev: dFin.elev },
    { t: 0.88, target: M87_G, dist: M(0.002), azim: dFin.azim, elev: dFin.elev },
    { t: 1, target: M87_G, dist: M87_END_DIST, azim: dFin.azim, elev: dFin.elev },
  ]
  void eqDir
  registerZone({
    id: 'nearby-galaxies', title: 'Nearby Galaxies', tick: 'Galaxies', budget: 250, unit: MLY, origin: SUN_G, scale: 'Intergalactic scale',
    objects: [...LG_SET, ...NEAR_SET], stillT: 0.3,
    notes: ['Positions and distances are real (to be re-checked). Pictures: procedural placeholders, NOT Hubble or Webb images.', 'Virgo Cluster: simulated members around M87. The jet and the stars near M87’s core are schematic.'],
    camera: nbKeys.map(conv(MLY)),
    beats: [
      { id: 'nb-1', kicker: 'Beyond the Local Group', title: 'Every labelled galaxy is a click away.', body: 'The Sun is at the centre of this view. Nothing here is a Hubble photograph yet.', w: [0.16, 0.22, 0.38, 0.44], side: 'left' },
      { id: 'nb-2', kicker: 'The Virgo Cluster', title: '55 million light-years: over a thousand galaxies.', body: 'M87 sits near its centre.', w: [0.46, 0.52, 0.62, 0.68], side: 'left' },
      { id: 'nb-3', kicker: 'M87', title: 'At its heart, a black hole of 6.5 billion Suns.', body: 'Imaged by the Event Horizon Telescope in 2019. Next: the approach.', w: [0.78, 0.84, 0.96, 1.01], side: 'left' },
    ],
  })
}
