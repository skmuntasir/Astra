/**
 * Node-side proof that the camera path never jumps: sample the whole journey at 40,000 points and bound the step of
 * (a) camera position relative to its distance from the target, (b) log distance, (c) azimuth/elevation.
 * Also checks zone ranges tile [0,1] exactly. Run: npx tsx tests/path.test.ts
 */
import '../src/zones/index'
import { ranges } from '../src/engine/journey'
import { evalPose, poseCameraPos } from '../src/engine/path'

let fail = 0
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++ }
const rs = ranges()
ok(Math.abs(rs[0].t0) < 1e-12 && Math.abs(rs[rs.length - 1].t1 - 1) < 1e-12, 'zone ranges span 0..1')
ok(rs.every((z, i) => i === 0 || Math.abs(z.t0 - rs[i - 1].t1) < 1e-12), 'zone ranges are contiguous')
const total = rs.reduce((s, z) => s + z.budget, 0)
console.log(`  zones: ${rs.map((z) => `${z.id}(${z.budget}svh)`).join(' -> ')}, total ${total} svh`)

// Sample at a fixed SCROLL step (0.03 svh), which is what the thresholds below were calibrated for (40000 samples over the 1200 svh of Prompt 4).
const N = Math.round(total / 0.03)
let maxPos = 0, maxLogD = 0, maxAng = 0, prev = evalPose(0), prevPos = poseCameraPos(prev, [0, 0, 0])
let worstAt = 0
for (let i = 1; i <= N; i++) {
  const T = i / N
  const p = evalPose(T)
  const pos = poseCameraPos(p, [0, 0, 0])
  const step = Math.hypot(pos[0] - prevPos[0], pos[1] - prevPos[1], pos[2] - prevPos[2]) / Math.max(p.dist, prev.dist)
  if (step > maxPos) { maxPos = step; worstAt = T }
  maxLogD = Math.max(maxLogD, Math.abs(Math.log(p.dist / prev.dist)))
  maxAng = Math.max(maxAng, Math.abs(p.azim - prev.azim), Math.abs(p.elev - prev.elev))
  prev = { ...p, target: [...p.target] }
  prevPos = pos
}
console.log(`  max camera step per ${(total / N).toFixed(3)} svh (1/${N} of the journey): ${maxPos.toFixed(4)} x distance (at T=${worstAt.toFixed(3)}), dlnD ${maxLogD.toFixed(4)}, dAngle ${maxAng.toFixed(3)} deg`)
ok(maxPos < 0.05, 'camera position is continuous (no step > 5% of its distance per 2.5e-5 of the journey)')
ok(maxLogD < 0.01, 'distance is continuous')
ok(maxAng < 0.05, 'angles are continuous')
// zone joins: pose just before and after each boundary
for (const z of rs.slice(1)) {
  const a = evalPose(z.t0 - 1e-6), b = evalPose(z.t0 + 1e-6)
  ok(Math.abs(Math.log(a.dist / b.dist)) < 1e-3 && Math.abs(a.azim - b.azim) < 0.1, `join into "${z.id}" is seamless`)
}
process.exit(fail ? 1 : 0)
