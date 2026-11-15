import { DEG } from './rng'

/**
 * Equirectangular grid helpers. Column 0 is lon -180, the last column is +180; row 0 is the north pole.
 * Unit-sphere position matches three's SphereGeometry: lon 0 is +X, north is +Y, east (+lon) runs toward -Z.
 */
export interface Grid {
  w: number
  h: number
  lon: Float32Array // radians, per column
  lat: Float32Array // radians, per row
  cosLon: Float32Array
  sinLon: Float32Array
  cosLat: Float32Array
  sinLat: Float32Array
}
export function makeGrid(w: number, h: number): Grid {
  const g: Grid = {
    w, h,
    lon: new Float32Array(w), lat: new Float32Array(h),
    cosLon: new Float32Array(w), sinLon: new Float32Array(w),
    cosLat: new Float32Array(h), sinLat: new Float32Array(h),
  }
  for (let x = 0; x < w; x++) {
    const l = ((x + 0.5) / w * 2 - 1) * Math.PI
    g.lon[x] = l; g.cosLon[x] = Math.cos(l); g.sinLon[x] = Math.sin(l)
  }
  for (let y = 0; y < h; y++) {
    const p = (0.5 - (y + 0.5) / h) * Math.PI
    g.lat[y] = p; g.cosLat[y] = Math.cos(p); g.sinLat[y] = Math.sin(p)
  }
  return g
}

export type Vec3 = [number, number, number]
export function vecFromLonLat(lonDeg: number, latDeg: number, out: Vec3 = [0, 0, 0]): Vec3 {
  const lo = lonDeg * DEG, la = latDeg * DEG
  out[0] = Math.cos(la) * Math.cos(lo)
  out[1] = Math.sin(la)
  out[2] = -Math.cos(la) * Math.sin(lo)
  return out
}

/** Calls fn(x, y, px, py, pz) for every pixel with the unit-sphere position. */
export function forEachPixel(g: Grid, fn: (x: number, y: number, px: number, py: number, pz: number, i: number) => void) {
  const { w, h } = g
  for (let y = 0; y < h; y++) {
    const cl = g.cosLat[y], sl = g.sinLat[y]
    for (let x = 0; x < w; x++) fn(x, y, cl * g.cosLon[x], sl, -cl * g.sinLon[x], y * w + x)
  }
}

/** Great-circle angular distance (radians) between two unit vectors. */
export const angDist = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
  const d = ax * bx + ay * by + az * bz
  return Math.acos(d > 1 ? 1 : d < -1 ? -1 : d)
}

/** Rotates (x, z) about the polar (Y) axis by `a` radians. Moving along a parallel of latitude is just this. */
export const rotY = (x: number, z: number, a: number, out: [number, number]) => {
  const c = Math.cos(a), s = Math.sin(a)
  out[0] = x * c + z * s
  out[1] = -x * s + z * c
  return out
}
