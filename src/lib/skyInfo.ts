import { BY_ID, CONSTELLATION_NAMES, FIXED, STAR_NOTES, type CatalogObject } from '@/data/sky'
import {
  PLANET_IDS, altOf, apply, azOf, ephemeris, fmtLmt, horizontalMatrix, jdFromMs, topocentric, type Ephemeris, type PlanetId,
  type Site, type Vec3, type Night,
} from '@/lib/astro'
import { FIXED_DIRS, bvToKelvin } from '@/lib/skyGeometry'
import { compass } from '@/lib/skyView'

const MINUS = '\u2212'
export const fmtMag = (m: number) => (m < 0 ? `${MINUS}${Math.abs(m).toFixed(2)}` : m.toFixed(2))
export const group = (n: number) => Math.round(n).toLocaleString('en-US')

export function fmtYears(y: number): string {
  if (y < 1) return 'less than a year'
  if (y < 100) return `${y < 10 ? y.toFixed(1) : Math.round(y)} years`
  if (y < 1_000_000) return `${group(Math.round(y / 10) * 10)} years`
  return `${(y / 1_000_000).toFixed(y < 10_000_000 ? 1 : 0)} million years`
}
export const fmtLy = (ly: number) => (ly < 100 ? `${ly < 10 ? ly.toFixed(1) : Math.round(ly)} light-years` : ly < 1_000_000 ? `≈ ${group(ly)} light-years` : `≈ ${(ly / 1_000_000).toFixed(1)} million light-years`)

export interface Row {
  k: string
  v: string
}
export interface ObjectInfo {
  id: string
  name: string
  /** One line under the name, e.g. "Star · A1V · Canis Major". */
  subtitle: string
  rows: Row[]
  note: string
  kind: CatalogObject['kind']
}

