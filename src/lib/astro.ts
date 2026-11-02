/**
 * Chapter 06 astronomy core. Pure maths, no three.js, no network.
 *
 * Everything is computed locally:
 *  - Sun, planets: JPL "Approximate Positions of the Planets" Keplerian elements (Standish, valid 1800–2050; a few
 *    arcminutes, far below what a naked-eye sky needs).
 *  - Moon: the leading terms of Meeus' lunar series (≈ 0.1–0.3°), plus topocentric parallax.
 *  - Precession: IAU 1976. Nutation, aberration, refraction are ignored (all < 0.3°).
 *
 * Frames. "Equatorial J2000" vectors are (x, y, z) = (cos δ cos α, cos δ sin α, sin δ). "Horizontal" vectors are
 * (East, North, Up). Azimuth is measured from North towards East.
 */
export type Vec3 = [number, number, number]
export type Mat3 = [number, number, number, number, number, number, number, number, number]

export const D2R = Math.PI / 180
export const R2D = 180 / Math.PI
const AU_KM = 149_597_870.7
const EARTH_R_KM = 6378.14

export const norm360 = (d: number) => ((d % 360) + 360) % 360
export const norm180 = (d: number) => norm360(d + 180) - 180

export const jdFromMs = (ms: number) => ms / 86_400_000 + 2_440_587.5
export const msFromJd = (jd: number) => (jd - 2_440_587.5) * 86_400_000

export function vecFromRaDec(raDeg: number, decDeg: number): Vec3 {
  const a = raDeg * D2R
  const d = decDeg * D2R
  return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]
}

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

export const mulMat = (a: Mat3, b: Mat3): Mat3 => {
  const r = new Array<number>(9)
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]
  return r as Mat3
}
export const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]
export const apply = (m: Mat3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
]

/** Equatorial J2000 → galactic (IAU 1958 pole, J2000 matrix). */
export const EQ_TO_GAL: Mat3 = [
  -0.0548755604, -0.8734370902, -0.4838350155, 0.4941094279, -0.44482963, 0.7469822445, -0.867666149, -0.1980763734,
  0.4559837762,
]

export const centuries = (jd: number) => (jd - 2_451_545) / 36_525

export function gmstDeg(jd: number): number {
  const d = jd - 2_451_545
  const T = d / 36_525
  return norm360(280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - (T * T * T) / 38_710_000)
}

/** Precession matrix, J2000 equatorial → mean equator of date. */
export function precession(jd: number): Mat3 {
  const T = centuries(jd)
  const as = D2R / 3600
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) * as
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) * as
  const th = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) * as
  const cz = Math.cos(zeta), sz = Math.sin(zeta)
  const cZ = Math.cos(z), sZ = Math.sin(z)
  const ct = Math.cos(th), st = Math.sin(th)
  return [
    cz * ct * cZ - sz * sZ, -sz * ct * cZ - cz * sZ, -st * cZ,
    cz * ct * sZ + sz * cZ, -sz * ct * sZ + cz * cZ, -st * sZ,
    cz * st, -sz * st, ct,
  ]
}

/** J2000 equatorial → horizontal (E, N, U) for an observer at (lat, lon east), at Julian date `jd`. */
export function horizontalMatrix(jd: number, latDeg: number, lonDeg: number): Mat3 {
  const lst = (gmstDeg(jd) + lonDeg) * D2R
  const phi = latDeg * D2R
  const sl = Math.sin(lst), cl = Math.cos(lst), sp = Math.sin(phi), cp = Math.cos(phi)
  const hor: Mat3 = [-sl, cl, 0, -sp * cl, -sp * sl, cp, cp * cl, cp * sl, sp]
  return mulMat(hor, precession(jd))
}

export const altOf = (h: Vec3) => Math.asin(Math.max(-1, Math.min(1, h[2]))) * R2D
export const azOf = (h: Vec3) => norm360(Math.atan2(h[0], h[1]) * R2D)

// ---------------------------------------------------------------------------------------------------------------------
// Planets (heliocentric, ecliptic J2000)
// ---------------------------------------------------------------------------------------------------------------------
type Elements = [number, number, number, number, number, number, number, number, number, number, number, number]
// a, da, e, de, I, dI, L, dL, ϖ, dϖ, Ω, dΩ   (AU, deg; rates per Julian century)
const EL: Record<'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn', Elements> = {
  mercury: [0.38709927, 0.00000037, 0.20563593, 0.00001906, 7.00497902, -0.00594749, 252.2503235, 149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081],
  venus: [0.72333566, 0.0000039, 0.00677672, -0.00004107, 3.39467605, -0.0007889, 181.9790995, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418],
  earth: [1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0, 0],
  mars: [1.52371034, 0.00001847, 0.0933941, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343],
  jupiter: [5.202887, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714, 34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106],
  saturn: [9.53667594, -0.0012506, 0.05386179, -0.00050991, 2.48599187, 0.00193609, 49.95424423, 1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794],
}

