import { BY_ID, CONSTELLATIONS, CONSTELLATION_NAMES, FIXED, STARS, type CatalogObject } from '@/data/sky'
import { D2R, R2D, EQ_TO_GAL, apply, norm180, norm360, transpose, unit, vecFromRaDec, type Vec3 } from '@/lib/astro'
import { bvToKelvin, mulberry32, slerp, starTint } from '@/lib/skyGeometry'
import { fmtDec, fmtLy, fmtRa, fmtSuns, fmtYears, fmtMag, group, luminosity, starNote, type ObjectInfo, type Row } from '@/lib/skyInfo'
import { tanQuarter, type Basis } from '@/lib/skyView'

/**
 * Chapter 07 — Star Map. The pure core: everything here is plain maths and data (no React, no three.js, no DOM), so the
 * canvas component and the chapter can share it and it can be checked on its own.
 *
 * Reused from Chapter 06 rather than rebuilt: the catalogue (`data/sky`), star colours and the seeded faint field
 * (`buildStars`), great-circle subdivision (`slerp`), the stereographic scale (`tanQuarter`), B–V temperature, and the
 * object formatters in `skyInfo`. The Observatory looks at the *horizontal* sky from one place; this map looks at the
 * *equatorial* sphere (J2000 RA/Dec), which has no horizon and no time.
 */

export const FOV_MIN = 4
export const FOV_MAX = 170
/** The map opens on Orion and Taurus: bright, familiar, and rich in figures. */
export const HOME = { ra: 82, dec: 8, fov: 78 }
/** The intro starts with the whole sky and eases in to HOME. */
export const INTRO_FOV = 165

// ---------------------------------------------------------------------------------------------------------------------
// View state
// ---------------------------------------------------------------------------------------------------------------------

export interface Flight {
  t0: number
  dur: number
  from: Vec3
  to: Vec3
  fovA: number
  fovB: number
  /** Extra zoom-out in ln(fov) at mid-flight, so long jumps pull back and settle (cinematic arc). */
  arc: number
}

export interface MapControl {
  /** Rendered view (centre RA/Dec, vertical field of view), degrees. */
  ra: number
  dec: number
  fov: number
  /** Where the view is heading (the render loop damps towards these). */
  tRa: number
  tDec: number
  tFov: number
  /** Pan inertia, degrees per second. */
  vRa: number
  vDec: number
  flight: Flight | null
  /** The opening flight has run once; later mounts (the canvas is torn down when far away) skip it. */
  introPlayed: boolean
  /** A star / deep-sky id, or `con:<id>` for a constellation. */
  selected: string | null
  figures: boolean
  names: boolean
  grid: boolean
  ecliptic: boolean
  // Wired by the scene:
  focusOn: ((id: string) => void) | null
  zoomBy: ((factor: number) => void) | null
  reset: (() => void) | null
  poke: (() => void) | null
  // Wired by the chapter:
  onSelect: ((id: string | null) => void) | null
  /** Throttled readout of the current view for the DOM. */
  onView: ((v: { ra: number; dec: number; fov: number }) => void) | null
}

export function makeMapControl(): MapControl {
  return {
    ra: HOME.ra, dec: HOME.dec, fov: INTRO_FOV, tRa: HOME.ra, tDec: HOME.dec, tFov: HOME.fov, vRa: 0, vDec: 0,
    flight: null, introPlayed: false, selected: null, figures: true, names: true, grid: true, ecliptic: false,
    focusOn: null, zoomBy: null, reset: null, poke: null, onSelect: null, onView: null,
  }
}

export const clampFov = (f: number) => Math.max(FOV_MIN, Math.min(FOV_MAX, f))
export const clampDec = (d: number) => Math.max(-89.5, Math.min(89.5, d))

const decFromVec = (v: Vec3) => Math.asin(Math.max(-1, Math.min(1, v[2]))) * R2D
const raFromVec = (v: Vec3) => norm360(Math.atan2(v[1], v[0]) * R2D)

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
export const easeOut = (t: number) => 1 - (1 - t) ** 3

/** Angular separation, degrees. */
export const separation = (a: Vec3, b: Vec3) =>
  Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * R2D

