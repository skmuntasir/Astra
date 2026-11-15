import { Simplex } from '../lib/noise'
import { rng, smoothstep, clamp, DEG, type Rng } from '../lib/rng'
import { saveRecord } from '../lib/manifest'
import { OUT_DIR } from '../lib/io'
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import type { Ctx } from '../lib/ctx'

/**
 * Layered particle / density renders of galaxies, 2048^2 RGBA (straight alpha, black-space look: alpha = brightness, so the sprite
 * can be alpha-blended over a dark sky and its edges are fully transparent). Layers: old stars (bulge, disc, optional bar), young blue
 * stars hugging the arms, HII knots (pink), globular-like clumps, and a DUST layer that attenuates the light by depth (dust lanes).
 * All of it is a procedural look-alike (no survey images): inclinations/position angles of M31 and M33 are the published values (// VERIFY).
 */
const SIZE = 2048

interface Arm { m: number; pitch: number; phase: number; w: number; strength: number }
interface Cfg {
  name: string; seed: number
  inc: number; pa: number // degrees. inclination (0 face-on, 90 edge-on), position angle of the major axis, image-plane, ccw from +x(right)
  Rd: number; hz: number // disc scale length and height (units of the half-width of the image, 1 = edge of the frame)
  nOld: number; nYoung: number; nBulge: number; nHII: number; nDust: number
  bulge: { a: number; q: number; amp: number }
  arms?: { old: Arm; young: Arm; dust: Arm }
  bar?: { a: number; q: number; pa: number; amp: number; n: number }
  ring?: { r: number; w: number; amp: number }
  rmax: number
  colOld: [number, number, number]; colYoung: [number, number, number]; colBulge: [number, number, number]
  expo: number; dustTau: number; sat?: number
  /** optional radial ramp of the OLD-disc colour: colOld inside ramp[0], colOuter beyond ramp[1] (units of image half-width). Real discs are bluer outward. */
  colOuter?: [number, number, number]; ramp?: [number, number]
  extra?: (add: (x: number, y: number, z: number, rgb: [number, number, number], w: number, depth?: number) => void, r: Rng, sc: number) => void
  elliptical?: { Re: number; q: number; pa: number; n: number; gcN: number }
  irregular?: boolean
}

const taper = (R: number) => 1 - smoothstep(0.5, 0.93, R)
function arm(R: number, th: number, a: Arm, R0 = 0.3): number {
  // distance (in radians-of-phase, converted to arc units) to the nearest arm, for m arms
  const t = th - Math.log(Math.max(1e-3, R / R0)) / Math.tan(a.pitch * DEG) - a.phase
  const per = (2 * Math.PI) / a.m
  let d = ((t % per) + per) % per
  if (d > per / 2) d -= per
  const arc = d * R
  return Math.exp(-(arc * arc) / (2 * a.w * a.w))
}

