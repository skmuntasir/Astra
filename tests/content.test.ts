/**
 * Final series 5c, Node-side checks: Voyager data, Crab/Orion/Sgr A* numbers.
 * Run: npx tsx tests/content.test.ts
 */
import '../src/zones/index'
import { getObject } from '../src/engine/journey'
import { VOYAGERS, LIGHT_DAY_AU, voyagerPos, rAUat, lightDayLine, trajectoryLy, CRAB, ORION, nebulaPos, PULSAR_SLOWDOWN, PULSAR_PERIOD_MS, PULSAR_SHOWN_S, LIGHT_DAY_EPOCH } from '../src/zones/content/data'
import { SUN_G } from '../src/zones/galactic/units'

let fail = 0
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++ }
const AU = 1.495978707e11, LY = 9.4607304725808e15
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

// ---- Voyager
ok(Math.abs(LIGHT_DAY_AU - 173.14) < 0.05, `one light-day = ${LIGHT_DAY_AU.toFixed(2)} AU`)
const [v1, v2] = VOYAGERS
ok(rAUat(v1) > 120 && rAUat(v1) < 200 && rAUat(v2) > 120 && rAUat(v2) < 180, `Voyager distances plausible: V1 ${rAUat(v1).toFixed(1)} AU, V2 ${rAUat(v2).toFixed(1)} AU`)
ok(rAUat(v1) > rAUat(v2), 'Voyager 1 is farther than Voyager 2')
ok(Math.abs(rAUat(v1, LIGHT_DAY_EPOCH) - 172.4) < 0.01, 'epoch distance is the documented one (172.4 AU)')
ok(Math.abs(dist(voyagerPos(v1), SUN_G) / AU - rAUat(v1)) < 1e-6 * rAUat(v1), 'Voyager 1 global position is Sun + r along its direction')
ok(Math.abs(dist(voyagerPos(v1), voyagerPos(v2)) / AU) > 100, 'the two probes are far apart (opposite sides of the sky)')
ok(getObject('voyager-1') !== undefined && getObject('voyager-2') !== undefined && getObject('voy-fx') !== undefined, 'voyager objects registered')
ok(/one light-day/.test(lightDayLine(new Date('2026-11-14T12:00:00Z'))) && /in about 4 days/.test(lightDayLine(new Date('2026-11-14T12:00:00Z'))), 'light-day line counts down to 18 Nov 2026')
ok(/passed one light-day/.test(lightDayLine(new Date('2026-12-01T00:00:00Z'))), 'light-day line switches to past tense afterwards')
for (const v of VOYAGERS) { const t = trajectoryLy(v); ok(t.length === v.flybys.length + 1 && t.every((p) => p.every(Number.isFinite)), `${v.name}: trajectory has ${t.length} finite points`) }
// precision: the model is placed camera-relative in doubles; a 1-metre nudge at 170 AU must survive subtraction at 12 m range
const pv = voyagerPos(v1); const cam = [pv[0] + 12, pv[1], pv[2]]; const rel = pv[0] - cam[0]
ok(Math.abs(rel + 12) < 1e-2, `camera-relative position survives at 170 AU (error ${(Math.abs(rel + 12) * 1000).toFixed(2)} mm)`)

// ---- nebulae (positions are the real distances from the Sun)
ok(Math.abs(dist(nebulaPos(ORION), SUN_G) / LY - 1344) < 1, 'Orion Nebula at 1,344 ly')
ok(Math.abs(dist(nebulaPos(CRAB), SUN_G) / LY - 6500) < 1, 'Crab Nebula at 6,500 ly')
ok(PULSAR_SLOWDOWN === Math.round(PULSAR_SHOWN_S * 1000 / PULSAR_PERIOD_MS) && PULSAR_SLOWDOWN > 10, `Crab pulsar drawn ${PULSAR_SLOWDOWN}x slower`)
for (const id of ['gx-orion', 'gx-crab', 'gx-sgra']) ok(!!getObject(id), `${id} registered`)

console.log(fail ? `\n${fail} FAILED` : '\nall content tests passed')
process.exit(fail ? 1 : 0)
