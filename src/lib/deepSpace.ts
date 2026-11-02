/**
 * Chapter 08 — Deep Space: data and pure maths (no three.js, no React).
 *
 * World units are LIGHT-YEARS in the equatorial J2000 frame (x → RA 0h Dec 0°, z → north celestial pole), with the Sun at
 * the origin. Everything named here sits where it really is: the exoplanet hosts, the nebulae, the catalogue stars. The
 * flight is a straight line from the Sun to Kepler-186 (580 ly, Cygnus), parametrised by the log of the remaining distance
 * so that a single scroll gesture covers nine orders of magnitude, from interstellar space to 1.5 AU from another star.
 *
 * Not real (and labelled as such in the UI): the faint star field, the sky glow, the nebula textures, the background
 * galaxy field. Orbital radii of the Kepler-186 system are computed from the periods with Kepler's third law.
 */
import { EQ_TO_GAL, unit, vecFromRaDec, type Vec3 } from '@/lib/astro'
import { smooth } from '@/lib/cosmicScale'

export const AU_PER_LY = 63_241.077
export const LY_PER_AU = 1 / AU_PER_LY
const D2R = Math.PI / 180
/** Radius of the Earth in solar radii, for transit depths. */
const R_EARTH_IN_SUN = 1 / 109.076

// ----- tiny vector helpers (float64 on purpose: the camera sits 1e-5 ly from a star 580 ly from the origin) -----------------
export const vadd = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const vsub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const vscale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const vdot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const vcross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const vlen = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
export const vmix = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
/** Component of `a` perpendicular to unit vector `n`. */
const perp = (a: Vec3, n: Vec3): Vec3 => vsub(a, vscale(n, vdot(a, n)))
/** Rotate `v` about unit axis `k` by `ang` (Rodrigues). */
const rotate = (v: Vec3, k: Vec3, ang: number): Vec3 => {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  return vadd(vadd(vscale(v, c), vscale(vcross(k, v), s)), vscale(k, vdot(k, v) * (1 - c)))
}

/** Galactic frame, in equatorial coordinates (rows of the IAU matrix): X → Galactic Centre, Y → rotation, Z → north pole. */
export const GAL_X: Vec3 = [EQ_TO_GAL[0], EQ_TO_GAL[1], EQ_TO_GAL[2]]
export const GAL_Y: Vec3 = [EQ_TO_GAL[3], EQ_TO_GAL[4], EQ_TO_GAL[5]]
export const GAL_Z: Vec3 = [EQ_TO_GAL[6], EQ_TO_GAL[7], EQ_TO_GAL[8]]

/** Position in ly from RA/Dec (degrees) and distance. */
export const posOf = (raDeg: number, decDeg: number, ly: number): Vec3 => vscale(vecFromRaDec(raDeg, decDeg), ly)

// ======================================================================================================================
// Exoplanets
// ======================================================================================================================
export type Look = 'hot-giant' | 'blue-giant' | 'lava' | 'rocky' | 'temperate' | 'sub-neptune'

export interface Exoplanet {
  id: string
  name: string
  host: string
  hostType: string
  /** Host star radius, solar radii. */
  hostR: number
  /** Host star mass, solar masses. */
  hostM: number
  /** Host star apparent V magnitude (as seen from Earth). */
  hostV: number
  /** Host star B–V colour index. */
  hostBV: number
  ra: number
  dec: number
  /** Distance from the Sun, light-years. */
  ly: number
  /** True when the distance is a rounded or revised figure. */
  lyApprox?: boolean
  year: number
  method: string
  by: string
  /** Orbital period, days. */
  period: number
  /** Planet radius (Earth radii); null when not measured (non-transiting). */
  radiusE: number | null
  /** Planet mass, Earth masses; null when unmeasured. */
  massE: number | null
  /** Mass label (carries "≥" for minimum masses). */
  massLabel: string
  radiusLabel: string
  temp: string
  look: Look
  headline: string
  facts: string[]
  /** Semi-amplitude of the star's reflex velocity, m/s (radial-velocity detections). */
  rvK?: number
  /** Whether the planet transits its star (so a light curve exists). */
  transits: boolean
}

