import fs from 'node:fs'
import sharp from 'sharp'
import path from 'node:path'
import { Simplex } from '../lib/noise'
import { rng, smoothstep, clamp, DEG, hash2 } from '../lib/rng'
import { eqToGal, eqToGalMatrix, galVec, bvToRgb } from '../lib/galactic'
import { BRIGHT } from '../data/brightStars'
import { saveRecord } from '../lib/manifest'
import { OUT_DIR, writeImage } from '../lib/io'
import type { Ctx } from '../lib/ctx'

/**
 * SKY. Equirectangular, GALACTIC coordinates: u = (180 - l)/360 (l=0 at the centre column, l grows to the left), v = (90 - b)/180.
 *  1) A coherent 3D model of the Galaxy seen from the Sun (R0 = 8.2 kpc), integrated along every line of sight at 2k x 1k:
 *     exponential thin+thick disc, a triaxial bar + bulge, four logarithmic spiral arms (+ the Local spur) that modulate both stars
 *     and dust, a flared dust layer with log-normal clumps, and a few explicit nearby dark clouds (Coalsack, Pipe, rho Oph,
 *     Aquila/Cygnus rift). Radiative transfer: I += j e^-tau ds, with two stellar populations (old/warm, young/blue).
 *  2) Upsampled (Catmull-Rom) to 8k, patchy dust detail and stellar granularity added from sphere-noise (seamless), Magellanic Clouds added.
 *  3) A star layer: the real bright stars (table in data/brightStars.ts, typed from memory // VERIFY) plus simulated V<7.5 field stars.
 *  4) A faint-star point-cloud buffer (simulated, density follows the model) and a very dark fallback gradient.
 * It is a stylised model, NOT a photograph or survey (Gaia/Planck/etc. are not used).
 */
const R0 = 8.2
const G = (l: number, b: number) => galVec(l, b)

interface Cloud { name: string; l: number; b: number; d: number; r: number; amp: number }
// Nearby dark clouds: galactic l, b (deg), distance (kpc), radius (kpc), peak density multiplier.  // VERIFY (positions from memory)
const CLOUDS: Cloud[] = [
  { name: 'Coalsack', l: 303.0, b: -0.8, d: 0.18, r: 0.016, amp: 14 },
  { name: 'Pipe Nebula', l: 0.0, b: 4.5, d: 0.15, r: 0.014, amp: 16 },
  { name: 'rho Ophiuchi', l: 353.0, b: 16.8, d: 0.14, r: 0.012, amp: 16 },
  { name: 'Aquila Rift a', l: 28.0, b: 2.0, d: 0.3, r: 0.05, amp: 12 },
  { name: 'Aquila Rift b', l: 36.0, b: 1.2, d: 0.45, r: 0.07, amp: 12 },
  { name: 'Cygnus Rift a', l: 50.0, b: 0.5, d: 0.6, r: 0.09, amp: 10 },
  { name: 'Cygnus Rift b', l: 66.0, b: 0.3, d: 0.8, r: 0.1, amp: 10 },
  { name: 'Cygnus Rift c', l: 80.0, b: 0.5, d: 1.0, r: 0.12, amp: 9 },
  { name: 'Taurus', l: 170.0, b: -15.0, d: 0.14, r: 0.02, amp: 8 },
  { name: 'Lupus', l: 340.0, b: 12.0, d: 0.16, r: 0.02, amp: 8 },
  { name: 'Vela', l: 262.0, b: -2.0, d: 0.7, r: 0.1, amp: 6 },
  { name: 'Carina', l: 288.0, b: -0.5, d: 2.3, r: 0.25, amp: 5 },
]
const ARMS = [ // radius (kpc) at the Sun's azimuth, relative weight. Pitch 14.5 deg, winding so R falls toward +l.   // VERIFY (stylised)
  { R: 4.6, w: 1.0 }, { R: 7.0, w: 1.0 }, { R: 9.9, w: 0.8 }, { R: 14.0, w: 0.5 },
]
const TANI = Math.tan(14.5 * DEG)
/** arm membership 0..1 and dust-lane bias at galactocentric (R, phi) */
export function armField(R: number, phi: number, wid: number): { star: number; best: number } {
  let s = 0
  for (const a of ARMS) {
    const m = Math.round((-Math.log(R / a.R) / TANI - phi) / (2 * Math.PI))
    const Rarm = a.R * Math.exp(-TANI * (phi + 2 * Math.PI * m))
    const dr = (R - Rarm) * Math.cos(14.5 * DEG)
    s += a.w * Math.exp(-(dr * dr) / (2 * wid * wid))
  }
  // Local (Orion) spur near the Sun
  const mL = Math.round((-Math.log(R / 8.3) / Math.tan(10 * DEG) - phi) / (2 * Math.PI))
  const dL = (R - 8.3 * Math.exp(-Math.tan(10 * DEG) * (phi + 2 * Math.PI * mL))) * 0.98
  s += 0.45 * Math.exp(-(dL * dL) / (2 * wid * wid)) * Math.exp(-phi * phi / 0.25)
  return { star: Math.min(1.4, s), best: 0 }
}

