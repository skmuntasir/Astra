/**
 * Chapter 09 — Search for Life: the pure core (no React, no three.js).
 *
 * Everything the chapter computes lives here so the numbers can be checked without the UI:
 *   1. the habitable-zone model (Kopparapu et al. 2013, 1 Earth-mass planet), as a function of stellar luminosity + Teff
 *   2. the candidate worlds compared with Earth (starlight received, equilibrium temperature, zone status)
 *   3. a SCHEMATIC transmission-spectrum model (real band positions, illustrative depths) and the signal-size arithmetic
 *   4. the "how likely is life elsewhere" arithmetic: a Poisson expectation whose only unknown is one probability
 *   5. static editorial data: the evidence ladder, claims that did not hold, where the search goes next
 *
 * Honesty rule for this chapter: nothing here is a detection. Every number is either a measurement with an error bar
 * (and is marked ≈), a textbook formula, or an explicit assumption the reader can change.
 */
import { EXOPLANET_BY_ID, semiMajorAU } from '@/lib/deepSpace'

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

// ======================================================================================================================
// 1. Stars and the habitable zone
// ======================================================================================================================
export interface StarPreset {
  id: string
  name: string
  type: string
  /** Bolometric luminosity, solar units. */
  lum: number
  /** Effective temperature, K. */
  teff: number
  note: string
}

/** Ordered from dimmest to brightest; the explorer's slider interpolates between neighbours (log L, linear Teff). */
export const STAR_PRESETS: StarPreset[] = [
  {
    id: 'trappist-1', name: 'TRAPPIST-1', type: 'M8 ultracool dwarf', lum: 0.000553, teff: 2566,
    note: 'So faint that its entire habitable zone lies far inside Mercury’s orbit. Worlds there are likely to keep one face to the star, and this star flares often.',
  },
  {
    id: 'proxima', name: 'Proxima Centauri', type: 'M5.5 red dwarf', lum: 0.00155, teff: 3042,
    note: 'The zone sits about a twentieth of an astronomical unit out. Flares can bathe a planet there in far more X-ray and ultraviolet light than Earth receives.',
  },
  {
    id: 'kepler-186', name: 'Kepler-186', type: 'M1 red dwarf', lum: 0.041, teff: 3788,
    note: 'Red dwarfs are roughly three in four stars, so most habitable zones in the Galaxy probably look like this one: close in, and dim and red by our standards.',
  },
  {
    id: 'eps-eri', name: 'Epsilon Eridani', type: 'K2 orange dwarf', lum: 0.34, teff: 5084,
    note: 'Steadier and longer-lived than the Sun’s kind of star in some respects, and calmer than a red dwarf. Some researchers regard orange dwarfs as a favourable compromise.',
  },
  {
    id: 'sun', name: 'The Sun', type: 'G2 yellow dwarf', lum: 1, teff: 5772,
    note: 'The only zone with a known inhabitant. By this model Mars lies inside it, and Venus lies just inside its inner edge: a place in the zone is a candidate, not a verdict.',
  },
  {
    id: 'f5', name: 'A typical F5 dwarf', type: 'F5 dwarf', lum: 2.5, teff: 6500,
    note: 'A wider zone, farther out, but a main-sequence life of only four to five billion years against the Sun’s ten. Earth took most of that long to grow animals.',
  },
]

export interface StarState {
  lum: number
  teff: number
  /** Nearest preset to the slider position. */
  nearest: StarPreset
  nearestIndex: number
}

export function starAt(t: number): StarState {
  const n = STAR_PRESETS.length
  const i = clamp(Math.floor(t), 0, n - 2)
  const f = clamp(t - i, 0, 1)
  const a = STAR_PRESETS[i]
  const b = STAR_PRESETS[i + 1]
  const lum = 10 ** lerp(Math.log10(a.lum), Math.log10(b.lum), f)
  const teff = lerp(a.teff, b.teff, f)
  const nearestIndex = clamp(Math.round(t), 0, n - 1)
  return { lum, teff, nearest: STAR_PRESETS[nearestIndex], nearestIndex }
}

