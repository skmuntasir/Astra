import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Orthographic "globe" previews: wraps an equirect map on a sphere (Lambert-lit, no atmosphere) and tiles several views per file.
 * Usage: tsx tools/texgen/globes.ts out.png file1:lon:lat[,lon:lat...] file2 ...   (files relative to public/textures[/_preview])
 */
async function globe(file: string, lonDeg: number, latDeg: number, S = 360, lit = 1): Promise<Buffer> {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width, H = info.height, C = info.channels
  const out = Buffer.alloc(S * S * 3, 8)
  const lo = (lonDeg * Math.PI) / 180, la = (latDeg * Math.PI) / 180
  const cl = Math.cos(la), sl = Math.sin(la), co = Math.cos(lo), so = Math.sin(lo)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = ((x + 0.5) / S) * 2 - 1, v = 1 - ((y + 0.5) / S) * 2
    const r2 = u * u + v * v
    if (r2 > 1) continue
    const w = Math.sqrt(1 - r2)
    // view frame: forward f = lon/lat direction, right, up
    const fx = cl * co, fy = sl, fz = -cl * so
    const rx = -so, ry = 0, rz = -co
    const ux = fy * rz - fz * ry, uy = fz * rx - fx * rz, uz = fx * ry - fy * rx
    const px = fx * w + rx * u + ux * v, py = fy * w + ry * u + uy * v, pz = fz * w + rz * u + uz * v
    const lon = Math.atan2(-pz, px), lat = Math.asin(Math.max(-1, Math.min(1, py)))
    const tx = Math.min(W - 1, Math.floor(((lon / Math.PI + 1) / 2) * W)), ty = Math.min(H - 1, Math.floor((0.5 - lat / Math.PI) * H))
    const light = lit ? Math.max(0.06, 0.25 + 0.95 * (w * 0.8 + u * 0.35 + v * 0.15)) : 1
    const o = (y * S + x) * 3, i = (ty * W + tx) * C
    for (let k = 0; k < 3; k++) out[o + k] = Math.min(255, Math.round((C >= 3 ? data[i + k] : data[i]) * light))
  }
  return sharp(out, { raw: { width: S, height: S, channels: 3 } }).png().toBuffer()
}
async function main() {
  const [outFile, ...specs] = process.argv.slice(2)
  const dir = path.resolve('public/textures')
  const tiles: Buffer[] = []
  for (const sp of specs) {
    const [f, ...views] = sp.split(':')
    const file = fs.existsSync(path.join(dir, '_preview', f)) && process.env.PREVIEW ? path.join(dir, '_preview', f) : path.join(dir, f)
    const vs = views.length ? views.join(':').split(',') : ['0:0']
    for (const v of vs) { const [lo, la] = v.split(':').map(Number); tiles.push(await globe(file, lo || 0, la || 0)) }
  }
  const S = 360, cols = Math.min(tiles.length, 4), rows = Math.ceil(tiles.length / cols)
  await sharp({ create: { width: cols * S, height: rows * S, channels: 3, background: '#06080c' } })
    .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * S, top: Math.floor(i / cols) * S }))).png().toFile(outFile)
}
main()