/** Begin a flight to (ra, dec, fov). With `instant` (reduced motion) the view simply jumps. */
export function flyTo(c: MapControl, ra: number, dec: number, fov: number, now: number, instant: boolean): void {
  const to = vecFromRaDec(ra, clampDec(dec))
  const from = vecFromRaDec(c.ra, c.dec)
  const fovB = clampFov(fov)
  c.vRa = c.vDec = 0
  if (instant) {
    c.flight = null
    c.ra = c.tRa = norm360(ra)
    c.dec = c.tDec = clampDec(dec)
    c.fov = c.tFov = fovB
    return
  }
  const dist = separation(from, to)
  const dur = 0.9 + Math.min(1.5, dist / 70 + Math.abs(Math.log(fovB / c.fov)) * 0.3)
  c.flight = { t0: now, dur, from, to, fovA: c.fov, fovB, arc: Math.min(0.9, dist / 70) * Math.log(Math.min(FOV_MAX, 110) / Math.max(fovB, 20)) * 0.5 }
  c.tFov = fovB
}

/**
 * Advance the view by `dt` seconds. Returns true while anything is still moving (the scene keeps rendering), false
 * when the view has settled (the scene goes idle).
 */
export function stepView(c: MapControl, dt: number, now: number): boolean {
  if (c.flight) {
    const f = c.flight
    const u = Math.max(0, Math.min(1, (now - f.t0) / f.dur))
    const e = easeInOut(u)
    const v = unit(slerp(f.from, f.to, e))
    c.ra = raFromVec(v)
    c.dec = clampDec(decFromVec(v))
    const lf = Math.log(f.fovA) + (Math.log(f.fovB) - Math.log(f.fovA)) * e + Math.sin(Math.PI * u) * f.arc
    c.fov = clampFov(Math.exp(lf))
    c.tRa = c.ra
    c.tDec = c.dec
    if (u >= 1) {
      c.flight = null
      c.fov = c.tFov = f.fovB
    }
    return true
  }
  const speed = Math.hypot(c.vRa, c.vDec)
  if (speed > 0.02) {
    c.tRa = norm360(c.tRa + c.vRa * dt)
    c.tDec = clampDec(c.tDec + c.vDec * dt)
    const decay = Math.exp(-dt * 4.2)
    c.vRa *= decay
    c.vDec *= decay
  } else {
    c.vRa = c.vDec = 0
  }
  const k = 1 - Math.exp(-dt * 11)
  const dRa = norm180(c.tRa - c.ra)
  const dDec = c.tDec - c.dec
  const dLf = Math.log(c.tFov) - Math.log(c.fov)
  c.ra = norm360(c.ra + dRa * k)
  c.dec = clampDec(c.dec + dDec * k)
  c.fov = clampFov(Math.exp(Math.log(c.fov) + dLf * k))
  const moving = Math.abs(dRa) > 0.002 || Math.abs(dDec) > 0.002 || Math.abs(dLf) > 0.0004 || speed > 0.02
  if (!moving) {
    c.ra = c.tRa
    c.dec = c.tDec
    c.fov = c.tFov
  }
  return moving
}

/** Pan by a pixel delta (dragging the sky). `h` is the canvas height in CSS px. */
export function panByPixels(c: MapControl, dx: number, dy: number, h: number): void {
  c.flight = null
  const ppd = pxPerDegreeAt(h, c.fov)
  const cosDec = Math.max(0.15, Math.cos(c.dec * D2R))
  // Sky follows the pointer; east is to the left on a sky chart, so dragging right moves the centre east (RA up).
  c.tRa = norm360(c.tRa + dx / ppd / cosDec)
  c.tDec = clampDec(c.tDec + dy / ppd)
}

/** Stereographic scale at the centre of the view: px per degree. (Same value as skyView's `pxPerDegree`.) */
export const pxPerDegreeAt = (h: number, fovDeg: number) => (h / 2 / (2 * tanQuarter(fovDeg))) * D2R