/** Kopparapu et al. (2013), Table 3 coefficients for a 1 Earth-mass planet: [S_eff☉, a, b, c, d]. */
const KOP = {
  recentVenus: [1.7753, 1.4316e-4, 2.9875e-9, -7.5702e-12, -1.1635e-15],
  moistGreenhouse: [1.014, 8.1774e-5, 1.7063e-9, -4.3241e-12, -6.6462e-16],
  maxGreenhouse: [0.3438, 5.8942e-5, 1.6558e-9, -3.0045e-12, -5.2983e-16],
  earlyMars: [0.3179, 5.4513e-5, 1.5313e-9, -2.7786e-12, -4.8997e-16],
} as const

/** The fit is published for 2,600 K ≤ Teff ≤ 7,200 K; outside that range the nearest edge is used. */
export const HZ_FIT_RANGE: [number, number] = [2600, 7200]

/** Critical stellar flux (Earth = 1) at one zone boundary. */
function seff(c: readonly number[], teff: number): number {
  const t = clamp(teff, HZ_FIT_RANGE[0], HZ_FIT_RANGE[1]) - 5780
  return c[0] + c[1] * t + c[2] * t * t + c[3] * t ** 3 + c[4] * t ** 4
}

export interface ZoneFluxes {
  optInner: number
  conInner: number
  conOuter: number
  optOuter: number
}
/** Flux limits (Earth = 1) of the optimistic and conservative zones for a star of this Teff. */
export function zoneFluxes(teff: number): ZoneFluxes {
  return {
    optInner: seff(KOP.recentVenus, teff),
    conInner: seff(KOP.moistGreenhouse, teff),
    conOuter: seff(KOP.maxGreenhouse, teff),
    optOuter: seff(KOP.earlyMars, teff),
  }
}

export interface ZoneEdges {
  optInner: number
  conInner: number
  conOuter: number
  optOuter: number
}
/** Zone edges in AU. */
export function zoneEdges(lum: number, teff: number): ZoneEdges {
  const f = zoneFluxes(teff)
  return {
    optInner: Math.sqrt(lum / f.optInner),
    conInner: Math.sqrt(lum / f.conInner),
    conOuter: Math.sqrt(lum / f.conOuter),
    optOuter: Math.sqrt(lum / f.optOuter),
  }
}

export type ZoneStatus = 'conservative' | 'optimistic' | 'too-hot' | 'too-cold'
export function zoneStatus(flux: number, teff: number): ZoneStatus {
  const f = zoneFluxes(teff)
  if (flux <= f.conInner && flux >= f.conOuter) return 'conservative'
  if (flux <= f.optInner && flux >= f.optOuter) return 'optimistic'
  return flux > f.optInner ? 'too-hot' : 'too-cold'
}
export const ZONE_LABEL: Record<ZoneStatus, string> = {
  conservative: 'Inside the conservative zone',
  optimistic: 'Inside the optimistic zone only',
  'too-hot': 'Too much starlight for the zone',
  'too-cold': 'Too little starlight for the zone',
}

/** Equilibrium temperature (K) for a given flux (Earth = 1) and Earth-like reflectivity (Bond albedo 0.3 → 255 K at 1). */
export const teqFromFlux = (flux: number) => 255 * flux ** 0.25

/** Solar-system reference points for the explorer and the comparison diagram. */
export const SOLAR_REFS = [
  { name: 'Mercury', au: 0.387, radiusE: 0.383 },
  { name: 'Venus', au: 0.723, radiusE: 0.949 },
  { name: 'Earth', au: 1, radiusE: 1 },
  { name: 'Mars', au: 1.524, radiusE: 0.532 },
] as const

