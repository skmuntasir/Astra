/** Sanity checks for the galactic -> ecliptic/world transform. Run: npx tsx tests/frames.test.ts */
import { galToWorld, worldToEcl, WORLD_TO_GAL, GAL_TO_WORLD } from '../src/lib/frames'
let fail = 0
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++ }
const near = (a: number, b: number, tol: number) => Math.abs(((a - b + 540) % 360) - 180) < tol
const gc = worldToEcl(galToWorld(0, 0))
console.log('  Galactic Centre ->', gc)
ok(near(gc.lon, 266.84, 0.3) && Math.abs(gc.lat - -5.6) < 0.3, 'Galactic Centre at ecliptic lon ~266.8, lat ~-5.6')
const ngp = worldToEcl(galToWorld(0, 90))
console.log('  North galactic pole ->', ngp)
ok(near(ngp.lon, 180.02, 0.5) && Math.abs(ngp.lat - 29.8) < 0.3, 'North galactic pole at ecliptic lon ~180, lat ~+29.8')
// l=90 b=0 (Cygnus) is near ecliptic lon ~ 318?  just report
console.log('  l=90,b=0 ->', worldToEcl(galToWorld(90, 0)))
// the matrix is a rotation: orthonormal, det +1, and world->gal is its inverse
const m = GAL_TO_WORLD
const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6])
ok(Math.abs(det - 1) < 1e-9, 'rotation determinant +1 (no mirroring)')
const w = galToWorld(123, 45), g = WORLD_TO_GAL
const back = [g[0] * w[0] + g[1] * w[1] + g[2] * w[2], g[3] * w[0] + g[4] * w[1] + g[5] * w[2], g[6] * w[0] + g[7] * w[1] + g[8] * w[2]]
const l = ((Math.atan2(back[1], back[0]) * 180) / Math.PI + 360) % 360, b = (Math.asin(back[2]) * 180) / Math.PI
ok(Math.abs(l - 123) < 1e-6 && Math.abs(b - 45) < 1e-6, 'world -> galactic inverts galactic -> world')
process.exit(fail ? 1 : 0)