/** Zoom by `factor` (<1 zooms in), keeping the sky under (ox, oy) — offset from the view centre in px — roughly fixed. */
export function zoomAt(c: MapControl, factor: number, ox: number, oy: number, h: number): void {
  const next = clampFov(c.tFov * factor)
  const real = next / c.tFov
  const ppd = pxPerDegreeAt(h, c.fov)
  const shift = 1 - real
  const cosDec = Math.max(0.15, Math.cos(c.tDec * D2R))
  c.flight = null
  c.tRa = norm360(c.tRa - (ox / ppd / cosDec) * shift)
  c.tDec = clampDec(c.tDec - (oy / ppd) * shift)
  c.tFov = next
}

// ---------------------------------------------------------------------------------------------------------------------
// Projection (equatorial, stereographic) — the same maths as `skyView.project`, in a form that needs no trigonometry
// per point, so the whole faint field can be projected every frame.
// ---------------------------------------------------------------------------------------------------------------------

/** View basis for a chart centred on (ra, dec): north up, east to the LEFT (as the sky looks from inside). */
export function equatorialBasis(raDeg: number, decDeg: number): Basis {
  const fwd = vecFromRaDec(raDeg, decDeg)
  const ra = raDeg * D2R
  const right: Vec3 = [Math.sin(ra), -Math.cos(ra), 0]
  // up = right × fwd
  const up: Vec3 = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ]
  return { fwd, right, up }
}

export interface Frame {
  b: Basis
  /** px per unit of stereographic radius: (h / 2) / tan(fov / 4). */
  k: number
  cx: number
  cy: number
  w: number
  h: number
}

export function makeFrame(c: Pick<MapControl, 'ra' | 'dec' | 'fov'>, w: number, h: number): Frame {
  return { b: equatorialBasis(c.ra, c.dec), k: h / 2 / tanQuarter(c.fov), cx: w / 2, cy: h / 2, w, h }
}

/** Points behind the view (past ~154° from the centre) are not drawn. */
const BEHIND = -0.9

/** Project a unit vector. Writes x, y into `out[0..1]`; returns false when it is behind the view. */
export function projectTo(d: Vec3, f: Frame, out: [number, number]): boolean {
  const cf = d[0] * f.b.fwd[0] + d[1] * f.b.fwd[1] + d[2] * f.b.fwd[2]
  if (cf < BEHIND) return false
  const s = f.k / (1 + cf)
  out[0] = f.cx + s * (d[0] * f.b.right[0] + d[1] * f.b.right[1] + d[2] * f.b.right[2])
  out[1] = f.cy - s * (d[0] * f.b.up[0] + d[1] * f.b.up[1] + d[2] * f.b.up[2])
  return true
}

/** Project `count` packed unit vectors into `out` as (x, y, ok) triples. */
export function projectBuffer(pos: Float32Array, count: number, f: Frame, out: Float32Array): void {
  const [fx, fy, fz] = f.b.fwd
  const [rx, ry, rz] = f.b.right
  const [ux, uy, uz] = f.b.up
  for (let i = 0; i < count; i++) {
    const x = pos[i * 3]
    const y = pos[i * 3 + 1]
    const z = pos[i * 3 + 2]
    const cf = x * fx + y * fy + z * fz
    const o = i * 3
    if (cf < BEHIND) {
      out[o + 2] = 0
      continue
    }
    const s = f.k / (1 + cf)
    out[o] = f.cx + s * (x * rx + y * ry + z * rz)
    out[o + 1] = f.cy - s * (x * ux + y * uy + z * uz)
    out[o + 2] = 1
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Constellation figures, grouped (so one figure can be highlighted), and reference circles
// ---------------------------------------------------------------------------------------------------------------------

export interface Figure {
  id: string
  name: string
  asterism: boolean
  /** Subdivided great-circle segments as packed vector pairs (a, b, a, b …): 6 floats per segment. */
  seg: Float32Array
  /** Catalogue star / object ids used by the figure, in first-use order. */
  members: string[]
  centre: Vec3
  /** Half-angle of the smallest cap around `centre` containing every member, degrees. */
  radius: number
}

const SUBDIV = 6

function buildFigures(): Figure[] {
  return CONSTELLATIONS.map((c) => {
    const segs: Vec3[] = []
    const members: string[] = []
    for (const [i, j] of c.lines) {
      const o1 = BY_ID[i]
      const o2 = BY_ID[j]
      if (!o1 || !o2) continue
      for (const id of [i, j]) if (!members.includes(id)) members.push(id)
      const a = vecFromRaDec(o1.ra, o1.dec)
      const b = vecFromRaDec(o2.ra, o2.dec)
      for (let k = 0; k < SUBDIV; k++) segs.push(slerp(a, b, k / SUBDIV), slerp(a, b, (k + 1) / SUBDIV))
    }
    const seg = new Float32Array(segs.length * 3)
    segs.forEach((v, n) => seg.set(v, n * 3))
    const acc: Vec3 = [0, 0, 0]
    for (const id of members) {
      const v = vecFromRaDec(BY_ID[id].ra, BY_ID[id].dec)
      acc[0] += v[0]
      acc[1] += v[1]
      acc[2] += v[2]
    }
    const centre = unit(acc)
    let radius = 0
    for (const id of members) radius = Math.max(radius, separation(centre, vecFromRaDec(BY_ID[id].ra, BY_ID[id].dec)))
    return { id: c.id, name: c.name, asterism: !!c.asterism, seg, members, centre, radius }
  })
}

export const FIGURES: Figure[] = buildFigures()
export const FIGURE_BY_ID: Record<string, Figure> = Object.fromEntries(FIGURES.map((f) => [f.id, f]))

/** Which figures an object belongs to (real constellations first, asterisms after). */
export const FIGURES_OF: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {}
  for (const f of [...FIGURES].sort((a, b) => Number(a.asterism) - Number(b.asterism))) for (const id of f.members) (m[id] ??= []).push(f.id)
  return m
})()