/** Semi-major axis in AU from Kepler's third law (period in days, stellar mass in solar masses). */
export const semiMajorAU = (periodDays: number, massSun: number) => Math.cbrt(massSun * (periodDays / 365.25) ** 2)

export const EXOPLANETS: Exoplanet[] = [
  {
    id: 'proxima-b', name: 'Proxima Centauri b', host: 'Proxima Centauri', hostType: 'M5.5 red dwarf', hostR: 0.154, hostM: 0.122, hostV: 11.1, hostBV: 1.9,
    ra: 217.429, dec: -62.68, ly: 4.2465, year: 2016, method: 'Radial velocity', by: 'Anglada-Escudé et al., HARPS + UVES (Pale Red Dot)',
    period: 11.19, radiusE: null, massE: 1.07, massLabel: '≥ 1.07 Earths', radiusLabel: 'Not measured', temp: '≈ 234 K (equilibrium)', look: 'temperate', transits: false, rvK: 1.2,
    headline: 'The nearest known world beyond the Sun.',
    facts: [
      'It orbits at 0.049 AU, one twentieth of Mercury’s distance from the Sun, and sits in the star’s habitable zone because the star is so dim.',
      'It does not transit, so its radius is unknown. The mass is a minimum: the orbit’s tilt is not known.',
      'Proxima is a flare star. Estimates put the planet’s X-ray dose hundreds of times Earth’s, which clouds the question of an atmosphere.',
      'Voyager 1, at about 17 km/s, would need roughly 75,000 years to cover the 4.25 light-years.',
    ],
  },
  {
    id: 'trappist-1e', name: 'TRAPPIST-1 e', host: 'TRAPPIST-1', hostType: 'M8 ultracool dwarf', hostR: 0.1192, hostM: 0.0898, hostV: 18.8, hostBV: 2.1,
    ra: 346.622, dec: -5.041, ly: 40.7, year: 2017, method: 'Transit', by: 'Gillon et al., TRAPPIST + Spitzer (system announced 2017)',
    period: 6.0996, radiusE: 0.92, massE: 0.69, massLabel: '0.69 Earths', radiusLabel: '0.92 Earths', temp: '≈ 250 K (equilibrium)', look: 'temperate', transits: true,
    headline: 'One of seven Earth-sized worlds around a single, tiny star.',
    facts: [
      'All seven known planets orbit closer to their star than Mercury does to the Sun; the whole system would fit inside Mercury’s orbit.',
      'Planets e, f and g lie in or near the habitable zone. Their masses and radii are measured well enough to say they are rocky.',
      'JWST has measured the heat of the two innermost planets (b and c) and found no thick atmosphere on either.',
      'The star is only about 9 % of the Sun’s mass and is very old, so these worlds have had billions of years of flares.',
    ],
  },
  {
    id: '51-peg-b', name: '51 Pegasi b', host: '51 Pegasi', hostType: 'G-type Sun-like star', hostR: 1.15, hostM: 1.11, hostV: 5.5, hostBV: 0.67,
    ra: 344.366, dec: 20.769, ly: 50.6, lyApprox: true, year: 1995, method: 'Radial velocity', by: 'Mayor & Queloz, ELODIE spectrograph, Haute-Provence',
    period: 4.2308, radiusE: null, massE: 149, massLabel: '≥ 0.47 Jupiters', radiusLabel: 'Not measured', temp: '≈ 1,300 K (equilibrium)', look: 'hot-giant', transits: false, rvK: 55.9,
    headline: 'The first planet found around a Sun-like star.',
    facts: [
      'A Jupiter-mass planet in a four-day orbit was not supposed to exist. It reshaped theories of how planets form and move.',
      'The star wobbles by about 56 m/s, a little faster than a sprinter. That is the signal Mayor and Queloz measured.',
      'The 2019 Nobel Prize in Physics recognised the discovery (shared with James Peebles for cosmology).',
      'You can see 51 Pegasi with the naked eye from a dark site, in Pegasus.',
    ],
  },
  {
    id: 'hd-209458-b', name: 'HD 209458 b', host: 'HD 209458', hostType: 'G0 Sun-like star', hostR: 1.155, hostM: 1.12, hostV: 7.65, hostBV: 0.59,
    ra: 330.795, dec: 18.884, ly: 159, lyApprox: true, year: 1999, method: 'Transit', by: 'Charbonneau et al. and Henry et al.',
    period: 3.5247, radiusE: 15.5, massE: 219, massLabel: '0.69 Jupiters', radiusLabel: '1.38 Jupiters', temp: '≈ 1,450 K (equilibrium)', look: 'hot-giant', transits: true,
    headline: 'The first planet seen crossing its star.',
    facts: [
      'Its 1999 transit proved that the planets found by Doppler wobble were real worlds, and gave the first measurement of a planet’s size.',
      'In 2001–02 Hubble detected sodium in its atmosphere: the first atmosphere found around any exoplanet.',
      'In 2003 Hubble saw a huge cloud of hydrogen streaming off it, an atmosphere being slowly stripped away by the star’s heat.',
      'It is puffed up, far larger than Jupiter for its mass, because it is so close to its star.',
    ],
  },
  {
    id: 'hd-189733-b', name: 'HD 189733 b', host: 'HD 189733', hostType: 'K2 orange dwarf', hostR: 0.75, hostM: 0.8, hostV: 7.67, hostBV: 0.93,
    ra: 300.182, dec: 22.711, ly: 64.5, year: 2005, method: 'Transit', by: 'Bouchy et al.',
    period: 2.2186, radiusE: 12.7, massE: 362, massLabel: '1.14 Jupiters', radiusLabel: '1.13 Jupiters', temp: '≈ 1,200 K (equilibrium)', look: 'blue-giant', transits: true,
    headline: 'A deep blue world, and the first exoplanet with a measured colour.',
    facts: [
      'Hubble’s 2013 measurement of its reflected light showed it to be a deep blue. The colour is not an ocean: the leading explanation is scattering by silicate particles high in the atmosphere.',
      'In 2007 Spitzer made the first temperature map of any exoplanet, showing the hottest point shifted away from the star-facing side by winds.',
      'Its winds blow at around 2 km per second.',
      'On the sky it appears next to the Dumbbell Nebula, which is in truth about twenty times farther away: a coincidence of line of sight.',
    ],
  },
  {
    id: '55-cnc-e', name: '55 Cancri e', host: '55 Cancri A', hostType: 'K0 orange dwarf', hostR: 0.94, hostM: 0.91, hostV: 5.95, hostBV: 0.87,
    ra: 133.149, dec: 28.331, ly: 41, year: 2004, method: 'Radial velocity (transit seen 2011)', by: 'McArthur et al. (transit: Winn et al., Demory et al.)',
    period: 0.7365, radiusE: 1.88, massE: 8.0, massLabel: '8.0 Earths', radiusLabel: '1.88 Earths', temp: '≈ 2,700 K (dayside)', look: 'lava', transits: true,
    headline: 'A rocky world that orbits in under eighteen hours.',
    facts: [
      'It sits at 0.015 AU from its star, so close that its dayside is hot enough to melt rock; its year lasts 17.7 hours.',
      'The first estimate of its period was a wrong alias (2.8 days). A later reanalysis found 0.74 days, and the 2011 transit confirmed it.',
      'It is bright enough that Spitzer mapped its heat, and in 2024 JWST found signs of a volatile atmosphere on a world that hot.',
      'Its host star is visible to the naked eye, so this is a planet circling a star you can see.',
    ],
  },
  {
    id: 'kepler-186f', name: 'Kepler-186 f', host: 'Kepler-186', hostType: 'M1 red dwarf', hostR: 0.47, hostM: 0.48, hostV: 14.9, hostBV: 1.4,
    ra: 298.65, dec: 43.957, ly: 580, lyApprox: true, year: 2014, method: 'Transit', by: 'Quintana et al., Kepler space telescope',
    period: 129.94, radiusE: 1.17, massE: null, massLabel: 'Not measured', radiusLabel: '1.17 Earths', temp: 'Receives ≈ 30 % of Earth’s starlight', look: 'temperate', transits: true,
    headline: 'The first Earth-sized planet found in a habitable zone.',
    facts: [
      'Announced in April 2014, it is the outermost of five known planets. The other four are hot, tightly orbiting worlds of similar size.',
      'It lies near the outer edge of its star’s habitable zone, where water could be liquid only under a thick, warm atmosphere.',
      'The star shines at 15th magnitude: far too faint to see from Earth without a large telescope. This is the destination of the flight above.',
      'Its mass is unknown, so nobody can say whether it is rocky: at this distance, around a star this dim, its pull on the star is out of reach.',
    ],
  },
  {
    id: 'k2-18b', name: 'K2-18 b', host: 'K2-18', hostType: 'M2.5 red dwarf', hostR: 0.445, hostM: 0.5, hostV: 13.5, hostBV: 1.5,
    ra: 172.56, dec: 7.589, ly: 124, lyApprox: true, year: 2015, method: 'Transit', by: 'Montet et al., K2 mission',
    period: 32.94, radiusE: 2.61, massE: 8.6, massLabel: '8.6 Earths', radiusLabel: '2.61 Earths', temp: '≈ 255–270 K (equilibrium)', look: 'sub-neptune', transits: true,
    headline: 'A planet with no counterpart in our system, and a JWST target.',
    facts: [
      'Between Earth and Neptune in size, it belongs to the commonest kind of planet known, one the Solar System does not contain.',
      'In 2019 water vapour was reported in its atmosphere; JWST detected methane and carbon dioxide in 2023.',
      'Whether a liquid ocean lies beneath the hydrogen-rich atmosphere is debated. A tentative 2025 claim of a further molecule was not confirmed by later analyses.',
      'It is a reminder of how the field works: each detection is a measurement with an error bar, tested by other teams.',
    ],
  },
]

