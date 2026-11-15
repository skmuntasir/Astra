import { AU_M, helioAU, eclToWorld, jdOf } from '@/lib/ephemeris'
import { LY, SUN_G, eqDir, ra, dec, add3, mul3 } from '../galactic/units'
import type { V3 } from '@/engine/journey'

/**
 * Final series 5c: the numbers of the extra content (Voyager 1 and 2, Orion Nebula, Crab Nebula + pulsar, Sagittarius A*).
 * Pure (no three.js), so tests/content.test.ts can run it in Node. Every number that was not re-checked is marked // VERIFY and listed in docs/STATUS.md.
 */

// ------------------------------------------------------------------------------------------------ Voyager
export const C_KM_S = 299792.458
export const LIGHT_DAY_AU = (C_KM_S * 86400 * 1000) / AU_M // 173.14 AU: one light-day

/** NASA/JPL (mission status, June 2026): Voyager 1 is exactly one light-day (25,902,068,356 km) FROM EARTH at this instant. */
export const LIGHT_DAY_EPOCH = new Date(Date.UTC(2026, 10, 18, 10, 16, 7))
export const LIGHT_DAY_KM = 25902068356

export interface VoyagerSpec {
  id: 'voyager-1' | 'voyager-2'
  name: string
  launch: string
  /** flybys: [body, date] (real encounter dates) */
  flybys: Array<['earth' | 'jupiter' | 'saturn' | 'uranus' | 'neptune', string]>
  /** direction FROM THE SUN, equatorial J2000 (degrees). Approximate: Heavens-Above / Sky&Telescope / theSkyLive (geocentric, <= 0.4 deg parallax). // VERIFY */
  raDeg: number
  decDeg: number
  /** heliocentric distance at EPOCH (AU) and speed (AU per year). // VERIFY: derived, see note below */
  r0AU: number
  vAUyr: number
  crossed: { date: string; au: number }
  color: [number, number, number]
}
/**
 * DISTANCES (honest derivation). NASA states Voyager 1 is 25,902,068,356 km = 173.14 AU from EARTH on 2026-11-18 10:16:07 UTC. Earth is ~1 AU off the
 * Sun, so the distance from the Sun is r = sqrt(1 + d^2 + 2 d cos(angle Earth-Sun-line vs Voyager direction)): with Earth at ecliptic longitude ~56 deg,
 * Voyager 1 at lon ~258 deg, lat +35 deg this gives ~172.4 AU. Voyager 2: Heavens-Above (early 2026) gives 142.4 AU from Earth, ~141.6 AU from the Sun,
 * moved forward at 3.25 AU/yr to the epoch: ~144.3 AU. Speeds: Heavens-Above 3.569 and 3.219 AU/yr (JPL: ~17.0 and ~15.4 km/s).
 * From the epoch the page extrapolates at constant speed to the day the page is opened (the real probes decelerate by a negligible amount);
 * NASA's mission-status page is the authority. All of this is // VERIFY and an estimate good to a few tenths of an AU.
 */
export const VOYAGERS: VoyagerSpec[] = [
  {
    id: 'voyager-1', name: 'Voyager 1', launch: '1977-09-05',
    flybys: [['earth', '1977-09-05'], ['jupiter', '1979-03-05'], ['saturn', '1980-11-12']],
    raDeg: ra(17, 14, 38), decDeg: dec(12, 22, 0), r0AU: 172.4, vAUyr: 3.569, crossed: { date: '2012-08-25', au: 121 }, color: [1.0, 0.82, 0.5],
  },
  {
    id: 'voyager-2', name: 'Voyager 2', launch: '1977-08-20',
    flybys: [['earth', '1977-08-20'], ['jupiter', '1979-07-09'], ['saturn', '1981-08-26'], ['uranus', '1986-01-24'], ['neptune', '1989-08-25']],
    raDeg: ra(20, 10, 30), decDeg: dec(-59, 45, 0), r0AU: 144.3, vAUyr: 3.219, crossed: { date: '2018-11-05', au: 119 }, color: [0.62, 0.86, 1.0],
  },
]
export const YEAR_MS = 365.25 * 86400 * 1000
/** The date the model is evaluated for: the day the page is opened (never earlier than mid-2026, so a wrong clock cannot put a probe inside the heliopause). */
export const NOW = new Date(Math.max(Date.now(), Date.UTC(2026, 5, 1)))

