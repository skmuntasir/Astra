/**
 * Model of the scroll input chain (NOT a frame-rate test): Lenis (exponential approach, `lerp` per 60 Hz frame) feeding the critically damped
 * master timeline (OMEGA rad/s). Input: ordinary mouse-wheel notches. Reports how abruptly the camera starts/stops (peak acceleration and jerk of T,
 * normalised by the notch size) and how long it takes to arrive. Lower peak jerk = softer. Run: npx tsx tests/scroll_smooth.test.ts
 * ASSUMPTION: Lenis' lerp acts as k = -ln(1 - lerp) * 60 per second (true for Lenis >= 1.1, which is time-corrected); VERIFY against the installed version.
 */
interface Cfg { name: string; lerp: number; omega: number; wheel: number }
const OLD: Cfg = { name: 'before (lerp 0.14, omega 8.5)', lerp: 0.14, omega: 8.5, wheel: 0.9 }
const NEW: Cfg = { name: 'after  (lerp 0.085, omega 6.0)', lerp: 0.085, omega: 6.0, wheel: 0.8 }
function run(c: Cfg, notches: number[], fps: number, jitter = 0) {
  const k = -Math.log(1 - c.lerp) * 60
  let s = 0, target = 0, t = 0, v = 0, time = 0, rs = 1
  const dtBase = 1 / fps
  const out: number[] = [], ts: number[] = []
  let ni = 0
  for (let f = 0; f < fps * 6; f++) {
    // frame time with optional jitter (a slow frame now and then)
    const dt = dtBase * (jitter && f % 17 === 0 ? 1 + jitter : 1)
    while (ni < notches.length && time >= ni * 0.12) { target += 100 * c.wheel; ni++ }
    s += (target - s) * (1 - Math.exp(-k * dt)) // Lenis
    const d = t - s, tmp = (v + c.omega * d) * dt, e = Math.exp(-c.omega * dt) // critically damped follower of s (as timeline.update)
    t = s + (d + tmp) * e; v = (v - c.omega * tmp) * e
    time += dt; out.push(t); ts.push(time)
  }
  // derivatives by finite differences on the output at the frame rate
  const total = out[out.length - 1]
  let pv = 0, pa = 0, pj = 0
  const vel: number[] = [], acc: number[] = []
  for (let i = 1; i < out.length; i++) vel.push((out[i] - out[i - 1]) / (ts[i] - ts[i - 1]))
  for (let i = 1; i < vel.length; i++) acc.push((vel[i] - vel[i - 1]) / (ts[i] - ts[i - 1]))
  for (let i = 1; i < acc.length; i++) pj = Math.max(pj, Math.abs((acc[i] - acc[i - 1]) / (ts[i] - ts[i - 1])))
  pv = Math.max(...vel); pa = Math.max(...acc.map(Math.abs))
  const t90 = ts[out.findIndex((x) => x >= 0.9 * total)]
  return { total, peakV: pv / total, peakA: pa / total, peakJ: pj / total, t90 }
}
for (const [label, notches] of [['one wheel notch', [0]], ['a fast fling (12 notches)', Array.from({ length: 12 }, (_, i) => i)]] as const) {
  console.log(`\n${label}, 60 fps, normalised by total travel:`)
  for (const c of [OLD, NEW]) { const r = run(c, notches as unknown as number[], 60); console.log(`  ${c.name.padEnd(34)} peak accel ${r.peakA.toFixed(1)}/s^2  peak jerk ${r.peakJ.toFixed(0)}/s^3  90% arrival ${r.t90.toFixed(2)} s`) }
}
const a = run(OLD, [0], 60), b = run(NEW, [0], 60)
let fails = 0
const check = (ok: boolean, m: string) => { console.log((ok ? 'PASS ' : 'FAIL ') + m); if (!ok) fails++ }
check(b.peakJ < a.peakJ * 0.75, `peak jerk (how abruptly the camera starts) is >= 25 % lower: ${(b.peakJ / a.peakJ * 100).toFixed(0)} % of before`)
check(b.peakA < a.peakA * 0.85, `peak acceleration is lower: ${(b.peakA / a.peakA * 100).toFixed(0)} % of before`)
check(b.t90 < 1.3, `still responsive: 90 % of a notch's travel within ${b.t90.toFixed(2)} s (< 1.3 s)`)
// NOT tested here: slow / uneven frames. The output T is an exact continuous function of time (analytic integration), so a slow frame never changes WHERE the
// camera is at a given instant, but it is still a visible hitch; that is a rendering cost problem (GPU), not an input-smoothing one.
process.exit(fails ? 1 : 0)
