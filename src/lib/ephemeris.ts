/**
 * Approximate heliocentric positions of the planets, Pluto and Ceres. Pure numbers (no three.js), so it runs in Node tests.
 *
 * PLANETS: E. M. Standish, "Keplerian Elements for Approximate Positions of the Major Planets" (JPL), Table 1, valid 1800-2050 AD.
 * Each element is  value(T) = v0 + rate * T,  T = Julian centuries (TDB ~ UTC here) since J2000.0. Accuracy is arc-minutes for the inner
 * planets, a few arc-minutes to ~0.1 deg for the outer ones: far better than anything visible on screen.
 * // VERIFY: every number in ELEMENTS was typed from memory of that table, NOT copied from the source. Check against the JPL page.
 *
 * Earth = the Earth-Moon barycentre row (it is within ~4,700 km of the Earth's centre: invisible at this scale).
 * CERES is not in Standish's table: osculating-style elements (a, e, i, node, perihelion) + a perihelion date, // VERIFY all, in
 * particular the perihelion date, which sets only Ceres's orbital phase.
 *
 * Output frame: heliocentric ecliptic J2000, x toward the March equinox, z toward ecliptic north, AU.
 */
export const DEG = Math.PI / 180
export const AU_M = 1.495978707e11

export type BodyId = 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto' | 'ceres'

/** [a AU, da/cy, e, de, I deg, dI, L deg, dL, long.peri deg, dw, long.node deg, dO] */
type Row = [number, number, number, number, number, number, number, number, number, number, number, number]
const ELEMENTS: Record<Exclude<BodyId, 'ceres'>, Row> = {
  mercury: [0.38709927, 0.00000037, 0.20563593, 0.00001906, 7.00497902, -0.00594749, 252.2503235, 149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081],
  venus: [0.72333566, 0.0000039, 0.00677672, -0.00004107, 3.39467605, -0.0007889, 181.9790995, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418],
  earth: [1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0.0, 0.0],
  mars: [1.52371034, 0.00001847, 0.0933941, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343],
  jupiter: [5.202887, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714, 34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106],
  saturn: [9.53667594, -0.0012506, 0.05386179, -0.00050991, 2.48599187, 0.00193609, 49.95424423, 1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794],
  uranus: [19.18916464, -0.00196176, 0.04725744, -0.00004397, 0.77263783, -0.00242939, 313.23810451, 428.48202785, 170.9542763, 0.40805281, 74.01692503, 0.04240589],
  neptune: [30.06992276, 0.00026291, 0.00859048, 0.00005105, 1.77004347, 0.00035372, -55.12002969, 218.45945325, 44.96476227, -0.32241464, 131.78422574, -0.00508664],
  pluto: [39.48211675, -0.00031596, 0.2488273, 0.0000517, 17.14001206, 0.00004818, 238.92903833, 145.20780515, 224.06891629, -0.04062942, 110.30393684, -0.01183482],
}
/** Ceres: a AU, e, i deg, node deg, perihelion longitude deg (= node + arg.peri), perihelion JD. // VERIFY all. */
const CERES = { a: 2.7691, e: 0.0760, i: 10.594, node: 80.305, varpi: 153.9, tp: 2458237.5 }

export const jdOf = (d: Date) => d.getTime() / 86400000 + 2440587.5
export const J2000 = 2451545.0

const wrap180 = (x: number) => { x = ((x + 180) % 360 + 360) % 360 - 180; return x }

/** Solve Kepler's equation M = E - e sin E (radians), Newton iteration. */
export function kepler(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI
  for (let k = 0; k < 30; k++) {
    const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= d
    if (Math.abs(d) < 1e-12) break
  }
  return E
}

export interface Orbit { a: number; e: number; I: number; node: number; varpi: number; M: number /* rad */ }

/** Orbital elements (angles in radians, M in radians) of a body at a Julian date. */
export function orbitAt(id: BodyId, jd: number): Orbit {
  if (id === 'ceres') {
    const a = CERES.a
    const n = (2 * Math.PI) / (Math.sqrt(a * a * a) * 365.25636) // rad / day (Kepler's third law, a in AU, period in sidereal years)
    return { a, e: CERES.e, I: CERES.i * DEG, node: CERES.node * DEG, varpi: CERES.varpi * DEG, M: n * (jd - CERES.tp) }
  }
  const r = ELEMENTS[id]
  const T = (jd - J2000) / 36525
  const L = r[6] + r[7] * T, varpi = r[8] + r[9] * T
  return { a: r[0] + r[1] * T, e: r[2] + r[3] * T, I: (r[4] + r[5] * T) * DEG, node: (r[10] + r[11] * T) * DEG, varpi: varpi * DEG, M: wrap180(L - varpi) * DEG }
}

/** Position on an orbit for eccentric anomaly E (AU, heliocentric ecliptic J2000). */
export function orbitPoint(o: Orbit, E: number): [number, number, number] {
  const xp = o.a * (Math.cos(E) - o.e), yp = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E)
  const w = o.varpi - o.node
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(o.node), sO = Math.sin(o.node), cI = Math.cos(o.I), sI = Math.sin(o.I)
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ]
}

export function helioAU(id: BodyId, jd: number): [number, number, number] {
  const o = orbitAt(id, jd)
  return orbitPoint(o, kepler(o.M, o.e))
}

/** Ecliptic J2000 (x equinox, y, z north) -> the app's y-up world (x, z, -y): the same mapping as src/lib/frames.ts. */
export const eclToWorld = (v: [number, number, number]): [number, number, number] => [v[0], v[2], -v[1]]
/** Equatorial J2000 -> ecliptic J2000 (rotate by the mean obliquity). */
export function eqToEcl(v: [number, number, number], obliquityDeg = 23.439291): [number, number, number] {
  const e = obliquityDeg * DEG
  return [v[0], v[1] * Math.cos(e) + v[2] * Math.sin(e), -v[1] * Math.sin(e) + v[2] * Math.cos(e)]
}
/** Unit vector of a rotation pole given in RA/Dec (degrees, J2000), in world axes. */
export function poleWorld(raDeg: number, decDeg: number): [number, number, number] {
  const ra = raDeg * DEG, dec = decDeg * DEG
  return eclToWorld(eqToEcl([Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]))
}
