import { dec, ra } from './units'

/**
 * REAL DATA for the Prompt 5 zones. Every number was typed from memory unless a line says it was checked; everything is marked
 * `// VERIFY` and listed in docs/STATUS.md. Positions are J2000 RA/Dec; distances are what the parallax / distance-modulus papers
 * give, rounded. Where sources disagree by more than the rounding, the more recent one is used.
 * CHECKED this session (web): Sun-Galactic Centre distance R0 = 8,275 pc +- 33 (GRAVITY 2021); Milky Way-Andromeda merger odds
 * (Sawala et al. 2025, Nature Astronomy, DOI 10.1038/s41550-025-02563-1; Wu et al. 2026, ApJL 1001, L19, DOI 10.3847/2041-8213/ae5799).
 */
export const R0_KPC = 8.275 // GRAVITY Collaboration 2021 (8,275 +- 9 stat +- 33 sys pc)
export const R0_LY = R0_KPC * 3261.5637769 // 26,990 ly

export type Rgb = [number, number, number]
const G: Rgb = [1.0, 0.93, 0.78], K: Rgb = [1.0, 0.76, 0.5], M: Rgb = [1.0, 0.52, 0.34], A: Rgb = [0.84, 0.9, 1.0], F: Rgb = [1.0, 0.96, 0.86], BD: Rgb = [0.86, 0.32, 0.24]

export interface NearStar { id: string; name: string; ra: number; dec: number; ly: number; cls: string; col: Rgb; size: number; note?: string }
/** Nearest stars and a few bright neighbours. size = sprite size in px at rest (bigger = more luminous). // VERIFY every row */
export const NEAR_STARS: NearStar[] = [
  { id: 'acen', name: 'Alpha Centauri', ra: ra(14, 39, 36.5), dec: dec(-60, 50, 2), ly: 4.37, cls: 'G2 + K1', col: G, size: 9, note: 'Two Sun-like stars orbiting each other; Proxima is a third, far out.' }, // VERIFY 4.37 ly (Kervella et al. 2016 ~ 4.36-4.37)
  { id: 'prox', name: 'Proxima Centauri', ra: ra(14, 29, 42.9), dec: dec(-62, 40, 46), ly: 4.2465, cls: 'M5.5', col: M, size: 5.5 }, // VERIFY Gaia DR3 parallax ~ 768.07 mas -> 4.2465 ly
  { id: 'barn', name: 'Barnard’s Star', ra: ra(17, 57, 48.5), dec: dec(4, 41, 36), ly: 5.96, cls: 'M4', col: M, size: 5 }, // VERIFY
  { id: 'l1649', name: 'Luhman 16', ra: ra(10, 49, 18.7), dec: dec(-53, 19, 10), ly: 6.5, cls: 'brown dwarfs', col: BD, size: 4.5 }, // VERIFY
  { id: 'w0855', name: 'WISE 0855−0714', ra: ra(8, 55, 10.8), dec: dec(-7, 14, 43), ly: 7.43, cls: 'Y dwarf', col: BD, size: 3.6 }, // VERIFY (coldest known brown dwarf, ~ 250-285 K)
  { id: 'wolf', name: 'Wolf 359', ra: ra(10, 56, 29.2), dec: dec(7, 0, 53), ly: 7.86, cls: 'M6', col: M, size: 4.8 }, // VERIFY
  { id: 'lal', name: 'Lalande 21185', ra: ra(11, 3, 20.2), dec: dec(35, 58, 12), ly: 8.3, cls: 'M2', col: M, size: 5.2 }, // VERIFY
  { id: 'sir', name: 'Sirius', ra: ra(6, 45, 8.9), dec: dec(-16, 42, 58), ly: 8.6, cls: 'A1 + white dwarf', col: A, size: 12 }, // VERIFY (Hipparcos new reduction ~ 8.60 ly)
  { id: 'uvc', name: 'Luyten 726-8', ra: ra(1, 39, 1.3), dec: dec(-17, 57, 1), ly: 8.73, cls: 'M5.5 + M6', col: M, size: 4.6 }, // VERIFY
  { id: 'r154', name: 'Ross 154', ra: ra(18, 49, 49.4), dec: dec(-23, 50, 10), ly: 9.69, cls: 'M3.5', col: M, size: 4.4 }, // VERIFY
  { id: 'r248', name: 'Ross 248', ra: ra(23, 41, 54.7), dec: dec(44, 10, 30), ly: 10.32, cls: 'M5', col: M, size: 4.2 }, // VERIFY
  { id: 'eeri', name: 'Epsilon Eridani', ra: ra(3, 32, 55.8), dec: dec(-9, 27, 30), ly: 10.47, cls: 'K2', col: K, size: 7 }, // VERIFY
  { id: 'l9352', name: 'Lacaille 9352', ra: ra(23, 5, 52.0), dec: dec(-35, 51, 11), ly: 10.72, cls: 'M0.5', col: M, size: 5.4 }, // VERIFY
  { id: 'r128', name: 'Ross 128', ra: ra(11, 47, 44.4), dec: dec(0, 48, 16), ly: 11.01, cls: 'M4', col: M, size: 4.2 }, // VERIFY
  { id: 'eind', name: 'Epsilon Indi', ra: ra(22, 3, 21.7), dec: dec(-56, 47, 10), ly: 11.87, cls: 'K5', col: K, size: 6 }, // VERIFY
  { id: '61cyg', name: '61 Cygni', ra: ra(21, 6, 53.9), dec: dec(38, 44, 58), ly: 11.4, cls: 'K5 + K7', col: K, size: 6 }, // VERIFY
  { id: 'proc', name: 'Procyon', ra: ra(7, 39, 18.1), dec: dec(5, 13, 30), ly: 11.46, cls: 'F5 + white dwarf', col: F, size: 10 }, // VERIFY
  { id: 'tcet', name: 'Tau Ceti', ra: ra(1, 44, 4.1), dec: dec(-15, 56, 15), ly: 11.9, cls: 'G8', col: G, size: 7 }, // VERIFY
  { id: 'alt', name: 'Altair', ra: ra(19, 50, 47.0), dec: dec(8, 52, 6), ly: 16.7, cls: 'A7', col: A, size: 10 }, // VERIFY
  { id: 'vega', name: 'Vega', ra: ra(18, 36, 56.3), dec: dec(38, 47, 1), ly: 25.0, cls: 'A0', col: A, size: 12 }, // VERIFY (~ 25.0 ly)
  { id: 'fom', name: 'Fomalhaut', ra: ra(22, 57, 39.0), dec: dec(-29, 37, 20), ly: 25.1, cls: 'A3', col: A, size: 11 }, // VERIFY
]

