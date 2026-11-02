import { CONSTELLATIONS, STARS, BY_ID } from '@/data/sky'
import { EQ_TO_GAL, apply, unit, vecFromRaDec, type Vec3 } from '@/lib/astro'

/** Blackbody colour (Tanner Helland's fit), 0–1 per channel. */
export function kelvinToRgb(k: number): Vec3 {
  const t = Math.max(1000, Math.min(40000, k)) / 100
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  const c = (x: number) => Math.max(0, Math.min(255, x)) / 255
  return [c(r), c(g), c(b)]
}

/** Surface temperature from B–V (Ballesteros 2012). */
export const bvToKelvin = (bv: number) => 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62))

/** Star tint for display: the real colour, softened towards white so the sky stays quiet and premium. */
export function starTint(bv: number, mag: number): Vec3 {
  const [r, g, b] = kelvinToRgb(bvToKelvin(bv))
  const keep = mag < 2.5 ? 0.7 : 0.45
  return [1 + (r - 1) * keep, 1 + (g - 1) * keep, 1 + (b - 1) * keep]
}

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

export interface StarBuffers {
  count: number
  real: number
  pos: Float32Array
  mag: Float32Array
  col: Float32Array
  seed: Float32Array
}

/**
 * The 148 catalogue stars plus a seeded procedural field of fainter stars (magnitude 3–6.4) thickened towards the Milky
 * Way. The field is NOT a real catalogue; the interface says so. Deterministic: same sky every load.
 */
export function buildStars(fieldCount: number): StarBuffers {
  const real = STARS.length
  const count = real + fieldCount
  const pos = new Float32Array(count * 3)
  const mag = new Float32Array(count)
  const col = new Float32Array(count * 3)
  const seed = new Float32Array(count)
  const rnd = mulberry32(2026)

  STARS.forEach((s, i) => {
    const v = vecFromRaDec(s.ra, s.dec)
    pos.set(v, i * 3)
    mag[i] = s.mag
    col.set(starTint(s.bv ?? 0.4, s.mag), i * 3)
    seed[i] = rnd()
  })

  const span = 10 ** (0.45 * 3.4) - 1
  for (let i = real; i < count; ) {
    const z = rnd() * 2 - 1
    const phi = rnd() * Math.PI * 2
    const r = Math.sqrt(1 - z * z)
    const v: Vec3 = [r * Math.cos(phi), r * Math.sin(phi), z]
    const b = Math.asin(apply(EQ_TO_GAL, v)[2])
    if (rnd() > 0.3 + 0.7 * Math.exp(-(b * b) / (2 * 0.3 * 0.3))) continue
    pos.set(v, i * 3)
    mag[i] = 3.0 + Math.log10(1 + rnd() * span) / 0.45
    // Field stars: mostly white to pale yellow, a few blue-white and orange.
    const g = (rnd() + rnd() + rnd() - 1.5) * 0.9
    col.set(starTint(Math.max(-0.1, Math.min(1.5, 0.55 + g)), mag[i]), i * 3)
    seed[i] = rnd()
    i++
  }
  return { count, real, pos, mag, col, seed }
}

/** Great-circle subdivision so constellation lines curve correctly under the stereographic projection. */
export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  const om = Math.acos(d)
  if (om < 1e-6) return a
  const s = Math.sin(om)
  const k1 = Math.sin((1 - t) * om) / s
  const k2 = Math.sin(t * om) / s
  return [a[0] * k1 + b[0] * k2, a[1] * k1 + b[1] * k2, a[2] * k1 + b[2] * k2]
}

export interface LineBuffers {
  count: number
  pos: Float32Array
  /** 1 for asterisms (drawn dimmer). */
  aster: Float32Array
}

const SUBDIV = 6

export function buildLines(): LineBuffers {
  const segs: { a: Vec3; b: Vec3; aster: number }[] = []
  for (const c of CONSTELLATIONS) {
    for (const [i, j] of c.lines) {
      const o1 = BY_ID[i]
      const o2 = BY_ID[j]
      if (!o1 || !o2) continue
      const a = vecFromRaDec(o1.ra, o1.dec)
      const b = vecFromRaDec(o2.ra, o2.dec)
      for (let k = 0; k < SUBDIV; k++) segs.push({ a: slerp(a, b, k / SUBDIV), b: slerp(a, b, (k + 1) / SUBDIV), aster: c.asterism ? 1 : 0 })
    }
  }
  const pos = new Float32Array(segs.length * 6)
  const aster = new Float32Array(segs.length * 2)
  segs.forEach((s, i) => {
    pos.set(s.a, i * 6)
    pos.set(s.b, i * 6 + 3)
    aster[i * 2] = aster[i * 2 + 1] = s.aster
  })
  return { count: segs.length * 2, pos, aster }
}

/** Where to write each constellation's name: the mean direction of its stars (J2000). */
export function constellationCentres(): { id: string; name: string; dir: Vec3; asterism: boolean }[] {
  return CONSTELLATIONS.map((c) => {
    const acc: Vec3 = [0, 0, 0]
    const seen = new Set<string>()
    for (const [a, b] of c.lines) for (const id of [a, b]) if (!seen.has(id) && BY_ID[id]) {
      seen.add(id)
      const v = vecFromRaDec(BY_ID[id].ra, BY_ID[id].dec)
      acc[0] += v[0]; acc[1] += v[1]; acc[2] += v[2]
    }
    return { id: c.id, name: c.name, dir: unit(acc), asterism: !!c.asterism }
  })
}

/** Unit vector cache for the fixed catalogue. */
export const FIXED_DIRS: Record<string, Vec3> = Object.fromEntries(
  [...STARS, ...Object.values(BY_ID).filter((o) => o.kind !== 'star')].map((o) => [o.id, vecFromRaDec(o.ra, o.dec)]),
)