async function render(ctx: Ctx, cfg: Cfg): Promise<{ rgba: Uint8Array; W: number }> {
  const W = ctx.preview ? 512 : SIZE
  const r = rng(cfg.seed), nz = new Simplex(cfg.seed + 5)
  const sc = ctx.preview ? 0.25 : 1
  const acc = new Float32Array(W * W * 3), lum0 = new Float32Array(W * W)
  const tau = new Float32Array(W * W)
  const ci = Math.cos(cfg.inc * DEG), si = Math.sin(cfg.inc * DEG), cp = Math.cos(cfg.pa * DEG), sp = Math.sin(cfg.pa * DEG)
  const half = W / 2
  // galaxy frame (X, Y, Z; disc in XY, units of the image half-width) -> screen px + view depth
  const proj = (X: number, Y: number, Z: number) => {
    const sx = X, sy = Y * ci + Z * si, depth = Z * ci - Y * si
    const rx = sx * cp - sy * sp, ry = sx * sp + sy * cp
    return { px: half + rx * half, py: half - ry * half, depth }
  }
  const splat = (buf: Float32Array, px: number, py: number, v: number) => {
    const x0 = Math.floor(px - 0.5), y0 = Math.floor(py - 0.5)
    if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= W - 1) return
    const fx = px - 0.5 - x0, fy = py - 0.5 - y0
    buf[y0 * W + x0] += v * (1 - fx) * (1 - fy); buf[y0 * W + x0 + 1] += v * fx * (1 - fy)
    buf[(y0 + 1) * W + x0] += v * (1 - fx) * fy; buf[(y0 + 1) * W + x0 + 1] += v * fx * fy
  }
  const lap = () => { const u = r.next() - 0.5; return -Math.sign(u) * Math.log(1 - 2 * Math.abs(u) + 1e-9) }
  const gammaR = (Rd: number) => -Rd * Math.log((r.next() + 1e-9) * (r.next() + 1e-9))
  // ---- dust first (a 2D optical-depth map in the image plane)
  const dustSample = () => {
    const R = gammaR(cfg.Rd * 1.05), th = r.next() * 2 * Math.PI
    if (R > cfg.rmax) return null
    if (cfg.arms) { const a = arm(R, th, cfg.arms.dust); if (r.next() > 0.12 + 0.88 * a) return null }
    const clump = 0.5 + 0.5 * nz.fbm(Math.cos(th) * R * 9, Math.sin(th) * R * 9, 3.1, 4)
    if (r.next() > clump * clump + 0.1) return null
    return { X: R * Math.cos(th), Y: R * Math.sin(th), Z: lap() * cfg.hz * 0.35 }
  }
  if (cfg.nDust > 0 && !cfg.elliptical) {
    const taus = new Float32Array(W * W)
    let n = 0
    for (let k = 0; k < cfg.nDust * 6 && n < cfg.nDust; k++) { const d = dustSample(); if (!d) continue; n++; const p = proj(d.X, d.Y, d.Z); splat(taus, p.px, p.py, 1) }
    // blur (separable box x2 ~ gaussian) then normalise to peak ~ dustTau
    const tmp = new Float32Array(W * W)
    const bl = (src: Float32Array, dst: Float32Array, rad: number, horiz: boolean) => {
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        let s = 0, c = 0
        for (let k = -rad; k <= rad; k++) { const xx = horiz ? x + k : x, yy = horiz ? y : y + k; if (xx < 0 || yy < 0 || xx >= W || yy >= W) continue; s += src[yy * W + xx]; c++ }
        dst[y * W + x] = s / (2 * rad + 1)
      }
    }
    const rad = Math.max(1, Math.round(4 * (W / 2048) + 2))
    bl(taus, tmp, rad, true); bl(tmp, taus, rad, false); bl(taus, tmp, rad, true); bl(tmp, taus, rad, false)
    const sorted = Float32Array.from(taus).sort()
    const p99 = sorted[Math.floor(sorted.length * 0.995)] || 1
    for (let i = 0; i < tau.length; i++) tau[i] = (taus[i] / p99) * cfg.dustTau
  }
  // dust attenuates blue more than red (reddening): the lanes come out brown, not grey. Returns the red-channel factor; the
  // blue and green factors are powers of it (extinction ratios ~ A_V : A_R ~ 1 : 0.75 : 0.5 for B : V : R, rounded).
  const attAt = (px: number, py: number, depth: number) => {
    const x = Math.floor(px), y = Math.floor(py)
    if (x < 0 || y < 0 || x >= W || y >= W) return 1
    const t = tau[y * W + x]
    if (t <= 0) return 1
    const s = 0.04 + 0.4 * si
    const w = 0.5 - 0.5 * clamp(depth / s, -1, 1) // fraction of the dust that lies in front of the star
    return Math.exp(-t * w * 1.0)
  }
  const add = (X: number, Y: number, Z: number, rgb: [number, number, number], w: number, depthOverride?: number) => {
    const p = proj(X, Y, Z)
    const ar = attAt(p.px, p.py, depthOverride ?? p.depth) // red factor; green / blue are attenuated more
    const a = ar * w
    const ag = Math.pow(ar, 1.25) * w, ab = Math.pow(ar, 1.7) * w
    splat(acc, p.px, p.py, 0) // keep signature simple
    // splat per channel
    const x0 = Math.floor(p.px - 0.5), y0 = Math.floor(p.py - 0.5)
    if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= W - 1) return
    const fx = p.px - 0.5 - x0, fy = p.py - 0.5 - y0
    const wt = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy], off = [0, 1, W, W + 1]
    for (let q = 0; q < 4; q++) { const o = (y0 * W + x0 + off[q]) * 3; acc[o] += rgb[0] * a * wt[q]; acc[o + 1] += rgb[1] * ag * wt[q]; acc[o + 2] += rgb[2] * ab * wt[q] }
  }
  // ---- elliptical (de Vaucouleurs-like, sampled in projection)
  if (cfg.elliptical) {
    const e = cfg.elliptical, cpa = Math.cos(e.pa * DEG), spa = Math.sin(e.pa * DEG)
    const n = Math.round(cfg.nOld * sc * sc * 4)
    // numerical inverse CDF of the projected de Vaucouleurs profile: dN/dR ~ R * exp(-7.67 ((R/Re)^(1/4) - 1))
    const NR = 4000, cum = new Float64Array(NR + 1), Rm = cfg.rmax * 1.1
    for (let i = 1; i <= NR; i++) { const R = (i / NR) * Rm; cum[i] = cum[i - 1] + R * Math.exp(-7.67 * (Math.pow(R / e.Re, 0.25) - 1)) }
    const ecdf = (u: number) => { const t = u * cum[NR]; let lo = 0, hi = NR; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < t) lo = m + 1; else hi = m } return (lo / NR) * Rm }
    for (let k = 0; k < n; k++) {
      const R = ecdf(r.next())
      const th = r.next() * 2 * Math.PI
      const x = R * Math.cos(th), y = R * Math.sin(th) * e.q
      const X = x * cpa - y * spa, Y = x * spa + y * cpa
      const px = half + X * half, py = half - Y * half
      const col = cfg.colOld, jitter = 0.85 + 0.3 * r.next()
      const o = [px, py]
      const x0 = Math.floor(o[0] - 0.5), y0 = Math.floor(o[1] - 0.5)
      if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= W - 1) continue
      const idx = (y0 * W + x0) * 3
      acc[idx] += col[0] * jitter; acc[idx + 1] += col[1] * jitter; acc[idx + 2] += col[2] * jitter
    }
    // globular-cluster swarm: faint yellowish points, density ~ r^-1.5
    for (let k = 0; k < e.gcN * sc * sc; k++) {
      const R = Math.pow(r.next(), 1.9) * cfg.rmax * 1.0 + 0.01, th = r.next() * 2 * Math.PI
      const X = R * Math.cos(th), Y = R * Math.sin(th) * (0.5 + 0.5 * e.q)
      add2(X, Y)
    }
    function add2(X: number, Y: number) { const px = half + X * half, py = half - Y * half; splat(lum0, px, py, 0); const x0 = Math.floor(px), y0 = Math.floor(py); if (x0 < 1 || y0 < 1 || x0 >= W - 1 || y0 >= W - 1) return; for (let c = 0; c < 3; c++) acc[(y0 * W + x0) * 3 + c] += 7 * cfg.colOld[c] }
    cfg.extra?.(add, r, sc)
  } else {
    // ---- bulge
    const bq = cfg.bulge.q
    for (let k = 0; k < cfg.nBulge * sc * sc * 4; k++) {
      const u = r.next(), a = cfg.bulge.a / Math.sqrt(Math.pow(Math.max(1e-4, u), -2 / 3) - 1 + 1e-6)
      if (a > cfg.rmax * 0.6) continue
      const cz = 2 * r.next() - 1, ph = r.next() * 2 * Math.PI, s = Math.sqrt(1 - cz * cz)
      add(a * s * Math.cos(ph), a * s * Math.sin(ph), a * cz * bq, cfg.colBulge, cfg.bulge.amp)
    }
    // ---- bar
    if (cfg.bar) {
      const b = cfg.bar, cb = Math.cos(b.pa * DEG), sb = Math.sin(b.pa * DEG)
      for (let k = 0; k < b.n * sc * sc * 4; k++) {
        const x = (r.next() * 2 - 1) * b.a, y = r.gauss() * b.a * b.q * 0.4
        if (Math.abs(x) > b.a) continue
        const fall = 1 - Math.pow(Math.abs(x) / b.a, 3)
        if (r.next() > fall) continue
        add(x * cb - y * sb, x * sb + y * cb, r.gauss() * cfg.hz * 0.4, cfg.colBulge, b.amp)
      }
    }
    // ---- old disc (+ spiral modulation, a ring for M31)
    const dens = (R: number, th: number, a: Arm | undefined, ring: Cfg['ring']) => {
      let p = 1
      if (a) p *= 1 - a.strength + a.strength * arm(R, th, a)
      if (ring) p = Math.max(p * 0.5, p * 0.35 + ring.amp * Math.exp(-Math.pow((R - ring.r) / ring.w, 2)))
      return p
    }
    if (cfg.irregular) {
      // LMC-like: an off-centre bar, one dominant spiral stub, patchy clouds. Positions from a mixture, brightness modulated by 3D noise.
      for (let k = 0; k < (cfg.nOld + cfg.nYoung) * sc * sc * 4; k++) {
        const t = r.next()
        let X: number, Y: number
        if (t < 0.34) { const x = r.gauss() * 0.2, y = r.gauss() * 0.06; X = x * Math.cos(0.5) - y * Math.sin(0.5) - 0.04; Y = x * Math.sin(0.5) + y * Math.cos(0.5) } // bar
        else if (t < 0.7) { const R = gammaR(cfg.Rd), th = r.next() * 2 * Math.PI; X = R * Math.cos(th); Y = R * Math.sin(th) * 0.85 }
        else { const s = r.next(), th = -0.4 + s * 3.4, R = 0.1 + s * 0.35 + r.gauss() * 0.04; X = R * Math.cos(th) + 0.1; Y = R * Math.sin(th) * 0.8 } // single arm stub
        if (Math.hypot(X, Y) > cfg.rmax) continue
        const n = 0.5 + 0.5 * nz.fbm(X * 7, Y * 7, 1.3, 4)
        if (r.next() > n * n + 0.08) continue
        const young = r.next() < 0.3 + 0.5 * n
        add(X, Y, lap() * cfg.hz, young ? cfg.colYoung : cfg.colOld, (young ? 1.3 : 0.9) * taper(Math.hypot(X, Y)))
      }
    } else {
      const aOld = cfg.arms?.old, aYoung = cfg.arms?.young
      for (let k = 0; k < cfg.nOld * sc * sc * 4; k++) {
        const R = gammaR(cfg.Rd), th = r.next() * 2 * Math.PI
        if (R > cfg.rmax) continue
        if (r.next() > dens(R, th, aOld, cfg.ring)) continue
        const f = 0.55 + 0.45 * nz.fbm(Math.cos(th) * R * 12, Math.sin(th) * R * 12, 5.5, 3)
        if (r.next() > f) continue
        let colO = cfg.colOld
        if (cfg.colOuter && cfg.ramp) { const q = smoothstep(cfg.ramp[0], cfg.ramp[1], R); colO = [0, 1, 2].map((c) => cfg.colOld[c] * (1 - q) + cfg.colOuter![c] * q) as [number, number, number] }
        add(R * Math.cos(th), R * Math.sin(th), lap() * cfg.hz, colO, taper(R))
      }
      for (let k = 0; k < cfg.nYoung * sc * sc * 4; k++) {
        const R = gammaR(cfg.Rd * 1.15), th = r.next() * 2 * Math.PI
        if (R > cfg.rmax) continue
        if (r.next() > dens(R, th, aYoung, cfg.ring)) continue
        const f = 0.4 + 0.6 * nz.fbm(Math.cos(th) * R * 20, Math.sin(th) * R * 20, 9.1, 3)
        if (r.next() > f) continue
        add(R * Math.cos(th), R * Math.sin(th), lap() * cfg.hz * 0.45, cfg.colYoung, 1.6 * (0.5 + 0.5 * f) * taper(R))
      }
    }
    // ---- HII knots: pink, compact, bright, strictly in arms (or random for irregulars)
    const hii: Array<[number, number]> = []
    for (let k = 0; k < cfg.nHII * 40 && hii.length < cfg.nHII; k++) {
      const R = gammaR(cfg.Rd * 1.1), th = r.next() * 2 * Math.PI
      if (R > cfg.rmax * 0.95 || R < 0.06) continue
      const pk = cfg.arms ? arm(R, th, cfg.arms.young) : 0.6 * (0.5 + 0.5 * nz.noise(R * 9 * Math.cos(th), R * 9 * Math.sin(th), 2))
      if (r.next() > pk * pk) continue
      hii.push([R * Math.cos(th), R * Math.sin(th)])
    }
    for (const [X, Y] of hii) {
      const m = 25 + 120 * Math.pow(r.next(), 3), cols: Array<[number, number, number]> = [[1.0, 0.3, 0.45], [0.95, 0.38, 0.7]]
      for (let j = 0; j < 30 * sc * sc + 4; j++) add(X + r.gauss() * 0.0035 * (m / 60), Y + r.gauss() * 0.0035 * (m / 60), 0, cols[j & 1], m / 30 * 0.7 * (0.35 + 0.65 * taper(Math.hypot(X, Y))))
    }
    cfg.extra?.(add, r, sc)
  }
  // ---- soften (gaussian-ish blur) and tone-map to straight RGBA
  const blurC = (src: Float32Array, rad: number) => {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length)
    for (let c = 0; c < 3; c++) {
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { let s = 0, n = 0; for (let k = -rad; k <= rad; k++) { const xx = x + k; if (xx < 0 || xx >= W) continue; s += src[(y * W + xx) * 3 + c]; n++ } tmp[(y * W + x) * 3 + c] = s / n }
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { let s = 0, n = 0; for (let k = -rad; k <= rad; k++) { const yy = y + k; if (yy < 0 || yy >= W) continue; s += tmp[(yy * W + x) * 3 + c]; n++ } out[(y * W + x) * 3 + c] = s / n }
    }
    return out
  }
  const soft = blurC(acc, 1)
  const wide = blurC(soft, Math.round(6 * (W / 2048) + 1)) // bloom / unresolved glow
  const mix = new Float32Array(soft.length)
  for (let i = 0; i < mix.length; i++) mix[i] = soft[i] * 0.8 + wide[i] * 0.9
  // exposure: scale so the 99.7th percentile of luminance sits at `expo`
  const lum = new Float32Array(W * W)
  for (let i = 0; i < lum.length; i++) lum[i] = 0.3 * mix[i * 3] + 0.59 * mix[i * 3 + 1] + 0.11 * mix[i * 3 + 2]
  const sorted = Float32Array.from(lum).sort()
  const ref = sorted[Math.floor(sorted.length * 0.997)] || 1
  const k = cfg.expo / ref
  const sRGB = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)
  // COLOUR-PRESERVING tone map. The first version tone-mapped each channel on its own (1 - exp(-x)), which drives every bright
  // region toward white, and a blue + yellow star mix is already grey. Now: a filmic curve on LUMINANCE, the colour ratios are kept
  // and their saturation boosted (`sat`), clipping scales all channels together (hue kept), and only the very brightest core is
  // allowed to burn toward white.
  const SAT = cfg.sat ?? 1.65
  const out = new Uint8Array(W * W * 4)
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x
    const edge = 1 - smoothstep(0.93, 1.0, Math.hypot((x + 0.5 - half) / half, (y + 0.5 - half) / half))
    const m0 = mix[i * 3] * k, m1 = mix[i * 3 + 1] * k, m2 = mix[i * 3 + 2] * k
    const L = 0.3 * m0 + 0.59 * m1 + 0.11 * m2
    if (L < 1e-7) continue
    const Lt = 1 - Math.exp(-L * 1.6)
    // chroma relative to luminance, boosted about neutral
    let c0 = Math.max(0, 1 + SAT * (m0 / L - 1)), c1 = Math.max(0, 1 + SAT * (m1 / L - 1)), c2 = Math.max(0, 1 + SAT * (m2 / L - 1))
    const cl = 0.3 * c0 + 0.59 * c1 + 0.11 * c2 || 1
    c0 /= cl; c1 /= cl; c2 /= cl
    let t0 = c0 * Lt, t1 = c1 * Lt, t2 = c2 * Lt
    const mx = Math.max(t0, t1, t2)
    if (mx > 1) { t0 /= mx; t1 /= mx; t2 /= mx }
    const burn = smoothstep(0.6, 0.97, Lt) * 0.8 // only the brightest core goes toward white
    t0 += (1 - t0) * burn; t1 += (1 - t1) * burn; t2 += (1 - t2) * burn
    const e0 = sRGB(clamp(t0)) * edge, e1 = sRGB(clamp(t1)) * edge, e2 = sRGB(clamp(t2)) * edge
    const a = Math.max(e0, e1, e2, 1e-6)
    out[i * 4] = Math.round((e0 / a) * 255); out[i * 4 + 1] = Math.round((e1 / a) * 255); out[i * 4 + 2] = Math.round((e2 / a) * 255); out[i * 4 + 3] = Math.round(a * 255)
  }
  void lum0
  return { rgba: out, W }
}

