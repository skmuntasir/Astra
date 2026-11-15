import fs from 'node:fs'
import sharp from 'sharp'
import path from 'node:path'
import { OUT_DIR, toU8, type WriteOpts } from './io'
import { saveRecord, type AssetRecord } from './manifest'
import type { Ctx } from './ctx'

export type Rec = Omit<AssetRecord, 'bytes' | 'w' | 'h' | 'channels' | 'file' | 'tier' | 'fallback'>

/**
 * Saves `name_<hiTag>.ext` (tier 'hi') and a downscaled `name_<loTag>.ext` (tier 'core', the mobile file), recording both.
 * If `loW` is omitted only one file is written and it is tier 'core'.
 * Alpha images are downscaled premultiplied-aware by sharp (straight alpha in, straight alpha out).
 */
export async function saveTiered(ctx: Ctx, rec: Rec, base: string, hiTag: string, loTag: string | null, data: Float32Array | Uint8Array, w: number, h: number, ch: 1 | 3 | 4, o: WriteOpts & { loW?: number } = {}) {
  const ext = o.format === 'png' ? 'png' : o.format === 'webp' ? 'webp' : 'jpg'
  const hiFile = `${base}_${hiTag}.${ext}`
  const loFile = loTag ? `${base}_${loTag}.${ext}` : undefined
  const u8 = data instanceof Uint8Array ? data : toU8(data, w, ch)
  await ctx.save({ ...rec, file: hiFile, tier: loFile ? 'hi' : 'core', fallback: loFile }, u8, w, h, ch, o)
  if (loFile && o.loW) {
    const lw = o.loW, lh = Math.max(1, Math.round((h * lw) / w))
    const pre = ctx.preview ? '_preview/' : ''
    const src = path.join(OUT_DIR, pre + hiFile), dst = path.join(OUT_DIR, pre + loFile)
    let img = sharp(src).resize(lw, lh, { kernel: 'lanczos3' })
    if (ext === 'jpg') img = img.jpeg({ quality: o.quality ?? 90, mozjpeg: true })
    else if (ext === 'png') img = img.png({ compressionLevel: 9, effort: 8 })
    else img = img.webp({ quality: o.quality ?? 85 })
    await img.toFile(dst)
    const bytes = fs.statSync(dst).size
    console.log(`  wrote ${pre}${loFile} ${lw}x${lh} ${(bytes / 1024).toFixed(0)} KB`)
    if (!ctx.preview) saveRecord({ ...rec, file: loFile, w: lw, h: lh, channels: ch, bytes, tier: 'core', usage: rec.usage + ' (mobile tier)' })
  }
}