export const EXOPLANET_BY_ID: Record<string, Exoplanet> = Object.fromEntries(EXOPLANETS.map((e) => [e.id, e]))

/** Transit depth (Rp/Rs)², as a fraction, or null if the radius is unknown. */
export function transitDepth(e: Exoplanet): number | null {
  if (e.radiusE === null || !e.transits) return null
  const ratio = (e.radiusE * R_EARTH_IN_SUN) / e.hostR
  return ratio * ratio
}
/** Full (central) transit duration in hours: P/π · Rs/a. */
export function transitHours(e: Exoplanet): number | null {
  if (!e.transits) return null
  const a = semiMajorAU(e.period, e.hostM) // AU
  const rsAU = e.hostR * 0.00465047
  return ((e.period / Math.PI) * (rsAU / a)) * 24
}
export const orbitAU = (e: Exoplanet) => semiMajorAU(e.period, e.hostM)
/** Year the light we receive today left the star (approximate). */
export const lightLeft = (ly: number, year: number) => Math.round(year - ly)

// ======================================================================================================================
// The route: Sun → Kepler-186, and the Kepler-186 system
// ======================================================================================================================
const K186 = EXOPLANET_BY_ID['kepler-186f']
export const TARGET_NAME = 'Kepler-186'
export const TARGET_LY = K186.ly
export const TARGET_POS: Vec3 = posOf(K186.ra, K186.dec, K186.ly)
/** Unit vector from the Sun toward the target. */
export const ROUTE_DIR: Vec3 = unit(TARGET_POS)
/** Absolute V magnitude of the target star, from its apparent magnitude and distance. */
export const TARGET_ABS_MAG = K186.hostV - 5 * Math.log10(K186.ly / 32.616)
export const TARGET_BV = K186.hostBV
export const TARGET_TEFF = 3788