interface Model { W: number; H: number; old: Float32Array; young: Float32Array; tau: Float32Array }
function integrate(W: number, H: number, seed: number, log: (s: string) => void): Model {
  const N = new Simplex(seed), N2 = new Simplex(seed + 1)
  const old = new Float32Array(W * H), young = new Float32Array(W * H), tau = new Float32Array(W * H)
  const NS = 60, SMAX = 22
  const cl = CLOUDS.map((c) => { const v = G(c.l * DEG, c.b * DEG); return { x: -R0 + v[0] * c.d, y: v[1] * c.d, z: 0.02 + v[2] * c.d, r2: c.r * c.r, amp: c.amp } })
  const bar = 27 * DEG, ux = -Math.cos(bar), uy = Math.sin(bar), vx = -uy, vy = ux // bar major axis (near end toward +l), minor axis
  const t0 = Date.now()
  for (let y = 0; y < H; y++) {
    const b = (90 - ((y + 0.5) / H) * 180) * DEG, cb = Math.cos(b), sb = Math.sin(b)
    for (let x = 0; x < W; x++) {
      const l = (180 - ((x + 0.5) / W) * 360) * DEG
      const dx = cb * Math.cos(l), dy = cb * Math.sin(l), dz = sb
      let tOld = 0, tYoung = 0, tauAcc = 0, sPrev = 0
      for (let k = 0; k < NS; k++) {
        const s = SMAX * Math.pow((k + 0.5) / NS, 2.0), ds = SMAX * (Math.pow((k + 1) / NS, 2.0) - Math.pow(k / NS, 2.0))
        sPrev = s
        const gx = -R0 + s * dx, gy = s * dy, gz = 0.02 + s * dz
        const R = Math.hypot(gx, gy)
        const az = Math.atan2(gy, -gx) // galactocentric azimuth from the Sun's meridian, + toward l = 90
        const az0 = Math.abs(gz)
        if (az0 > 6 && s > 3) break
        const arm = armField(R, az, 0.5).star * smoothstep(2.5, 4.5, R) * (1 - smoothstep(13, 17, R))
        // stars
        const disc = Math.exp(-R / 2.6) * (0.95 * Math.exp(-az0 / 0.14) + 0.05 * Math.exp(-az0 / 0.5)) * (1 - smoothstep(14, 18, R))
        const bx = gx * ux + gy * uy, by = gx * vx + gy * vy
        const rb2 = (bx / 2.2) ** 2 + (by / 0.75) ** 2 + (gz / 0.5) ** 2
        const bulge = 9 * Math.exp(-rb2) + 14 * Math.exp(-(gx * gx + gy * gy + (gz / 0.7) ** 2) / 0.35) + 0.12 * Math.exp(-Math.hypot(gx, gy, gz * 1.6) / 1.0)
        // dust
        const flare = 0.09 * (1 + 0.6 * Math.max(0, R - R0) / R0)
        const clump = Math.exp(1.15 * N.fbm(gx * 2.2, gy * 2.2, gz * 5, 3) + 0.55 * N2.fbm(gx * 7, gy * 7, gz * 12, 2) - 0.55)
        let nd = Math.exp(-(R - R0) / 3.2) * Math.exp(-Math.abs(gz - 0.04 * Math.sin(az)) / flare) * (0.3 + 1.3 * arm) * clump
        nd *= 1 - 0.8 * smoothstep(1.2, 0.2, R) // clear the very centre (the GC gas is not modelled)
        for (const c of cl) { const ddx = gx - c.x, ddy = gy - c.y, ddz = gz - c.z; nd += c.amp * Math.exp(-(ddx * ddx + ddy * ddy + ddz * ddz) / c.r2) }
        const dtau = 1.4 * nd * ds
        const att = Math.exp(-tauAcc - 0.5 * dtau)
        tOld += (0.75 * disc + bulge) * att * ds
        tYoung += 0.9 * disc * Math.max(0, arm - 0.35) * att * ds * 2.2 * (1 + 2 * smoothstep(0, 1, R > 3 ? 1 : 0))
        tauAcc += dtau
        if (tauAcc > 14) break
      }
      void sPrev
      const i = y * W + x
      old[i] = tOld; young[i] = tYoung; tau[i] = tauAcc
    }
    if (y % 128 === 0) log(`  sky model row ${y}/${H} (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
  }
  return { W, H, old, young, tau }
}

/** Catmull-Rom sample of a (wrapping in x) float field. */
function cr(t: number) { const a = -0.5; const x = Math.abs(t); return x < 1 ? (a + 2) * x ** 3 - (a + 3) * x * x + 1 : x < 2 ? a * x ** 3 - 5 * a * x * x + 8 * a * x - 4 * a : 0 }
function sample(f: Float32Array, w: number, h: number, u: number, v: number): number {
  const x = u * w - 0.5, y = v * h - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0
  let s = 0
  for (let j = -1; j <= 2; j++) {
    const yy = Math.min(h - 1, Math.max(0, y0 + j)), wy = cr(fy - j)
    let r = 0
    for (let i = -1; i <= 2; i++) r += f[yy * w + (((x0 + i) % w) + w) % w] * cr(fx - i)
    s += r * wy
  }
  return s
}

const sRGB = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)

/** LMC / SMC as stylised gaussian-ellipse blobs in the tangent plane. Returns linear RGB add. */
function magellanic(l: number, b: number): [number, number, number] {
  const blob = (lc: number, bc: number, a: number, bb: number, pa: number, amp: number): number => {
    const v = G(l * DEG, b * DEG), c = G(lc * DEG, bc * DEG)
    const dot = v[0] * c[0] + v[1] * c[1] + v[2] * c[2]
    if (dot < 0.98) return 0
    // tangent-plane offsets (east = +l)
    const ex = -Math.sin(lc * DEG), ey = Math.cos(lc * DEG), ez = 0
    const nx = -Math.sin(bc * DEG) * Math.cos(lc * DEG), ny = -Math.sin(bc * DEG) * Math.sin(lc * DEG), nz = Math.cos(bc * DEG)
    const de = (v[0] * ex + v[1] * ey + v[2] * ez) / DEG, dn = (v[0] * nx + v[1] * ny + v[2] * nz) / DEG
    const p = pa * DEG, u = de * Math.cos(p) + dn * Math.sin(p), w = -de * Math.sin(p) + dn * Math.cos(p)
    const r = Math.hypot(u / a, w / bb)
    return amp * (Math.exp(-r * r * 1.4) + 0.35 * Math.exp(-r * 2.2))
  }
  let lmc = blob(280.5, -32.9, 4.6, 3.4, 20, 1) + 0.9 * blob(279.2, -33.4, 2.4, 0.8, 100, 1) // disc + bar
  const smc = blob(302.8, -44.3, 2.2, 1.0, 40, 1.2)
  const dor = blob(279.5, -31.7, 0.35, 0.35, 0, 1.3) // 30 Doradus
  lmc *= 0.5
  return [0.5 * lmc + 0.5 * smc + 0.6 * dor, 0.55 * lmc + 0.55 * smc + 0.2 * dor, 0.62 * lmc + 0.6 * smc + 0.28 * dor]
}

export async function genSky(ctx: Ctx) {
  const prev = ctx.preview
  const Wm = prev ? 512 : 2048, Hm = Wm / 2
  const Wf = ctx.W(8192), Hf = Wf / 2
  const model = integrate(Wm, Hm, 8801, ctx.log)
  const NF = new Simplex(8811), NG = new Simplex(8812), NH = new Simplex(8813)
  // tone: HDR -> display. Exposure chosen so the plane at l=60 reads mid-grey and the bulge stays below clipping.
  { // diagnostics: mean model radiance (old+young) by |b| in the l = 20..100 band and at the centre
    const mean = (b0: number, l0: number, l1: number) => { let a = 0, n = 0; const y = Math.floor(((90 - b0) / 180) * Hm); for (let x = 0; x < Wm; x++) { const l = 180 - ((x + 0.5) / Wm) * 360; if (l >= l0 && l <= l1) { a += model.old[y * Wm + x] + model.young[y * Wm + x]; n++ } } return (a / Math.max(1, n)).toFixed(4) }
    ctx.log('  model radiance l=20..100: ' + [0, 2, 5, 10, 20, 40, 70].map((b) => `b${b}=${mean(b + 0.01, 20, 100)}`).join(' ') + ' | centre ' + mean(0.01, -10, 10) + ' b10=' + mean(10, -10, 10))
  }
  const EXP_OLD = 0.9, EXP_YOUNG = 0.9, EXPOSE = 16, BLACK = 0.02
  const rowBuf = new Uint8Array(Wf * Hf * 3)
  const t0 = Date.now()
  for (let y = 0; y < Hf; y++) {
    const vv = (y + 0.5) / Hf, b = (90 - vv * 180)
    const cb = Math.cos(b * DEG), sb = Math.sin(b * DEG)
    for (let x = 0; x < Wf; x++) {
      const uu = (x + 0.5) / Wf, l = 180 - uu * 360
      const o = sample(model.old, Wm, Hm, uu, vv), yg = sample(model.young, Wm, Hm, uu, vv)
      let tau = Math.max(0, sample(model.tau, Wm, Hm, uu, vv))
      const gx = cb * Math.cos(l * DEG), gy = cb * Math.sin(l * DEG), gz = sb
      // fine dust: filaments and cloudlets, where the model column is already dusty. Tau is damped near b=0 detail.
      const nd = NF.fbm(gx * 18, gy * 18, gz * 18, 5), nd2 = NF.ridged(gx * 46 + 3, gy * 46, gz * 46, 3)
      const dustAmt = smoothstep(0.15, 2.5, tau) * (1 - smoothstep(25, 50, Math.abs(b)))
      const patch = smoothstep(-0.1, 0.5, nd + 0.35 * nd2 - 0.2)
      const lane = Math.exp(-Math.abs(b) / 9)
      const extra = dustAmt * lane * (0.9 * patch * patch + 1.6 * Math.max(0, nd2 - 0.5)) * (0.3 + 0.5 * smoothstep(0.1, 1.5, tau))
      const att = Math.exp(-extra * 1.1)
      // stellar granularity (unresolved stars + star clouds)
      const gran = 1 + 0.16 * NG.fbm(gx * 30, gy * 30, gz * 30, 4) + 0.06 * NH.noise(gx * 240, gy * 240, gz * 240)
      let rr = (o * 0.62 + yg * 0.42) * EXP_OLD, gg = (o * 0.52 + yg * 0.56) * EXP_OLD, bb = (o * 0.38 + yg * 0.78) * EXP_YOUNG
      rr *= att * gran; gg *= att * gran; bb *= att * gran
      // dust reddening of the transmitted light (scattering colours the lane edges brown)
      const red = Math.min(1, tau * 0.12 + extra * 0.1)
      rr *= 1 + 0.25 * red; gg *= 1 - 0.1 * red; bb *= 1 - 0.38 * red
      // faint zodiacal-free sky floor + airglow-ish diffuse background, bluer toward the poles
      rr += 0; gg += 0; bb += 0.0004
      const mc = magellanic(l, b)
      rr += mc[0] * 0.06; gg += mc[1] * 0.06; bb += mc[2] * 0.06
      // tone map
      const k = 1.0
      const tm = (c: number) => sRGB(1 - Math.exp(-k * Math.pow(Math.max(0, c - BLACK) * EXPOSE, 1.3)))
      const R8 = tm(rr), G8 = tm(gg), B8 = tm(bb)
      const dth = hash2(x, y, 3) - 0.5
      const p = (y * Wf + x) * 3
      rowBuf[p] = Math.max(0, Math.min(255, Math.round(R8 * 255 + dth)))
      rowBuf[p + 1] = Math.max(0, Math.min(255, Math.round(G8 * 255 + dth)))
      rowBuf[p + 2] = Math.max(0, Math.min(255, Math.round(B8 * 255 + dth)))
    }
    if (y % 512 === 0) ctx.log(`  sky 8k row ${y}/${Hf} (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
  }
  const rec = { kind: 'procedural' as const, zone: 'sky', colorSpace: 'srgb' as const, generator: 'tools/texgen/gen/sky.ts (3D Galaxy model, ray-integrated; galactic coordinates)', credit: 'ASTRA procedural model of the Milky Way as seen from the Sun (NOT a survey image; dark clouds and arms are stylised)' }
  const pre = prev ? '_preview/' : ''
  const hiFile = 'milkyway_8k.jpg'
  const bytes = await writeImage(pre + hiFile, rowBuf, Wf, Hf, 3, { format: 'jpg', quality: 88 })
  ctx.log(`  wrote ${pre}${hiFile} ${Wf}x${Hf} ${(bytes / 1024).toFixed(0)} KB`)
  if (!prev) saveRecord({ ...rec, file: hiFile, w: Wf, h: Hf, channels: 3, bytes, tier: 'hi', fallback: 'milkyway_4k.jpg', usage: 'Milky Way panorama, galactic coords (u=(180-l)/360, v=(90-b)/180)' })
  await sharp(path.join(OUT_DIR, pre + hiFile)).resize(Wf / 2, Hf / 2, { kernel: 'lanczos3' }).jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(OUT_DIR, pre + 'milkyway_4k.jpg'))
  if (!prev) saveRecord({ ...rec, file: 'milkyway_4k.jpg', w: Wf / 2, h: Hf / 2, channels: 3, bytes: fs.statSync(path.join(OUT_DIR, 'milkyway_4k.jpg')).size, tier: 'core', usage: 'Milky Way panorama, 4k fallback (mobile tier, also the 4k desktop-low option)' })

  // ---------- very dark gradient fallback (256x128): faint blue-grey glow on the galactic plane, used if the panorama is unavailable
  {
    const w = 256, h = 128, out = new Uint8Array(w * h * 3)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const b = (90 - ((y + 0.5) / h) * 180) * DEG, l = (180 - ((x + 0.5) / w) * 360) * DEG
      const glow = Math.exp(-Math.pow(b / (11 * DEG), 2)) * (0.55 + 0.45 * Math.exp(-Math.pow(Math.atan2(Math.sin(l), Math.cos(l)) / (50 * DEG), 2)))
      const p = (y * w + x) * 3
      out[p] = Math.round(255 * sRGB(0.004 + 0.02 * glow)); out[p + 1] = Math.round(255 * sRGB(0.005 + 0.021 * glow)); out[p + 2] = Math.round(255 * sRGB(0.009 + 0.03 * glow))
    }
    await ctx.save({ ...rec, file: 'sky_fallback_256.jpg', generator: 'tools/texgen/gen/sky.ts (analytic gradient)', tier: 'core', usage: 'Very dark gradient fallback sky (256x128), shown if the panorama cannot load' }, out, w, h, 3, { format: 'jpg', quality: 90 })
  }

  // ---------- STAR LAYER: real bright stars + simulated V<7.5 field stars, flux-correct Gaussian PSFs on black
  await genStarLayer(ctx, model, rec)
}

