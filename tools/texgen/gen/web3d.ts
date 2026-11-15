import fs from 'node:fs'
import path from 'node:path'
import { rng, clamp } from '../lib/rng'
import { saveRecord } from '../lib/manifest'
import { OUT_DIR, writeImage } from '../lib/io'
import type { Ctx } from '../lib/ctx'

/**
 * cosmicweb3d.bin: a 3-D "cosmic web" point set, SIMULATED (a Zel'dovich-approximation toy, not an N-body run and not survey data).
 *  1. Gaussian random density field on a 64^3 periodic grid, power spectrum P(k) ~ k^-1.5 with a smooth small-scale cut (k0 = 14 cells).
 *  2. Zel'dovich displacement field psi_k = i k delta_k / k^2 (three inverse FFTs). Particles start on a 64^3 lattice and move x = q + D psi(q):
 *     D is tuned so that the rms displacement is ~ 2.6 cells, enough shell crossing to empty the voids and pile the matter into sheets,
 *     filaments and knots (the "web").
 *  3. Each particle stores its position (u16 x3, fraction of the box) and the local density (CIC on the final positions, u8 in log scale),
 *     which the app uses for brightness and colour.
 * File: 'ACW1', u32 N, then N x { u16 x, u16 y, u16 z, u8 dens, u8 0 }. The `_lo` file is a seeded 35 % subsample (mobile tier).
 * The app maps the unit box to a physical size and labels it "schematic, based on large-scale structure surveys" (it is a look-alike).
 */

export function buildWeb(seed = 5150, nSeeds = 70, N = 262144) {
  const r = rng(seed)
  // void centres: dart throwing with a minimum separation (periodic), so cells are of similar size
  const sx: number[] = [], sy: number[] = [], sz: number[] = []
  const per = (d: number) => { d = Math.abs(d); return d > 0.5 ? 1 - d : d }
  let guard = 0
  while (sx.length < nSeeds && guard++ < 100000) {
    const x = r.next(), y = r.next(), z = r.next()
    let ok = true
    for (let i = 0; i < sx.length; i++) if (Math.hypot(per(x - sx[i]), per(y - sy[i]), per(z - sz[i])) < 0.14) { ok = false; break }
    if (ok) { sx.push(x); sy.push(y); sz.push(z) }
  }
  const S = sx.length
  const d = new Float64Array(S)
  const pos = new Float32Array(N * 3), dens = new Float32Array(N)
  let n = 0
  while (n < N) {
    const x = r.next(), y = r.next(), z = r.next()
    let m1 = 9, m2 = 9, m3 = 9, m4 = 9
    for (let i = 0; i < S; i++) {
      const v = Math.hypot(per(x - sx[i]), per(y - sy[i]), per(z - sz[i]))
      if (v < m1) { m4 = m3; m3 = m2; m2 = m1; m1 = v } else if (v < m2) { m4 = m3; m3 = m2; m2 = v } else if (v < m3) { m4 = m3; m3 = v } else if (v < m4) m4 = v
    }
    void d
    // sheets (equidistant from 2 centres), filaments (3), knots (4): the Voronoi-foam model of the cosmic web (Icke & van de Weygaert 1987)
    const wall = 0.05 * Math.exp(-(m2 - m1) / 0.007), fil = 0.6 * Math.exp(-(m3 - m1) / 0.009), node = 1.0 * Math.exp(-(m4 - m1) / 0.014)
    const w = 0.008 + wall + fil + node
    if (r.next() * 1.7 > w) continue
    pos[n * 3] = x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = z
    dens[n] = Math.max(0.1, w * 12)
    n++
  }
  return { pos, dens, n }
}

function pack(pos: Float32Array, dens: Float32Array, keep: (i: number) => boolean) {
  const idx: number[] = []
  for (let i = 0; i < dens.length; i++) if (keep(i)) idx.push(i)
  const buf = Buffer.alloc(8 + idx.length * 8)
  buf.write('ACW1', 0, 'ascii'); buf.writeUInt32LE(idx.length, 4)
  idx.forEach((i, k) => {
    const o = 8 + k * 8
    for (let c = 0; c < 3; c++) buf.writeUInt16LE(Math.min(65535, Math.round(pos[i * 3 + c] * 65535)), o + c * 2)
    // log density, 0.1 .. 60 x mean -> 0..255
    buf.writeUInt8(Math.round(clamp((Math.log(Math.max(dens[i], 0.1) / 0.1)) / Math.log(600)) * 255), o + 6)
    buf.writeUInt8(0, o + 7)
  })
  return { buf, count: idx.length }
}

export async function genWeb3d(ctx: Ctx) {
  const { pos, dens, n } = buildWeb()
  const pre = ctx.preview ? '_preview/' : ''
  fs.mkdirSync(path.join(OUT_DIR, pre || '.'), { recursive: true })
  const full = pack(pos, dens, () => true)
  const r = rng(5151)
  const lo = pack(pos, dens, () => r.next() < (ctx.preview ? 0.5 : 0.35))
  fs.writeFileSync(path.join(OUT_DIR, pre + 'cosmicweb3d.bin'), full.buf)
  fs.writeFileSync(path.join(OUT_DIR, pre + 'cosmicweb3d_lo.bin'), lo.buf)
  ctx.log(`  wrote ${pre}cosmicweb3d.bin ${full.count} pts ${(full.buf.length / 1024).toFixed(0)} KB, _lo ${lo.count} pts ${(lo.buf.length / 1024).toFixed(0)} KB (of ${n})`)
  // preview slab, for a human check of filaments and voids (not shipped)
  const W = 768, img = new Float32Array(W * W)
  for (let i = 0; i < n; i++) { const z = pos[i * 3 + 2]; if (Math.abs(z - 0.5) > 0.03) continue; const x = Math.floor(pos[i * 3] * W), y = Math.floor(pos[i * 3 + 1] * W); img[y * W + x] += 1 }
  const mx = 1.6
  const u8 = new Uint8Array(W * W)
  for (let i = 0; i < img.length; i++) u8[i] = Math.round(clamp(img[i] / mx) ** 0.6 * 255)
  fs.mkdirSync(path.join(OUT_DIR, '_preview'), { recursive: true })
  await writeImage('_preview/web3d_slab.png', u8, W, W, 1, { format: 'png' })
  if (ctx.preview) return
  const rec = { kind: 'procedural' as const, zone: 'universe', colorSpace: 'linear' as const, note: 'binary', credit: 'ASTRA procedural: Zel\'dovich-approximation toy, not an N-body simulation and not survey data.' }
  saveRecord({ ...rec, file: 'cosmicweb3d_lo.bin', w: lo.count, h: 1, channels: 0, bytes: lo.buf.length, tier: 'core', generator: 'tools/texgen/gen/web3d.ts', usage: 'Cosmic-web 3-D points, 35 % subsample (mobile tier). Record: u16 x,y,z (box fraction), u8 log-density, u8 pad. SIMULATED.' })
  saveRecord({ ...rec, file: 'cosmicweb3d.bin', w: full.count, h: 1, channels: 0, bytes: full.buf.length, tier: 'hi', fallback: 'cosmicweb3d_lo.bin', generator: 'tools/texgen/gen/web3d.ts (Gaussian field + Zel\'dovich displacement, 64^3 particles)', usage: 'Cosmic-web 3-D point set (periodic unit box), SIMULATED look-alike for large-scale structure. Record: u16 x,y,z (box fraction), u8 log-density, u8 pad.' })
}
