import { clamp, smoothstep, DEG } from './rng'
import type { RGB } from './ramps'
import { hex } from './ramps'

/**
 * Banded-atmosphere toolkit shared by the gas / ice giants.
 *  - `bandProfile`: latitude -> colour from a list of belts/zones with soft edges
 *  - `Vortex`: an elliptical swirl that rotates the sampling coordinates (so surrounding bands wrap round it)
 *    and reports a core / collar weight for colour overrides.
 * Everything works in (lon, lat) radians of the *planetographic* sphere; callers convert to 3D for noise.
 */
export interface BandSeg { lat: number; col: string | RGB }
/** lat in degrees, ascending south->north; colour is the band colour from that latitude to the next entry. */
export function bandProfile(segs: BandSeg[], edge: number) {
  const s = segs.map((q) => ({ lat: q.lat * DEG, col: typeof q.col === 'string' ? hex(q.col) : q.col }))
  return (lat: number, out: RGB): RGB => {
    let i = 0
    while (i < s.length - 1 && lat > s[i + 1].lat) i++
    out[0] = s[i].col[0]; out[1] = s[i].col[1]; out[2] = s[i].col[2]
    // soft blend toward the neighbours across each boundary (edge width in radians, scaled per call)
    if (i > 0) {
      const t = smoothstep(s[i].lat - edge, s[i].lat + edge, lat)
      const c0 = s[i - 1].col
      out[0] = c0[0] + (out[0] - c0[0]) * t; out[1] = c0[1] + (out[1] - c0[1]) * t; out[2] = c0[2] + (out[2] - c0[2]) * t
    }
    if (i < s.length - 1) {
      const t = smoothstep(s[i + 1].lat - edge, s[i + 1].lat + edge, lat)
      const c1 = s[i + 1].col
      out[0] += (c1[0] - out[0]) * t; out[1] += (c1[1] - out[1]) * t; out[2] += (c1[2] - out[2]) * t
    }
    return out
  }
}

export interface Vortex {
  lat: number; lon: number // deg
  rx: number; ry: number // semi-axes in deg of arc (rx along longitude, ry along latitude)
  spin: number // peak rotation of the sample frame in radians (sign = sense of rotation)
  core?: RGB; collar?: number; coreAmt?: number
  tag?: string
}
export interface VortexHit { w: number; rho: number; tag?: string; core?: RGB; amt: number; collar: number; v: Vortex }

/** Applies the swirl of one vortex to (lon,lat) in place. Returns the hit (or null if outside). */
export function applyVortex(v: Vortex, lon: number, lat: number, out: { lon: number; lat: number }): VortexHit | null {
  const la0 = v.lat * DEG
  let dl = lon - v.lon * DEG
  dl = Math.atan2(Math.sin(dl), Math.cos(dl))
  const cl = Math.max(0.05, Math.cos(la0))
  const dx = (dl * cl) / (v.rx * DEG)
  const dy = (lat - la0) / (v.ry * DEG)
  const rho2 = dx * dx + dy * dy
  if (rho2 > 4) return null
  const rho = Math.sqrt(rho2)
  // rotation falls off smoothly from the centre to 2 radii; stronger near the rim (a shear layer), like a real vortex
  const f = Math.pow(1 - smoothstep(0, 2, rho), 1.5)
  const a = v.spin * f
  const c = Math.cos(a), s = Math.sin(a)
  const rx = dx * c - dy * s, ry = dx * s + dy * c
  out.lon = v.lon * DEG + (rx * v.rx * DEG) / cl
  out.lat = la0 + ry * v.ry * DEG
  const w = 1 - smoothstep(0.55, 1.0, rho)
  const collar = Math.exp(-Math.pow((rho - 1.12) / 0.14, 2))
  return { w, rho, tag: v.tag, core: v.core, amt: v.coreAmt ?? 1, collar, v }
}
export { clamp }