const W_OLD: [number, number, number] = [1.0, 0.84, 0.62], W_YOUNG: [number, number, number] = [0.4, 0.62, 1.0], W_BULGE: [number, number, number] = [1.0, 0.8, 0.52]
const A = (m: number, pitch: number, phase: number, w: number, strength: number): Arm => ({ m, pitch, phase, w, strength })
const dim = 3e6

export const GALAXIES: Array<{ file: string; cfg: Cfg; usage: string }> = [
  { file: 'galaxy_spiral_face_2k.webp', usage: 'Face-on grand-design spiral (M101-style): two main arms + branches, HII knots, dust lanes on the inner arm edges', cfg: {
    name: 'M101-style', seed: 1101, inc: 8, pa: 20, Rd: 0.17, hz: 0.006, nOld: dim, nYoung: dim * 0.8, nBulge: 0.9e6, nHII: 260, nDust: 2.4e6, rmax: 0.95,
    bulge: { a: 0.035, q: 0.7, amp: 1.5 }, arms: { old: A(2, 17, 0.4, 0.09, 0.85), young: A(2, 17, 0.4, 0.045, 0.97), dust: A(2, 17, 0.4 - 0.1, 0.03, 0.95) },
    colOld: W_OLD, colYoung: W_YOUNG, colBulge: W_BULGE, expo: 1.0, dustTau: 2.6 } },
  { file: 'galaxy_spiral_edge_2k.webp', usage: 'Edge-on spiral (NGC 891 / Sombrero-like): thin disc, bulge, central dust lane', cfg: {
    name: 'edge-on', seed: 1102, inc: 89, pa: 8, Rd: 0.22, hz: 0.012, nOld: dim, nYoung: dim * 0.3, nBulge: 1.4e6, nHII: 60, nDust: 3.2e6, rmax: 0.95,
    bulge: { a: 0.06, q: 0.8, amp: 1.6 }, arms: { old: A(2, 15, 0.2, 0.08, 0.35), young: A(2, 15, 0.2, 0.05, 0.8), dust: A(2, 15, 0.1, 0.06, 0.5) },
    colOld: W_OLD, colYoung: W_YOUNG, colBulge: W_BULGE, expo: 1.0, dustTau: 4.0 } },
  { file: 'galaxy_spiral_barred_2k.webp', usage: 'Barred spiral (NGC 1300-style): prominent bar, two arms from the bar ends, little dust', cfg: {
    name: 'barred', seed: 1103, inc: 25, pa: 100, Rd: 0.2, hz: 0.006, nOld: dim, nYoung: dim * 0.7, nBulge: 0.8e6, nHII: 180, nDust: 1.6e6, rmax: 0.95,
    bulge: { a: 0.03, q: 0.8, amp: 1.2 }, bar: { a: 0.3, q: 0.3, pa: 20, amp: 1.0, n: 1.3e6 },
    arms: { old: A(2, 20, 0.2 + 0.35, 0.08, 0.5), young: A(2, 20, 0.2 + 0.35, 0.04, 0.95), dust: A(2, 20, 0.2 + 0.35 - 0.1, 0.03, 0.9) },
    colOld: W_OLD, colYoung: W_YOUNG, colBulge: W_BULGE, expo: 1.0, dustTau: 2.0 } },
  { file: 'galaxy_elliptical_2k.webp', usage: 'Giant elliptical (M87-style): smooth de Vaucouleurs light, globular-cluster swarm, faint stylised blue jet', cfg: {
    name: 'M87-style', seed: 1104, inc: 0, pa: 0, Rd: 0.2, hz: 0.01, nOld: 5e6, nYoung: 0, nBulge: 0, nHII: 0, nDust: 0, rmax: 0.95,
    bulge: { a: 0.05, q: 1, amp: 1 }, colOld: [1.0, 0.84, 0.6], colYoung: W_YOUNG, colBulge: [1.0, 0.78, 0.5], expo: 1.0, dustTau: 0, sat: 1.35,
    elliptical: { Re: 0.08, q: 0.92, pa: 20, n: 4, gcN: 9000 },
    extra: (add, r) => { // jet: a thin blue streak from the nucleus, PA ~290 deg (stylised, ~1.5% of the frame wide)
      for (let k = 0; k < 4000; k++) { const t = Math.pow(r.next(), 1.4) * 0.16; add(t * Math.cos(290 * DEG) + r.gauss() * 0.0012, t * Math.sin(290 * DEG) + r.gauss() * 0.0012, 0, [0.6, 0.72, 1.0], 4 * (1 - t / 0.18)) }
    } } },
  { file: 'galaxy_irregular_2k.webp', usage: 'Irregular (LMC-style): off-centre bar, one spiral stub, patchy star formation, pink HII knots', cfg: {
    name: 'LMC-style', seed: 1105, inc: 30, pa: 40, Rd: 0.22, hz: 0.02, nOld: dim * 0.9, nYoung: dim * 0.9, nBulge: 0.1e6, nHII: 300, nDust: 8e5, rmax: 0.92, irregular: true,
    bulge: { a: 0.02, q: 1, amp: 0.4 }, colOld: [1.0, 0.82, 0.58], colYoung: [0.46, 0.64, 1.0], colBulge: W_BULGE, expo: 1.0, dustTau: 1.0, sat: 2.0 } },
  { file: 'galaxy_m31_2k.webp', usage: 'Andromeda (M31) look-alike: inclination 77 deg, PA 35 deg, star-forming ring, strong dust lanes, M32 and M110 companions', cfg: {
    name: 'M31-like', seed: 1106, inc: 77, pa: 35 + 90, Rd: 0.28, hz: 0.008, nOld: dim, nYoung: dim * 0.5, nBulge: 1.6e6, nHII: 150, nDust: 3.6e6, rmax: 0.93,
    bulge: { a: 0.06, q: 0.8, amp: 1.6 }, ring: { r: 0.38, w: 0.06, amp: 1.4 }, arms: { old: A(2, 10, 0.5, 0.1, 0.25), young: A(2, 10, 0.5, 0.05, 0.6), dust: A(2, 10, 0.4, 0.04, 0.7) },
    colOld: [1.0, 0.82, 0.58], colYoung: [0.5, 0.66, 1.0], colBulge: [1.0, 0.76, 0.46], expo: 1.0, dustTau: 3.2,
    extra: (add, r) => { // M32 (compact elliptical, south of the nucleus), M110 (elongated dwarf, north-west). Offsets in the image frame.
      for (let k = 0; k < 90000; k++) { const R = Math.pow(r.next(), 1.8) * 0.045, th = r.next() * 6.283; add(0.12 + R * Math.cos(th), -0.2 + R * Math.sin(th) * 0.8, 0, [1.0, 0.82, 0.58], 1.6 * (1 - R / 0.05)) }
      for (let k = 0; k < 90000; k++) { const R = Math.pow(r.next(), 1.5) * 0.12, th = r.next() * 6.283; const x = R * Math.cos(th), y = R * Math.sin(th) * 0.4; add(-0.62 + x * 0.8 - y * 0.6, 0.5 + x * 0.6 + y * 0.8, 0, [1.0, 0.86, 0.66], 0.8 * (1 - R / 0.13)) }
    } } },
  { file: 'galaxy_m33_2k.webp', usage: 'Triangulum (M33) look-alike: inclination 54 deg, PA 23 deg, flocculent arms, strong HII regions (NGC 604-like), faint bulge', cfg: {
    name: 'M33-like', seed: 1107, inc: 54, pa: 23 + 90, Rd: 0.26, hz: 0.01, nOld: dim * 0.9, nYoung: dim, nBulge: 2e5, nHII: 420, nDust: 1.4e6, rmax: 0.93,
    bulge: { a: 0.02, q: 1, amp: 0.5 }, arms: { old: A(3, 14, 0.2, 0.08, 0.4), young: A(3, 14, 0.2, 0.045, 0.85), dust: A(3, 14, 0.1, 0.035, 0.75) },
    colOld: [1.0, 0.86, 0.66], colYoung: [0.38, 0.6, 1.0], colBulge: W_BULGE, expo: 1.0, dustTau: 1.6, sat: 2.0 } },
]

