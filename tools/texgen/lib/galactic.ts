import { DEG } from './rng'
/**
 * Galactic coordinates (IAU 1958 system, J2000): north galactic pole RA 192.85948 deg, Dec 27.12825 deg; l of the north celestial pole 122.93192 deg.
 * Sky textures use u = (180 - l)/360 (l = 0 at the centre column, l increases to the LEFT, as in sky charts), v = (90 - b)/180 (row 0 = north galactic pole).
 */
const A_NGP = 192.85948 * DEG, D_NGP = 27.12825 * DEG, L_NCP = 122.93192 * DEG
export function eqToGal(raRad: number, decRad: number): { l: number; b: number } {
  const sb = Math.sin(decRad) * Math.sin(D_NGP) + Math.cos(decRad) * Math.cos(D_NGP) * Math.cos(raRad - A_NGP)
  const b = Math.asin(Math.max(-1, Math.min(1, sb)))
  const y = Math.cos(decRad) * Math.sin(raRad - A_NGP)
  const x = Math.sin(decRad) * Math.cos(D_NGP) - Math.cos(decRad) * Math.sin(D_NGP) * Math.cos(raRad - A_NGP)
  let l = L_NCP - Math.atan2(y, x)
  l = ((l % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  return { l, b }
}
/** 3x3 rotation (row-major) taking a J2000 equatorial unit vector (x to RA 0, z to the pole) to the galactic frame (x to l=0 b=0, y to l=90, z to NGP). */
export function eqToGalMatrix(): number[] {
  const rows: number[][] = []
  const cols = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  const out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  cols.forEach((c, j) => {
    const dec = Math.asin(c[2]), ra = Math.atan2(c[1], c[0])
    const { l, b } = eqToGal(ra, dec)
    const v = [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)]
    for (let i = 0; i < 3; i++) out[i][j] = v[i]
  })
  void rows
  return out.flat()
}
/** unit vector (galactic frame) from l,b radians */
export const galVec = (l: number, b: number): [number, number, number] => [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)]
/** B-V -> linear-ish sRGB colour (blackbody via Ballesteros T and a Planckian fit), normalised to max 1. */
export function bvToRgb(bv: number): [number, number, number] {
  const T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62))
  const t = Math.max(1000, Math.min(40000, T)) / 100
  let r: number, g: number, b: number
  r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592)
  g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492)
  b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  const c = (x: number) => Math.max(0, Math.min(255, x)) / 255
  return [c(r), c(g), c(b)]
}
