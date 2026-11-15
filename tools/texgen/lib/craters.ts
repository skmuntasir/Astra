import { DEG, clamp, smoothstep, type Rng } from './rng'
import type { Grid } from './sphere'

/**
 * Crater stamping on an equirect height field + brightness field. Craters are described in km on a body of radius R,
 * placed at lat/lon, and stamped through true angular distance (so they stay round near the poles and wrap the seam).
 *
 * Profile (r = distance / crater radius):
 *  - bowl (r<1): parabolic for simple craters, flat floor + terraced wall for complex ones, central peak above ~25 km
 *  - raised rim around r=1, ejecta blanket falling off as r^-3 out to ~2.5 radii
 *  - fresh craters get bright radial rays; `degradation` (0 fresh .. 1 ancient) flattens rim/depth, fades rays.
 * Bowl pixels REPLACE the underlying height (a newer crater erases older ones), ejecta is additive.
 */
export interface Crater {
  lat: number // deg
  lon: number // deg (east positive)
  d: number // diameter, km
  deg: number // degradation 0..1
  rays?: number // 0..1 ray brightness
  peak?: boolean
  floorFill?: number // 0..1 how much lava/plains fill the floor (Mercury/Moon style)
}

export interface CraterField {
  height: Float32Array // km
  bright: Float32Array // additive albedo modifier, about -0.3..+0.5
}
export const newCraterField = (g: Grid): CraterField => ({ height: new Float32Array(g.w * g.h), bright: new Float32Array(g.w * g.h) })

/** Power-law size-frequency sample: N(>D) ~ D^-b. Larger b => more small craters. */
export function sampleDiameters(r: Rng, n: number, dMin: number, dMax: number, b = 1.9): number[] {
  const out: number[] = []
  const k = 1 - Math.pow(dMin / dMax, b)
  for (let i = 0; i < n; i++) out.push(dMin * Math.pow(1 - r.next() * k, -1 / b))
  return out.sort((a, c) => c - a) // largest (oldest) first
}