/** Fov that frames a figure with some air around it. */
export const fovForFigure = (f: Figure) => clampFov(Math.max(18, f.radius * 2 * 1.9 + 6))

export interface DeepField {
  count: number
  pos: Float32Array
  mag: Float32Array
  col: Float32Array
}

/**
 * A second, fainter procedural layer (magnitude 6.4–10) that only appears when the view is zoomed in, the way a telescope
 * shows more stars than the eye. Same recipe as the main field in `buildStars` (seeded, thickened towards the Milky Way,
 * colours from `starTint`), but a different seed and a stronger concentration. NOT a catalogue; the interface says so.
 */
export function buildDeepField(count: number): DeepField {
  const rnd = mulberry32(7007)
  const pos = new Float32Array(count * 3)
  const mag = new Float32Array(count)
  const col = new Float32Array(count * 3)
  const span = 10 ** (0.45 * 3.6) - 1
  for (let i = 0; i < count; ) {
    const z = rnd() * 2 - 1
    const phi = rnd() * Math.PI * 2
    const r = Math.sqrt(1 - z * z)
    const v: Vec3 = [r * Math.cos(phi), r * Math.sin(phi), z]
    const b = Math.asin(apply(EQ_TO_GAL, v)[2])
    if (rnd() > 0.2 + 0.8 * Math.exp(-(b * b) / (2 * 0.22 * 0.22))) continue
    pos.set(v, i * 3)
    mag[i] = 6.4 + Math.log10(1 + rnd() * span) / 0.45
    const g = (rnd() + rnd() + rnd() - 1.5) * 0.9
    col.set(starTint(Math.max(-0.1, Math.min(1.5, 0.6 + g)), mag[i]), i * 3)
    i++
  }
  return { count, pos, mag, col }
}

/** Points along a small or great circle, for the graticule and the ecliptic. */
export function circlePoints(fn: (t: number) => Vec3, steps: number): Float32Array {
  const out = new Float32Array((steps + 1) * 3)
  for (let i = 0; i <= steps; i++) out.set(fn(i / steps), i * 3)
  return out
}

const OBLIQUITY = 23.4393 * D2R
/** The ecliptic, J2000: where the Sun, Moon and planets travel. */
export const ECLIPTIC = circlePoints((t) => {
  const l = t * Math.PI * 2
  return [Math.cos(l), Math.sin(l) * Math.cos(OBLIQUITY), Math.sin(l) * Math.sin(OBLIQUITY)]
}, 180)