export interface SystemPlanet {
  id: string
  name: string
  period: number
  radiusE: number
  /** Orbital phase at t = 0, radians (arbitrary). */
  phase: number
}
// Quintana et al. 2014 / Torres et al. 2015 (periods in days, radii in Earth radii).
export const SYSTEM_PLANETS: SystemPlanet[] = [
  { id: 'b', name: 'Kepler-186 b', period: 3.8867, radiusE: 1.07, phase: 0.6 },
  { id: 'c', name: 'Kepler-186 c', period: 7.2674, radiusE: 1.25, phase: 2.4 },
  { id: 'd', name: 'Kepler-186 d', period: 13.3429, radiusE: 1.4, phase: 4.1 },
  { id: 'e', name: 'Kepler-186 e', period: 22.4077, radiusE: 1.27, phase: 1.2 },
  { id: 'f', name: 'Kepler-186 f', period: 129.944, radiusE: 1.17, phase: 3.3 },
]
export const SYSTEM_AU = SYSTEM_PLANETS.map((p) => semiMajorAU(p.period, K186.hostM))
/** Approximate habitable zone of a 3,800 K star of luminosity ≈ 0.041 Suns: flux limits ≈ 0.9 (inner) and ≈ 0.25 (outer) of Earth's. */
const L_STAR = 0.041
export const HZ_AU: [number, number] = [Math.sqrt(L_STAR / 0.9), Math.sqrt(L_STAR / 0.25)]
/** One second of the animation is one day in the Kepler-186 system. */
export const DAYS_PER_SECOND = 1

