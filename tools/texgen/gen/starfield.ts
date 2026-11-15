import fs from 'node:fs'
import path from 'node:path'
import { rng, clamp, DEG } from '../lib/rng'
import { saveRecord } from '../lib/manifest'
import { OUT_DIR } from '../lib/io'
import type { Ctx } from '../lib/ctx'

/**
 * stars_field.bin: the naked-eye star field, SIMULATED (resolution independent point data, drawn as sprites by the app's sky).
 * ~12,000 stars with 4.0 <= V <= 7.5, same 'AFS1' record format as stars_faint.bin (u16 l, i16 b, u8 V, u8 B-V).
 *  - magnitudes: counts rise by ~10^0.45 per magnitude (a rough stand-in for the real luminosity function, // VERIFY)
 *  - positions: isotropic floor + enrichment toward the galactic plane (exp(-|b|/14 deg)) and toward the bulge (l = 0)
 *  - colours: B-V ~ N(0.6, 0.45) clipped to -0.2..1.8
 * These are NOT real stars (the ~136 real bright stars come from stars_bright.json); the HUD labels the field as simulated.
 */
export async function genStarField(ctx: Ctx) {
  const r = rng(424242)
  const N = ctx.preview ? 2000 : 12000
  const buf = Buffer.alloc(8 + N * 6)
  buf.write('AFS1', 0, 'ascii'); buf.writeUInt32LE(N, 4)
  const k = Math.LN10 * 0.45
  const v0 = 4.0, v1 = 7.5
  let n = 0
  while (n < N) {
    // isotropic point, rejection by plane/bulge density
    const z = r.next() * 2 - 1, l = r.next() * 360
    const b = Math.asin(z) / DEG
    const dens = (0.35 + 1.6 * Math.exp(-Math.abs(b) / 14)) * (1 + 0.45 * Math.cos(l * DEG) * Math.exp(-Math.abs(b) / 30))
    if (r.next() * 2.2 > dens) continue
    // inverse-CDF of p(V) ~ exp(k V) on [v0, v1]
    const u = r.next()
    const V = Math.log(Math.exp(k * v0) + u * (Math.exp(k * v1) - Math.exp(k * v0))) / k
    const bv = clamp(0.6 + 0.45 * r.gauss(), -0.2, 1.8)
    const o = 8 + n * 6
    buf.writeUInt16LE(Math.round((l / 360) * 65535), o)
    buf.writeInt16LE(Math.round((b / 90) * 32767), o + 2)
    buf.writeUInt8(Math.round(clamp((V - 4) / 12.75) * 255), o + 4)
    buf.writeUInt8(Math.round(clamp((bv + 0.4) / 2.55) * 255), o + 5)
    n++
  }
  const pre = ctx.preview ? '_preview/' : ''
  const f = path.join(OUT_DIR, pre + 'stars_field.bin')
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, buf)
  ctx.log(`  wrote ${pre}stars_field.bin ${N} stars ${(buf.length / 1024).toFixed(0)} KB`)
  if (!ctx.preview) saveRecord({
    file: 'stars_field.bin', w: N, h: 1, channels: 0, bytes: buf.length, kind: 'procedural',
    generator: 'tools/texgen/gen/starfield.ts (seeded point sampler)', zone: 'sky', tier: 'core', colorSpace: 'linear', note: 'binary',
    usage: `Naked-eye star field V 4.0-7.5, SIMULATED: ${N} stars, same record layout as stars_faint.bin (u16 l, i16 b, u8 V = 4+u8/255*12.75, u8 B-V = -0.4+u8/255*2.55)`,
    credit: 'ASTRA procedural: simulated field stars (density rises toward the galactic plane and bulge); NOT a catalogue. Real bright stars are in stars_bright.json.',
  })
}
