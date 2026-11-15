import { ranges, type ZoneRange, type V3, registryVersion } from './journey'

/**
 * Camera path: every zone's keyframes are flattened into ONE global key list (target in global metres, distance in
 * metres, angles in degrees) and each channel is interpolated with a monotone cubic (PCHIP): C1-continuous, never
 * overshoots, zero slope at `hold` keys. Distance is interpolated in log space so a 1e6x zoom feels uniform.
 */
export interface Pose {
  target: V3 // global metres
  dist: number // metres
  azim: number // deg
  elev: number
  fov: number
  roll: number
}

const CH = 8 // tx ty tz logd azim elev fov roll
interface Flat {
  T: Float64Array
  v: Float64Array[] // per channel
  m: Float64Array[] // slopes per channel
  n: number
}
const cache = new Map<string, { ver: number; flat: Flat }>()

function pchipSlopes(x: Float64Array, y: Float64Array, hold: boolean[]): Float64Array {
  const n = x.length
  const m = new Float64Array(n)
  if (n < 3) {
    const s = n === 2 ? (y[1] - y[0]) / (x[1] - x[0]) : 0
    m.fill(s)
  } else {
    const h = new Float64Array(n - 1)
    const d = new Float64Array(n - 1)
    for (let i = 0; i < n - 1; i++) { h[i] = x[i + 1] - x[i]; d[i] = (y[i + 1] - y[i]) / h[i] }
    for (let i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) m[i] = 0
      else {
        const w1 = 2 * h[i] + h[i - 1]
        const w2 = h[i] + 2 * h[i - 1]
        m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
      }
    }
    const end = (h0: number, h1: number, d0: number, d1: number) => {
      let s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1)
      if (Math.sign(s) !== Math.sign(d0)) s = 0
      else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(s) > 3 * Math.abs(d0)) s = 3 * d0
      return s
    }
    m[0] = end(h[0], h[1], d[0], d[1])
    m[n - 1] = end(h[n - 2], h[n - 3], d[n - 2], d[n - 3])
  }
  for (let i = 0; i < n; i++) if (hold[i]) m[i] = 0
  return m
}

function flatten(timelineId: string): Flat {
  const rs = ranges(timelineId)
  type K = { T: number; c: number[]; hold: boolean }
  const keys: K[] = []
  for (const z of rs) {
    const o = z.origin ?? [0, 0, 0]
    for (const k of z.camera) {
      const T = z.t0 + k.t * (z.t1 - z.t0)
      const c = [
        o[0] + k.target[0] * z.unit, o[1] + k.target[1] * z.unit, o[2] + k.target[2] * z.unit,
        Math.log(k.dist * z.unit), k.azim, k.elev, k.fov ?? 35, k.roll ?? 0,
      ]
      // zone boundary: the last key of zone A and the first of zone B share T; the later one wins (zones are authored to match)
      const last = keys[keys.length - 1]
      if (last && Math.abs(last.T - T) < 1e-9) keys[keys.length - 1] = { T, c, hold: !!k.hold || last.hold }
      else keys.push({ T, c, hold: !!k.hold })
    }
  }
  const n = keys.length
  const T = new Float64Array(n)
  const v = Array.from({ length: CH }, () => new Float64Array(n))
  keys.forEach((k, i) => { T[i] = k.T; for (let c = 0; c < CH; c++) v[c][i] = k.c[c] })
  // unwrap azimuth so the camera never spins the long way round
  for (let i = 1; i < n; i++) while (v[4][i] - v[4][i - 1] > 180) v[4][i] -= 360
  for (let i = 1; i < n; i++) while (v[4][i] - v[4][i - 1] < -180) v[4][i] += 360
  const holds = keys.map((k) => k.hold)
  const m = v.map((y) => pchipSlopes(T, y, holds))
  return { T, v, m, n }
}

function flatFor(timelineId: string): Flat {
  const ver = registryVersion()
  const c = cache.get(timelineId)
  if (c && c.ver === ver) return c.flat
  const flat = flatten(timelineId)
  cache.set(timelineId, { ver, flat })
  return flat
}

const tmp = new Float64Array(CH)
export function evalPose(T: number, timelineId = 'main', out?: Pose): Pose {
  const f = flatFor(timelineId)
  const x = Math.min(f.T[f.n - 1], Math.max(f.T[0], T))
  let lo = 0
  let hi = f.n - 1
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (f.T[mid] <= x) lo = mid; else hi = mid }
  const h = f.T[hi] - f.T[lo] || 1
  const u = (x - f.T[lo]) / h
  const u2 = u * u, u3 = u2 * u
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2
  for (let c = 0; c < CH; c++) tmp[c] = h00 * f.v[c][lo] + h10 * h * f.m[c][lo] + h01 * f.v[c][hi] + h11 * h * f.m[c][hi]
  const p = out ?? { target: [0, 0, 0], dist: 1, azim: 0, elev: 0, fov: 35, roll: 0 }
  p.target[0] = tmp[0]; p.target[1] = tmp[1]; p.target[2] = tmp[2]
  p.dist = Math.exp(tmp[3]); p.azim = tmp[4]; p.elev = tmp[5]; p.fov = tmp[6]; p.roll = tmp[7]
  return p
}

/** Camera position (global metres) for a pose. */
export function poseCameraPos(p: Pose, out: V3 = [0, 0, 0]): V3 {
  const a = (p.azim * Math.PI) / 180
  const e = (p.elev * Math.PI) / 180
  out[0] = p.target[0] + p.dist * Math.cos(e) * Math.sin(a)
  out[1] = p.target[1] + p.dist * Math.sin(e)
  out[2] = p.target[2] + p.dist * Math.cos(e) * Math.cos(a)
  return out
}

export type { ZoneRange }