// ----- camera path ---------------------------------------------------------------------------------------------------
/** Scroll progress → remaining distance to the target (ly). Log-interpolated between knots. */
const D_KNOTS: ReadonlyArray<readonly [number, number]> = [
  [0, TARGET_LY],
  [0.07, 573],
  [0.2, 500],
  [0.36, 180],
  [0.52, 20],
  [0.66, 0.8],
  [0.78, 0.012],
  [0.9, 0.00006],
  [0.97, 1.5 * LY_PER_AU],
  [1, 1.4 * LY_PER_AU],
]
export function distanceAt(p: number): number {
  const x = Math.min(1, Math.max(0, p))
  for (let i = 1; i < D_KNOTS.length; i++) {
    if (x <= D_KNOTS[i][0]) {
      const t = (x - D_KNOTS[i - 1][0]) / (D_KNOTS[i][0] - D_KNOTS[i - 1][0])
      const a = Math.log(D_KNOTS[i - 1][1])
      const b = Math.log(D_KNOTS[i][1])
      return Math.exp(a + (b - a) * t)
    }
  }
  return D_KNOTS[D_KNOTS.length - 1][1]
}

/** The orbital plane of the Kepler-186 system (arbitrary but fixed: inclined to the line of approach). */
const U_REF = unit(perp(GAL_Z, ROUTE_DIR))
export const PLANE_N: Vec3 = unit(vadd(vscale(ROUTE_DIR, -0.62), vscale(U_REF, 0.78)))
const APPROACH_IN_PLANE = unit(perp(vscale(ROUTE_DIR, -1), PLANE_N))
export const PLANE_E1: Vec3 = APPROACH_IN_PLANE
export const PLANE_E2: Vec3 = unit(vcross(PLANE_N, PLANE_E1))
const FINAL_ELEV = 31 * D2R
const FINAL_AZ = 62 * D2R
const FINAL_DIR: Vec3 = unit(
  vadd(vscale(vadd(vscale(PLANE_E1, Math.cos(FINAL_AZ)), vscale(PLANE_E2, Math.sin(FINAL_AZ))), Math.cos(FINAL_ELEV)), vscale(PLANE_N, Math.sin(FINAL_ELEV))),
)

export interface Pose {
  pos: Vec3
  fwd: Vec3
  up: Vec3
  right: Vec3
  /** Remaining distance to the target (ly). */
  dTarget: number
  /** 0 = deep field, 1 = fully swung into the system view. */
  swing: number
}
export const P_SWING: [number, number] = [0.8, 0.975]