// ======================================================================================================================
// 2. Candidate worlds
// ======================================================================================================================
export interface World {
  id: string
  name: string
  host: string
  hostType: string
  ly: number
  lyApprox: boolean
  radiusE: number | null
  massE: number | null
  /** True when massE is a lower limit (non-transiting planets found by radial velocity). */
  massMinimum: boolean
  period: number
  /** Semi-major axis, AU, from Kepler's third law with the host mass used here. */
  au: number
  lum: number
  teff: number
  hostR: number
  /** Starlight received, Earth = 1 (computed here: published values differ by up to ~20 %). */
  flux: number
  teq: number
  status: ZoneStatus
  headline: string
  atmosphere: string
  known: string[]
  unknown: string[]
}

interface WorldInput {
  id: string
  name: string
  host: string
  hostType: string
  ly: number
  lyApprox?: boolean
  radiusE: number | null
  massE: number | null
  massMinimum?: boolean
  period: number
  hostM: number
  hostR: number
  lum: number
  teff: number
  headline: string
  atmosphere: string
  known: string[]
  unknown: string[]
}

function makeWorld(w: WorldInput): World {
  const au = semiMajorAU(w.period, w.hostM)
  const flux = w.lum / (au * au)
  return {
    id: w.id, name: w.name, host: w.host, hostType: w.hostType, ly: w.ly, lyApprox: w.lyApprox ?? false,
    radiusE: w.radiusE, massE: w.massE, massMinimum: w.massMinimum ?? false, period: w.period, au, lum: w.lum, teff: w.teff, hostR: w.hostR,
    flux, teq: teqFromFlux(flux), status: zoneStatus(flux, w.teff),
    headline: w.headline, atmosphere: w.atmosphere, known: w.known, unknown: w.unknown,
  }
}

/** Pull the shared measurements from the Chapter 08 atlas so the two chapters can never disagree about them. */
function fromAtlas(
  id: string,
  extra: Pick<WorldInput, 'lum' | 'teff' | 'headline' | 'atmosphere' | 'known' | 'unknown' | 'massMinimum'>,
): World {
  const e = EXOPLANET_BY_ID[id]
  return makeWorld({
    id: e.id, name: e.name, host: e.host, hostType: e.hostType, ly: e.ly, lyApprox: e.lyApprox,
    radiusE: e.radiusE, massE: e.massE, period: e.period, hostM: e.hostM, hostR: e.hostR, ...extra,
  })
}