/** Oort cloud: inner edge ~ 2,000-5,000 AU, outer edge ~ 100,000 AU (up to ~ 200,000 AU). Inferred from long-period comets, never imaged. // VERIFY */
export const OORT = { innerAU: 2000, outerAU: 100000 }

export interface Dwarf { name: string; ra: number; dec: number; kly: number; group: 'mw' | 'm31' | 'lg'; label?: boolean }
const kpc = (x: number) => x * 3.2615637769
/** Local Group dwarfs and satellites: a subset (~ 45) of the 80-100+ known members. Positions / distances typed from memory (McConnachie 2012 era). // VERIFY ALL */
export const DWARFS: Dwarf[] = [
  { name: 'Sagittarius dwarf', ra: ra(18, 55, 19.5), dec: dec(-30, 32, 43), kly: kpc(26.7), group: 'mw', label: true },
  { name: 'Segue 1', ra: ra(10, 7, 4), dec: dec(16, 4, 55), kly: kpc(23), group: 'mw' },
  { name: 'Ursa Major II', ra: ra(8, 51, 30), dec: dec(63, 7, 48), kly: kpc(32), group: 'mw' },
  { name: 'Willman 1', ra: ra(10, 49, 21), dec: dec(51, 3, 0), kly: kpc(38), group: 'mw' },
  { name: 'Coma Berenices', ra: ra(12, 26, 59), dec: dec(23, 54, 15), kly: kpc(44), group: 'mw' },
  { name: 'Boötes I', ra: ra(14, 0, 6), dec: dec(14, 30, 0), kly: kpc(66), group: 'mw' },
  { name: 'Draco', ra: ra(17, 20, 12.4), dec: dec(57, 54, 55), kly: kpc(76), group: 'mw', label: true },
  { name: 'Ursa Minor', ra: ra(15, 9, 8.5), dec: dec(67, 13, 21), kly: kpc(76), group: 'mw' },
  { name: 'Sculptor', ra: ra(1, 0, 9.4), dec: dec(-33, 42, 33), kly: kpc(86), group: 'mw', label: true },
  { name: 'Sextans', ra: ra(10, 13, 3), dec: dec(-1, 36, 53), kly: kpc(86), group: 'mw' },
  { name: 'Ursa Major I', ra: ra(10, 34, 52.8), dec: dec(51, 55, 12), kly: kpc(97), group: 'mw' },
  { name: 'Carina', ra: ra(6, 41, 36.7), dec: dec(-50, 57, 58), kly: kpc(105), group: 'mw' },
  { name: 'Hercules', ra: ra(16, 31, 2), dec: dec(12, 47, 30), kly: kpc(132), group: 'mw' },
  { name: 'Fornax', ra: ra(2, 39, 59.3), dec: dec(-34, 26, 57), kly: kpc(147), group: 'mw', label: true },
  { name: 'Leo IV', ra: ra(11, 32, 57), dec: dec(-0, 32, 0), kly: kpc(154), group: 'mw' },
  { name: 'Canes Venatici II', ra: ra(12, 57, 10), dec: dec(34, 19, 15), kly: kpc(160), group: 'mw' },
  { name: 'Canes Venatici I', ra: ra(13, 28, 3.5), dec: dec(33, 33, 21), kly: kpc(218), group: 'mw' },
  { name: 'Leo II', ra: ra(11, 13, 28.8), dec: dec(22, 9, 6), kly: kpc(233), group: 'mw' },
  { name: 'Leo I', ra: ra(10, 8, 28.1), dec: dec(12, 18, 23), kly: kpc(254), group: 'mw', label: true },
  { name: 'Leo T', ra: ra(9, 34, 53.4), dec: dec(17, 3, 5), kly: kpc(417), group: 'lg' },
  { name: 'Phoenix', ra: ra(1, 51, 6.3), dec: dec(-44, 26, 41), kly: kpc(415), group: 'lg' },
  { name: 'NGC 6822', ra: ra(19, 44, 56.6), dec: dec(-14, 47, 21), kly: kpc(459), group: 'lg', label: true },
  { name: 'Cetus', ra: ra(0, 26, 11), dec: dec(-11, 2, 40), kly: kpc(755), group: 'lg' },
  { name: 'IC 1613', ra: ra(1, 4, 47.8), dec: dec(2, 7, 4), kly: kpc(755), group: 'lg' },
  { name: 'Tucana', ra: ra(22, 41, 49.6), dec: dec(-64, 25, 10), kly: kpc(887), group: 'lg' },
  { name: 'Leo A', ra: ra(9, 59, 26.5), dec: dec(30, 44, 47), kly: kpc(798), group: 'lg' },
  { name: 'WLM', ra: ra(0, 1, 58.2), dec: dec(-15, 27, 39), kly: kpc(933), group: 'lg' },
  { name: 'Pegasus dwarf', ra: ra(23, 28, 36.3), dec: dec(14, 44, 35), kly: kpc(920), group: 'lg' },
  { name: 'Aquarius dwarf', ra: ra(20, 46, 51.8), dec: dec(-12, 50, 53), kly: kpc(1066), group: 'lg' },
  { name: 'Antlia dwarf', ra: ra(10, 4, 4), dec: dec(-27, 19, 55), kly: kpc(1235), group: 'lg' },
  { name: 'NGC 3109', ra: ra(10, 3, 6.9), dec: dec(-26, 9, 34), kly: kpc(1300), group: 'lg' },
  { name: 'Sextans B', ra: ra(10, 0, 0.1), dec: dec(5, 19, 56), kly: kpc(1426), group: 'lg' },
  { name: 'Sextans A', ra: ra(10, 11, 0.8), dec: dec(-4, 41, 34), kly: kpc(1432), group: 'lg' },
  // Andromeda's satellites
  { name: 'M32', ra: ra(0, 42, 41.8), dec: dec(40, 51, 55), kly: kpc(805), group: 'm31', label: true },
  { name: 'M110', ra: ra(0, 40, 22.1), dec: dec(41, 41, 7), kly: kpc(824), group: 'm31', label: true },
  { name: 'NGC 147', ra: ra(0, 33, 12.1), dec: dec(48, 30, 32), kly: kpc(676), group: 'm31' },
  { name: 'NGC 185', ra: ra(0, 38, 58), dec: dec(48, 20, 15), kly: kpc(617), group: 'm31' },
  { name: 'Andromeda I', ra: ra(0, 45, 39.8), dec: dec(38, 2, 28), kly: kpc(745), group: 'm31' },
  { name: 'Andromeda II', ra: ra(1, 16, 29.8), dec: dec(33, 25, 9), kly: kpc(652), group: 'm31' },
  { name: 'Andromeda III', ra: ra(0, 35, 33.8), dec: dec(36, 29, 52), kly: kpc(748), group: 'm31' },
  { name: 'Andromeda V', ra: ra(1, 10, 17.1), dec: dec(47, 37, 41), kly: kpc(773), group: 'm31' },
  { name: 'Andromeda VII', ra: ra(23, 26, 31.7), dec: dec(50, 40, 33), kly: kpc(762), group: 'm31' },
  { name: 'IC 10', ra: ra(0, 20, 17.3), dec: dec(59, 18, 14), kly: kpc(794), group: 'm31' },
  { name: 'LGS 3', ra: ra(1, 3, 55), dec: dec(21, 53, 0), kly: kpc(769), group: 'm31' },
]