export function stampCrater(f: CraterField, g: Grid, R: number, c: Crater, rayNoise: (a: number) => number) {
  const { w, h } = g
  const rad = c.d / 2
  const rho = rad / R // angular radius
  const ext = Math.min(Math.PI, rho * (c.rays && c.rays > 0.05 ? 12 : 2.6))
  const la = c.lat * DEG, lo = c.lon * DEG
  const cx = Math.cos(la) * Math.cos(lo), cy = Math.sin(la), cz = -Math.cos(la) * Math.sin(lo)
  // local frame for azimuth
  let ex = -cz, ey = 0, ez = cx // east = Y x c
  const el = Math.hypot(ex, ez) || 1
  ex /= el; ez /= el
  const nx = cy * ez - cz * ey, ny = cz * ex - cx * ez, nz = cx * ey - cy * ex // north = c x e
  const row0 = Math.max(0, Math.floor((0.5 - (la + ext) / Math.PI) * h) - 1)
  const row1 = Math.min(h - 1, Math.ceil((0.5 - (la - ext) / Math.PI) * h) + 1)
  const cosLa = Math.cos(la)
  const fullLon = cosLa < 1e-3 || Math.abs(la) + ext >= Math.PI / 2
  const dLon = fullLon ? Math.PI : Math.min(Math.PI, Math.asin(Math.min(1, Math.sin(ext) / Math.max(1e-6, cosLa))) + 0.01)
  const col0 = Math.floor(((lo - dLon) / Math.PI + 1) / 2 * w) - 1
  const col1 = Math.ceil(((lo + dLon) / Math.PI + 1) / 2 * w) + 1
  const complex = c.d > 18
  const depthK = (complex ? 0.045 * Math.pow(c.d, 0.0) + 0.02 : 0.2) * (1 - 0.8 * c.deg) * (1 - 0.6 * (c.floorFill ?? 0))
  const depth = complex ? depthK * c.d * 0.9 * Math.pow(18 / c.d, 0.35) : depthK * c.d
  const rimH = (complex ? 0.018 : 0.045) * c.d * (1 - 0.85 * c.deg)
  const peakH = c.peak ? 0.03 * c.d * (1 - 0.7 * c.deg) : 0
  const rayAmp = (c.rays ?? 0) * (1 - c.deg)
  const floorB = -0.05 - 0.08 * (c.floorFill ?? 0)
  for (let y = row0; y <= row1; y++) {
    const cl = g.cosLat[y], sl = g.sinLat[y]
    for (let xx = col0; xx <= col1; xx++) {
      const x = ((xx % w) + w) % w
      const px = cl * g.cosLon[x], pz = -cl * g.sinLon[x]
      const dot = px * cx + sl * cy + pz * cz
      const ang = Math.acos(dot > 1 ? 1 : dot < -1 ? -1 : dot)
      const r = ang / rho
      if (r > ext / rho) continue
      const i = y * w + x
      const rim = rimH * Math.exp(-Math.pow((r - 1) / (0.1 + 0.12 * c.deg), 2))
      if (r < 1) {
        let bowl: number
        if (!complex) bowl = -depth * (1 - r * r)
        else {
          const wall = smoothstep(0.55, 1.0, r)
          bowl = -depth * (1 - wall * wall * (3 - 2 * wall)) + 0.004 * c.d * Math.sin(wall * 14) * wall * (1 - wall)
        }
        if (peakH) bowl += peakH * Math.exp(-Math.pow(r / 0.12, 2))
        const wgt = smoothstep(1.0, 0.9, r) // newer crater erases what was under its bowl
        f.height[i] = f.height[i] * (1 - wgt) + bowl * wgt + rim
        f.bright[i] += (floorB + 0.05 * (1 - r)) * (1 - 0.5 * c.deg) * wgt
      } else {
        const ej = r < 2.6 ? rimH * 0.55 * Math.pow(r, -3) * (1 - c.deg * 0.8) : 0
        f.height[i] += rim + ej
        f.bright[i] += Math.pow(r, -2.2) * 0.3 * (1 - c.deg) * (0.6 + 0.4 * (c.rays ?? 0.3))
        if (rayAmp > 0.02) {
          const rx = px * ex + pz * ez
          const ry = px * nx + sl * ny + pz * nz
          const ray = rayNoise(Math.atan2(ry, rx))
          f.bright[i] += rayAmp * ray * Math.pow(r, -0.85) * 0.42 * smoothstep(12, 3.5, r)
        }
      }
    }
  }
}

/** Convenience: stamp a whole population. */
export function stampAll(f: CraterField, g: Grid, R: number, list: Crater[], mkRayNoise: (seed: number) => (a: number) => number) {
  for (let i = 0; i < list.length; i++) stampCrater(f, g, R, list[i], mkRayNoise(i))
}

export { clamp }