export const WORLDS: World[] = [
  fromAtlas('proxima-b', {
    lum: 0.00155, teff: 3042, massMinimum: true,
    headline: 'The nearest candidate, and the one we know least about.',
    atmosphere: 'Not measured. The planet does not transit, so there is no transmission spectrum to take.',
    known: ['Its orbit and a minimum mass of about one Earth, from the star’s wobble.', 'It receives roughly two-thirds of the starlight Earth does.'],
    unknown: ['Its radius, so whether it is rocky at all.', 'Whether it has an atmosphere, in the face of the star’s flares.', 'Whether it keeps one face to the star.'],
  }),
  fromAtlas('trappist-1e', {
    lum: 0.000553, teff: 2566,
    headline: 'Earth-sized, rocky, and the best-studied habitable-zone world.',
    atmosphere:
      'JWST’s first four transits argue against a thick hydrogen-rich or CO₂-dominated atmosphere. A thin nitrogen-rich atmosphere, or none at all, is not yet distinguished; more transits are being collected. Spots on the star contaminate the signal.',
    known: ['Size and mass: close to Earth’s, and consistent with a rocky planet.', 'It lies inside the zone for its star.'],
    unknown: ['Whether it has any atmosphere.', 'Whether it is tidally locked, and how much of its water it has kept through billions of years of flares.'],
  }),
  makeWorld({
    id: 'lhs-1140-b', name: 'LHS 1140 b', host: 'LHS 1140', hostType: 'M4.5 red dwarf', ly: 49, lyApprox: true,
    radiusE: 1.73, massE: 5.6, period: 24.74, hostM: 0.179, hostR: 0.216, lum: 0.0039, teff: 3096,
    headline: 'A larger rocky world, or perhaps a water world, in its star’s zone.',
    atmosphere: 'A 2024 JWST spectrum gave a tentative hint of a nitrogen-rich atmosphere. That is a hint, not an established detection.',
    known: ['Radius and mass are both measured, which gives a density.', 'The density suggests either a rocky world with a large iron core, or one with a lot of water.'],
    unknown: ['Which of those it is.', 'Whether an atmosphere is present, and whether any of it is liquid ocean.'],
  }),
  makeWorld({
    id: 'toi-700-d', name: 'TOI-700 d', host: 'TOI-700', hostType: 'M2 red dwarf', ly: 101, lyApprox: true,
    radiusE: 1.07, massE: null, period: 37.43, hostM: 0.415, hostR: 0.416, lum: 0.0233, teff: 3480,
    headline: 'An Earth-sized world in the zone, found by TESS.',
    atmosphere: 'Not measured.',
    known: ['Radius, about 7 % larger than Earth’s, from its transits.'],
    unknown: ['Mass, so whether it is rocky.', 'Whether it has an atmosphere.'],
  }),
  fromAtlas('kepler-186f', {
    lum: 0.041, teff: 3788,
    headline: 'The first Earth-sized planet found in a zone, 580 light-years away.',
    atmosphere: 'Not measurable with current telescopes: the star is far too faint.',
    known: ['Radius, about 17 % larger than Earth’s.', 'It orbits near the outer edge of its star’s zone.'],
    unknown: ['Mass and composition.', 'Atmosphere. With the Sun’s kind of air it would likely be frozen; a thick greenhouse could change that.'],
  }),
  makeWorld({
    id: 'kepler-442-b', name: 'Kepler-442 b', host: 'Kepler-442', hostType: 'K dwarf', ly: 1200, lyApprox: true,
    radiusE: 1.34, massE: null, period: 112.3, hostM: 0.61, hostR: 0.6, lum: 0.118, teff: 4402,
    headline: 'A larger-than-Earth candidate around an orange dwarf.',
    atmosphere: 'Not measurable with current telescopes.',
    known: ['Radius, about a third larger than Earth’s.'],
    unknown: ['Mass, composition, atmosphere. At 1.3 Earth radii a planet may or may not be rocky.'],
  }),
  fromAtlas('k2-18b', {
    lum: 0.0255, teff: 3457,
    headline: 'Larger than any rocky planet we know, with a hydrogen-rich atmosphere.',
    atmosphere:
      'JWST has detected methane and carbon dioxide. A 2025 report of a possible dimethyl-sulfide signal reached about 3σ; independent re-analyses of the same and further data find the evidence insufficient. It is not an established detection.',
    known: ['Methane and CO₂ in a hydrogen-rich atmosphere.', 'It is 2.6 times Earth’s radius and 8.6 times its mass.'],
    unknown: ['Whether there is a liquid-water ocean under the hydrogen, or a deep, hot interior instead.', 'Whether any biosignature gas is present at all.'],
  }),
  fromAtlas('55-cnc-e', {
    lum: 0.58, teff: 5196,
    headline: 'Rocky, and about 2,400 times Earth’s starlight: a contrast, not a candidate.',
    atmosphere: 'JWST has seen signs of a volatile atmosphere on a world hot enough to melt rock. Included here to show how far outside the zone a planet can be.',
    known: ['A radius of 1.9 Earths and a mass of 8 Earths.', 'A year lasting under eighteen hours.'],
    unknown: ['How an atmosphere survives at all at this temperature.'],
  }),
]
export const WORLD_BY_ID: Record<string, World> = Object.fromEntries(WORLDS.map((w) => [w.id, w]))

export const EARTH_ROW = {
  radiusE: 1, massE: 1, flux: 1, teq: 255, period: 365.25, hostType: 'G2 yellow dwarf', atmosphere: 'Nitrogen 78 %, oxygen 21 %, with water vapour, argon and traces of CO₂, methane and N₂O',
}

