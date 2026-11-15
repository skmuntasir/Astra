import { saveRecord, type AssetRecord } from './manifest'
import { writeImage, resizeFile, toU8, type WriteOpts } from './io'
import fs from 'node:fs'
import path from 'node:path'
import { OUT_DIR } from './io'

/** Per-run context handed to each generator. `preview` renders at reduced size into public/textures/_preview. */
export interface Ctx {
  preview: boolean
  /** Scale a nominal width for preview runs (heights follow as w/2). */
  W: (nominal: number) => number
  save: (rec: Omit<AssetRecord, 'bytes' | 'w' | 'h' | 'channels' | 'file'> & { file: string }, data: Float32Array | Uint8Array, w: number, h: number, ch: 1 | 3 | 4, o?: WriteOpts) => Promise<void>
  resize: (src: string, dst: string, w: number, h: number) => Promise<void>
  log: (s: string) => void
}

export function makeCtx(preview: boolean, scale: number): Ctx {
  const pre = preview ? '_preview/' : ''
  return {
    preview,
    W: (n) => (preview ? Math.max(256, Math.round((n * scale) / 2) * 2) : n),
    async save(rec, data, w, h, ch, o) {
      const u8 = data instanceof Uint8Array ? data : toU8(data, w, ch)
      const bytes = await writeImage(pre + rec.file, u8, w, h, ch, o)
      if (!preview) saveRecord({ ...rec, w, h, channels: ch, bytes })
      console.log(`  wrote ${pre}${rec.file} ${w}x${h} ${(bytes / 1024).toFixed(0)} KB`)
    },
    async resize(src, dst, w, h) {
      await resizeFile(pre + src, pre + dst, w, h)
    },
    log: (s) => console.log(s),
  }
}
export { fs, path, OUT_DIR }
