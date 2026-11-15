import { FrameGuard } from '../src/lib/bh/guard'
let fail = 0
const ok = (c: boolean, m: string) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++ }
{ const g = new FrameGuard(0.5); for (let i = 0; i < 600; i++) g.update(40); ok(g.scale < 0.3 && g.state.lowered, `slow frames (40 ms) lower the resolution scale: 0.5 -> ${g.scale.toFixed(3)}`) }
{ const g = new FrameGuard(0.5); for (let i = 0; i < 3000; i++) g.update(200); ok(Math.abs(g.scale - 0.16) < 1e-9 && g.stepScale < 1, `very slow frames bottom out at the minimum scale then reduce steps (scale ${g.scale}, steps x${g.stepScale.toFixed(2)})`) }
{ const g = new FrameGuard(0.5); for (let i = 0; i < 600; i++) g.update(16); ok(g.scale === 0.5 && g.changes === 0, 'a steady 60 fps never changes anything') }
{ const g = new FrameGuard(0.5); for (let i = 0; i < 600; i++) g.update(40); const low = g.scale; for (let i = 0; i < 4000; i++) g.update(8); ok(g.scale > low && g.scale <= 0.5, `scale recovers when there is headroom (${low.toFixed(3)} -> ${g.scale.toFixed(3)})`) }
{ const g = new FrameGuard(0.5); for (let i = 0; i < 200; i++) g.update(5000); ok(g.changes === 0, 'tab-switch hitches (5 s frames) are ignored') }
process.exit(fail ? 1 : 0)