/** Radius above which most planets with measured masses are too light to be purely rocky (≈ 1.6 R⊕; Rogers 2015). */
export const ROCKY_LIMIT_RE = 1.6

// ======================================================================================================================
// 3. Atmospheres: schematic transmission spectrum + signal size
// ======================================================================================================================
export type Gas = 'H2O' | 'CO2' | 'O2' | 'O3' | 'CH4' | 'N2O'
export const GAS_LIST: { id: Gas; label: string; role: string }[] = [
  { id: 'H2O', label: 'H₂O', role: 'Water vapour: the habitability context. Not a sign of life.' },
  { id: 'CO2', label: 'CO₂', role: 'Carbon dioxide: abundant on Venus and Mars as well as Earth. Not a sign of life.' },
  { id: 'O2', label: 'O₂', role: 'Oxygen: made by life on Earth, but chemistry can make it too.' },
  { id: 'O3', label: 'O₃', role: 'Ozone: a by-product of oxygen, and easier to see.' },
  { id: 'CH4', label: 'CH₄', role: 'Methane: made by life, and by volcanoes and rock–water chemistry.' },
  { id: 'N2O', label: 'N₂O', role: 'Nitrous oxide: mostly produced by microbes on Earth; weak and hard to see.' },
]

/** One absorption band: centre wavelength (µm), relative strength (0–1) and width in ln λ. Positions are real; strengths are illustrative. */
export interface Band {
  gas: Gas
  um: number
  a: number
  w: number
}
export const BANDS: Band[] = [
  { gas: 'O2', um: 0.69, a: 0.18, w: 0.012 },
  { gas: 'O2', um: 0.76, a: 0.5, w: 0.012 },
  { gas: 'O2', um: 1.27, a: 0.35, w: 0.012 },
  { gas: 'O3', um: 0.6, a: 0.28, w: 0.07 },
  { gas: 'O3', um: 9.6, a: 0.9, w: 0.045 },
  { gas: 'H2O', um: 0.94, a: 0.4, w: 0.03 },
  { gas: 'H2O', um: 1.13, a: 0.45, w: 0.03 },
  { gas: 'H2O', um: 1.4, a: 0.75, w: 0.035 },
  { gas: 'H2O', um: 1.9, a: 0.85, w: 0.04 },
  { gas: 'H2O', um: 2.7, a: 0.95, w: 0.07 },
  { gas: 'H2O', um: 6.3, a: 0.85, w: 0.06 },
  { gas: 'CO2', um: 1.6, a: 0.2, w: 0.015 },
  { gas: 'CO2', um: 2.0, a: 0.5, w: 0.015 },
  { gas: 'CO2', um: 2.7, a: 0.7, w: 0.02 },
  { gas: 'CO2', um: 4.3, a: 1, w: 0.04 },
  { gas: 'CH4', um: 1.65, a: 0.45, w: 0.03 },
  { gas: 'CH4', um: 2.3, a: 0.45, w: 0.03 },
  { gas: 'CH4', um: 3.3, a: 0.9, w: 0.035 },
  { gas: 'CH4', um: 7.7, a: 0.8, w: 0.05 },
  { gas: 'N2O', um: 2.9, a: 0.25, w: 0.025 },
  { gas: 'N2O', um: 4.5, a: 0.55, w: 0.03 },
  { gas: 'N2O', um: 7.8, a: 0.5, w: 0.04 },
]
export const SPECTRUM_RANGE_UM: [number, number] = [0.6, 12]

