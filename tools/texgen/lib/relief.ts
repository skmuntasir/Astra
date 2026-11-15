import { clamp } from './rng'
import type { Grid } from './sphere'

/**
 * Height -> normal map (tangent space, OpenGL convention: +X east, +Y north, +Z out) and height -> shaded relief.
 * `heights` are in km (or any consistent unit), `radiusKm` sets the metric size of a pixel so slopes are physically
 * proportional at every latitude; `strength` exaggerates relief for display.
 */
export function heightToNormal(heights: Float32Array, g: Grid, radiusKm: number, strength: number): Uint8Array {
  const { w, h } = g
  const out = new Uint8Array(w * h * 3)
  const dLat = Math.PI / h
  const dLon = (2 * Math.PI) / w
  for (let y = 0; y < h; y++) {
    const cl = Math.max(0.2, g.cosLat[y])
    const dxKm = radiusKm * cl * dLon * 2
    const dyKm = radiusKm * dLat * 2
    const yn = y > 0 ? y - 1 : 0
    const ys = y < h - 1 ? y + 1 : h - 1
    for (let x = 0; x < w; x++) {
      const xe = x === w - 1 ? 0 : x + 1
      const xw = x === 0 ? w - 1 : x - 1
      const dhE = (heights[y * w + xe] - heights[y * w + xw]) / dxKm
      const dhN = (heights[yn * w + x] - heights[ys * w + x]) / dyKm
      let nx = -dhE * strength
      let ny = -dhN * strength
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1)
      nx *= inv; ny *= inv
      const nz = inv
      const o = (y * w + x) * 3
      out[o] = Math.round(clamp(nx * 0.5 + 0.5) * 255)
      out[o + 1] = Math.round(clamp(ny * 0.5 + 0.5) * 255)
      out[o + 2] = Math.round(clamp(nz * 0.5 + 0.5) * 255)
    }
  }
  return out
}

/** Hillshade in [0,1]; light from azimuth (deg, clockwise from north) and elevation. */
export function shadedRelief(heights: Float32Array, g: Grid, radiusKm: number, strength: number, azimuthDeg = 315, elevDeg = 40): Float32Array {
  const { w, h } = g
  const out = new Float32Array(w * h)
  const az = (azimuthDeg * Math.PI) / 180
  const el = (elevDeg * Math.PI) / 180
  const lx = Math.sin(az) * Math.cos(el)
  const ly = Math.cos(az) * Math.cos(el)
  const lz = Math.sin(el)
  const dLat = Math.PI / h
  const dLon = (2 * Math.PI) / w
  for (let y = 0; y < h; y++) {
    const cl = Math.max(0.2, g.cosLat[y])
    const dxKm = radiusKm * cl * dLon * 2
    const dyKm = radiusKm * dLat * 2
    const yn = y > 0 ? y - 1 : 0
    const ys = y < h - 1 ? y + 1 : h - 1
    for (let x = 0; x < w; x++) {
      const xe = x === w - 1 ? 0 : x + 1
      const xw = x === 0 ? w - 1 : x - 1
      const dhE = ((heights[y * w + xe] - heights[y * w + xw]) / dxKm) * strength
      const dhN = ((heights[yn * w + x] - heights[ys * w + x]) / dyKm) * strength
      const inv = 1 / Math.sqrt(dhE * dhE + dhN * dhN + 1)
      out[y * w + x] = clamp((-dhE * lx - dhN * ly + lz) * inv)
    }
  }
  return out
}

/** Separable box blur on an equirect field (wraps in x, clamps in y). Used to degrade/soften. */
export function blur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  const n = 2 * r + 1
  for (let y = 0; y < h; y++) {
    let s = 0
    for (let k = -r; k <= r; k++) s += src[y * w + ((k + w) % w)]
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = s / n
      s += src[y * w + ((x + r + 1) % w)] - src[y * w + ((x - r + w) % w)]
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0
    for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, k)) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
    }
  }
  return out
}
