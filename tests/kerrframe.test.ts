/** Spin frame of the Kerr M87*. Run: npx tsx tests/kerrframe.test.ts (pure math). */
import { spinFrame, jetToSpin, kerrObserver, type V3 } from '../src/zones/blackhole/kerrFrame'
let fail = 0
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++ }
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
// an arbitrary right-handed jet frame
const EZ: V3 = [0.3, -0.5, Math.sqrt(1 - 0.09 - 0.25)]; const t: V3 = [1, 0.2, 0.1]
const k = dot(t, EZ); const ex0: V3 = [t[0] - k * EZ[0], t[1] - k * EZ[1], t[2] - k * EZ[2]]; const l = Math.hypot(...ex0)
const EX: V3 = [ex0[0] / l, ex0[1] / l, ex0[2] / l]; const EY = cross(EZ, EX)
const f = spinFrame(EX, EY, EZ)
ok(Math.abs(dot(f.KX, f.KY)) < 1e-12 && Math.abs(dot(f.KY, f.KZ)) < 1e-12 && Math.abs(dot(f.KX, f.KZ)) < 1e-12, 'spin frame orthogonal')
const c = cross(f.KX, f.KY); ok(Math.abs(c[0] - f.KZ[0]) + Math.abs(c[1] - f.KZ[1]) + Math.abs(c[2] - f.KZ[2]) < 1e-12, 'spin frame right-handed (KX x KY = KZ)')
ok(dot(f.KZ, EZ) < -0.999999, 'angular momentum is opposite the approaching jet (points away from us)')
// jetToSpin agrees with projecting on the K axes
const v: V3 = [0.2, 0.5, -0.7]; const a = jetToSpin([dot(v, EX), dot(v, EY), dot(v, EZ)]); const b: V3 = [dot(v, f.KX), dot(v, f.KY), dot(v, f.KZ)]
ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-12, 'jetToSpin == projection on K axes')
// observer basis: camera looking at the hole (axis z_cam = back = +r-hat) has camRot = identity on (r,theta,phi) up to the camera roll we choose
const pos: V3 = [30, 20, -25]; const r = Math.hypot(...pos); const rhatK: V3 = [pos[0] / r, pos[1] / r, pos[2] / r]
const world = (p: V3): V3 => [p[0] * f.KX[0] + p[1] * f.KY[0] + p[2] * f.KZ[0], p[0] * f.KX[1] + p[1] * f.KY[1] + p[2] * f.KZ[1], p[0] * f.KX[2] + p[1] * f.KY[2] + p[2] * f.KZ[2]]
const zc = world(rhatK)
const nrm = (q: V3): V3 => { const m = Math.hypot(...q); return [q[0] / m, q[1] / m, q[2] / m] }
const xc = nrm(cross([0, 1, 0], zc))
const obs = kerrObserver(pos, [xc, cross(zc, xc), zc], f)
ok(Math.abs(obs.r0 - r) < 1e-9 && Math.abs(obs.mu0 - pos[2] / r) < 1e-12, 'r0 and mu0 from the spin-frame position')
ok(Math.abs(obs.camRot[6] - 1) < 1e-9 && Math.abs(obs.camRot[7]) < 1e-9 && Math.abs(obs.camRot[8]) < 1e-9, 'camera back-axis = +r-hat when the camera looks at the hole')
const col = (j: number) => Math.hypot(obs.camRot[3 * j], obs.camRot[3 * j + 1], obs.camRot[3 * j + 2]); ok([0, 1, 2].every((j) => Math.abs(col(j) - 1) < 1e-9), 'camRot columns are unit vectors')
console.log(fail ? `${fail} FAIL` : 'ALL PASS'); process.exit(fail ? 1 : 0)
