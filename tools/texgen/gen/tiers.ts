import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { OUT_DIR } from '../lib/io'
import { loadRecords, saveRecord } from '../lib/manifest'
import type { Ctx } from '../lib/ctx'

/**
 * Lower tiers derived from the finished hi files (Lanczos downscale; reproducible, no new content):
 *   milkyway_8k -> milkyway_2k (mobile, 'core'), milkyway_4k stays as the optional 'mid' file
 *   stars_8k    -> stars_2k
 *   galaxy_*_2k.webp -> galaxy_*_1k.webp (mobile)       cosmicweb_2k -> cosmicweb_1k
 * The hi record becomes tier 'hi' with `fallback` = the lower file; the lower file is tier 'core' (what a mobile device loads).
 */
export async function genTiers(ctx: Ctx) {
  if (ctx.preview) return
  const recs = loadRecords()
  const jobs: Array<[string, string, number]> = [['milkyway_8k.jpg', 'milkyway_2k.jpg', 2048], ['stars_8k.jpg', 'stars_2k.jpg', 2048], ['cosmicweb_2k.jpg', 'cosmicweb_1k.jpg', 1024]]
  for (const f of fs.readdirSync(OUT_DIR)) if (/^galaxy_.*_2k\.webp$/.test(f)) jobs.push([f, f.replace('_2k.webp', '_1k.webp'), 1024])
  for (const [src, dst, w] of jobs) {
    const hi = recs[src]
    if (!hi) { ctx.log(`  tiers: ${src} has no record, skipped`); continue }
    const h = Math.round((hi.h * w) / hi.w)
    let img = sharp(path.join(OUT_DIR, src)).resize(w, h, { kernel: 'lanczos3' })
    if (dst.endsWith('.jpg')) img = img.jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' })
    else img = img.webp({ quality: 88, alphaQuality: 100, effort: 5 })
    await img.toFile(path.join(OUT_DIR, dst))
    const bytes = fs.statSync(path.join(OUT_DIR, dst)).size
    saveRecord({ ...hi, file: dst, w, h, bytes, tier: 'core', fallback: undefined, usage: hi.usage + ' (mobile tier, derived by tools/texgen/gen/tiers.ts)' })
    saveRecord({ ...hi, tier: 'hi', fallback: dst })
    ctx.log(`  tiers: ${dst} ${w}x${h} ${(bytes / 1024).toFixed(0)} KB`)
  }
  // the 4k panorama / star layer stay as optional mid-size files: not preloaded, not counted in either tier total
  for (const f of ['milkyway_4k.jpg', 'stars_4k.jpg']) { const r = recs[f]; if (r) saveRecord({ ...r, tier: 'mid', fallback: undefined, usage: r.usage.replace(/\(mobile tier.*$/, '') + ' (optional mid tier, 4k; not preloaded by default)' }) }
}