export interface Composition {
  id: string
  name: string
  /** Mean molecular mass (in atomic mass units); 0 means no atmosphere. */
  mu: number
  /** Fraction of the strong-band height that a band can reach (thin air or high cloud decks lower it). */
  reach: number
  gases: Partial<Record<Gas, number>>
  blurb: string
}
export const COMPOSITIONS: Composition[] = [
  {
    id: 'earth', name: 'Earth today', mu: 29, reach: 1,
    gases: { H2O: 0.8, CO2: 0.35, O2: 0.6, O3: 0.7, CH4: 0.12, N2O: 0.1 },
    blurb: 'Oxygen and ozone together with methane and N₂O: the combination that, on Earth, living things keep supplying.',
  },
  {
    id: 'archean', name: 'Early Earth (~3 Gyr ago)', mu: 29, reach: 1,
    gases: { H2O: 0.7, CO2: 0.5, CH4: 0.6 },
    blurb: 'Life was already here, but there was almost no free oxygen. A biosphere without an oxygen signature: easy to miss.',
  },
  {
    id: 'venus', name: 'Venus-like', mu: 44, reach: 0.45,
    gases: { CO2: 1, H2O: 0.15 },
    blurb: 'A thick carbon-dioxide atmosphere under high cloud decks. Plenty of gas, no biosignature, and the clouds shorten every band.',
  },
  {
    id: 'mars', name: 'Mars-like', mu: 44, reach: 0.12,
    gases: { CO2: 0.5 },
    blurb: 'A thin carbon-dioxide atmosphere. Air this thin barely imprints a spectrum at all.',
  },
  {
    id: 'hydrogen', name: 'Hydrogen-rich', mu: 2.3, reach: 1,
    gases: { H2O: 0.6, CH4: 0.7, CO2: 0.5 },
    blurb: 'A light, puffy atmosphere makes large signals, which is why such planets are easiest to study.',
  },
  {
    id: 'rock', name: 'Bare rock', mu: 0, reach: 0,
    gases: {},
    blurb: 'No atmosphere, no features: a flat line. A thick, high cloud deck also gives a flat line.',
  },
]

export interface LabPlanet {
  id: string
  name: string
  radiusE: number
  massE: number
  teq: number
  hostR: number
  note: string
}
export const LAB_PLANETS: LabPlanet[] = [
  { id: 'earth-sun', name: 'Earth, around the Sun', radiusE: 1, massE: 1, teq: 255, hostR: 1, note: 'A Sun-like star is a hundred times wider than a red dwarf, so the thin ring of air is a tiny fraction of its disc.' },
  { id: 'trappist-1e', name: 'TRAPPIST-1 e', radiusE: 0.92, massE: 0.69, teq: WORLD_BY_ID['trappist-1e'].teq, hostR: 0.1192, note: 'A tiny star makes a small planet’s air as visible as it can be.' },
  { id: 'lhs-1140-b', name: 'LHS 1140 b', radiusE: 1.73, massE: 5.6, teq: WORLD_BY_ID['lhs-1140-b'].teq, hostR: 0.216, note: 'Higher gravity squeezes the atmosphere closer to the ground.' },
  { id: 'k2-18b', name: 'K2-18 b', radiusE: 2.61, massE: 8.6, teq: WORLD_BY_ID['k2-18b'].teq, hostR: 0.445, note: 'A light, hydrogen-rich envelope is the easiest case there is.' },
]

const K_B = 1.380649e-23
const AMU = 1.66054e-27
const R_EARTH_M = 6.371e6
const R_SUN_M = 6.957e8
/** How many scale heights a strong band typically spans in a transmission spectrum (order-of-magnitude rule of thumb). */
export const SCALE_HEIGHTS_SPANNED = 5

/** Atmospheric scale height in km. */
export function scaleHeightKm(p: LabPlanet, mu: number): number {
  if (mu <= 0) return 0
  const g = (9.80665 * p.massE) / (p.radiusE * p.radiusE)
  return (K_B * p.teq) / (mu * AMU * g) / 1000
}
/** Extra transit depth, in ppm, of a strong band: 2 Rp · N·H / Rs². */
export function strongBandPpm(p: LabPlanet, mu: number): number {
  if (mu <= 0) return 0
  const h = scaleHeightKm(p, mu) * 1000
  const rp = p.radiusE * R_EARTH_M
  const rs = p.hostR * R_SUN_M
  return ((2 * rp * SCALE_HEIGHTS_SPANNED * h) / (rs * rs)) * 1e6
}