/** Top-down Milky Way ILLUSTRATION: same arm family as the sky model (two major arms, minor arms, Orion Spur), bar at 27 deg. NOT an observation. */
export function milkyWayTopDown(): Cfg {
  // Look (from the user's reference, an artist's concept, NOT copied): a golden bar + bulge only in the core; a broad, tightly wound
  // BLUE-WHITE disc with two strong arms leaving the bar ends and two fainter minor arms; pink star-forming knots strung along
  // the arms' inner edges; dark brown dust lanes just inside the arms. The disc colour ramps from warm (inner) to blue-white (outer).
  const BLUE_DISC: [number, number, number] = [0.62, 0.76, 1.0]
  return {
    name: 'MW-illustration', seed: 1108, inc: 0, pa: 0, Rd: 0.3, hz: 0.004, nOld: dim, nYoung: dim * 1.2, nBulge: 1.0e6, nHII: 900, nDust: 2.6e6, rmax: 0.95,
    bulge: { a: 0.04, q: 0.7, amp: 1.5 }, bar: { a: 0.17, q: 0.34, pa: 90 - 27, amp: 0.9, n: 1.2e6 },
    arms: { old: A(2, 13.5, 0.2, 0.09, 0.5), young: A(2, 13.5, 0.2, 0.04, 0.95), dust: A(2, 13.5, 0.2 - 0.075, 0.03, 0.95) },
    colOld: [0.95, 0.8, 0.6], colOuter: BLUE_DISC, ramp: [0.14, 0.42],
    colYoung: [0.5, 0.68, 1.0], colBulge: W_BULGE, expo: 1.0, dustTau: 2.4, sat: 1.5,
    extra: (add, r, sc) => { // two fainter minor arms (blue-white, broader), offset by a quarter turn
      const minor: Arm = A(2, 13.5, 0.2 + Math.PI / 2, 0.06, 0.9)
      const B = 16 * sc * sc // the disc particle counts scale with sc^2; keep the extras in the same proportion at every resolution
      for (let k = 0; k < 600000 * (B / 4); k++) {
        const R = 0.12 + 0.8 * Math.pow(r.next(), 0.8), th = r.next() * 2 * Math.PI
        if (r.next() > arm(R, th, minor)) continue
        add(R * Math.cos(th), R * Math.sin(th), 0, [0.66, 0.8, 1.0], 0.75 * taper(R) * 4)
      }
      // pink H II knots strung along the major arms' inner edge (small clusters, brighter in the outer half of the disc)
      const major: Arm = A(2, 13.5, 0.2 - 0.02, 0.022, 1)
      let nk = 0
      for (let k = 0; k < 400000 && nk < 520; k++) {
        const R = 0.14 + 0.78 * r.next(), th = r.next() * 2 * Math.PI
        if (r.next() > Math.pow(arm(R, th, major), 2)) continue
        nk++
        const X = R * Math.cos(th), Y = R * Math.sin(th), m = 0.6 + 2.2 * Math.pow(r.next(), 3)
        for (let j = 0; j < 28; j++) add(X + r.gauss() * 0.0028 * m, Y + r.gauss() * 0.0028 * m, 0, j & 1 ? [1.0, 0.32, 0.5] : [0.95, 0.4, 0.72], 2.4 * m * taper(R) * B)
      }
    },
  }
}

