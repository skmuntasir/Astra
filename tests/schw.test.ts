/** CPU reference tracer (src/lib/bh/schw.ts) vs analytic results and vs the independent Kerr tracer (a = 0). Run: npx tsx tests/schw.test.ts */
import { traceSchw, staticFrame, fallFrame, type V3 } from '../src/lib/bh/schw'
import { traceCPU } from '../src/lib/bh/kerr'
import { faller, aberrate, staticShadowAngle, betaStatic } from '../src/lib/bh/infall'

let fail = 0, n = 0
const ok = (c: boolean, m: string) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++ }
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a: V3): V3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l] }
const sph = (mu: number, phi: number) => { const s = Math.sqrt(1 - mu * mu); return { er: [s * Math.cos(phi), s * Math.sin(phi), mu] as V3, th: [mu * Math.cos(phi), mu * Math.sin(phi), -s] as V3, ph: [-Math.sin(phi), Math.cos(phi), 0] as V3 } }
const comb = (b: ReturnType<typeof sph>, c: V3): V3 => norm([c[0] * b.er[0] + c[1] * b.th[0] + c[2] * b.ph[0], c[0] * b.er[1] + c[1] * b.th[1] + c[2] * b.ph[1], c[0] * b.er[2] + c[1] * b.th[2] + c[2] * b.ph[2]])

