/**
 * Procedural lunar relief.
 *
 * The only Moon map we ship is a 1024×512 albedo (≈260 KB). Seen close, that is soft. Instead of shipping
 * megabytes of normal map, we synthesise one at runtime from two ingredients:
 *   1. a population of craters with a realistic size–frequency law (cumulative count ∝ r⁻²), each with a
 *      raised rim, a bowl, an ejecta apron and (for large ones) a central peak, sparser on the maria;
 *   2. the high-pass of the albedo itself, so the real craters/ridges in the photo also catch the light.
 * The result is an RG tangent-space slope map (equirectangular, row 0 = SOUTH, to match WebGL texture space).
 *
 * Work is time-sliced (≈6 ms per task) so it never costs a dropped frame; the scene fades the detail in
 * when it lands. Deterministic: same seed → same Moon every load.
 */

export interface LunarDetailParams {
  width: number
  height: number
  /** Albedo luminance 0..1, north-up. */
  lum: Float32Array
  lumW: number
  lumH: number
  /** Crater count and radius range, in texels of the output (radius measured along v). */
  craters: number
  rMin: number
  rMax: number
  seed: number
}

/** Cancel handle. */
export type Cancel = () => void

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SLICE_MS = 6

function* build(p: LunarDetailParams): Generator<void, Uint8Array> {
  const { width: W, height: H, lum, lumW, lumH } = p
  const rand = rng(p.seed)
  const h = new Float32Array(W * H) // height in units of the Moon's radius; row 0 = north here
  let t0 = performance.now()
  const over = () => performance.now() - t0 > SLICE_MS

  // ── 1. High-pass of the albedo → low relief that follows the real features ──────────────────────────
  const blur = new Float32Array(lumW * lumH)
  const tmp = new Float32Array(lumW * lumH)
  const R = 4
  for (let y = 0; y < lumH; y++) {
    let acc = 0
    for (let x = -R; x <= R; x++) acc += lum[y * lumW + ((x + lumW) % lumW)]
    for (let x = 0; x < lumW; x++) {
      tmp[y * lumW + x] = acc / (2 * R + 1)
      acc += lum[y * lumW + ((x + R + 1) % lumW)] - lum[y * lumW + ((x - R + lumW) % lumW)]
    }
    if ((y & 31) === 31 && over()) {
      yield
      t0 = performance.now()
    }
  }
  for (let x = 0; x < lumW; x++) {
    let acc = 0
    for (let y = -R; y <= R; y++) acc += tmp[Math.min(lumH - 1, Math.max(0, y)) * lumW + x]
    for (let y = 0; y < lumH; y++) {
      blur[y * lumW + x] = acc / (2 * R + 1)
      acc += tmp[Math.min(lumH - 1, y + R + 1) * lumW + x] - tmp[Math.max(0, y - R) * lumW + x]
    }
    if ((x & 63) === 63 && over()) {
      yield
      t0 = performance.now()
    }
  }
  const HP = 0.0085 // albedo high-pass → height (Moon radii per unit of luminance)
  for (let y = 0; y < H; y++) {
    const ly = Math.min(lumH - 1, Math.floor((y * lumH) / H)) * lumW
    for (let x = 0; x < W; x++) {
      const li = ly + Math.min(lumW - 1, Math.floor((x * lumW) / W))
      h[y * W + x] = (lum[li] - blur[li]) * HP
    }
    if ((y & 31) === 31 && over()) {
      yield
      t0 = performance.now()
    }
  }
  yield

  // ── 2. Craters, largest first so small ones overprint large ones ───────────────────────────────────
  const list = new Float32Array(p.craters * 5) // x, y, r, age, mare
  const radii: number[] = []
  const ratio = (p.rMin / p.rMax) ** 2
  for (let i = 0; i < p.craters; i++) radii.push(p.rMin * (1 - rand() * (1 - ratio)) ** -0.5) // N(>r) ∝ r⁻²
  radii.sort((a, b) => b - a)
  let n = 0
  for (const r of radii) {
    const lat = Math.asin(2 * rand() - 1) // area-uniform on the sphere
    if (Math.abs(lat) > 1.38) continue // keep clear of the pole pinch
    const x = rand() * W
    const y = (0.5 - lat / Math.PI) * H
    const L = lum[Math.min(lumH - 1, Math.floor((y * lumH) / H)) * lumW + Math.min(lumW - 1, Math.floor((x * lumW) / W))]
    const mare = L < 0.43
    if (mare && rand() < (r < 12 ? 0.6 : 0.3)) continue // maria are younger, smoother, sparser
    list.set([x, y, r, rand(), mare ? 1 : 0], n * 5)
    n++
  }
  yield

  const Rpx = Math.PI / H // one texel along v, in Moon radii
  t0 = performance.now()
  for (let i = 0; i < n; i++) {
    const cx = list[i * 5]
    const cy = list[i * 5 + 1]
    const r = list[i * 5 + 2]
    const age = list[i * 5 + 3]
    const mare = list[i * 5 + 4]

    const lat = (0.5 - cy / H) * Math.PI
    const cosLat = Math.max(0.12, Math.cos(lat))
    const rx = Math.min(W / 3, r / cosLat) // round on the sphere, so wide in u at high latitude
    const rPhys = r * Rpx
    const big = Math.min(1, Math.max(0, (r - 4) / 18))
    const depth = rPhys * (0.2 - 0.1 * big) * (1 - 0.55 * age) * (mare ? 0.7 : 1)
    const rimH = rPhys * (0.05 + 0.02 * (1 - age)) * (1 - 0.4 * age)
    const w = 0.1 + 0.1 * age // older craters have a softer rim
    const peak = big > 0.35 ? depth * 0.35 * (1 - age) : 0

    const ext = 2.0
    const y0 = Math.max(0, Math.floor(cy - r * ext))
    const y1 = Math.min(H - 1, Math.ceil(cy + r * ext))
    const x0 = Math.floor(cx - rx * ext)
    const x1 = Math.ceil(cx + rx * ext)
    for (let y = y0; y <= y1; y++) {
      const dy = (y - cy) / r
      const row = y * W
      for (let xx = x0; xx <= x1; xx++) {
        const dx = (xx - cx) / rx
        const s2 = dx * dx + dy * dy
        if (s2 >= ext * ext) continue
        const s = Math.sqrt(s2)
        const tt = (s - 1) / w
        const rim = 1 / (1 + tt * tt)
        let v: number
        if (s < 1) {
          v = -depth * (1 - s2) + rimH * rim
          if (peak > 0) v += peak / (1 + (s / 0.14) ** 2)
        } else {
          v = rimH * (0.65 * rim + 0.35 / (s2 * s2))
        }
        h[row + ((xx % W) + W) % W] += v
      }
    }
    if ((i & 7) === 7 && over()) {
      yield
      t0 = performance.now()
    }
  }
  yield

  // ── 3. Heights → tangent-space slopes (RG), written with row 0 = south ───────────────────────────────
  const out = new Uint8Array(W * H * 4)
  const dn = 2 * (Math.PI / H) // two texels along v, in Moon radii
  const K = 1.6 // slope exaggeration: craters read at a distance only if they are a little overdrawn
  t0 = performance.now()
  for (let y = 0; y < H; y++) {
    const lat = (0.5 - (y + 0.5) / H) * Math.PI
    const c = Math.max(0.1, Math.cos(lat))
    const de = 2 * ((2 * Math.PI) / W) * c // two texels along u, in Moon radii
    const fade = 0.25 + 0.75 * c // calm the stretched polar rows
    const yN = Math.max(0, y - 1)
    const yS = Math.min(H - 1, y + 1)
    const dst = (H - 1 - y) * W
    for (let x = 0; x < W; x++) {
      const xe = (x + 1) % W
      const xw = (x + W - 1) % W
      const he = (h[y * W + xe] - h[y * W + xw]) / de
      const hn = (h[yN * W + x] - h[yS * W + x]) / dn
      let nx = -he * K * fade
      let ny = -hn * K * fade
      const m = Math.hypot(nx, ny, 1)
      nx /= m
      ny /= m
      const o = (dst + x) * 4
      out[o] = Math.round((nx * 0.5 + 0.5) * 255)
      out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255)
      out[o + 2] = 255
      out[o + 3] = 255
    }
    if ((y & 3) === 3 && over()) {
      yield
      t0 = performance.now()
    }
  }
  return out
}

/** Runs the generator in ~6 ms slices. Returns a cancel function. `onDone` receives RGBA bytes (row 0 = south). */
export function generateLunarDetail(p: LunarDetailParams, onDone: (rgba: Uint8Array) => void): Cancel {
  const gen = build(p)
  let dead = false
  let timer = 0
  const run = () => {
    if (dead) return
    const start = performance.now()
    for (;;) {
      const r = gen.next()
      if (r.done) {
        onDone(r.value)
        return
      }
      if (performance.now() - start > SLICE_MS) break
    }
    timer = window.setTimeout(run, 0)
  }
  timer = window.setTimeout(run, 0)
  return () => {
    dead = true
    window.clearTimeout(timer)
  }
}