async function genStarLayer(ctx: Ctx, model: Model, rec: any) {
  const prev = ctx.preview
  const W = ctx.W(8192), H = W / 2
  const acc = new Float32Array(W * H * 3)
  const sig = W / 8192 * 0.85 + 0.2
  // flux normalisation: a V=6.0 star reaches a peak of ~0.55 in linear display units; Gaussian volume = 2*pi*sig^2
  const FLUX6 = 0.55 * 2 * Math.PI * sig * sig
  const splat = (l: number, b: number, V: number, rgb: [number, number, number]) => {
    const flux = FLUX6 * Math.pow(10, -0.4 * (V - 6.0))
    const cx = (0.5 - 0 - (l / 360)) * W, cy = (0.5 - b / 180) * H // l in deg (-180..180 mapping handled by caller)
    const bloom = flux > FLUX6 * 6
    const rad = Math.ceil(sig * (bloom ? 9 : 3.2)) + (V < 1 ? 6 : 0)
    const sx = 1 / Math.max(0.2, Math.cos(b * DEG)) // equirect stretch near the poles
    const x0 = Math.floor(cx), y0 = Math.floor(cy)
    for (let dy = -rad; dy <= rad; dy++) {
      const yy = y0 + dy
      if (yy < 0 || yy >= H) continue
      for (let dx = -Math.ceil(rad * Math.min(sx, 6)); dx <= Math.ceil(rad * Math.min(sx, 6)); dx++) {
        const fx = (x0 + dx + 0.5 - cx) / Math.min(sx, 6), fy = yy + 0.5 - cy
        const r2 = fx * fx + fy * fy
        let v = Math.exp(-r2 / (2 * sig * sig)) / (2 * Math.PI * sig * sig)
        if (bloom) v += 0.015 * Math.exp(-r2 / (2 * (sig * 4) ** 2)) / (2 * Math.PI * (sig * 4) ** 2) * 16 + 0.002 * Math.exp(-Math.sqrt(r2) / (sig * 3)) / (2 * Math.PI * sig * sig)
        const xx = (((x0 + dx) % W) + W) % W
        const p = (yy * W + xx) * 3, a = v * flux / Math.min(sx, 6)
        acc[p] += a * rgb[0]; acc[p + 1] += a * rgb[1]; acc[p + 2] += a * rgb[2]
      }
    }
  }
  const toU = (lRad: number) => { let l = lRad / DEG; if (l > 180) l -= 360; return l } // -180..180, then u = 0.5 - l/360
  const bright: Array<{ name: string; l: number; b: number; V: number; BV: number }> = []
  for (const [name, rh, rm, dd, dm, V, BV] of BRIGHT) {
    const ra = (rh + rm / 60) * 15 * DEG
    const sign = dd < 0 || (dd === 0 && dm < 0) ? -1 : 1
    const dec = sign * (Math.abs(dd) + Math.abs(dm) / 60) * DEG
    const g = eqToGal(ra, dec)
    bright.push({ name, l: g.l / DEG, b: g.b / DEG, V, BV })
  }
  // dedupe the one duplicated entry (Alpheratz / Sirrah)
  const seen = new Set<string>()
  const uniq = bright.filter((s) => { const k = s.l.toFixed(2) + s.b.toFixed(2); if (seen.has(k)) return false; seen.add(k); return true })
  for (const s of uniq) splat(toU(s.l * DEG), s.b, s.V, bvToRgb(s.BV))
  // simulated field stars, V 3.4..7.5, positions drawn from the model's brightness + an isotropic floor (labelled simulated)
  const r = rng(8899)
  const cdf = new Float64Array(model.W * model.H)
  let tot = 0
  for (let y = 0; y < model.H; y++) { const cb = Math.cos((90 - ((y + 0.5) / model.H) * 180) * DEG); for (let x = 0; x < model.W; x++) { const i = y * model.W + x; tot += (0.25 + 4 * (model.old[i] + model.young[i]) / (1 + 0.06 * model.tau[i])) * cb; cdf[i] = tot } }
  const pick = (): { l: number; b: number } => {
    const t = r.next() * tot
    let lo = 0, hi = cdf.length - 1
    while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < t) lo = m + 1; else hi = m }
    const y = Math.floor(lo / model.W), x = lo % model.W
    return { l: 180 - ((x + r.next()) / model.W) * 360, b: 90 - ((y + r.next()) / model.H) * 180 }
  }
  const nField = prev ? 800 : 6500
  for (let k = 0; k < nField; k++) { const p = pick(); const V = 7.5 - 4.1 * Math.pow(r.next(), 0.42); const bv = clamp(0.55 + 0.55 * r.gauss(), -0.2, 1.8); splat(toU(((p.l + 360) % 360) * DEG), p.b, V, bvToRgb(bv)) }
  const out = new Uint8Array(W * H * 3)
  for (let i = 0; i < out.length; i++) { const d = hash2(i % W, (i / W / 3) | 0, 5) - 0.5; out[i] = Math.max(0, Math.min(255, Math.round(255 * sRGB(1 - Math.exp(-acc[i])) + d * 0.6))) }
  const r2 = { ...rec, generator: 'tools/texgen/gen/sky.ts (flux-correct star PSFs: ~' + uniq.length + ' real bright stars + simulated field stars)', credit: 'Real star positions/magnitudes typed from memory (// VERIFY); field stars to V=7.5 are SIMULATED. Not a photograph.' }
  const pre = prev ? '_preview/' : ''
  const bytes = await writeImage(pre + 'stars_8k.jpg', out, W, H, 3, { format: 'jpg', quality: 90, subsample444: true })
  ctx.log(`  wrote ${pre}stars_8k.jpg ${W}x${H} ${(bytes / 1024).toFixed(0)} KB (${uniq.length} real + ${nField} simulated)`)
  if (!prev) saveRecord({ ...r2, file: 'stars_8k.jpg', w: W, h: H, channels: 3, bytes, tier: 'hi', fallback: 'stars_4k.jpg', usage: 'Star layer, galactic coords (additive over the panorama): real bright stars + simulated V<7.5 field' })
  await sharp(path.join(OUT_DIR, pre + 'stars_8k.jpg')).resize(W / 2, H / 2, { kernel: 'lanczos3' }).jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' }).toFile(path.join(OUT_DIR, pre + 'stars_4k.jpg'))
  if (!prev) saveRecord({ ...r2, file: 'stars_4k.jpg', w: W / 2, h: H / 2, channels: 3, bytes: fs.statSync(path.join(OUT_DIR, 'stars_4k.jpg')).size, tier: 'core', usage: 'Star layer 4k (mobile tier)' })

  // ---------- faint-star point cloud (simulated): int16 l, int16 b, u8 V, u8 colour  (6 bytes/star), header 'AFS1' + u32 count
  const NP = prev ? 20000 : 220000
  const buf = Buffer.alloc(8 + NP * 6)
  buf.write('AFS1', 0, 'ascii'); buf.writeUInt32LE(NP, 4)
  for (let k = 0; k < NP; k++) {
    const p = pick()
    const V = 7.5 + 5.0 * Math.pow(r.next(), 0.55) // 7.5..12.5, more faint than bright
    const bv = clamp(0.6 + 0.5 * r.gauss(), -0.2, 1.9)
    const o = 8 + k * 6
    buf.writeUInt16LE(Math.round((((p.l % 360) + 360) % 360) / 360 * 65535), o)
    buf.writeInt16LE(Math.round((p.b / 90) * 32767), o + 2)
    buf.writeUInt8(Math.round(clamp((V - 4) / 12.75) * 255), o + 4)
    buf.writeUInt8(Math.round(clamp((bv + 0.4) / 2.55) * 255), o + 5)
  }
  const f = path.join(OUT_DIR, pre + 'stars_faint.bin')
  fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf)
  if (!prev) saveRecord({ ...r2, file: 'stars_faint.bin', w: NP, h: 1, channels: 0, bytes: buf.length, tier: 'core', colorSpace: 'linear', usage: `Faint-star point cloud, SIMULATED: ${NP} stars, 6 B each after an 8 B header 'AFS1'+u32 count; l=u16/65535*360 deg, b=i16/32767*90 deg, V=4+u8/255*12.75, B-V=-0.4+u8/255*2.55`, note: 'binary' })
  // real bright stars as JSON for labels / sprites, plus the equatorial->galactic matrix
  const json = { note: 'Real bright stars typed from memory (// VERIFY). l,b in degrees (galactic), V magnitude, B-V; rgb from B-V via a blackbody fit. eqToGal is the row-major 3x3 rotation from J2000 equatorial to galactic unit vectors. Texture convention: u=(180-l)/360, v=(90-b)/180.', eqToGal: eqToGalMatrix(), stars: uniq.map((s) => ({ name: s.name, l: +s.l.toFixed(3), b: +s.b.toFixed(3), V: s.V, BV: s.BV, rgb: bvToRgb(s.BV).map((c) => +c.toFixed(3)) })) }
  const jf = path.join(OUT_DIR, pre + 'stars_bright.json')
  fs.writeFileSync(jf, JSON.stringify(json))
  if (!prev) saveRecord({ ...r2, file: 'stars_bright.json', w: uniq.length, h: 1, channels: 0, bytes: fs.statSync(jf).size, tier: 'core', colorSpace: 'linear', usage: 'Real bright stars (galactic l,b, V, B-V, rgb) + equatorial->galactic matrix', note: 'json' })
}