export async function genGalaxies(ctx: Ctx, only?: string[]) {
  const rec = (usage: string, file: string) => ({
    file, kind: 'procedural' as const, generator: 'tools/texgen/gen/galaxies.ts (layered particle render: old stars, young stars, HII knots, depth-aware dust)', zone: 'galaxies', usage,
    credit: 'ASTRA procedural look-alike (not a photograph; not a survey image)', tier: 'core' as const, colorSpace: 'srgb' as const, note: 'straight alpha, black-space look',
  })
  const save = async (file: string, usage: string, rgba: Uint8Array, W: number) => {
    const pre = ctx.preview ? '_preview/' : ''
    const full = path.join(OUT_DIR, pre + file)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    await sharp(rgba, { raw: { width: W, height: W, channels: 4 } }).webp({ quality: 88, alphaQuality: 100, effort: 5 }).toFile(full)
    const bytes = fs.statSync(full).size
    console.log(`  wrote ${pre}${file} ${W}x${W} ${(bytes / 1024).toFixed(0)} KB`)
    if (!ctx.preview) saveRecord({ ...rec(usage, file), w: W, h: W, channels: 4, bytes })
  }
  const jobs = [...GALAXIES.map((g) => ({ id: g.file.replace(/^galaxy_|_2k\.webp$/g, ''), file: g.file, usage: g.usage, cfg: g.cfg })),
    { id: 'milkyway', file: 'galaxy_milkyway_topdown_2k.webp', usage: 'Milky Way top-down ILLUSTRATION (bar, major + minor arms, Orion Spur); not an observation', cfg: milkyWayTopDown() }]
  for (const j of jobs) {
    if (only && !only.includes(j.id)) continue
    const t0 = Date.now()
    const { rgba, W } = await render(ctx, j.cfg)
    await save(j.file, j.usage, rgba, W)
    ctx.log(`  [${j.id}] ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  }
}
