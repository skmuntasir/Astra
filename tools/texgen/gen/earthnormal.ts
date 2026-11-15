import sharp from 'sharp'
import path from 'node:path'
import { OUT_DIR } from '../lib/io'
import { clamp, smoothstep } from '../lib/rng'
import type { Ctx } from '../lib/ctx'

/**
 * earth_normal_2k.jpg: a tangent-space normal map DERIVED from the imagery we have (there is no elevation model in the
 * project). It is NOT real topography:  height = coast-distance proxy (blurred land mask) + ice-sheet dome (blurred snow
 * mask, from the day map) + a little high-pass of the day-map luminance on land (hills, canyons, dune fields).
 * Ocean relief is masked flat by the shader with the ocean mask (the sea surface). Slopes are scaled by 1/cos(lat) so texels keep their physical size.
 * Convention: OpenGL tangent space, +Y = north = up in the image (the app loads bitmaps pre-flipped, v=1 north).
 */
async function loadGray(file: string, w: number, h: number): Promise<Float32Array> {
  const { data } = await sharp(path.join(OUT_DIR, file)).resize(w, h, { kernel: 'lanczos3' }).greyscale().raw().toBuffer({ resolveWithObject: true })
  const f = new Float32Array(w * h)
  for (let i = 0; i < f.length; i++) f[i] = data[i] / 255
  return f
}
/** separable gaussian blur, wraps in x, clamps in y */
function blur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const R = Math.ceil(sigma * 3)
  const ker = new Float32Array(2 * R + 1)
  let s = 0
  for (let i = -R; i <= R; i++) { ker[i + R] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += ker[i + R] }
  for (let i = 0; i < ker.length; i++) ker[i] /= s
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0
    for (let i = -R; i <= R; i++) a += ker[i + R] * src[y * w + ((x + i + w * 4) % w)]
    tmp[y * w + x] = a
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let a = 0
    for (let i = -R; i <= R; i++) a += ker[i + R] * tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x]
    out[y * w + x] = a
  }
  return out
}

export async function genEarthNormal(ctx: Ctx) {
  const W = ctx.W(2048), H = W / 2
  const ocean = await loadGray('real/earth-ocean.png', W, H) // 1 = ocean, 0 = land
  const rgb = (await sharp(path.join(OUT_DIR, 'real/earth-day.jpg')).resize(W, H, { kernel: 'lanczos3' }).raw().toBuffer())
  const land = new Float32Array(W * H), lum = new Float32Array(W * H), snow = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) {
    const r = rgb[i * 3] / 255, g = rgb[i * 3 + 1] / 255, b = rgb[i * 3 + 2] / 255
    land[i] = 1 - smoothstep(0.35, 0.65, ocean[i])
    lum[i] = 0.3 * r + 0.55 * g + 0.15 * b
    snow[i] = land[i] * smoothstep(0.62, 0.85, Math.min(r, g, b) * 0.5 + lum[i] * 0.5)
  }
  const k = W / 2048
  const base = blur(land, W, H, 9 * k)
  const dome = blur(snow, W, H, 18 * k)
  const lumLow = blur(lum, W, H, 7 * k)
  const hgt = new Float32Array(W * H)
  for (let i = 0; i < W * H; i++) hgt[i] = 1.0 * base[i] + 0.9 * dome[i] + land[i] * 1.5 * (lum[i] - lumLow[i]) // base is NOT masked: a gentle coastal ramp, the shader keeps the sea flat with the ocean mask
  const out = new Uint8Array(W * H * 3)
  const STRENGTH = 14 * k // slope gain (pixels of height per unit); picked by eye, // tuned on the globe preview
  for (let y = 0; y < H; y++) {
    const lat = (0.5 - (y + 0.5) / H) * Math.PI
    const cl = Math.max(0.08, Math.cos(lat))
    for (let x = 0; x < W; x++) {
      const xm = (x - 1 + W) % W, xp = (x + 1) % W, ym = Math.max(0, y - 1), yp = Math.min(H - 1, y + 1)
      const hx = (hgt[y * W + xp] - hgt[y * W + xm]) * 0.5 / cl // per texel east; texel is cos(lat) shorter
      const hrow = (hgt[yp * W + x] - hgt[ym * W + x]) * 0.5 // per texel DOWN (south)
      const nx = -hx * STRENGTH, ny = hrow * STRENGTH // +Y = north = -row direction => ny = +dh/drow ... (n = (-dh/dE, -dh/dN, 1), dh/dN = -dh/drow)
      const il = 1 / Math.hypot(nx, ny, 1)
      const o = (y * W + x) * 3
      out[o] = Math.round(clamp(nx * il * 0.5 + 0.5) * 255)
      out[o + 1] = Math.round(clamp(ny * il * 0.5 + 0.5) * 255)
      out[o + 2] = Math.round(clamp(il * 0.5 + 0.5) * 255)
    }
  }
  await ctx.save({
    file: 'earth_normal_2k.jpg', kind: 'procedural', generator: 'tools/texgen/gen/earthnormal.ts (relief inferred from the real day map + ocean mask)', zone: 'earth', tier: 'core', colorSpace: 'linear',
    usage: 'Earth tangent-space normal map, 2k. DERIVED from imagery (coast proxy + ice-sheet domes + day-map luminance high-pass); ocean flat. NOT real topography.',
    credit: 'ASTRA derived relief; inherits the NASA-derived inputs (credit-needed, see Earth day). Do not present as elevation data.',
  }, out, W, H, 3, { format: 'jpg', quality: 93, subsample444: true })
}
