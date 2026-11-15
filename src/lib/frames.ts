/**
 * Coordinate frames for the backdrop sky. Pure numbers (no three.js) so tests/frames.test.ts can run it in Node.
 *
 * World frame of the app = ecliptic frame mapped to y-up:  world = (x_ecl, z_ecl, -y_ecl)
 *   (x_ecl toward the March equinox, z_ecl toward the ecliptic north pole; the planets orbit in the world XZ plane).
 * Sky textures are in GALACTIC coordinates: u = (180 - l) / 360 (image x), v = (90 - b) / 180 (image y from the top).
 *
 * Chain: galactic -> equatorial J2000 (transpose of the IAU rotation stored with stars_bright.json) -> ecliptic
 * (rotate about x by the J2000 mean obliquity) -> world.  // VERIFY: the matrix is the standard IAU 1958 / Hipparcos
 * galactic rotation; frames.test.ts checks that the Galactic Centre lands at ecliptic lon ~266.8 deg, lat ~ -5.6 deg
 * and the north galactic pole at lon ~180 deg, lat ~ +29.8 deg (values recalled, not looked up).
 */
export const OBLIQUITY_DEG = 23.439291 // J2000 mean obliquity of the ecliptic, // VERIFY

/** Row-major equatorial(J2000) -> galactic. Same numbers as stars_bright.json "eqToGal". */
export const EQ_TO_GAL = [
  -0.054875560416215705, -0.8734370902348852, -0.48383501554871305,
  0.49410942787558354, -0.44482962996001096, 0.746982244497219,
  -0.8676661490190047, -0.19807637343120135, 0.4559837761750669,
]

type M3 = number[] // row-major 3x3
const mul = (a: M3, b: M3): M3 => {
  const o = new Array<number>(9).fill(0)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j]
  return o
}
const tr = (a: M3): M3 => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]]

/** equatorial -> ecliptic */
const eps = (OBLIQUITY_DEG * Math.PI) / 180
const EQ_TO_ECL: M3 = [1, 0, 0, 0, Math.cos(eps), Math.sin(eps), 0, -Math.sin(eps), Math.cos(eps)]
/** ecliptic -> world (y-up): (x, z, -y) */
const ECL_TO_WORLD: M3 = [1, 0, 0, 0, 0, 1, 0, -1, 0]

/** galactic -> world, row-major */
export const GAL_TO_WORLD: M3 = mul(ECL_TO_WORLD, mul(EQ_TO_ECL, tr(EQ_TO_GAL)))
/** world -> galactic, row-major (what the sky shader needs: it starts from a world-space view ray) */
export const WORLD_TO_GAL: M3 = tr(GAL_TO_WORLD)

export function galToWorld(lDeg: number, bDeg: number): [number, number, number] {
  const l = (lDeg * Math.PI) / 180, b = (bDeg * Math.PI) / 180
  const g = [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)]
  const m = GAL_TO_WORLD
  return [m[0] * g[0] + m[1] * g[1] + m[2] * g[2], m[3] * g[0] + m[4] * g[1] + m[5] * g[2], m[6] * g[0] + m[7] * g[1] + m[8] * g[2]]
}
/** world direction -> ecliptic longitude / latitude (degrees) */
export function worldToEcl(v: [number, number, number]): { lon: number; lat: number } {
  const x = v[0], y = -v[2], z = v[1]
  const lon = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
  return { lon, lat: (Math.asin(z / Math.hypot(x, y, z)) * 180) / Math.PI }
}
