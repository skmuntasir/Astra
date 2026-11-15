/** Prompt 5 data / geometry checks (Node, no GPU). Run: npx tsx tests/galactic.test.ts */
import '../src/zones/index'
import { ranges } from '../src/engine/journey'
import { NEAR_STARS, GALAXIES, R0_KPC, R0_LY, DWARFS, M87D } from '../src/zones/galactic/data'
import { LY, SUN_G, eqDir, eqPos, len3, sub3, dot3, galDir, MPC } from '../src/zones/galactic/units'
import { buildMilkyWay, mwAnchors, KPC_LY, BAR_DEG } from '../src/zones/galactic/mwmodel'
import { discBasis, planeMatrix, gPos } from '../src/zones/galactic/Galaxy'
import { M87_G } from '../src/zones/galactic/M87'
import { GC_G } from '../src/zones/galactic/MilkyWay'
import { evalPose } from '../src/engine/path'

let fail = 0
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++ }
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

// budgets
const rs = ranges('main')
const bud = (id: string) => rs.find((z) => z.id === id)?.budget
ok(bud('beyond') === 300 && bud('milky-way') === 300 && bud('local-group') === 250 && bud('nearby-galaxies') === 250, 'scroll budgets 300 / 300 / 250 / 250 svh')

// Sun-centre distance: GRAVITY 2021 8.275 kpc ~ 26,990 ly
ok(near(R0_KPC, 8.275, 1e-9) && near(R0_LY, 26990, 5), `R0 = ${R0_KPC} kpc = ${R0_LY.toFixed(0)} ly`)
ok(near(len3(sub3(GC_G, SUN_G)) / LY, R0_LY, 1), 'the Galactic Centre object sits R0 from the Sun')
// GC direction matches galactic l=b=0
const gcd = galDir(0, 0), dd = sub3(GC_G, SUN_G), dn = len3(dd)
ok(dot3([dd[0] / dn, dd[1] / dn, dd[2] / dn], gcd) > 0.999999, 'the Galactic Centre lies in the l = 0, b = 0 direction')
// Sgr A* is at RA 17h45m40s Dec -29 00 28 : must equal the galactic centre direction (within the J2000 frame definition, ~0.1 deg)
const sgr = eqDir(266.4168, -29.0078)
ok(dot3(sgr, gcd) > Math.cos((0.2 * Math.PI) / 180), 'Sgr A* (RA/Dec) agrees with l = 0, b = 0 within 0.2 deg')

// star table: distances are monotone sensible and the nearest is Proxima
const sorted = [...NEAR_STARS].sort((a, b) => a.ly - b.ly)
ok(sorted[0].id === 'prox' && near(sorted[0].ly, 4.2465, 1e-3), 'nearest star is Proxima Centauri at 4.25 ly')
ok(NEAR_STARS.every((s) => s.ly > 4 && s.ly < 26) && NEAR_STARS.length === 21, '21 stars between 4 and 26 ly')
const sir = NEAR_STARS.find((s) => s.id === 'sir')!
ok(dot3(eqDir(sir.ra, sir.dec), eqDir(101.287, -16.716)) > 0.99999, 'Sirius direction (RA 6h45m, Dec -16.7 deg) round-trips')
// Alpha Cen and Proxima are ~2.2 deg apart on the sky
const ac = NEAR_STARS.find((s) => s.id === 'acen')!, px = NEAR_STARS.find((s) => s.id === 'prox')!
const ang = (Math.acos(dot3(eqDir(ac.ra, ac.dec), eqDir(px.ra, px.dec))) * 180) / Math.PI
ok(near(ang, 2.2, 0.2), `Alpha Cen - Proxima separation on the sky ${ang.toFixed(2)} deg (real ~ 2.2)`)