export const MOVING = ['moon', ...PLANET_IDS] as const
export const isMoving = (id: string) => (MOVING as readonly string[]).includes(id)
const PLANET_NAME: Record<PlanetId, string> = { mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn' }
export const nameOf = (id: string) => (id === 'moon' ? 'Moon' : id in PLANET_NAME ? PLANET_NAME[id as PlanetId] : BY_ID[id]?.name ?? id)

const PLANET_NOTE: Record<PlanetId, string> = {
  mercury: 'The innermost planet never strays more than 28° from the Sun, so it is only ever seen low in twilight.',
  venus: 'The brightest planet, wrapped in sulphuric-acid cloud. Through a small telescope it shows phases like the Moon, and is a thin crescent when it is closest.',
  mars: 'The red colour is iron-oxide dust. Its brightness changes about seventyfold between opposition and conjunction, as the distance changes.',
  jupiter: 'A gas giant with more mass than all the other planets together. Binoculars show its four large moons as points in a line.',
  saturn: 'To the eye a steady, faintly yellow star. The rings, wide and paper-thin, are visible in any small telescope.',
}

/** J2000 equatorial direction of an object at an instant. For the Moon this is geocentric; see `horizontalOf`. */
export function dirOf(id: string, eph: Ephemeris): Vec3 {
  if (id === 'moon') return eph.moon.dir
  if (id in eph.planets) return eph.planets[id as PlanetId].dir
  return FIXED_DIRS[id]
}

export interface Where {
  alt: number
  az: number
  h: Vec3
}

/** Horizontal position (degrees) of any object. */
export function whereIs(id: string, eph: Ephemeris, M: ReturnType<typeof horizontalMatrix>): Where {
  let h = apply(M, dirOf(id, eph))
  if (id === 'moon') h = topocentric(h, eph.moon.distKm)
  return { alt: altOf(h), az: azOf(h), h }
}

export const fmtRa = (raDeg: number) => {
  const h = raDeg / 15
  const hh = Math.floor(h)
  return `${hh}h ${String(Math.round((h - hh) * 60) % 60).padStart(2, '0')}m`
}
export const fmtDec = (d: number) => `${d < 0 ? MINUS : '+'}${Math.abs(d).toFixed(1)}°`

/** When (and how high) an object peaks during the given night. */
function peak(id: string, night: Night, site: Site): string {
  let best = -90
  let at = night.start
  for (let t = night.start; t <= night.end; t += 15 * 60_000) {
    const jd = jdFromMs(t)
    const eph = ephemeris(jd)
    const alt = whereIs(id, eph, horizontalMatrix(jd, site.lat, site.lon)).alt
    if (alt > best) {
      best = alt
      at = t
    }
  }
  return best < 0 ? 'Below the horizon all night' : `${Math.round(best)}° at ${fmtLmt(at, site.lon)}`
}

/** Luminosity in Suns from apparent magnitude and distance (visual, no bolometric correction). */
export const luminosity = (mag: number, ly: number) => 10 ** (0.4 * (4.83 - (mag - 5 * Math.log10(ly / 3.2616 / 10))))
export function fmtSuns(l: number): string {
  if (l < 10) return `${l.toFixed(1)} × Sun`
  if (l < 10_000) return `${group(l < 100 ? l : Math.round(l / 10) * 10)} × Sun`
  return `${group(Math.round(l / 1000) * 1000)} × Sun`
}

export function describe(id: string, ms: number, site: Site, night: Night): ObjectInfo {
  const jd = jdFromMs(ms)
  const eph = ephemeris(jd)
  const year = new Date(ms).getUTCFullYear()
  const pk = { k: 'Peak tonight', v: peak(id, night, site) }

  if (id === 'moon') {
    const m = eph.moon
    return {
      id, name: 'Moon', kind: 'moon', subtitle: `Satellite of Earth · ${m.phase}`,
      rows: [
        { k: 'Illuminated', v: `${Math.round(m.illum * 100)} %` },
        { k: 'Age', v: `${m.ageDays.toFixed(1)} days since new` },
        { k: 'Distance', v: `${group(m.distKm)} km · ${(m.distKm / 299_792.458).toFixed(2)} light-seconds` },
        { k: 'Apparent size', v: `${(m.diamArcsec / 60).toFixed(1)} arcminutes` },
        { k: 'Magnitude', v: fmtMag(m.mag) },
        pk,
      ],
      note: 'The same face always points to Earth. The dim part of a crescent is lit by Earthshine: sunlight reflected off our own planet.',
    }
  }
  if (id in eph.planets) {
    const p = eph.planets[id as PlanetId]
    const au = p.distKm / 149_597_870.7
    return {
      id, name: PLANET_NAME[id as PlanetId], kind: 'planet', subtitle: 'Planet · Solar System',
      rows: [
        { k: 'Magnitude', v: fmtMag(p.mag) },
        { k: 'Distance', v: `${au.toFixed(2)} AU · ${(au * 8.317).toFixed(1)} light-minutes` },
        { k: 'Illuminated', v: `${Math.round(p.illum * 100)} %` },
        { k: 'From the Sun', v: `${Math.round(p.elong)}° elongation` },
        { k: 'Apparent size', v: `${p.diamArcsec.toFixed(1)} arcseconds` },
        pk,
      ],
      note: PLANET_NOTE[id as PlanetId],
    }
  }
  const o = BY_ID[id]
  if (o.kind === 'centre') {
    return {
      id, name: o.name, kind: 'centre', subtitle: `${o.designation} · ${CONSTELLATION_NAMES[o.con ?? ''] ?? ''}`,
      rows: [
        { k: 'Distance', v: `≈ ${group(o.ly ?? 0)} light-years` },
        { k: 'Mass', v: '4.3 million Suns' },
        { k: 'Horizon radius', v: '≈ 12.7 million km · 0.085 AU' },
        { k: 'Shadow, from Earth', v: '≈ 50 microarcseconds' },
        { k: 'Visible light', v: 'Dimmed ≈ 10¹² × by dust' },
        { k: 'Position', v: `RA ${fmtRa(o.ra)} · Dec ${fmtDec(o.dec)}` },
        pk,
      ],
      note: o.note ?? '',
    }
  }
  if (o.kind === 'dso') {
    return {
      id, name: o.name, kind: 'dso', subtitle: `${o.type} · ${CONSTELLATION_NAMES[o.con ?? ''] ?? ''} · ${o.designation}`,
      rows: [
        { k: 'Magnitude', v: `${fmtMag(o.mag)} (whole object)` },
        { k: 'Distance', v: fmtLy(o.ly ?? 0) },
        { k: 'Light left', v: `${fmtYears(o.ly ?? 0)} ago` },
        { k: 'Position', v: `RA ${fmtRa(o.ra)} · Dec ${fmtDec(o.dec)}` },
        pk,
      ],
      note: o.note ?? '',
    }
  }
  // Star
  const ly = o.ly ?? 0
  const kelvin = o.bv !== undefined ? Math.round(bvToKelvin(o.bv) / 100) * 100 : 0
  return {
    id, name: o.name, kind: 'star', subtitle: `Star · ${o.type} · ${CONSTELLATION_NAMES[o.con ?? ''] ?? ''}`,
    rows: [
      { k: 'Magnitude', v: fmtMag(o.mag) },
      { k: 'Distance', v: fmtLy(ly) },
      { k: 'Light left', v: `${fmtYears(ly)} ago (${Math.round(year - ly) > 0 ? `${Math.round(year - ly)}` : `${Math.abs(Math.round(year - ly))} BC`})` },
      { k: 'Surface', v: kelvin ? `≈ ${group(kelvin)} K` : '—' },
      { k: 'Luminosity', v: `≈ ${fmtSuns(luminosity(o.mag, ly))} (visual)` },
      { k: 'Designation', v: o.designation ?? '—' },
      { k: 'Position', v: `RA ${fmtRa(o.ra)} · Dec ${fmtDec(o.dec)}` },
      pk,
    ],
    note: starNote(o),
  }
}

export function starNote(o: CatalogObject): string {
  return STAR_NOTES[o.id] ?? `${o.name} (${o.designation}) is a ${o.type} star about ${fmtLy(o.ly ?? 0)} away, shining at magnitude ${fmtMag(o.mag)}.`
}

// ---------------------------------------------------------------------------------------------------------------------
// Sky Tonight
// ---------------------------------------------------------------------------------------------------------------------
export interface SkyEntry {
  id: string
  name: string
  kind: CatalogObject['kind']
  alt: number
  az: number
  detail: string
}

export interface Snapshot {
  ms: number
  sunAlt: number
  phase: string
  illum: number
  moonUp: boolean
  entries: SkyEntry[]
  /** One line for the header: Moon, then planets that are up. */
  summary: string
  key: string
}

export function snapshot(ms: number, site: Site): Snapshot {
  const jd = jdFromMs(ms)
  const eph = ephemeris(jd)
  const M = horizontalMatrix(jd, site.lat, site.lon)
  const sunAlt = altOf(apply(M, eph.sunDir))
  const dark = sunAlt < -12
  const place = (id: string) => whereIs(id, eph, M)

  const entries: SkyEntry[] = []
  const planetsUp: string[] = []
  const moon = place('moon')
  if (moon.alt > 2) {
    entries.push({ id: 'moon', name: 'Moon', kind: 'moon', alt: moon.alt, az: moon.az, detail: `${eph.moon.phase} · ${Math.round(eph.moon.illum * 100)} %` })
  }
  for (const id of PLANET_IDS) {
    const w = place(id)
    if (w.alt > 4 && sunAlt < -3) {
      planetsUp.push(PLANET_NAME[id])
      entries.push({ id, name: PLANET_NAME[id], kind: 'planet', alt: w.alt, az: w.az, detail: `Planet · mag ${fmtMag(eph.planets[id].mag)}` })
    }
  }
  const pool = FIXED.filter((o) => o.label >= 6 || o.kind === 'dso' || o.kind === 'centre')
    .map((o) => ({ o, w: place(o.id) }))
    .filter((x) => x.w.alt > 8 && dark)
    .sort((a, b) => (a.o.kind === 'star' ? a.o.mag : a.o.kind === 'dso' ? a.o.mag - 1.5 : -2) - (b.o.kind === 'star' ? b.o.mag : b.o.kind === 'dso' ? b.o.mag - 1.5 : -2))
  for (const { o, w } of pool) {
    if (entries.length >= 9) break
    const detail = o.kind === 'star' ? `${CONSTELLATION_NAMES[o.con ?? '']} · mag ${fmtMag(o.mag)}` : o.kind === 'centre' ? `${o.designation} · black hole` : `${o.type}`
    entries.push({ id: o.id, name: o.name, kind: o.kind, alt: w.alt, az: w.az, detail })
  }

  const moonPart = moon.alt > 2 ? `Moon ${Math.round(eph.moon.illum * 100)} %` : 'Moon down'
  const planetPart = planetsUp.length ? planetsUp.join(', ') : 'no bright planets up'
  const summary = sunAlt > -0.833 ? 'Daylight' : `${moonPart} · ${planetPart}`
  return {
    ms, sunAlt, phase: eph.moon.phase, illum: eph.moon.illum, moonUp: moon.alt > 2, entries, summary,
    key: `${Math.round(ms / 60_000)}|${summary}|${entries.map((e) => e.id + Math.round(e.alt / 3)).join(',')}`,
  }
}

export const where = (alt: number, az: number) => (alt < 0 ? 'Below horizon' : `Alt ${Math.round(alt)}° · ${compass(az)} ${Math.round(az)}°`)
