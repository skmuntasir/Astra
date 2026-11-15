/**
 * Node-side checks of the ephemeris and the compressed layout. Run: npx tsx tests/ephemeris.test.ts
 * The independent sanity values below (planet sky positions in Nov 2026) are recalled, not looked up: // VERIFY.
 */
import { helioAU, jdOf, eclToWorld, DEG, AU_M } from '../src/lib/ephemeris'
import { J0, YAW, bodyPos, SUN_POS, U, SIM_DAYS, compress, R_EARTH_AU0, HELIOPAUSE_U, NEPTUNE_U, poleOf } from '../src/zones/solar/layout'
import { SUN_DIR } from '../src/zones/common'

let fail = 0
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++ }
const lon = (v: number[]) => ((Math.atan2(v[1], v[0]) / DEG) + 360) % 360
const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

// 1. definitional check: at J2000 the Earth's heliocentric longitude is ~100.5 deg (Jan 1.5: Sun's geocentric longitude ~280.4)
const e2000 = helioAU('earth', 2451545.0)
ok(Math.abs(lon(e2000) - 100.4) < 0.6, `Earth helio longitude at J2000 = ${lon(e2000).toFixed(2)} (expect ~100.4)`)
ok(Math.abs(Math.hypot(e2000[0], e2000[1], e2000[2]) - 0.9833) < 0.001, 'Earth distance at J2000 ~0.9833 AU (near perihelion)')

// 2. orbital radii inside perihelion/aphelion for every body over a full year
for (const id of ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'ceres'] as const) {
  let mn = 1e9, mx = 0
  for (let d = 0; d < 366 * 3; d += 7) { const v = helioAU(id, J0 + d); const r = Math.hypot(v[0], v[1], v[2]); mn = Math.min(mn, r); mx = Math.max(mx, r) }
  console.log(`  ${id.padEnd(8)} r over 3 yr: ${mn.toFixed(3)} .. ${mx.toFixed(3)} AU, lon now ${lon(helioAU(id, J0)).toFixed(1)}`)
}
ok(Math.hypot(...(helioAU('mars', J0) as [number, number, number])) > 1.38 && Math.hypot(...(helioAU('mars', J0) as [number, number, number])) < 1.67, 'Mars within 1.38..1.67 AU')

// 3. geocentric longitudes in early Nov 2026 (recalled: Jupiter in Leo, retrograde toward its Feb-2027 opposition ~135-155 deg; Saturn / Neptune near the Pisces-Aries border)
const E = helioAU('earth', J0)
const geo = (id: Parameters<typeof helioAU>[0]) => lon(sub(helioAU(id, J0), E))
console.log(`  geocentric longitudes: Jupiter ${geo('jupiter').toFixed(1)}, Saturn ${geo('saturn').toFixed(1)}, Neptune ${geo('neptune').toFixed(1)}, Mars ${geo('mars').toFixed(1)}`)
ok(geo('jupiter') > 135 && geo('jupiter') < 155, 'Jupiter geocentric longitude in Leo (135..155)')
const sg = geo('saturn'); ok(sg > 350 || sg < 15, 'Saturn geocentric longitude around Pisces/Aries (350..15)')
const ng = geo('neptune'); ok(ng > 350 || ng < 12, 'Neptune geocentric longitude around Pisces/Aries (350..12)')

// 4. the date matches the scene's Sun direction: Sun geocentric longitude = helio Earth + 180
const sunLon = (lon(E) + 180) % 360
const sceneLon = ((Math.atan2(-SUN_DIR.z, SUN_DIR.x) / DEG) + 360) % 360 // world (x, z, -y): y_ecl = -z
console.log(`  Sun geocentric longitude on the journey date ${sunLon.toFixed(2)}; scene's SUN_DIR corresponds to ${sceneLon.toFixed(2)}; YAW = ${(YAW / DEG).toFixed(2)} deg`)
ok(Math.abs(YAW / DEG) < 2.5, 'the journey date matches the scene Sun direction to < 2.5 deg (residual removed by YAW)')

// 5. Earth lands exactly at the origin at days = 0, and the Sun is where the Sun zone put it
const e0 = bodyPos('earth', 0)
ok(Math.hypot(e0[0], e0[1], e0[2]) < 1e-3, 'Earth is at the origin at the start (|p| < 1 mm)')
ok(Math.abs(Math.hypot(SUN_POS[0], SUN_POS[1], SUN_POS[2]) - U) < 1, 'Sun at the compressed Earth-Sun distance')
const eAfter = bodyPos('earth', SIM_DAYS)
console.log(`  Earth moves ${(Math.hypot(...(eAfter as [number, number, number])) / U).toFixed(3)} U (= ${((Math.hypot(...(eAfter as [number, number, number])) / U) * 100).toFixed(1)} % of its distance to the Sun) over the zone`)

// 6. order and compression
const d = (id: Parameters<typeof helioAU>[0]) => { const p = bodyPos(id, 0); return Math.hypot(p[0] - SUN_POS[0], p[1] - SUN_POS[1], p[2] - SUN_POS[2]) / U }
const ids = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'] as const
ok(ids.every((id, i) => i === 0 || d(id) > d(ids[i - 1])), 'order outward from the Sun is true')
ok(Math.abs(d('earth') - 1) < 0.002, `Earth at 1.00 U from the Sun (${d('earth').toFixed(4)})`)
console.log('  distances (U): ' + ids.map((i) => `${i} ${d(i).toFixed(2)}`).join(', ') + `, pluto ${d('pluto').toFixed(2)}, ceres ${d('ceres').toFixed(2)}; heliopause ${HELIOPAUSE_U.toFixed(2)}, neptune(a) ${NEPTUNE_U.toFixed(2)}`)
ok(Math.abs(compress(R_EARTH_AU0) - U) < 1, 'compress(Earth r) = U')

// 7. Saturn: the Sun's elevation above the ring plane (recalled: ~ -8 deg in Nov 2026, i.e. southern side lit) // VERIFY
const pole = poleOf(40.59, 83.54)
const ps = bodyPos('saturn', 0); const toSun = [SUN_POS[0] - ps[0], SUN_POS[1] - ps[1], SUN_POS[2] - ps[2]]; const l = Math.hypot(...(toSun as [number, number, number]))
const elev = Math.asin((toSun[0] * pole[0] + toSun[1] * pole[1] + toSun[2] * pole[2]) / l) / DEG
console.log(`  Sun elevation above Saturn's ring plane on the journey date: ${elev.toFixed(1)} deg`)
ok(Math.abs(elev) < 14, 'Saturn ring tilt to the Sun is moderate (|elev| < 14)')
void AU_M; void eclToWorld; void jdOf
process.exit(fail ? 1 : 0)