/** The camera pose at scroll progress p. `look` adds a small yaw/pitch (radians) for cursor look-around. */
export function poseAt(p: number, yaw = 0, pitchIn = 0): Pose {
  let pitch = pitchIn
  const d = distanceAt(p)
  const swing = smooth(P_SWING[0], P_SWING[1], p)
  const off: Vec3 = unit(vmix(vscale(ROUTE_DIR, -1), FINAL_DIR, swing))
  const pos = vadd(TARGET_POS, vscale(off, d))
  let fwd = vscale(off, -1)
  const upRef = unit(vmix(GAL_Z, PLANE_N, swing))
  let up = unit(perp(upRef, fwd))
  let right = vcross(fwd, up)
  // A slow look upward out of the disc while the extragalactic sky is shown (beat 4), easing back before the approach.
  const lift = 0.3 * (smooth(0.54, 0.62, p) - smooth(0.72, 0.8, p))
  pitch += lift
  if (yaw || pitch) {
    fwd = unit(rotate(fwd, up, yaw))
    right = unit(rotate(right, up, yaw))
    fwd = unit(rotate(fwd, right, pitch))
    up = unit(vcross(right, fwd))
  }
  return { pos, fwd, up, right, dTarget: d, swing }
}

/** Perspective projection of a world point for DOM labels. Returns CSS-pixel position (relative to the canvas) and depth. */
export function projectToScreen(
  world: Vec3, pose: Pose, tanX: number, tanY: number, shiftX: number, shiftY: number, w: number, h: number,
): { x: number; y: number; z: number } {
  const rel = vsub(world, pose.pos)
  const z = vdot(rel, pose.fwd)
  if (z <= 1e-12) return { x: -1e5, y: -1e5, z }
  const nx = vdot(rel, pose.right) / (z * tanX) + shiftX
  const ny = vdot(rel, pose.up) / (z * tanY) + shiftY
  return { x: (nx * 0.5 + 0.5) * w, y: (1 - (ny * 0.5 + 0.5)) * h, z }
}

// ----- formatting ----------------------------------------------------------------------------------------------------
export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US')
/** Distances in the HUD: light-years above 0.5, astronomical units below. */
export function fmtDist(ly: number): string {
  if (ly >= 100) return `${fmtInt(ly)} ly`
  if (ly >= 10) return `${ly.toFixed(1)} ly`
  if (ly >= 0.5) return `${ly.toFixed(2)} ly`
  const au = ly * AU_PER_LY
  if (au >= 1000) return `${fmtInt(au)} AU`
  if (au >= 100) return `${au.toFixed(0)} AU`
  if (au >= 10) return `${au.toFixed(1)} AU`
  return `${au.toFixed(2)} AU`
}
export const fmtLy = (ly: number) => (ly < 10 ? `${ly.toFixed(ly < 5 ? 2 : 1)} ly` : `${fmtInt(ly)} ly`)

// ======================================================================================================================
// Nebulae (real positions and sizes; the textures are procedural)
// ======================================================================================================================
export interface Nebula {
  id: string
  name: string
  ra: number
  dec: number
  ly: number
  /** Full extent, light-years. */
  size: number
  aspect: number
  rot: number
  mode: 0 | 1 | 2
  /** Three palette colours (linear-ish RGB). */
  a: [number, number, number]
  b: [number, number, number]
  c: [number, number, number]
  gain: number
  seed: number
  kind: string
}
const H_ALPHA: [number, number, number] = [0.9, 0.16, 0.2]
const OIII: [number, number, number] = [0.1, 0.62, 0.62]
const BLUE: [number, number, number] = [0.25, 0.4, 0.95]
export const NEBULAE: Nebula[] = [
  { id: 'north-america', name: 'North America Nebula', ra: 314.81, dec: 44.53, ly: 2590, size: 90, aspect: 1.2, rot: 0.5, mode: 0, a: H_ALPHA, b: [0.95, 0.4, 0.35], c: BLUE, gain: 0.5, seed: 3.1, kind: 'Emission nebula' },
  { id: 'veil', name: 'Veil Nebula', ra: 312.2, dec: 30.7, ly: 2400, size: 125, aspect: 1, rot: 0, mode: 1, a: OIII, b: BLUE, c: H_ALPHA, gain: 0.55, seed: 8.4, kind: 'Supernova remnant' },
  { id: 'crescent', name: 'Crescent Nebula', ra: 303.0, dec: 38.35, ly: 5000, size: 36, aspect: 0.75, rot: 0.9, mode: 1, a: OIII, b: H_ALPHA, c: BLUE, gain: 0.7, seed: 5.7, kind: 'Wolf–Rayet bubble' },
  { id: 'dumbbell', name: 'Dumbbell Nebula', ra: 299.9, dec: 22.72, ly: 1360, size: 3.2, aspect: 1.35, rot: 0.3, mode: 2, a: OIII, b: H_ALPHA, c: [0.9, 0.9, 1], gain: 1.0, seed: 1.3, kind: 'Planetary nebula' },
]