function helio(name: keyof typeof EL, T: number): Vec3 {
  const k = EL[name]
  const a = k[0] + k[1] * T
  const e = k[2] + k[3] * T
  const I = (k[4] + k[5] * T) * D2R
  const L = k[6] + k[7] * T
  const wbar = k[8] + k[9] * T
  const Om = (k[10] + k[11] * T) * D2R
  const w = wbar * D2R - Om
  const M = norm180(L - wbar) * D2R
  let E = M + e * Math.sin(M)
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  const xp = a * (Math.cos(E) - e)
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(Om), sO = Math.sin(Om), cI = Math.cos(I), sI = Math.sin(I)
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ]
}

const OBLIQUITY = 23.43929111 * D2R
const eclToEq = (v: Vec3): Vec3 => [
  v[0],
  v[1] * Math.cos(OBLIQUITY) - v[2] * Math.sin(OBLIQUITY),
  v[1] * Math.sin(OBLIQUITY) + v[2] * Math.cos(OBLIQUITY),
]

export type PlanetId = 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn'
export const PLANET_IDS: PlanetId[] = ['mercury', 'venus', 'mars', 'jupiter', 'saturn']
const PLANET_DIAM_KM: Record<PlanetId, number> = { mercury: 4879, venus: 12104, mars: 6779, jupiter: 142984, saturn: 120536 }

export interface BodyState {
  /** Unit vector, equatorial J2000. For the Moon this is geocentric (parallax is applied in the horizontal frame). */
  dir: Vec3
  /** Distance from the observer's planet, km. */
  distKm: number
  mag: number
  /** Illuminated fraction 0–1. */
  illum: number
  /** Angular distance from the Sun, degrees. */
  elong: number
  /** Angular diameter, arcseconds. */
  diamArcsec: number
  /** Heliocentric distance, AU (planets). */
  rAU?: number
}

export interface Ephemeris {
  sunDir: Vec3
  sunDistKm: number
  moon: BodyState & { ageDays: number; waxing: boolean; phase: string }
  planets: Record<PlanetId, BodyState>
}

function planetMag(id: PlanetId, r: number, d: number, iDeg: number): number {
  const l = 5 * Math.log10(r * d)
  switch (id) {
    case 'mercury': return -0.42 + l + 0.038 * iDeg - 0.000273 * iDeg ** 2 + 0.000002 * iDeg ** 3
    case 'venus': return -4.4 + l + 0.0009 * iDeg + 0.000239 * iDeg ** 2 - 0.00000065 * iDeg ** 3
    case 'mars': return -1.52 + l + 0.016 * iDeg
    case 'jupiter': return -9.4 + l + 0.005 * iDeg
    case 'saturn': return -8.9 + l // ring tilt term ignored
  }
}

/** Geocentric ecliptic J2000 position of the Sun, as a vector in AU. */
function sunEcl(T: number): Vec3 {
  const e = helio('earth', T)
  return [-e[0], -e[1], -e[2]]
}

/** Just the Sun's equatorial J2000 direction: cheap, used when scanning the night. */
export function sunDirection(jd: number): Vec3 {
  return unit(eclToEq(sunEcl(centuries(jd))))
}

export function moonPhaseName(illum: number, waxing: boolean): string {
  if (illum < 0.02) return 'New Moon'
  if (illum > 0.98) return 'Full Moon'
  if (Math.abs(illum - 0.5) < 0.04) return waxing ? 'First quarter' : 'Last quarter'
  if (illum < 0.5) return waxing ? 'Waxing crescent' : 'Waning crescent'
  return waxing ? 'Waxing gibbous' : 'Waning gibbous'
}