export type TexMode = 'baked' | 'disk' | 'pa'
export interface GalaxySpec {
  id: string
  name: string
  kind: string
  ra: number
  dec: number
  /** distance, light-years */
  ly: number
  /** visible half-extent of the stellar light, light-years */
  radiusLy: number
  /** manifest id of the image (PLACEHOLDER: procedural, not a Hubble / Webb photograph) */
  tex: string
  /** fraction of the image's half-width that the galaxy's light fills (so the physical size is right) */
  fill: number
  /** baked = the image already shows the galaxy as seen from the Sun; disk = a face-on image laid in the true disc plane (inc, pa); pa = an edge-on image turned to the sky position angle */
  mode: TexMode
  inc?: number
  pa?: number
  zone: 'lg' | 'nearby'
  tint: Rgb
  /** particle halo: number of points (high tier), shape */
  parts: { n: number; shape: 'spiral' | 'ellipsoid' | 'irregular'; arms?: number; thick: number; bulge: number }
  facts: string[]
  /** what the focus panel says about the picture */
  imageNote: string
}
const PLACEHOLDER = 'Picture: a procedural illustration made for this journey, NOT a Hubble or Webb photograph (no images were downloaded).'
/** Galaxies that are objects (clickable, focusable). Sizes: stellar disc radius, rounded. // VERIFY every row */
export const GALAXIES: GalaxySpec[] = [
  { id: 'gx-m31', name: 'Andromeda (M31)', kind: 'Spiral galaxy', ra: ra(0, 42, 44.3), dec: dec(41, 16, 9), ly: 2.5e6, radiusLy: 100e3, tex: 'galaxy-m31', fill: 0.84, mode: 'baked', inc: 77, pa: 38, zone: 'lg', tint: [1, 0.84, 0.62],
    parts: { n: 14000, shape: 'spiral', arms: 2, thick: 0.02, bulge: 0.18 },
    facts: ['2.5 million light-years away', 'Falling toward us at about 110 km/s', 'Roughly a trillion stars // VERIFY', 'Light you see left it before humans existed'], imageNote: PLACEHOLDER },
  { id: 'gx-m33', name: 'Triangulum (M33)', kind: 'Spiral galaxy', ra: ra(1, 33, 50.9), dec: dec(30, 39, 37), ly: 2.73e6, radiusLy: 30e3, tex: 'galaxy-m33', fill: 0.82, mode: 'baked', inc: 54, pa: 23, zone: 'lg', tint: [0.86, 0.9, 1],
    parts: { n: 5000, shape: 'spiral', arms: 2, thick: 0.03, bulge: 0.08 },
    facts: ['2.7 million light-years away', 'Third-largest galaxy of the Local Group', 'About 40 billion stars // VERIFY'], imageNote: PLACEHOLDER },
  { id: 'gx-lmc', name: 'Large Magellanic Cloud', kind: 'Irregular galaxy', ra: ra(5, 23, 34.5), dec: dec(-69, 45, 22), ly: 162e3, radiusLy: 16e3, tex: 'galaxy-irregular', fill: 0.8, mode: 'baked', inc: 35, pa: 0, zone: 'lg', tint: [0.8, 0.88, 1],
    parts: { n: 5000, shape: 'irregular', thick: 0.12, bulge: 0.05 },
    facts: ['162,000 light-years away', 'Orbits the Milky Way; likely to merge with it within about 2 billion years // VERIFY', 'Holds the Tarantula Nebula'], imageNote: PLACEHOLDER },
  { id: 'gx-smc', name: 'Small Magellanic Cloud', kind: 'Dwarf irregular galaxy', ra: ra(0, 52, 44.8), dec: dec(-72, 49, 43), ly: 204e3, radiusLy: 9.5e3, tex: 'galaxy-irregular', fill: 0.8, mode: 'baked', inc: 40, pa: 45, zone: 'lg', tint: [0.82, 0.89, 1],
    parts: { n: 3000, shape: 'irregular', thick: 0.14, bulge: 0.04 },
    facts: ['About 200,000 light-years away', 'Gas bridge links it to the LMC', 'Same placeholder picture as the LMC, rotated'], imageNote: PLACEHOLDER + ' The LMC and SMC share one picture.' },
  // ---- nearby galaxies (Prompt 5 zone 4)
  { id: 'gx-m81', name: 'Bode’s Galaxy (M81)', kind: 'Grand-design spiral', ra: ra(9, 55, 33.2), dec: dec(69, 3, 55), ly: 11.7e6, radiusLy: 45e3, tex: 'galaxy-spiral-face', fill: 0.8, mode: 'disk', inc: 59, pa: 157, zone: 'nearby', tint: [1, 0.9, 0.72],
    parts: { n: 6000, shape: 'spiral', arms: 2, thick: 0.03, bulge: 0.15 },
    facts: ['About 12 million light-years away', 'Leads a group with M82 and about 30 others // VERIFY'], imageNote: PLACEHOLDER },
  { id: 'gx-m82', name: 'Cigar Galaxy (M82)', kind: 'Starburst galaxy', ra: ra(9, 55, 52.2), dec: dec(69, 40, 47), ly: 11.4e6, radiusLy: 18e3, tex: 'galaxy-spiral-edge', fill: 0.84, mode: 'pa', pa: 65, zone: 'nearby', tint: [1, 0.8, 0.6],
    parts: { n: 3000, shape: 'spiral', arms: 2, thick: 0.03, bulge: 0.25 },
    facts: ['About 11–12 million light-years away', 'Forms stars ~ 10× faster than the Milky Way // VERIFY', 'A flyby of M81 set it off'], imageNote: PLACEHOLDER + ' (edge-on placeholder, not M82’s real shape)' },
  { id: 'gx-cena', name: 'Centaurus A (NGC 5128)', kind: 'Peculiar elliptical', ra: ra(13, 25, 27.6), dec: dec(-43, 1, 9), ly: 12.4e6, radiusLy: 30e3, tex: 'galaxy-elliptical', fill: 0.9, mode: 'baked', zone: 'nearby', tint: [1, 0.84, 0.62],
    parts: { n: 6000, shape: 'ellipsoid', thick: 1, bulge: 0.3 },
    facts: ['About 12 million light-years away', 'Nearest radio galaxy: jets from a ~ 55-million-solar-mass black hole // VERIFY', 'A dust lane from a swallowed spiral'], imageNote: PLACEHOLDER + ' (no dust lane in the placeholder)' },
  { id: 'gx-m101', name: 'Pinwheel Galaxy (M101)', kind: 'Face-on spiral', ra: ra(14, 3, 12.6), dec: dec(54, 20, 57), ly: 21e6, radiusLy: 85e3, tex: 'galaxy-spiral-face', fill: 0.8, mode: 'disk', inc: 18, pa: 39, zone: 'nearby', tint: [0.82, 0.9, 1],
    parts: { n: 6000, shape: 'spiral', arms: 2, thick: 0.02, bulge: 0.1 },
    facts: ['About 21 million light-years away // VERIFY (estimates run 20–27)', 'About twice the Milky Way’s width // VERIFY'], imageNote: PLACEHOLDER },
  { id: 'gx-m51', name: 'Whirlpool Galaxy (M51)', kind: 'Interacting spiral', ra: ra(13, 29, 52.7), dec: dec(47, 11, 43), ly: 28e6, radiusLy: 38e3, tex: 'galaxy-spiral-face', fill: 0.8, mode: 'disk', inc: 20, pa: 163, zone: 'nearby', tint: [0.9, 0.92, 1],
    parts: { n: 5000, shape: 'spiral', arms: 2, thick: 0.03, bulge: 0.14 },
    facts: ['About 28 million light-years away', 'Its companion NGC 5195 is tugging its arms'], imageNote: PLACEHOLDER + ' (the companion is not drawn)' },
  { id: 'gx-m104', name: 'Sombrero Galaxy (M104)', kind: 'Edge-on spiral', ra: ra(12, 39, 59.4), dec: dec(-11, 37, 23), ly: 31e6, radiusLy: 25e3, tex: 'galaxy-spiral-edge', fill: 0.84, mode: 'pa', pa: 89, zone: 'nearby', tint: [1, 0.88, 0.66],
    parts: { n: 4000, shape: 'spiral', arms: 2, thick: 0.03, bulge: 0.3 },
    facts: ['About 31 million light-years away', 'A huge bulge and a razor-thin dust lane', 'About 100 billion solar masses of stars // VERIFY'], imageNote: PLACEHOLDER },
  { id: 'gx-n1365', name: 'NGC 1365', kind: 'Barred spiral', ra: ra(3, 33, 36.4), dec: dec(-36, 8, 25), ly: 56e6, radiusLy: 100e3, tex: 'galaxy-spiral-barred', fill: 0.8, mode: 'disk', inc: 40, pa: 220, zone: 'nearby', tint: [0.9, 0.92, 1],
    parts: { n: 7000, shape: 'spiral', arms: 2, thick: 0.03, bulge: 0.18 },
    facts: ['About 56 million light-years away // VERIFY (estimates 55–60)', 'A member of the Fornax cluster // VERIFY'], imageNote: PLACEHOLDER },
]