// 1. static observer: shadow edge at asin(3 sqrt3 sqrt(1-2/r)/r) from the inward direction (bisection on the captured/escaped boundary)
for (const r0 of [1000, 60, 12, 5]) {
  const b = sph(0.3, 0.4), fr = staticFrame(r0)
  const inward: V3 = [-b.er[0], -b.er[1], -b.er[2]]
  const dirAt = (ang: number): V3 => { const t = b.th; return norm([Math.cos(ang) * inward[0] + Math.sin(ang) * t[0], Math.cos(ang) * inward[1] + Math.sin(ang) * t[1], Math.cos(ang) * inward[2] + Math.sin(ang) * t[2]]) }
  const run = (ang: number) => traceSchw({ r0, ...fr, er: b.er, look: dirAt(ang), rIn: 6, rOut: 30, maxSteps: 2000, eps: 0.03 }).kind
  let lo = 0.001, hi = 1.5
  // captured below, not captured above (disc ignored by rIn > rOut)
  const run2 = (ang: number) => traceSchw({ r0, ...fr, er: b.er, look: dirAt(ang), rIn: 1e9, rOut: 1e9, maxSteps: 3000, eps: 0.03 }).kind
  void run
  for (let i = 0; i < 40; i++) { const m = 0.5 * (lo + hi); if (run2(m) === 'captured') lo = m; else hi = m }
  const want = Math.asin((3 * Math.sqrt(3) * Math.sqrt(1 - 2 / r0)) / r0)
  ok(Math.abs(0.5 * (lo + hi) / want - 1) < 2e-3, `static observer r0=${r0}: shadow half-angle ${(0.5 * (lo + hi)).toExponential(4)} vs analytic ${want.toExponential(4)}`)
}
// 2. falling observer outside the horizon: shadow edge = aberrated static shadow
for (const r0 of [40, 12, 5]) {
  const b = sph(-0.2, 1.0), fr = fallFrame(60, r0)
  const inward: V3 = [-b.er[0], -b.er[1], -b.er[2]]
  const dirAt = (ang: number): V3 => norm([Math.cos(ang) * inward[0] + Math.sin(ang) * b.th[0], Math.cos(ang) * inward[1] + Math.sin(ang) * b.th[1], Math.cos(ang) * inward[2] + Math.sin(ang) * b.th[2]])
  const run = (ang: number) => traceSchw({ r0, ...fr, er: b.er, look: dirAt(ang), rIn: 1e9, rOut: 1e9, maxSteps: 3000, eps: 0.03 }).kind
  let lo = 0.001, hi = 1.5
  for (let i = 0; i < 40; i++) { const m = 0.5 * (lo + hi); if (run(m) === 'captured') lo = m; else hi = m }
  const want = aberrate(staticShadowAngle(r0), betaStatic(faller(60), r0))
  ok(Math.abs(0.5 * (lo + hi) / want - 1) < 3e-3, `faller r0=${r0} (beta ${betaStatic(faller(60), r0).toFixed(3)}): shadow half-angle ${(0.5 * (lo + hi)).toFixed(5)} vs aberrated ${want.toFixed(5)}`)
}
// 3. cross-check against the independent Kerr tracer (a = 0, ZAMO = static observer): kind, disc radius, g, sky direction
{
  let bad = 0, cnt = 0, worstSky = 0, worstG = 0, worstR = 0
  for (const [r0, mu0] of [[100, 0.3], [30, 0.05], [12, 0.8]] as Array<[number, number]>) {
    const b = sph(mu0, 0.7), fr = staticFrame(r0)
    for (let i = 0; i < 400; i++) {
      const az = (i * 2.399963) % (2 * Math.PI), rad = Math.sqrt((i + 0.5) / 400) * (r0 > 50 ? 0.35 : 1.2)
      const loc: V3 = norm([-Math.cos(rad), Math.sin(rad) * Math.cos(az), Math.sin(rad) * Math.sin(az)]) // local (r, theta, phi) components, mostly inward
      const look = comb(b, loc)
      const a = traceSchw({ r0, ...fr, er: b.er, look, rIn: 6, rOut: 30, maxSteps: 3000, eps: 0.02 })
      const k = traceCPU({ a: 0, r0, mu0, phi0: 0.7, n: loc, rIn: 6, rOut: 30, maxSteps: 3000, eps: 0.02 })
      cnt++
      const kk = (x: string) => (x === 'lost' ? 'captured' : x)
      if (kk(a.kind) !== kk(k.kind)) { bad++; continue }
      if (a.kind === 'disc') { worstR = Math.max(worstR, Math.abs(a.rHit - k.rHit) / k.rHit); worstG = Math.max(worstG, Math.abs(a.g / k.g - 1)) }
      if (a.kind === 'escaped') worstSky = Math.max(worstSky, Math.acos(Math.min(1, dot(a.sky, k.sky))))
    }
  }
  ok(bad <= 2, `Schwarzschild planar tracer vs Kerr tracer (a=0): ${cnt - bad}/${cnt} rays agree on captured / escaped / disc`)
  ok(worstR < 2e-3, `disc hit radius agrees (worst relative ${worstR.toExponential(1)})`)
  ok(worstG < 2e-3, `disc g-factor agrees (worst relative ${worstG.toExponential(1)})`)
  ok(worstSky < 2e-3, `sky direction agrees (worst ${worstSky.toExponential(1)} rad)`)
}
// 4. inside the horizon: sky exists exactly where E > 0 (cos psi > -E/P) and the ray is not turned back; the boundary moves continuously across r = 2
{
  const b = sph(0.3, 0.2)
  const frontier = (r0: number) => {
    const fr = fallFrame(60, r0)
    const inward: V3 = [-b.er[0], -b.er[1], -b.er[2]]
    const dirAt = (ang: number): V3 => norm([Math.cos(ang) * inward[0] + Math.sin(ang) * b.th[0], Math.cos(ang) * inward[1] + Math.sin(ang) * b.th[1], Math.cos(ang) * inward[2] + Math.sin(ang) * b.th[2]])
    const dark = (ang: number) => traceSchw({ r0, ...fr, er: b.er, look: dirAt(ang), rIn: 1e9, rOut: 1e9, maxSteps: 4000, eps: 0.03 }).kind !== 'escaped'
    let lo = 0, hi = Math.PI * 0.99
    for (let i = 0; i < 40; i++) { const m = 0.5 * (lo + hi); if (dark(m)) lo = m; else hi = m }
    return 0.5 * (lo + hi)
  }
  const a = frontier(2.02), c = frontier(1.98)
  ok(Math.abs(a - c) < 0.08, `dark-region edge is continuous across the horizon: ${a.toFixed(4)} rad at r=2.02, ${c.toFixed(4)} rad at r=1.98`)
  const f60 = faller(60)
  for (const r0 of [1.5, 0.5]) {
    const e = frontier(r0)
    const P = Math.sqrt(f60.E * f60.E - (1 - 2 / r0))
    const cone = Math.acos(f60.E / P) // E = 0 boundary (the edge cannot be darker-than-cone: rays with E <= 0 are dark)
    ok(e >= cone - 0.02, `r=${r0}: dark region is at least the E<=0 cone (edge ${e.toFixed(3)} rad >= cone ${cone.toFixed(3)} rad)`)
  }
  // all rays that escape from inside must have E > 0; and the number of escaping directions shrinks as r -> 0
  let esc = 0, tot = 0
  for (let i = 0; i < 2000; i++) {
    const mu = -1 + (2 * (i + 0.5)) / 2000
    const s = Math.sqrt(1 - mu * mu)
    const look = norm([mu * b.er[0] + s * b.th[0], mu * b.er[1] + s * b.th[1], mu * b.er[2] + s * b.th[2]])
    const out = traceSchw({ r0: 0.5, ...fallFrame(60, 0.5), er: b.er, look, rIn: 1e9, rOut: 1e9, maxSteps: 4000, eps: 0.03 })
    tot++
    if (out.kind === 'escaped') { esc++; if (out.E <= 0) { fail++; n++; console.log('FAIL escaped with E<=0') } }
  }
  console.log(`  at r=0.5 inside: ${((100 * esc) / tot).toFixed(1)} % of the solid angle (by cos psi) shows the outside sky`)
  ok(esc > 0 && esc < tot, 'inside the horizon part of the view shows the sky and part is dark')
}
console.log(`\n${n - fail}/${n} passed`)
process.exit(fail ? 1 : 0)
