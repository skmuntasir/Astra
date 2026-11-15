import { Simplex } from '../lib/noise'
import { rng, smoothstep, clamp, DEG, hash2 } from '../lib/rng'
import { fft } from '../lib/fft'
import { makeRamp } from '../lib/ramps'
import { makeGrid } from '../lib/sphere'
import { saveRecord } from '../lib/manifest'
import { OUT_DIR, toU8 } from '../lib/io'
import fs from 'node:fs'
import path from 'node:path'
import type { Ctx } from '../lib/ctx'

/**
 * COSMOS
 *  - CMB: an exact Gaussian random field on the sphere. a_lm ~ N(0, C_l) with a phenomenological D_l = l(l+1)C_l/2pi spectrum
 *    (Sachs-Wolfe plateau, acoustic peaks at l ~ 220 / 537 / 810, Silk damping), l = 0 and 1 (monopole and DIPOLE) removed, 10 arcmin beam.
 *    Synthesis: ring-by-ring with normalised associated Legendre recurrences + a real FFT over m. Units: microkelvin.
 *    The spectrum is a hand-fitted curve through approximate Planck 2018 band powers (// VERIFY): NOT a Boltzmann-code output.
 *  - Cosmic-web slice: a density field from a Gaussian field + a Zel'dovich-like displacement + log-normal transform (filaments, voids, nodes).
 *  - Dust/nebula noise: a tileable (periodic) noise texture.
 *  - Accretion-disc noise for the black-hole shader: a (u = azimuth, v = radius) strip with spiral shear structure and hot spots.
 */

// --- angular power spectrum D_l [muK^2] control points (l, D_l)   // VERIFY approximate Planck-like values
const DL_PTS: Array<[number, number]> = [[2, 220], [3, 700], [5, 950], [8, 1050], [12, 1000], [20, 1000], [30, 1050], [50, 1500], [80, 2600], [110, 3700], [140, 4700], [180, 5500], [220, 5750], [260, 5300], [300, 4300], [340, 3200], [380, 2200], [410, 1850], [450, 2000], [490, 2350], [537, 2550], [580, 2350], [625, 2000], [675, 1850], [725, 2050], [775, 2350], [810, 2450], [850, 2300], [900, 2000], [950, 1850], [1000, 1850], [1060, 1950], [1120, 1900], [1250, 1550], [1400, 1100], [1600, 700]]
function Dl(l: number): number {
  let i = 1
  while (i < DL_PTS.length - 1 && l > DL_PTS[i][0]) i++
  const [l0, d0] = DL_PTS[i - 1], [l1, d1] = DL_PTS[i]
  // interpolate in log D with a cosine easing (keeps the peaks and troughs rounded)
  const t = clamp((l - l0) / (l1 - l0)), e = 0.5 - 0.5 * Math.cos(Math.PI * t)
  return Math.exp(Math.log(d0) * (1 - e) + Math.log(d1) * e)
}