const GAL_TO_EQ = transpose(EQ_TO_GAL)
/** The galactic equator and a point on it (for the Milky Way band). */
export const GALACTIC_PLANE = circlePoints((t) => {
  const l = t * Math.PI * 2
  return unit(apply(GAL_TO_EQ, [Math.cos(l), Math.sin(l), 0]))
}, 240)
/** Direction of the Galactic Centre in the equatorial frame. */
export const GALACTIC_CENTRE: Vec3 = unit(apply(GAL_TO_EQ, [1, 0, 0]))

// ---------------------------------------------------------------------------------------------------------------------
// Objects: facts, the HR diagram, search
// ---------------------------------------------------------------------------------------------------------------------

/** The selectable catalogue: 148 stars and the deep-sky objects. */
export const MAP_OBJECTS: CatalogObject[] = FIXED

export const isFigureId = (id: string) => id.startsWith('con:')
export const figureOf = (id: string) => FIGURE_BY_ID[id.slice(4)]

/** Absolute visual magnitude, from apparent magnitude and distance in light-years. */
export const absMag = (mag: number, ly: number) => mag - 5 * Math.log10(ly / 3.2616 / 10)

const MINUS = '\u2212'
const fmtAbs = (m: number) => (m < 0 ? `${MINUS}${Math.abs(m).toFixed(1)}` : m.toFixed(1))

/** "4.4 light-years ago (1,990s)" style line, with the year the light left. */
export function lightLeft(ly: number, nowYear: number): string {
  const y = Math.round(nowYear - ly)
  const yr = y > 0 ? `${y}` : `${Math.abs(y)} BC`
  // A calendar year only means something for the recent past.
  return ly < 1 ? 'under a year ago' : ly >= 5_000 ? `${fmtYears(ly)} ago` : `${fmtYears(ly)} ago (${yr})`
}

const conName = (o: CatalogObject) => CONSTELLATION_NAMES[o.con ?? ''] ?? ''

/** Time-independent facts for one catalogue object. The Observatory's `describe` needs a site and a night; this does not. */
export function describeObject(id: string, nowYear: number): ObjectInfo | null {
  const o = BY_ID[id]
  if (!o) return null
  const position: Row = { k: 'Position (J2000)', v: `RA ${fmtRa(o.ra)} · Dec ${fmtDec(o.dec)}` }
  if (o.kind === 'star') {
    const ly = o.ly ?? 0
    const kelvin = o.bv !== undefined ? Math.round(bvToKelvin(o.bv) / 100) * 100 : 0
    const rows: Row[] = [
      { k: 'Apparent magnitude', v: fmtMag(o.mag) },
      { k: 'Absolute magnitude', v: ly > 0 ? fmtAbs(absMag(o.mag, ly)) : '—' },
      { k: 'Distance', v: ly > 0 ? fmtLy(ly) : '—' },
      { k: 'Light left', v: ly > 0 ? lightLeft(ly, nowYear) : '—' },
      { k: 'Luminosity', v: ly > 0 ? `≈ ${fmtSuns(luminosity(o.mag, ly))} (visual)` : '—' },
      { k: 'Surface', v: kelvin ? `≈ ${group(kelvin)} K` : '—' },
      { k: 'Spectral class', v: o.type ?? '—' },
      { k: 'Designation', v: o.designation ?? '—' },
      position,
    ]
    return { id, name: o.name, kind: 'star', subtitle: `Star · ${o.type ?? ''} · ${conName(o)}`, rows, note: starNote(o) }
  }
  const rows: Row[] = [
    ...(o.kind === 'dso' ? [{ k: 'Magnitude', v: `${fmtMag(o.mag)} (whole object)` }] : []),
    { k: 'Distance', v: o.ly ? fmtLy(o.ly) : '—' },
    ...(o.ly ? [{ k: 'Light left', v: lightLeft(o.ly, nowYear) }] : []),
    { k: 'Designation', v: o.designation ?? '—' },
    position,
  ]
  return { id, name: o.name, kind: o.kind, subtitle: `${o.type ?? ''} · ${conName(o)}`, rows, note: o.note ?? '' }
}

export interface HrPoint {
  id: string
  /** log10 of surface temperature, K. */
  logT: number
  /** log10 of visual luminosity, Suns. */
  logL: number
}