/** Band-feature strength (0–1+) at wavelength λ for a gas mix. */
export function featureAt(um: number, gases: Partial<Record<Gas, number>>): number {
  const x = Math.log(um)
  let sum = 0
  for (const b of BANDS) {
    const s = gases[b.gas]
    if (!s) continue
    const d = (x - Math.log(b.um)) / b.w
    if (d > -5 && d < 5) sum += s * b.a * Math.exp(-0.5 * d * d)
  }
  return sum
}

/** Model spectrum height (ppm above the continuum). `cloud` 0–1 raises an opaque deck that clips every band. */
export function modelPpm(um: number, gases: Partial<Record<Gas, number>>, peakPpm: number, reach: number, cloud: number): number {
  const ceiling = 1 - 0.9 * clamp(cloud, 0, 1)
  return peakPpm * reach * Math.min(Math.min(1, featureAt(um, gases)), ceiling)
}

/** Deterministic PRNG so the noise doesn’t reshuffle on every slider move. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function gaussian(rand: () => number): number {
  const u = Math.max(1e-12, rand())
  const v = rand()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Assumed noise per spectral bin for ONE transit (ppm). Illustrative: real values depend on the star and the instrument. */
export const SINGLE_TRANSIT_NOISE_PPM = 100

// ======================================================================================================================
// 4. The odds: one unknown probability
// ======================================================================================================================
export const STAR_DENSITY_PER_LY3 = 0.004 // stars per cubic light-year in the Sun's neighbourhood (≈ 0.14 per pc³)

/** Expected number of living worlds in the Galaxy: stars × (habitable-zone rocky planets per star) × P(life | such a planet). */
export const expectedLiving = (stars: number, eta: number, logF: number) => stars * eta * 10 ** logF
/** The probability at which the expectation is exactly one. */
export const breakEvenLog10 = (stars: number, eta: number) => -Math.log10(stars * eta)
/** Chance of at least one if living worlds were scattered independently (Poisson). */
export const pAtLeastOne = (n: number) => 1 - Math.exp(-n)
/** Median distance (ly) to the nearest living world if they were spread through the Galaxy as evenly as stars are near the Sun. */
export const medianNearestLy = (eta: number, logF: number) => Math.cbrt(0.1655 / (STAR_DENSITY_PER_LY3 * eta * 10 ** logF))

/** Upper limit (95 % confidence) on the fraction of worlds with a detectable biosphere after surveying n and finding none. */
export function nullUpperLimit(n: number, efficiency: number, confidence = 0.95): number {
  return clamp((1 - (1 - confidence) ** (1 / Math.max(1, n))) / clamp(efficiency, 0.01, 1), 0, 1)
}

const SUP: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' }
/** 6.3 × 10⁹ style formatting; plain numbers in a readable range. */
export function fmtSci(x: number, digits = 1): string {
  if (!isFinite(x)) return '—'
  if (x === 0) return '0'
  const ax = Math.abs(x)
  if (ax >= 0.01 && ax < 10000) return x < 1 ? x.toPrecision(2) : Math.round(x * 10) / 10 + ''
  const e = Math.floor(Math.log10(ax))
  const m = x / 10 ** e
  const exp = String(e).split('').map((ch) => SUP[ch] ?? ch).join('')
  return `${m.toFixed(digits)} × 10${exp}`
}
export function fmtPow10(logX: number): string {
  const e = Math.round(logX)
  return `10${String(e).split('').map((ch) => SUP[ch] ?? ch).join('')}`
}