export const rAUat = (v: VoyagerSpec, when: Date = NOW) => v.r0AU + (v.vAUyr * (when.getTime() - LIGHT_DAY_EPOCH.getTime())) / YEAR_MS
/** unit direction (world frame) from the Sun toward the probe */
export const dirOf = (v: VoyagerSpec): V3 => eqDir(v.raDeg, v.decDeg)
/** global position (metres) at a date */
export function voyagerPos(v: VoyagerSpec, when: Date = NOW): V3 { return add3(SUN_G, mul3(dirOf(v), rAUat(v, when) * AU_M)) }
export const lightHoursFromSun = (v: VoyagerSpec, when: Date = NOW) => (rAUat(v, when) * AU_M) / (C_KM_S * 1000) / 3600

/** Trajectory through the real flyby positions (ephemeris at each encounter date), then out to the probe. Points in LIGHT-YEARS relative to the Sun, world axes. */
export function trajectoryLy(v: VoyagerSpec, when: Date = NOW): V3[] {
  const pts: V3[] = []
  for (const [body, date] of v.flybys) {
    const e = helioAU(body, jdOf(new Date(date + 'T12:00:00Z')))
    const w = eclToWorld(e)
    pts.push([(w[0] * AU_M) / LY, (w[1] * AU_M) / LY, (w[2] * AU_M) / LY])
  }
  const d = dirOf(v), r = (rAUat(v, when) * AU_M) / LY
  pts.push([d[0] * r, d[1] * r, d[2] * r])
  return pts
}
/** Centripetal-ish Catmull-Rom through the points (n samples per span). */
export function smoothPath(p: V3[], n = 24): V3[] {
  const out: V3[] = []
  const P = (i: number) => p[Math.min(p.length - 1, Math.max(0, i))]
  for (let i = 0; i < p.length - 1; i++) {
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t
      const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2)
      out.push([0, 1, 2].map((j) => 0.5 * (2 * b[j] + (-a[j] + c[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t2 + (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * t3)) as V3)
    }
  }
  out.push(p[p.length - 1])
  return out
}

/** Text for the one-light-day line, computed from the date the page is opened. */
export function lightDayLine(now: Date = NOW): string {
  const when = LIGHT_DAY_EPOCH.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  const days = (LIGHT_DAY_EPOCH.getTime() - now.getTime()) / 86400000
  if (days > 1) return `Voyager 1 reaches one light-day from Earth (173 AU, 25.9 billion km) on 18 Nov 2026, in about ${Math.round(days)} days (NASA/JPL: ${when}).`
  if (days > -0.0001) return `Voyager 1 reaches one light-day from Earth (173 AU, 25.9 billion km) today, 18 Nov 2026, at ${when} (NASA/JPL).`
  return `Voyager 1 passed one light-day from Earth (173 AU, 25.9 billion km) on 18 Nov 2026 (NASA/JPL: ${when}), the first human-made object to do so.`
}

// ------------------------------------------------------------------------------------------------ nebulae
export interface NebulaSpec { id: string; name: string; raDeg: number; decDeg: number; ly: number; radiusLy: number }
/** Orion Nebula (M42): RA 05h35m17.3s, Dec -05d23m28s, 1,344 +- 20 ly, ~24 ly across (several sources, checked online 2026-11-14). */
export const ORION: NebulaSpec = { id: 'gx-orion', name: 'Orion Nebula', raDeg: ra(5, 35, 17.3), decDeg: dec(-5, 23, 28), ly: 1344, radiusLy: 12 }
/** Crab Nebula (M1): RA 05h34m31.97s, Dec +22d00m52s, ~6,500 ly (2.0 +- 0.5 kpc), ~11 ly across (checked online 2026-11-14). */
export const CRAB: NebulaSpec = { id: 'gx-crab', name: 'Crab Nebula', raDeg: ra(5, 34, 31.97), decDeg: dec(22, 0, 52), ly: 6500, radiusLy: 5.5 }
export const nebulaPos = (n: NebulaSpec): V3 => add3(SUN_G, mul3(eqDir(n.raDeg, n.decDeg), n.ly * LY))

/** Crab pulsar: real period ~33.8 ms (33.09 ms in 1969, growing 38 ns per day: ~+0.76 ms in 57 yr) // VERIFY; shown 74 times slower. */
export const PULSAR_PERIOD_MS = 33.8
export const PULSAR_SHOWN_S = 2.5
export const PULSAR_SLOWDOWN = Math.round((PULSAR_SHOWN_S * 1000) / PULSAR_PERIOD_MS) // 74

/** Sagittarius A*: RA 17h45m40.04s Dec -29d00m28.1s; 4.3 million Suns (GRAVITY 2022: 4.297 +- 0.012 +- 0.040); EHT image 12 May 2022. Distance = the Milky Way zone's R0 (GRAVITY 2021, 8,275 pc). */
export const SGRA = { id: 'gx-sgra', name: 'Sagittarius A*', massMsun: 4.3e6, imageDate: '12 May 2022' }