export async function genCMB(ctx: Ctx) {
  const W = ctx.W(2048), H = W / 2
  const LMAX = ctx.preview ? 200 : Math.min(950, Math.floor(W / 2.15))
  const rr = rng(1999)
  const beam = (l: number) => Math.exp(-0.5 * l * (l + 1) * Math.pow((10 / 60) * DEG / 2.355, 2)) // 10 arcmin FWHM
  // a_lm: store re/im for m >= 0, l >= m
  const idx = (l: number, m: number) => (l * (l + 1)) / 2 + m
  const are = new Float64Array(idx(LMAX, LMAX) + 1), aim = new Float64Array(are.length)
  for (let l = 2; l <= LMAX; l++) {
    const Cl = (Dl(l) * 2 * Math.PI) / (l * (l + 1)) * beam(l) ** 2
    for (let m = 0; m <= l; m++) {
      const s = Math.sqrt(Cl)
      if (m === 0) { are[idx(l, 0)] = s * rr.gauss(); aim[idx(l, 0)] = 0 }
      else { are[idx(l, m)] = (s * rr.gauss()) / Math.SQRT2; aim[idx(l, m)] = (s * rr.gauss()) / Math.SQRT2 }
    }
  }
  const out = new Float32Array(W * H)
  const re = new Float64Array(W), im = new Float64Array(W)
  const Gr = new Float64Array(LMAX + 1), Gi = new Float64Array(LMAX + 1)
  const t0 = Date.now()
  for (let y = 0; y < H; y++) {
    const theta = ((y + 0.5) / H) * Math.PI, x = Math.cos(theta), sx = Math.sin(theta)
    Gr.fill(0); Gi.fill(0)
    // normalised associated Legendre lambda_l^m(x) = sqrt((2l+1)/4pi (l-m)!/(l+m)!) P_l^m(x), by the standard recurrences
    let pmm = Math.sqrt(1 / (4 * Math.PI)) // lambda_0^0
    for (let m = 0; m <= LMAX; m++) {
      if (m > 0) pmm *= -Math.sqrt((2 * m + 1) / (2 * m)) * sx
      let p0 = pmm, p1 = 0
      // l = m
      if (m >= 2) { Gr[m] += are[idx(m, m)] * p0; Gi[m] += aim[idx(m, m)] * p0 }
      if (m + 1 <= LMAX) {
        p1 = x * Math.sqrt(2 * m + 3) * p0
        if (m + 1 >= 2) { Gr[m] += are[idx(m + 1, m)] * p1; Gi[m] += aim[idx(m + 1, m)] * p1 }
        let pa = p0, pb = p1
        for (let l = m + 2; l <= LMAX; l++) {
          const a = Math.sqrt(((4 * l * l - 1) / (l * l - m * m))), b = Math.sqrt((((l - 1) * (l - 1) - m * m) / (4 * (l - 1) * (l - 1) - 1)))
          const pl = a * (x * pb - b * pa)
          pa = pb; pb = pl
          Gr[m] += are[idx(l, m)] * pl; Gi[m] += aim[idx(l, m)] * pl
        }
      }
    }
    // T(phi) = G_0 + 2 Re sum_{m>0} G_m e^{i m phi}  ->  inverse FFT of the hermitian-extended spectrum
    re.fill(0); im.fill(0)
    re[0] = Gr[0]
    for (let m = 1; m <= Math.min(LMAX, W / 2 - 1); m++) { re[m] = Gr[m]; im[m] = Gi[m]; re[W - m] = Gr[m]; im[W - m] = -Gi[m] }
    fft(re, im, true)
    // fft(inverse) divides by n: undo. Row output is for phi_j = 2 pi j / W; the map column 0 is lon -180 -> shift by half a pixel and flip so east is to the right
    for (let xx = 0; xx < W; xx++) {
      // lon = -pi + (xx + .5) 2pi/W ; phi = lon (+east). The FFT grid is phi_j = 2 pi j/W: use j = xx + W/2 (mod W) and apply a half-pixel phase offset (ignored: sub-pixel)
      out[y * W + xx] = re[(xx + W / 2) % W] * W
    }
    if (y % 128 === 0) ctx.log(`  cmb row ${y}/${H} (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
  }
  // stats
  let s2 = 0, mean = 0, wsum = 0
  for (let y = 0; y < H; y++) { const w = Math.sin(((y + 0.5) / H) * Math.PI); for (let x = 0; x < W; x++) { mean += out[y * W + x] * w; wsum += w } }
  mean /= wsum
  for (let y = 0; y < H; y++) { const w = Math.sin(((y + 0.5) / H) * Math.PI); for (let x = 0; x < W; x++) { const d = out[y * W + x] - mean; s2 += d * d * w } }
  const rms = Math.sqrt(s2 / wsum)
  ctx.log(`  CMB: mean ${mean.toFixed(2)} muK, rms ${rms.toFixed(1)} muK (Planck 5 arcmin-smoothed: ~ 110 muK), lmax ${LMAX}`)
  // Planck-style "Planck blue-white-red" colour map, +-300 muK (the published Planck maps use +-300). The brief asks for ~+-100 muK; the
  // greyscale temperature map is provided as well so the shader can pick any scale (saturating +-100 would clip ~1/3 of the sky: the field rms is ~100).
  const ramp = makeRamp([[0, '#0000ff'], [0.16, '#0040ff'], [0.33, '#00b0ff'], [0.4, '#6fd8ff'], [0.46, '#c0e8f5'], [0.5, '#f4f0e8'], [0.54, '#ffe6b0'], [0.62, '#ffb860'], [0.72, '#ff6a20'], [0.86, '#e01000'], [1, '#6a0000']])
  const col: [number, number, number] = [0, 0, 0]
  const rgb = new Float32Array(W * H * 3), gray = new Float32Array(W * H)
  for (let i = 0; i < out.length; i++) {
    const t = clamp(0.5 + (out[i] - mean) / 600)
    ramp(t, col)
    rgb[i * 3] = col[0]; rgb[i * 3 + 1] = col[1]; rgb[i * 3 + 2] = col[2]
    gray[i] = t
  }
  const rec = { kind: 'procedural' as const, generator: 'tools/texgen/gen/cosmos.ts (Gaussian random field on the sphere, a_lm ~ N(0, C_l), l>=2)', zone: 'universe', credit: 'ASTRA procedural: a random realisation with a Planck-like angular spectrum (hand-fitted, // VERIFY). NOT the Planck map.', tier: 'core' as const, colorSpace: 'srgb' as const }
  await ctx.save({ ...rec, file: 'cmb_color_2k.jpg', usage: 'CMB all-sky map, equirect, Planck-style colour, +-300 muK (full colour range), dipole removed, SIMULATED' }, rgb, W, H, 3, { format: 'jpg', quality: 92, subsample444: true })
  await ctx.save({ ...rec, file: 'cmb_temp_2k.png', colorSpace: 'linear', usage: 'CMB temperature, greyscale: 0.5 = mean, +-300 muK across the full range (the shader may colour it with any scale, e.g. +-100 muK); SIMULATED' }, gray, W, H, 1, { format: 'png' })
}

/** Cosmic-web density slice: Gaussian field -> Zel'dovich-like displaced filaments -> log-normal, 2k x 2k greyscale. */
export async function genWeb(ctx: Ctx) {
  const W = ctx.preview ? 512 : 2048
  const G = ctx.preview ? 256 : 640 // particle accumulation grid: ~10-20 particles per cell, then smooth upsample (1 particle/pixel at 2k would be pure shot noise)
  const N = new Simplex(2101), N2 = new Simplex(2102), N3 = new Simplex(2103)
  const r = rng(2104)
  const pot = (x: number, y: number) => N.fbm(x * 1.7, y * 1.7, 0.5, 3, 2.0, 0.5) + 0.35 * N2.fbm(x * 4, y * 4, 3.3, 2, 2.0, 0.5)
  const eps = 0.002
  const NP = ctx.preview ? 1_000_000 : 8_000_000
  const acc = new Float32Array(G * G)
  const strength = 0.19 * 3.4
  for (let k = 0; k < NP; k++) {
    const qx = r.next(), qy = r.next()
    const gx = (pot(qx + eps, qy) - pot(qx - eps, qy)) / (2 * eps), gy = (pot(qx, qy + eps) - pot(qx, qy - eps)) / (2 * eps)
    const x = qx + strength * gx * 1.1, y = qy + strength * gy * 1.1
    if (x < 0 || y < 0 || x >= 1 || y >= 1) continue
    const px = x * G, py = y * G, x0 = Math.floor(px - 0.5), y0 = Math.floor(py - 0.5)
    if (x0 < 0 || y0 < 0 || x0 >= G - 1 || y0 >= G - 1) continue
    const fx = px - 0.5 - x0, fy = py - 0.5 - y0
    acc[y0 * G + x0] += (1 - fx) * (1 - fy); acc[y0 * G + x0 + 1] += fx * (1 - fy); acc[(y0 + 1) * G + x0] += (1 - fx) * fy; acc[(y0 + 1) * G + x0 + 1] += fx * fy
  }
  const bl = (src: Float32Array, rad: number) => {
    const t = new Float32Array(src.length), o = new Float32Array(src.length)
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) { let s = 0, n = 0; for (let k = -rad; k <= rad; k++) { const xx = x + k; if (xx < 0 || xx >= G) continue; s += src[y * G + xx]; n++ } t[y * G + x] = s / n }
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) { let s = 0, n = 0; for (let k = -rad; k <= rad; k++) { const yy = y + k; if (yy < 0 || yy >= G) continue; s += t[yy * G + x]; n++ } o[y * G + x] = s / n }
    return o
  }
  const d = bl(bl(acc, 2), 1)
  const sorted = Float32Array.from(d).sort()
  const med = sorted[Math.floor(sorted.length * 0.5)] || 1e-6, hi = sorted[Math.floor(sorted.length * 0.9995)]
  const out = new Float32Array(W * W * 3)
  const ramp = makeRamp([[0, '#02030a'], [0.25, '#0b1430'], [0.5, '#2a4f8a'], [0.72, '#8ab4e8'], [0.9, '#f4e8d0'], [1, '#ffffff']])
  const col: [number, number, number] = [0, 0, 0]
  const samp = (u: number, v: number) => { const x = u * G - 0.5, y = v * G - 0.5, x0 = Math.max(0, Math.min(G - 2, Math.floor(x))), y0 = Math.max(0, Math.min(G - 2, Math.floor(y))), fx = Math.min(1, Math.max(0, x - x0)), fy = Math.min(1, Math.max(0, y - y0)); return (d[y0 * G + x0] * (1 - fx) + d[y0 * G + x0 + 1] * fx) * (1 - fy) + (d[(y0 + 1) * G + x0] * (1 - fx) + d[(y0 + 1) * G + x0 + 1] * fx) * fy }
  for (let i = 0; i < W * W; i++) {
    const x = i % W, y = (i / W) | 0, u = (x + 0.5) / W, v = (y + 0.5) / W
    const dd = samp(u, v)
    let t = Math.log(1 + 2.5 * dd / med) / Math.log(1 + 2.5 * hi / med)
    t *= 0.9 + 0.2 * N3.fbm(u * 60, v * 60, 1.1, 3) // sub-cell clumping of the gas
    ramp(clamp(Math.pow(t, 1.25)), col)
    out[i * 3] = col[0]; out[i * 3 + 1] = col[1]; out[i * 3 + 2] = col[2]
  }
  await ctx.save({ file: 'cosmicweb_2k.jpg', kind: 'procedural', generator: "tools/texgen/gen/cosmos.ts (Zel'dovich-style particle displacement of a Gaussian potential; filaments, voids, nodes)", zone: 'universe', usage: 'Cosmic-web density slice (SIMULATED look-alike; not N-body or SDSS data)', credit: 'ASTRA procedural, no external source', tier: 'core', colorSpace: 'srgb' }, out, W, W, 3, { format: 'jpg', quality: 92 })
}

/** Tileable dust/nebula noise (periodic in both axes): 3D simplex sampled on a 4D torus is overkill; instead blend 3 shifted copies (cross-fade tiling). */
export async function genDust(ctx: Ctx) {
  const W = ctx.preview ? 512 : 1024
  const N = new Simplex(2201), N2 = new Simplex(2202)
  const rawF = (x: number, y: number) => {
    const w1 = N.fbm(x * 4 + 1.7, y * 4, 0.3, 5), w2 = N.fbm(x * 4 - 3.3, y * 4 + 9, 7.9, 5)
    const a = N2.fbm(x * 3 + 2 * w1, y * 3 + 2 * w2, 2.2, 6, 2.0, 0.55)
    return a * 0.65 + 0.35 * N2.ridged(x * 6 + w1, y * 6 + w2, 4.4, 4)
  }
  // periodic by construction: sample on a torus embedded in 4D is not available, so use the classic 4-way offset blend
  const out = new Float32Array(W * W)
  const L = 1 // tile period in noise units
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / W
    const a = rawF(u, v), b = rawF(u - L, v), c = rawF(u, v - L), d = rawF(u - L, v - L)
    const wu = u * u * (3 - 2 * u), wv = v * v * (3 - 2 * v)
    const val = (a * (1 - wu) + b * wu) * (1 - wv) + (c * (1 - wu) + d * wu) * wv
    out[y * W + x] = clamp(0.5 + 0.9 * val)
  }
  await ctx.save({ file: 'dust_noise_1k.png', kind: 'procedural', generator: 'tools/texgen/gen/cosmos.ts (4-way blended fBm + ridged warp, periodic)', zone: 'universe', usage: 'Tileable dust / nebula density noise (greyscale, use as multiplier / mask)', credit: 'ASTRA procedural, no external source', tier: 'core', colorSpace: 'linear' }, out, W, W, 1, { format: 'png' })
}

/** Accretion-disc noise for the black-hole renderer: u = azimuth (wraps), v = radius (0 inner edge .. 1 outer). Differential-rotation-sheared turbulence. */
export async function genDisc(ctx: Ctx) {
  const Wd = ctx.preview ? 512 : 2048, Hd = ctx.preview ? 128 : 512
  const N = new Simplex(2301), N2 = new Simplex(2302)
  const out = new Float32Array(Wd * Hd * 3)
  for (let y = 0; y < Hd; y++) {
    const rad = (y + 0.5) / Hd
    // Keplerian shear: azimuth angle gets stretched by omega ~ r^-1.5, so features at small radius are long thin arcs
    const shear = 1.0 + 6.0 * Math.pow(1 - rad, 1.5)
    for (let x = 0; x < Wd; x++) {
      const th = ((x + 0.5) / Wd) * 2 * Math.PI
      const cx = Math.cos(th), sx = Math.sin(th)
      // periodic in azimuth by sampling on a circle in noise space; angular frequency falls as shear grows
      const kc = 6 / Math.sqrt(shear), kr = 18
      const t = N.fbm(cx * kc + 3 * rad, sx * kc + rad * kr * 0.2, rad * kr, 5, 2.0, 0.55)
      const t2 = N2.fbm(cx * kc * 3, sx * kc * 3, rad * kr * 2.6, 4, 2.0, 0.5)
      // spiral arms of heated gas: log-spiral phase
      const spiral = 0.5 + 0.5 * Math.sin(2 * th + 7 * Math.log(0.15 + rad) + 2.5 * t)
      let v = 0.55 + 0.4 * t + 0.2 * t2
      v *= 0.65 + 0.5 * spiral
      // a few hot spots (orbiting blobs)
      for (let h = 0; h < 5; h++) {
        const hy = hash2(h, 7, 3), hx = hash2(h, 9, 4) * 2 * Math.PI, hr = 0.15 + 0.7 * hy
        const dth = Math.atan2(Math.sin(th - hx), Math.cos(th - hx))
        v += 0.9 * Math.exp(-(dth * dth) / (0.04 / shear + 1e-3) - Math.pow((rad - hr) / 0.04, 2))
      }
      const i = (y * Wd + x) * 3
      out[i] = clamp(v); out[i + 1] = clamp(v * 0.97); out[i + 2] = clamp(v * 0.95)
    }
  }
  // the colour is neutral (the temperature colour ramp is the renderer's job); the three channels are the same noise scaled for convenience
  await ctx.save({ file: 'bh_disc_noise_2k.png', kind: 'procedural', generator: 'tools/texgen/gen/cosmos.ts (sheared turbulence + log-spiral + hot spots)', zone: 'black-hole', usage: 'Accretion-disc turbulence strip, u = azimuth (wraps), v = radius inner->outer. Real EHT images are NOT included', credit: 'ASTRA procedural, not an EHT image', tier: 'core', colorSpace: 'linear' }, out, Wd, Hd, 3, { format: 'png' })
}

export async function genCosmos(ctx: Ctx, only?: string[]) {
  const all: Array<[string, (c: Ctx) => Promise<void>]> = [['cmb', genCMB], ['web', genWeb], ['dust', genDust], ['disc', genDisc]]
  for (const [n, fn] of all) if (!only || only.includes(n)) { const t0 = Date.now(); await fn(ctx); ctx.log(`  [${n}] ${((Date.now() - t0) / 1000).toFixed(0)} s`) }
}
void saveRecord; void OUT_DIR; void toU8; void fs; void path; void makeGrid; void smoothstep