function moonEq(T: number): { dir: Vec3; distKm: number; lonDeg: number } {
  const Lp = norm360(218.3164477 + 481267.88123421 * T)
  const D = norm360(297.8501921 + 445267.1114034 * T) * D2R
  const M = norm360(357.5291092 + 35999.0502909 * T) * D2R
  const Mp = norm360(134.9633964 + 477198.8675055 * T) * D2R
  const F = norm360(93.272095 + 483202.0175233 * T) * D2R
  const E = 1 - 0.002516 * T - 0.0000074 * T * T
  const A1 = norm360(119.75 + 131.849 * T) * D2R
  const A2 = norm360(53.09 + 479264.29 * T) * D2R
  const A3 = norm360(313.45 + 481266.484 * T) * D2R
  const Lr = Lp * D2R
  const s = Math.sin, c = Math.cos
  const sl =
    6288774 * s(Mp) + 1274027 * s(2 * D - Mp) + 658314 * s(2 * D) + 213618 * s(2 * Mp) - 185116 * E * s(M) - 114332 * s(2 * F) +
    58793 * s(2 * D - 2 * Mp) + 57066 * E * s(2 * D - M - Mp) + 53322 * s(2 * D + Mp) + 45758 * E * s(2 * D - M) -
    40923 * E * s(M - Mp) - 34720 * s(D) - 30383 * E * s(M + Mp) + 15327 * s(2 * D - 2 * F) - 12528 * s(Mp + 2 * F) +
    10980 * s(Mp - 2 * F) + 3958 * s(A1) + 1962 * s(Lr - F) + 318 * s(A2)
  const sb =
    5128122 * s(F) + 280602 * s(Mp + F) + 277693 * s(Mp - F) + 173237 * s(2 * D - F) + 55413 * s(2 * D - Mp + F) +
    46271 * s(2 * D - Mp - F) + 32573 * s(2 * D + F) + 17198 * s(2 * Mp + F) + 9266 * s(2 * D + Mp - F) +
    8822 * s(2 * Mp - F) + 8216 * E * s(2 * D - M - F) + 4324 * s(2 * D - 2 * Mp - F) + 4200 * s(2 * D + Mp + F) -
    2235 * s(Lr) + 382 * s(A3) + 175 * s(A1 - F) + 175 * s(A1 + F) + 127 * s(Lr - Mp) - 115 * s(Lr + Mp)
  const sr =
    -20905355 * c(Mp) - 3699111 * c(2 * D - Mp) - 2955968 * c(2 * D) - 569925 * c(2 * Mp) + 48888 * E * c(M) +
    246158 * c(2 * D - 2 * Mp) - 152138 * E * c(2 * D - M - Mp) - 170733 * c(2 * D + Mp) - 204586 * E * c(2 * D - M) -
    129620 * E * c(M - Mp) + 108743 * c(D) + 104755 * E * c(M + Mp) + 79661 * c(Mp - 2 * F)
  // Longitude/latitude are "of date"; remove general precession in longitude to land on the J2000 ecliptic.
  const lon = norm360(Lp + sl / 1e6 - 1.3969713 * T) * D2R
  const lat = (sb / 1e6) * D2R
  const distKm = 385000.56 + sr / 1000
  const ecl: Vec3 = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]
  return { dir: unit(eclToEq(ecl)), distKm, lonDeg: lon * R2D }
}

export function ephemeris(jd: number): Ephemeris {
  const T = centuries(jd)
  const earth = helio('earth', T)
  const sunV = sunEcl(T)
  const sunDist = Math.hypot(...sunV)
  const sunDir = unit(eclToEq(sunV))

  const planets = {} as Record<PlanetId, BodyState>
  for (const id of PLANET_IDS) {
    const p = helio(id, T)
    const g: Vec3 = [p[0] - earth[0], p[1] - earth[1], p[2] - earth[2]]
    const d = Math.hypot(...g)
    const r = Math.hypot(...p)
    const dir = unit(eclToEq(g))
    const cosI = (r * r + d * d - sunDist * sunDist) / (2 * r * d)
    const iDeg = Math.acos(Math.max(-1, Math.min(1, cosI))) * R2D
    const el = Math.acos(Math.max(-1, Math.min(1, dot(dir, sunDir)))) * R2D
    planets[id] = {
      dir,
      distKm: d * AU_KM,
      mag: planetMag(id, r, d, iDeg),
      illum: (1 + Math.cos(iDeg * D2R)) / 2,
      elong: el,
      diamArcsec: (PLANET_DIAM_KM[id] / (d * AU_KM)) * 206265,
      rAU: r,
    }
  }

  const m = moonEq(T)
  const psi = Math.acos(Math.max(-1, Math.min(1, dot(m.dir, sunDir))))
  const R = sunDist * AU_KM
  const phaseAngle = Math.atan2(R * Math.sin(psi), m.distKm - R * Math.cos(psi))
  const illum = (1 + Math.cos(phaseAngle)) / 2
  // Waxing when the Moon is east of the Sun (ecliptic longitude difference 0–180°).
  const sunLon = Math.atan2(sunV[1], sunV[0]) * R2D
  const dLon = norm360(m.lonDeg - sunLon)
  const waxing = dLon < 180
  const a = phaseAngle // radians
  const mag = -12.73 + 1.49 * Math.abs(a) + 0.043 * a ** 4
  return {
    sunDir,
    sunDistKm: R,
    moon: {
      dir: m.dir,
      distKm: m.distKm,
      mag,
      illum,
      elong: psi * R2D,
      diamArcsec: (3474.8 / m.distKm) * 206265,
      ageDays: (dLon / 360) * 29.530588,
      waxing,
      phase: moonPhaseName(illum, waxing),
    },
    planets,
  }
}

