import { clamp } from './rng'

export type RGB = [number, number, number]
export const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]
export type Stop = [number, string | RGB]

/** Colour ramp (piecewise linear in sRGB, which is how planetary palettes are usually authored). */
export function makeRamp(stops: Stop[]) {
  const s = stops.map(([t, c]) => [t, typeof c === 'string' ? hex(c) : c] as [number, RGB])
  return (t: number, out: RGB): RGB => {
    t = clamp(t)
    let i = 1
    while (i < s.length - 1 && t > s[i][0]) i++
    const [t0, c0] = s[i - 1]
    const [t1, c1] = s[i]
    const u = clamp((t - t0) / (t1 - t0 || 1))
    out[0] = c0[0] + (c1[0] - c0[0]) * u
    out[1] = c0[1] + (c1[1] - c0[1]) * u
    out[2] = c0[2] + (c1[2] - c0[2]) * u
    return out
  }
}
