import { clamp } from './rng'

/**
 * Ring-strip generator: a 1D radial profile -> RGBA strip (width = radial resolution, height = `rows` identical rows;
 * a ring shader maps radius -> u). `profile(r)` takes r in [0,1] (inner -> outer edge) and returns colour + alpha.
 * Output is straight (non-premultiplied) 8-bit RGBA.
 */
export interface RingSample { r: number; g: number; b: number; a: number }
export function ringStrip(width: number, rows: number, profile: (r: number) => RingSample): Uint8Array {
  const out = new Uint8Array(width * rows * 4)
  for (let x = 0; x < width; x++) {
    const s = profile((x + 0.5) / width)
    for (let y = 0; y < rows; y++) {
      const o = (y * width + x) * 4
      out[o] = Math.round(clamp(s.r) * 255)
      out[o + 1] = Math.round(clamp(s.g) * 255)
      out[o + 2] = Math.round(clamp(s.b) * 255)
      out[o + 3] = Math.round(clamp(s.a) * 255)
    }
  }
  return out
}