// galaxies: planes are orthonormal, face the Sun's side, and have the declared physical size
for (const g of GALAXIES) {
  const d = eqDir(g.ra, g.dec)
  const { M } = planeMatrix(g, d)
  const e = M.elements, s = 1 / g.fill
  const c = [0, 1, 2].map((i) => Math.hypot(e[i * 4], e[i * 4 + 1], e[i * 4 + 2]))
  ok(c.every((x) => near(x, s, 1e-6)), `${g.id}: picture plane is uniformly scaled 1/${g.fill}`)
  const x = [e[0], e[1], e[2]], y = [e[4], e[5], e[6]], z = [e[8], e[9], e[10]]
  ok(near(dot3(x as never, y as never), 0, 1e-6 * s * s) && near(dot3(x as never, z as never), 0, 1e-6 * s * s), `${g.id}: plane axes are perpendicular`)
  ok(dot3(z as never, [-d[0], -d[1], -d[2]]) > 0.2, `${g.id}: picture faces the Sun's side`)
}
const b = discBasis(eqDir(GALAXIES[0].ra, GALAXIES[0].dec), 77, 38)
ok(near(dot3(b.m, b.q), 0, 1e-9) && near(dot3(b.m, b.n), 0, 1e-9) && near(len3(b.n), 1, 1e-9), 'disc basis (inc 77, PA 38) is orthonormal')
ok(near(len3(sub3(gPos.get('gx-m31')!, SUN_G)) / LY, 2.5e6, 1), 'M31 sits 2.5 Mly from the Sun')
ok(near(len3(sub3(M87_G, SUN_G)) / MPC, 16.8, 1e-6), 'M87 sits 16.8 Mpc from the Sun (EHT 2019)')
ok(near(len3(sub3(eqPos(M87D.ra, M87D.dec, 1e9), SUN_G)), 1e9, 1e3), 'eqPos is a 1e9 m offset for 1e9 m distance (double precision at Sun range)')
// Milky Way model
const mw = buildMilkyWay(1)
ok(mw.n > 140000 && mw.n < 170000, `Milky Way model has ${mw.n} particles`)
let inside = 0, maxR = 0, finite = true
for (let i = 0; i < mw.n; i++) {
  const x = mw.pos[i * 3], y = mw.pos[i * 3 + 1], z = mw.pos[i * 3 + 2]
  if (!Number.isFinite(x + y + z)) finite = false
  const R = Math.hypot(x - R0_LY, y)
  maxR = Math.max(maxR, R); if (R < 16 * KPC_LY) inside++
}
ok(finite, 'no NaN in the Milky Way particles')
ok(inside / mw.n > 0.95, `95 %+ of particles within 16 kpc of the centre (${((100 * inside) / mw.n).toFixed(1)} %)`)
const a = mwAnchors()
ok(near(a.centre[0], R0_LY, 1) && near(a.sun[0], 0, 1e-9), 'anchors: Sun at the origin, centre at R0 along +x')
ok(a.warp[2] > 0 && a.warp[2] < 4000, `warp rises on the +l side (${a.warp[2].toFixed(0)} ly at 14.6 kpc)`)
ok(BAR_DEG === 27, 'bar angle 27 deg (same as the sky model)')
// dwarfs
ok(DWARFS.length >= 40 && DWARFS.every((d) => d.kly > 20 && d.kly < 5000), `${DWARFS.length} dwarfs, 20 - 5,000 kly`)
// the dive: end distance = 1000 Schwarzschild radii, pose at T=1 targets M87
// (the journey continues past M87 since the black-hole series: the dive ends at the end of the nearby-galaxies zone)
const nz = ranges().find((z) => z.id === 'nearby-galaxies')!
const end = evalPose(nz.t1 - 1e-9)
ok(near(end.dist, 1000 * M87D.rs, 1000 * M87D.rs * 1e-6), `dive ends 1000 rs (${(1000 * M87D.rs).toExponential(2)} m) from M87`)
const tgt = [end.target[0], end.target[1], end.target[2]]
ok(len3(sub3(tgt as never, M87_G)) < 1e9, 'the final target is M87 itself')
console.log(fail ? `\nFAILED ${fail}` : '\nALL PASSED')
process.exit(fail ? 1 : 0)