// ======================================================================================================================
// On-screen labels in the flight
// ======================================================================================================================
export type LabelKind = 'star' | 'host' | 'nebula' | 'target'
export interface SceneLabel {
  id: string
  kind: LabelKind
  name: string
  /** Static second line (distance from the Sun) or null for a live one. */
  sub: string
  pos: Vec3
  /** [in0, in1, out0, out1] in scroll progress. */
  w: [number, number, number, number]
  /** Label sits to the right (+1) or left (-1) of its marker. */
  side: 1 | -1
}
const hostLabel = (id: string, w: [number, number, number, number], side: 1 | -1 = 1): SceneLabel => {
  const e = EXOPLANET_BY_ID[id]
  return { id, kind: 'host', name: e.host, sub: `${fmtLy(e.ly)} · ${e.name}`, pos: posOf(e.ra, e.dec, e.ly), w, side }
}
export const SCENE_LABELS: SceneLabel[] = [
  { id: 'vega', kind: 'star', name: 'Vega', sub: '25 ly', pos: posOf(279.235, 38.784, 25), w: [0.1, 0.16, 0.3, 0.38], side: 1 },
  { id: 'altair', kind: 'star', name: 'Altair', sub: '17 ly', pos: posOf(297.696, 8.868, 16.7), w: [0.12, 0.18, 0.28, 0.36], side: -1 },
  hostLabel('51-peg-b', [0.3, 0.37, 0.52, 0.6], -1),
  hostLabel('hd-189733-b', [0.32, 0.39, 0.55, 0.63], 1),
  hostLabel('hd-209458-b', [0.34, 0.41, 0.55, 0.63], -1),
  { id: 'dumbbell', kind: 'nebula', name: 'Dumbbell Nebula', sub: '1,360 ly · planetary nebula', pos: posOf(299.9, 22.72, 1360), w: [0.4, 0.46, 0.6, 0.68], side: 1 },
  { id: 'north-america', kind: 'nebula', name: 'North America Nebula', sub: '≈ 2,600 ly · emission nebula', pos: posOf(314.81, 44.53, 2590), w: [0.42, 0.48, 0.62, 0.7], side: 1 },
  { id: 'veil', kind: 'nebula', name: 'Veil Nebula', sub: '≈ 2,400 ly · supernova remnant', pos: posOf(312.2, 30.7, 2400), w: [0.44, 0.5, 0.62, 0.7], side: 1 },
  { id: 'target', kind: 'target', name: TARGET_NAME, sub: '580 ly · magnitude 14.9', pos: TARGET_POS, w: [0.3, 0.38, 0.8, 0.86], side: 1 },
]

