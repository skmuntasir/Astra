import { rng } from './rng'

/**
 * 3D noise toolkit. Everything is sampled on 3D positions (the unit sphere), so there is no seam and no polar pinching.
 * Simplex (Gustavson), fBm, ridged, billow, domain warp, Worley/cellular.
 */
const G3 = new Float32Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1])
const F3 = 1 / 3
const GG = 1 / 6

export class Simplex {
  private perm = new Uint8Array(512)
  private pm12 = new Uint8Array(512)
  constructor(seed: number) {
    const r = rng(seed ^ 0x9e3779b9)
    const p = new Uint8Array(256)
    for (let i = 0; i < 256; i++) p[i] = i
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r.next() * (i + 1))
      const t = p[i]
      p[i] = p[j]
      p[j] = t
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255]
      this.pm12[i] = this.perm[i] % 12
    }
  }
  /** Value in about [-1, 1]. */
  noise(x: number, y: number, z: number): number {
    const perm = this.perm
    const pm = this.pm12
    const s = (x + y + z) * F3
    const i = Math.floor(x + s)
    const j = Math.floor(y + s)
    const k = Math.floor(z + s)
    const t = (i + j + k) * GG
    const x0 = x - (i - t)
    const y0 = y - (j - t)
    const z0 = z - (k - t)
    let i1: number, j1: number, k1: number, i2: number, j2: number, k2: number
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0 }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1 }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1 }
    } else if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1 }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1 }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0 }
    const x1 = x0 - i1 + GG, y1 = y0 - j1 + GG, z1 = z0 - k1 + GG
    const x2 = x0 - i2 + 2 * GG, y2 = y0 - j2 + 2 * GG, z2 = z0 - k2 + 2 * GG
    const x3 = x0 - 1 + 3 * GG, y3 = y0 - 1 + 3 * GG, z3 = z0 - 1 + 3 * GG
    const ii = i & 255, jj = j & 255, kk = k & 255
    let n = 0
    let tt = 0.6 - x0 * x0 - y0 * y0 - z0 * z0
    if (tt > 0) { const g = pm[ii + perm[jj + perm[kk]]] * 3; tt *= tt; n += tt * tt * (G3[g] * x0 + G3[g + 1] * y0 + G3[g + 2] * z0) }
    tt = 0.6 - x1 * x1 - y1 * y1 - z1 * z1
    if (tt > 0) { const g = pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; tt *= tt; n += tt * tt * (G3[g] * x1 + G3[g + 1] * y1 + G3[g + 2] * z1) }
    tt = 0.6 - x2 * x2 - y2 * y2 - z2 * z2
    if (tt > 0) { const g = pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; tt *= tt; n += tt * tt * (G3[g] * x2 + G3[g + 1] * y2 + G3[g + 2] * z2) }
    tt = 0.6 - x3 * x3 - y3 * y3 - z3 * z3
    if (tt > 0) { const g = pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; tt *= tt; n += tt * tt * (G3[g] * x3 + G3[g + 1] * y3 + G3[g + 2] * z3) }
    return 32 * n
  }

  /** Fractal Brownian motion, normalised to about [-1, 1]. */
  fbm(x: number, y: number, z: number, oct = 5, lac = 2.02, gain = 0.5): number {
    let a = 1, f = 1, sum = 0, norm = 0
    for (let o = 0; o < oct; o++) {
      sum += a * this.noise(x * f + o * 17.31, y * f - o * 9.17, z * f + o * 5.73)
      norm += a
      a *= gain
      f *= lac
    }
    return sum / norm
  }
  /** Ridged multifractal: sharp crests (mountain chains, wrinkle ridges). Returns [0, 1]. */
  ridged(x: number, y: number, z: number, oct = 5, lac = 2.1, gain = 0.5): number {
    let a = 1, f = 1, sum = 0, norm = 0, w = 1
    for (let o = 0; o < oct; o++) {
      let n = 1 - Math.abs(this.noise(x * f + o * 7.7, y * f + o * 3.1, z * f - o * 11.3))
      n *= n
      n *= w
      w = Math.min(1, Math.max(0, n * 2))
      sum += a * n
      norm += a
      a *= gain
      f *= lac
    }
    return sum / norm
  }
  /** Billow: puffy rounded lumps (clouds, hummocks). Returns about [-1, 1]. */
  billow(x: number, y: number, z: number, oct = 5, lac = 2, gain = 0.5): number {
    let a = 1, f = 1, sum = 0, norm = 0
    for (let o = 0; o < oct; o++) {
      sum += a * (Math.abs(this.noise(x * f + o * 4.3, y * f + o * 1.9, z * f - o * 8.1)) * 2 - 1)
      norm += a
      a *= gain
      f *= lac
    }
    return sum / norm
  }
}

/** Domain warp: displaces (x,y,z) by a noise vector. Writes into `out`. */
export function warp(n: Simplex, x: number, y: number, z: number, amp: number, freq: number, out: [number, number, number], oct = 3) {
  out[0] = x + amp * n.fbm(x * freq + 11.1, y * freq + 2.3, z * freq - 5.7, oct)
  out[1] = y + amp * n.fbm(x * freq - 3.9, y * freq + 14.2, z * freq + 8.8, oct)
  out[2] = z + amp * n.fbm(x * freq + 6.4, y * freq - 7.5, z * freq + 20.1, oct)
  return out
}

export interface WorleyResult { f1: number; f2: number; id: number; cx: number; cy: number; cz: number }
export function makeWorley(): WorleyResult { return { f1: 0, f2: 0, id: 0, cx: 0, cy: 0, cz: 0 } }

function h32(ix: number, iy: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1442695041) ^ Math.imul(seed, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = Math.imul(h ^ (h >>> 16), 2246822519)
  return (h ^ (h >>> 15)) >>> 0
}

/** Worley/cellular noise, 3D. f1/f2 are distances to the nearest/second feature point (in cell units). */
export function worley3(x: number, y: number, z: number, seed: number, out: WorleyResult, jitter = 1): WorleyResult {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  let d1 = 1e9, d2 = 1e9, id = 0, bx = 0, by = 0, bz = 0
  for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx, cy = iy + dy, cz = iz + dz
        const h = h32(cx, cy, cz, seed)
        const px = cx + 0.5 + (((h & 1023) / 1023) - 0.5) * jitter
        const py = cy + 0.5 + ((((h >>> 10) & 1023) / 1023) - 0.5) * jitter
        const pz = cz + 0.5 + ((((h >>> 20) & 1023) / 1023) - 0.5) * jitter
        const ex = px - x, ey = py - y, ez = pz - z
        const d = ex * ex + ey * ey + ez * ez
        if (d < d1) { d2 = d1; d1 = d; id = h / 4294967296; bx = px; by = py; bz = pz }
        else if (d < d2) d2 = d
      }
  out.f1 = Math.sqrt(d1)
  out.f2 = Math.sqrt(d2)
  out.id = id
  out.cx = bx; out.cy = by; out.cz = bz
  return out
}