/** Every catalogue star that has both a distance and a colour, placed on a Hertzsprung–Russell diagram. */
export const HR_POINTS: HrPoint[] = STARS.filter((s) => s.ly && s.bv !== undefined).map((s) => ({
  id: s.id,
  logT: Math.log10(bvToKelvin(s.bv as number)),
  logL: Math.log10(luminosity(s.mag, s.ly as number)),
}))

export interface FigureMember {
  id: string
  name: string
  ly: number | null
  mag: number
}

/** A figure's stars, nearest first: the lines on the chart join stars that are nowhere near each other in space. */
export function figureMembers(f: Figure): FigureMember[] {
  return f.members
    .map((id) => BY_ID[id])
    .filter((o) => o.kind === 'star')
    .map((o) => ({ id: o.id, name: o.name, ly: o.ly ?? null, mag: o.mag }))
    .sort((a, b) => (a.ly ?? 1e9) - (b.ly ?? 1e9))
}

export interface SearchHit {
  id: string
  name: string
  detail: string
}

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const INDEX: (SearchHit & { hay: string; rank: number })[] = [
  ...FIGURES.filter((f) => !f.asterism).map((f) => ({ id: `con:${f.id}`, name: f.name, detail: 'Constellation', hay: fold(f.name), rank: 1 })),
  ...FIXED.map((o) => ({
    id: o.id, name: o.name, detail: `${o.designation ?? ''}${o.kind === 'star' ? ` · mag ${fmtMag(o.mag)}` : ` · ${o.type ?? ''}`}`,
    hay: fold(`${o.name} ${o.designation ?? ''} ${conName(o)}`), rank: o.kind === 'star' ? 2 + Math.max(0, o.mag) / 10 : 1.5,
  })),
]

export function search(q: string, limit = 7): SearchHit[] {
  const s = fold(q.trim())
  if (!s) return []
  return INDEX.filter((e) => e.hay.includes(s))
    .map((e) => ({ e, score: (fold(e.name).startsWith(s) ? 0 : 10) + e.rank }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map(({ e }) => ({ id: e.id, name: e.name, detail: e.detail }))
}

/** Where an id should be centred, and a sensible field of view for it. */
export function targetFor(id: string): { ra: number; dec: number; fov: number } | null {
  if (isFigureId(id)) {
    const f = figureOf(id)
    return f ? { ra: raFromVec(f.centre), dec: decFromVec(f.centre), fov: fovForFigure(f) } : null
  }
  const o = BY_ID[id]
  return o ? { ra: o.ra, dec: o.dec, fov: o.kind === 'star' ? 24 : 16 } : null
}

// ---------------------------------------------------------------------------------------------------------------------
// Readouts
// ---------------------------------------------------------------------------------------------------------------------

export const fmtRaFull = (raDeg: number) => {
  const h = norm360(raDeg) / 15
  const hh = Math.floor(h)
  const m = Math.floor((h - hh) * 60)
  const s = Math.round(((h - hh) * 60 - m) * 60)
  const carry = s === 60
  return `${String(carry && m === 59 ? (hh + 1) % 24 : hh).padStart(2, '0')}h ${String(carry ? (m + 1) % 60 : m).padStart(2, '0')}m ${String(carry ? 0 : s).padStart(2, '0')}s`
}
export const fmtDecFull = (d: number) => {
  const a = Math.abs(d)
  const deg = Math.floor(a)
  const m = Math.round((a - deg) * 60)
  return `${d < 0 ? MINUS : '+'}${String(m === 60 ? deg + 1 : deg).padStart(2, '0')}° ${String(m === 60 ? 0 : m).padStart(2, '0')}′`
}
export const fmtFov = (f: number) => (f >= 10 ? `${Math.round(f)}°` : `${f.toFixed(1)}°`)

/** A "nice" scale-bar length in degrees for a view `fov` degrees tall (about a fifth of the height). */
export function niceSpan(fov: number): number {
  const target = fov / 5
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 20, 30, 45, 60]
  return steps.reduce((best, s) => (Math.abs(s - target) < Math.abs(best - target) ? s : best), steps[0])
}