// ======================================================================================================================
// Text
// ======================================================================================================================
export interface Beat {
  label: string
  title: string
  line: string
  /** [in0, in1, out0, out1] */
  w: [number, number, number, number]
}
export const BEATS: Beat[] = [
  {
    label: 'Interstellar space',
    title: 'The chart ends at the edge of the page. The sky does not.',
    line: 'We start where the Sun’s wind gives out. The Sun sits inside the Local Bubble, a cavity of thin, hot gas about 300 light-years across. Out here a cubic centimetre holds roughly one atom: thinner than any laboratory vacuum.',
    w: [0.03, 0.08, 0.15, 0.2],
  },
  {
    label: 'The neighbourhood',
    title: 'Every point of light is a sun.',
    line: 'The nearest, Proxima Centauri, is 4.25 light-years away. Voyager 1, travelling at 17 km/s, would need about 75,000 years to reach it. Here the same distance passes in a few turns of the scroll wheel.',
    w: [0.2, 0.25, 0.32, 0.38],
  },
  {
    label: 'Looking back in time',
    title: 'The light is older than the picture.',
    line: 'Starlight takes one year for every light-year it crosses. The glow ahead in Cygnus, with its clouds of glowing hydrogen, left its sources centuries to millennia ago. Distance is also time.',
    w: [0.4, 0.46, 0.55, 0.6],
  },
  {
    label: 'Beyond the disc',
    title: 'Look away from the plane and other galaxies appear.',
    line: 'The Milky Way’s dust hides most of the universe behind it. Where the dust thins, faint smudges show: each one a galaxy of billions of stars, millions to billions of light-years away. Their shapes here are illustrative.',
    w: [0.6, 0.65, 0.7, 0.75],
  },
  {
    label: 'A distant sun',
    title: 'Kepler-186: five planets, 580 light-years away.',
    line: 'A red dwarf in Cygnus, too faint for the naked eye by a factor of thousands. In 2014 the Kepler telescope found the dimming of its light as five Earth-sized worlds crossed in front.',
    w: [0.75, 0.8, 0.86, 0.9],
  },
  {
    label: 'A system, to scale',
    title: 'The outermost world sits near the edge of the habitable zone.',
    line: 'Orbits are drawn to true scale and the planets are not: at this scale each would be far smaller than a pixel. One second here is one day there. The faint band marks where liquid water could, in principle, persist.',
    w: [0.91, 0.95, 1.1, 1.2],
  },
]

export interface Milestone {
  year: number
  title: string
  line: string
}
export const MILESTONES: Milestone[] = [
  { year: 1992, title: 'The first planets', line: 'Wolszczan and Frail find planets around the pulsar PSR B1257+12, about 2,300 light-years away: the first confirmed worlds outside the Solar System.' },
  { year: 1995, title: '51 Pegasi b', line: 'A Jupiter-mass planet in a four-day orbit around a Sun-like star, found by its Doppler pull on the star.' },
  { year: 1999, title: 'The first transit', line: 'HD 209458 b is seen crossing its star. For the first time a planet’s size can be measured.' },
  { year: 2009, title: 'Kepler launches', line: 'A telescope that stares at one patch of sky in Cygnus for years, watching 150,000 stars for the faint dips of passing planets.' },
  { year: 2014, title: 'An Earth-sized habitable-zone planet', line: 'Kepler-186 f: the first planet of Earth’s size found in the habitable zone of another star.' },
  { year: 2016, title: 'Proxima b', line: 'A planet around the nearest star, found as a 1 m/s wobble in its light.' },
  { year: 2017, title: 'TRAPPIST-1', line: 'Seven Earth-sized planets around one dwarf star, 40 light-years away.' },
  { year: 2022, title: '5,000 confirmed', line: 'The NASA Exoplanet Archive passes five thousand confirmed planets. The first JWST science results follow in the summer.' },
  { year: 2025, title: '6,000 confirmed', line: 'The tally passes six thousand in September. On the Archive’s own count it stands near 6,300 today.' },
]

/** Confirmed planets by discovery method (NASA Exoplanet Archive tally; rounded). */
export const METHOD_COUNTS: { name: string; n: number; note: string }[] = [
  { name: 'Transit', n: 4653, note: 'Starlight dims as a planet crosses the star.' },
  { name: 'Radial velocity', n: 1186, note: 'The star wobbles toward and away from us.' },
  { name: 'Microlensing', n: 278, note: 'A planet bends light from a background star.' },
  { name: 'Direct imaging', n: 97, note: 'The planet itself is photographed, usually a young giant far from its star.' },
]
export const TOTAL_CONFIRMED = 6298
