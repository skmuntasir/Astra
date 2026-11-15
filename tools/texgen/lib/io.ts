import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { hash2 } from './rng'

export type Fmt = 'png' | 'jpg' | 'webp'
export const OUT_DIR = path.resolve('public/textures')

/** Float [0,1] interleaved -> 8-bit with deterministic +-0.5 LSB dither (kills banding in smooth gradients). */
export function toU8(data: Float32Array, w: number, ch: number, dither = true): Uint8Array {
  const out = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) {
    const px = (i / ch) | 0
    const d = dither ? hash2(px % w, (px / w) | 0, i % ch) - 0.5 : 0
    const v = data[i] * 255 + d
    out[i] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
  }
  return out
}

export interface WriteOpts { format?: Fmt; quality?: number; lossless?: boolean; subsample444?: boolean }

/** Writes an 8-bit image (1, 3 or 4 channels). Returns the byte size. WebP is used only when asked for. */
export async function writeImage(file: string, raw: Uint8Array, w: number, h: number, ch: 1 | 3 | 4, o: WriteOpts = {}): Promise<number> {
  const format = o.format ?? (path.extname(file).slice(1) === 'jpeg' ? 'jpg' : (path.extname(file).slice(1) as Fmt))
  const full = path.join(OUT_DIR, file)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  let img = sharp(raw, { raw: { width: w, height: h, channels: ch } })
  if (format === 'png') img = img.png({ compressionLevel: 9, effort: 8 })
  else if (format === 'jpg') img = img.jpeg({ quality: o.quality ?? 90, mozjpeg: true, chromaSubsampling: o.subsample444 ? '4:4:4' : '4:2:0' })
  else img = img.webp({ quality: o.quality ?? 90, lossless: o.lossless ?? false })
  await img.toFile(full)
  return fs.statSync(full).size
}

/** Downscale an existing output file (used for the 2k mobile tier of the 4k Sun). */
export async function resizeFile(src: string, dst: string, w: number, h: number, quality = 90): Promise<number> {
  const out = path.join(OUT_DIR, dst)
  await sharp(path.join(OUT_DIR, src)).resize(w, h, { kernel: 'lanczos3' }).jpeg({ quality, mozjpeg: true }).toFile(out)
  return fs.statSync(out).size
}

/** Pack a Float32 channel into 1-channel gray. */
export const gray = (f: Float32Array) => toU8(f, 1, 1)
