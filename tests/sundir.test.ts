/**
 * Final series 5a, item 3: every lit body uses the REAL direction toward the Sun.
 * Run: npx tsx tests/sundir.test.ts
 * Earth: solar.sunDir('earth') = normalize(SUN_POS - bodyPos('earth', days)) (what stepSolar() writes). Expected value computed
 * independently: the negated heliocentric direction of Earth from the ephemeris at J0 + days, rotated by YAW (placeVec).
 */
import { helioAU } from '../src/lib/ephemeris'
import { J0, SUN_POS, SIM_DAYS, bodyPos, placeVec } from '../src/zones/solar/layout'
import { SUN_DIR, MOON_DIST, SUN_DIST } from '../src/zones/common'

let fail = 0
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++ }
type V = [number, number, number]
const norm = (v: V): V => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l] }
const angDeg = (a: V, b: V) => Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180 / Math.PI
const SD: V = [SUN_DIR.x, SUN_DIR.y, SUN_DIR.z]

let worstOld = 0
for (const u of [0, 0.25, 0.5, 0.75, 1]) {
  const d = SIM_DAYS * u
  const e = bodyPos('earth', d)
  const got = norm([SUN_POS[0] - e[0], SUN_POS[1] - e[1], SUN_POS[2] - e[2]])                // what the shader now gets
  const h = placeVec(helioAU('earth', J0 + d))                                               // Sun -> Earth, metres, world
  const want = norm([-h[0], -h[1], -h[2]])                                                    // Earth -> Sun
  const err = angDeg(got, want), old = angDeg(SD, want)
  worstOld = Math.max(worstOld, old)
  // tolerance 0.01 deg: the scene's Sun sits exactly in the ecliptic plane (y = 0) while the ephemeris has Earth ~0.0025 deg off it; invisible, and 3000x smaller than the bug being fixed
  ok(err < 0.01, `day ${d.toFixed(1).padStart(4)}: lit direction vs expected ${err.toExponential(1)} deg (the old constant was ${old.toFixed(2)} deg off)`)
  // independent: Earth moves ~0.9856 deg/day along its orbit (eccentricity <= +-3.4 %), so the direction turns by about that
  ok(Math.abs(old - 0.9856 * d) <= 0.035 * 0.9856 * d + 0.01, `day ${d.toFixed(1).padStart(4)}: direction has turned ${old.toFixed(2)} deg (expected ~${(0.9856 * d).toFixed(2)})`)
  // Moon sits MOON_DIST from Earth along +X; its Sun direction differs from Earth's by < asin(MOON_DIST / distance to Sun)
  const m: V = [e[0] + MOON_DIST, e[1], e[2]]
  const mg = norm([SUN_POS[0] - m[0], SUN_POS[1] - m[1], SUN_POS[2] - m[2]])
  ok(angDeg(mg, got) < (Math.asin(MOON_DIST / (0.8 * SUN_DIST)) * 180 / Math.PI), `day ${d.toFixed(1).padStart(4)}: Moon->Sun within ${angDeg(mg, got).toFixed(2)} deg of Earth->Sun`)
}
ok(worstOld > 25 && worstOld < 32, `the old constant is up to ${worstOld.toFixed(1)} deg wrong at the end of the zone (brief: ~30)`)
{
  const e = bodyPos('earth', 0)
  const got = norm([SUN_POS[0] - e[0], SUN_POS[1] - e[1], SUN_POS[2] - e[2]])
  ok(angDeg(got, SD) < 1e-9 && Math.hypot(...e) < 1e-3, `hero (days = 0): Earth at the origin and the direction equals SUN_DIR to ${angDeg(got, SD).toExponential(1)} deg, so the hero look is unchanged`)
}
console.log(fail ? `${fail} FAIL` : 'ALL PASS')
process.exit(fail ? 1 : 0)