// ======================================================================================================================
// 5. Editorial data
// ======================================================================================================================
export interface Rung {
  title: string
  text: string
}
/** A simplified evidence ladder, in the spirit of NASA’s Confidence of Life Detection framework (not that scale itself). */
export const LADDER: Rung[] = [
  { title: 'A signal', text: 'Something in the data that was not predicted: a dip, a band, an excess. At this stage it is only a measurement.' },
  { title: 'Not an artefact', text: 'The instrument, the data reduction and the host star are ruled out as the cause, and other teams, analysing the data independently, see the same thing.' },
  { title: 'Not chemistry or geology', text: 'Every non-biological way of making that signal on that particular planet is tested. This is the longest step, and where most claims stop.' },
  { title: 'The context fits', text: 'The planet’s orbit, size and temperature, and the other gases, make a coherent story: sources, sinks and a place where the signal could be sustained.' },
  { title: 'It repeats', text: 'New observations, with other instruments and at other times, confirm it. A single result, however striking, is not a finding.' },
  { title: 'Consensus, after argument', text: 'The remaining explanations are exhausted, and the community, having tried hard to break it, concludes that life is the best one.' },
]

export interface Case {
  year: string
  title: string
  claim: string
  status: string
  /** How far up the ladder the claim got (our reading; 1–6). No claim of extraterrestrial life has reached 6. */
  rung: number
}
export const CASES: Case[] = [
  {
    year: '1996', title: 'A Martian meteorite',
    claim: 'Microscopic structures in meteorite ALH 84001 were proposed as fossils of Martian microbes.',
    status: 'Not accepted: each feature has a plausible non-biological explanation.',
    rung: 3,
  },
  {
    year: '2003 →', title: 'Methane on Mars',
    claim: 'Methane, which on Earth is largely made by life, has been reported in Mars’s air by several instruments.',
    status: 'Unresolved: surface measurements find small, variable amounts; orbiters have not confirmed it.',
    rung: 2,
  },
  {
    year: '2020', title: 'Phosphine on Venus',
    claim: 'A phosphine absorption was reported in Venus’s clouds, a gas hard to make without life in an oxidised world.',
    status: 'Disputed: later analyses question the detection itself, and no consensus supports it.',
    rung: 2,
  },
  {
    year: '2023–25', title: 'Dimethyl sulfide on K2-18 b',
    claim: 'A faint spectral hint, later reported at about 3σ, was interpreted as dimethyl sulfide, a gas made by marine microbes on Earth.',
    status: 'Not established: independent re-analyses find the evidence insufficient.',
    rung: 2,
  },
  {
    year: '2024–25', title: 'A rock on Mars',
    claim: 'Perseverance found a mudstone with spots and reaction textures, and the team called it a potential biosignature.',
    status: 'Open: the textures can also form without life, and the sample is still on Mars.',
    rung: 3,
  },
]

export interface Next {
  name: string
  who: string
  when: string
  text: string
}
export const NEXT_STEPS: Next[] = [
  { name: 'JWST: rocky worlds', who: 'NASA · ESA · CSA', when: 'Observing now', text: 'Hundreds of hours are going to a single question: do rocky planets around red dwarfs keep atmospheres? That is a prerequisite for everything else on this page.' },
  { name: 'PLATO', who: 'ESA', when: 'Launch targeted for 2027', text: 'A wide field of 26 cameras watching bright, Sun-like stars for years, looking for Earth-sized planets in their zones.' },
  { name: 'Ariel', who: 'ESA', when: 'Planned for the end of the 2020s', text: 'A dedicated survey of the atmospheres of about a thousand known planets, mostly hotter and larger than these.' },
  { name: 'Extremely Large Telescope', who: 'ESO', when: 'Under construction; first light around 2030', text: 'A 39-metre mirror in Chile, able to study the light of nearby planets from the ground.' },
  { name: 'Habitable Worlds Observatory', who: 'NASA', when: 'In study; 2040s', text: 'A telescope designed to block a star’s light and image around twenty-five Earth-sized planets in their zones, and look at the air of each.' },
  { name: 'Closer to home', who: 'NASA · ESA', when: 'Europa Clipper 2030 · JUICE 2031 · Dragonfly planned 2028 launch', text: 'The ocean moons of Jupiter and Titan are habitable-environment candidates inside our own Solar System, reachable by spacecraft.' },
]