/** Adds fn(distanceKm, azimuthRad) into `field` for every pixel within `maxKm` of (lat,lon). Volcanoes, basins, bulges. */
export function addRadial(field: Float32Array, g: Grid, R: number, lat: number, lon: number, maxKm: number, fn: (dKm: number, az: number) => number) {
  const { w, h } = g
  const la = lat * DEG, lo = lon * DEG
  const cx = Math.cos(la) * Math.cos(lo), cy = Math.sin(la), cz = -Math.cos(la) * Math.sin(lo)
  let ex = -cz, ez = cx
  const el = Math.hypot(ex, ez) || 1
  ex /= el; ez /= el
  const nx = cy * ez, ny = cz * ex - cx * ez, nz = -cy * ex
  const ext = Math.min(Math.PI, maxKm / R)
  const row0 = Math.max(0, Math.floor((0.5 - (la + ext) / Math.PI) * h) - 1)
  const row1 = Math.min(h - 1, Math.ceil((0.5 - (la - ext) / Math.PI) * h) + 1)
  const cosLa = Math.cos(la)
  const full = cosLa < 1e-3 || Math.abs(la) + ext >= Math.PI / 2
  const dLon = full ? Math.PI : Math.min(Math.PI, Math.asin(Math.min(1, Math.sin(ext) / cosLa)) + 0.01)
  const col0 = Math.floor(((lo - dLon) / Math.PI + 1) / 2 * w) - 1
  const col1 = Math.ceil(((lo + dLon) / Math.PI + 1) / 2 * w) + 1
  for (let y = row0; y <= row1; y++) {
    const cl = g.cosLat[y], sl = g.sinLat[y]
    for (let xx = col0; xx <= col1; xx++) {
      const x = ((xx % w) + w) % w
      const px = cl * g.cosLon[x], pz = -cl * g.sinLon[x]
      const dot = px * cx + sl * cy + pz * cz
      const d = Math.acos(dot > 1 ? 1 : dot < -1 ? -1 : dot) * R
      if (d > maxKm) continue
      const az = Math.atan2(px * nx + sl * ny + pz * nz, px * ex + pz * ez)
      field[y * w + x] += fn(d, az)
    }
  }
}

/** Distance (km) from every pixel in the lat/lon window to a great-circle polyline; fn(distKm, along 0..1, segIndex). */
export function addPath(field: Float32Array, g: Grid, R: number, pts: Array<[number, number]>, maxKm: number, fn: (dKm: number, along: number) => number, window: { lat: [number, number]; lon: [number, number] }) {
  const { w, h } = g
  const V = pts.map(([la, lo]) => [Math.cos(la * DEG) * Math.cos(lo * DEG), Math.sin(la * DEG), -Math.cos(la * DEG) * Math.sin(lo * DEG)])
  const lens: number[] = []
  let total = 0
  for (let i = 1; i < V.length; i++) {
    const d = Math.acos(Math.min(1, V[i - 1][0] * V[i][0] + V[i - 1][1] * V[i][1] + V[i - 1][2] * V[i][2]))
    lens.push(d); total += d
  }
  const y0 = Math.max(0, Math.floor((0.5 - window.lat[1] / 180) * h)), y1 = Math.min(h - 1, Math.ceil((0.5 - window.lat[0] / 180) * h))
  const x0 = Math.floor(((window.lon[0] + 180) / 360) * w), x1 = Math.ceil(((window.lon[1] + 180) / 360) * w)
  for (let y = y0; y <= y1; y++) {
    const cl = g.cosLat[y], sl = g.sinLat[y]
    for (let xx = x0; xx <= x1; xx++) {
      const x = ((xx % w) + w) % w
      const px = cl * g.cosLon[x], pz = -cl * g.sinLon[x]
      let best = 1e9, bestAlong = 0, acc = 0
      for (let s = 0; s < lens.length; s++) {
        const a = V[s], b = V[s + 1]
        // project p onto the arc a->b
        const ab = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
        const sn = Math.sqrt(Math.max(1e-12, 1 - ab * ab))
        const pa = px * a[0] + sl * a[1] + pz * a[2]
        const pb = px * b[0] + sl * b[1] + pz * b[2]
        let t = Math.atan2(pb - pa * ab, pa * sn) / lens[s] // along-arc parameter (approx.)
        t = t < 0 ? 0 : t > 1 ? 1 : t
        // point on arc at t
        const A = Math.sin((1 - t) * lens[s]) / sn, B = Math.sin(t * lens[s]) / sn
        const qx = A * a[0] + B * b[0], qy = A * a[1] + B * b[1], qz = A * a[2] + B * b[2]
        const dd = Math.acos(Math.min(1, px * qx + sl * qy + pz * qz)) * R
        if (dd < best) { best = dd; bestAlong = (acc + t * lens[s]) / total }
        acc += lens[s]
      }
      if (best < maxKm) field[y * w + x] += fn(best, bestAlong)
    }
  }
}