/** Topocentric direction of the Moon (horizontal frame): parallax up to ~1°, important near the horizon. */
export function topocentric(hGeo: Vec3, distKm: number): Vec3 {
  return unit([hGeo[0] * distKm, hGeo[1] * distKm, hGeo[2] * distKm - EARTH_R_KM])
}

// ---------------------------------------------------------------------------------------------------------------------
// Observing sites and "tonight"
// ---------------------------------------------------------------------------------------------------------------------
export interface Site {
  id: string
  name: string
  region: string
  lat: number
  lon: number
  elevM: number
}

export const SITES: Site[] = [
  { id: 'mauna-kea', name: 'Mauna Kea', region: 'Hawaiʻi', lat: 19.8207, lon: -155.4681, elevM: 4207 },
  { id: 'paranal', name: 'Paranal', region: 'Atacama, Chile', lat: -24.6275, lon: -70.4044, elevM: 2635 },
  { id: 'la-palma', name: 'La Palma', region: 'Canary Islands', lat: 28.7569, lon: -17.892, elevM: 2396 },
  { id: 'namib', name: 'NamibRand', region: 'Namibia', lat: -24.97, lon: 15.98, elevM: 1100 },
]

export const fmtLat = (lat: number) => `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`
export const fmtLon = (lon: number) => `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`

/** Local mean time (solar, from longitude only: no time-zone database needed), hours since local midnight. */
export const lmtHours = (ms: number, lonDeg: number) => (((ms / 3_600_000 + lonDeg / 15) % 24) + 24) % 24
export function fmtLmt(ms: number, lonDeg: number): string {
  const total = Math.floor(lmtHours(ms, lonDeg) * 60 + 1e-6) % 1440
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
export function fmtLocalDate(ms: number, lonDeg: number): string {
  const shifted = new Date(ms + (lonDeg / 15) * 3_600_000)
  return shifted.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function sunAltitude(ms: number, site: Site): number {
  const jd = jdFromMs(ms)
  return altOf(apply(horizontalMatrix(jd, site.lat, site.lon), sunDirection(jd)))
}

export interface Night {
  /** Sunset-ish → sunrise-ish, ms epoch. */
  start: number
  end: number
  /** Default view time: 22:00 local mean time, or the middle of the night. */
  at: number
}

/**
 * "Tonight" at a site. Before 06:00 local the night in progress is still tonight; otherwise it is the coming one.
 * The window runs from the Sun crossing −0.83° to it crossing back, sampled every 6 minutes.
 */
export function tonight(site: Site, nowMs: number): Night {
  const lmt = lmtHours(nowMs, site.lon)
  const lastMidnight = nowMs - lmt * 3_600_000
  const anchor = lmt < 6 ? lastMidnight : lastMidnight + 24 * 3_600_000
  const step = 6 * 60_000
  let start = anchor - 6 * 3_600_000
  let end = anchor + 6 * 3_600_000
  let t = anchor
  while (t > anchor - 14 * 3_600_000 && sunAltitude(t, site) < -0.833) t -= step
  if (t > anchor - 14 * 3_600_000) start = t + step
  t = anchor
  while (t < anchor + 14 * 3_600_000 && sunAltitude(t, site) < -0.833) t += step
  if (t < anchor + 14 * 3_600_000) end = t - step
  const pref = anchor - 2 * 3_600_000
  const at = pref > start && pref < end ? pref : (start + end) / 2
  return { start, end, at }
}