/** The M87 object (Prompt 5's destination). EHT 2019: mass 6.5e9 Msun, distance 16.8 Mpc (54.8 Mly). */
export const M87D = {
  id: 'gx-m87', name: 'M87', ra: ra(12, 30, 49.4), dec: dec(12, 23, 28), mpc: 16.8, // VERIFY (EHT 2019 adopted 16.8 +- 0.8 Mpc)
  radiusLy: 60e3, rs: 1.92e13, // Schwarzschild radius of 6.5e9 Msun: 2GM/c^2 = 1.92e13 m (128 AU) // VERIFY
  jetPA: 288, jetInc: 17, // jet position angle (deg east of north) and angle to the line of sight (deg) // VERIFY (Walker et al. 2018)
}

/** Virgo cluster members drawn as labelled dots (not clickable): bright ellipticals near M87. Distances ~ 16-18 Mpc. // VERIFY ALL */
export const VIRGO: Array<{ name: string; ra: number; dec: number; mpc: number }> = [
  { name: 'M84', ra: ra(12, 25, 3.7), dec: dec(12, 53, 13), mpc: 16.8 },
  { name: 'M86', ra: ra(12, 26, 11.7), dec: dec(12, 56, 46), mpc: 16.3 },
  { name: 'M49', ra: ra(12, 29, 46.8), dec: dec(8, 0, 2), mpc: 17.1 },
  { name: 'M60', ra: ra(12, 43, 40), dec: dec(11, 33, 9), mpc: 16.5 },
  { name: 'M85', ra: ra(12, 25, 24), dec: dec(18, 11, 28), mpc: 17.9 },
  { name: 'M88', ra: ra(12, 31, 59.2), dec: dec(14, 25, 14), mpc: 16.7 },
  { name: 'M100', ra: ra(12, 22, 54.9), dec: dec(15, 49, 21), mpc: 16.1 },
]
export const VIRGO_CLUSTER = { members: 1300, mpcCentre: 16.5, scaleMpc: 0.5, edgeMpc: 2.0 } // ~ 1,300-2,000 members; // VERIFY
