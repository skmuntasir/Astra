/** Pure tests of the shareable-link codec (src/lib/link.ts). Run: npx tsx tests/link.test.ts */
import { encodeLink, parseLink, targetToT, round4, type LinkEnv } from '../src/lib/link'
let fails = 0
const check = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
const ZONES = ['earth', 'moon', 'sun', 'solar-system', 'beyond', 'milky-way', 'local-group', 'nearby-galaxies', 'bh-approach', 'universe', 'multiverse']
const env: LinkEnv = { zones: ZONES, branchZones: ['fall-1', 'fall-2', 'fall-3'], gate: { zone: 'bh-approach', p: 0.97 }, isFocusable: (id) => ['jupiter', 'gx-m31', 'earth'].includes(id) }

// round trip, every zone, many positions
let ok = true
for (const z of ZONES) for (const p of [0, 0.0001, 0.25, 0.3333, 0.5, 0.9999, 1]) {
  const h = encodeLink({ zone: z, p, focus: null })
  const t = parseLink(h, env)
  if (!t || t.zone !== z || Math.abs(t.p - round4(p)) > 1e-9 || t.focus !== null) { ok = false; console.log('  bad', z, p, h, t) }
}
check(ok, 'round trip: 11 zones x 7 positions (4-decimal progress)')
check(encodeLink({ zone: 'earth', p: 0.123456, focus: null }) === '#z=earth&p=0.1235', 'progress is written with 4 decimals')
check(encodeLink({ zone: 'solar-system', p: 0.38, focus: 'jupiter' }) === '#z=solar-system&p=0.3800&f=jupiter', 'focus target is written as &f=')
const f = parseLink('#z=solar-system&p=0.3800&f=jupiter', env)
check(f?.zone === 'solar-system' && f.p === 0.38 && f.focus === 'jupiter', 'focus target round trip')
check(parseLink('z=earth&p=0.5', env)?.p === 0.5, 'works without the leading #')
check(parseLink('#z=earth&p=0.5&f=ss-fx', env)?.focus === null, 'a non-focusable object id is ignored, the position still opens')
check(parseLink('#z=earth&p=0.5&f=nope', env)?.focus === null, 'an unknown focus id is ignored')
check(parseLink('#z=earth', env)?.p === 0, 'missing p = start of the zone')

// invalid input -> null (start of the journey), never a throw
const bad = ['', '#', '#garbage', '#z=nope&p=0.5', '#z=earth&p=abc', '#z=earth&p=-0.2', '#z=earth&p=1.5', '#z=earth&p=9', '#z=earth&p=NaN', '#z=earth&p=Infinity', '#z=earth&p=1e9',
  '#z=../../etc/passwd&p=0.1', '#z=<script>&p=0.1', '#z=earth%00&p=0.1', '#p=0.5', '#z=&p=0.5', '#' + 'a'.repeat(5000), '#z=earth&p=0.5&p=0.6x', '#z=EARTH&p=0.5', '#%E0%A4%A', '#z=earth&p=0.123456789012']
let threw = false, nonNull: string[] = []
for (const b of bad) { try { if (parseLink(b, env) !== null) nonNull.push(b.slice(0, 40)) } catch { threw = true } }
check(!threw, 'parseLink never throws')
check(nonNull.length === 0, `every invalid link gives null ${nonNull.length ? JSON.stringify(nonNull) : `(${bad.length} cases)`}`)

// infall: no deep links, resolves to the gate
const g = parseLink('#z=fall-2&p=0.4&f=jupiter', env)
check(g?.zone === 'bh-approach' && g.p === 0.97 && g.focus === null, 'a link into the infall resolves to the black-hole gate (and drops the focus)')
check(parseLink('#z=bh-approach&p=0.97', env)?.p === 0.97, 'a link to the gate position itself is fine')

// position -> timeline T
const zr = ZONES.map((id, i) => ({ id, t0: i / 11, t1: (i + 1) / 11 }))
const T = targetToT({ zone: 'universe', p: 0.5, focus: null }, zr)!
check(Math.abs(T - (9.5 / 11)) < 1e-12, 'zone + progress -> global T')
check(targetToT({ zone: 'x', p: 0, focus: null }, zr) === null, 'unknown zone -> null')
console.log(fails ? `\n${fails} FAIL` : '\nALL PASS')
process.exit(fails ? 1 : 0)
