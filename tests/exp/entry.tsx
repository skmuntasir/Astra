// Test harness: the REAL src/hud/Experience.tsx + the REAL engine core (store, journey, timeline, scroll, api) with stubbed zustand / lenis and
// fake zones (the real zone ids and budgets, simple cameras, no three.js). A tiny driver mimics what <Driver/> does each frame.
import { createRoot } from 'react-dom/client'
import { registerZone, registerBranch, registerObject, ranges } from '@/engine/journey'
import { useStore, st } from '@/engine/store'
import { timeline, publishZone } from '@/engine/timeline'
import { initScroll } from '@/engine/scroll'
import { stepFocus, focus, release, jumpToZone, choiceGate } from '@/engine/api'
import { ExperienceTop, ScrollHint, PlanetHint, SoundFeed, LinkSync } from '@/hud/Experience'
import { hintPos } from '@/hud/hint'
import { sound } from '@/lib/audio/sound'
import { buildLink, currentTarget } from '@/hud/linkSync'
import { scrollToT } from '@/engine/scroll'

const Z = [['earth', 250], ['moon', 250], ['sun', 200], ['solar-system', 500], ['beyond', 300], ['milky-way', 300], ['local-group', 250], ['nearby-galaxies', 250], ['bh-approach', 300], ['universe', 400], ['multiverse', 300]] as const
const cam = (d: number) => [{ t: 0, target: [0, 0, 0] as [number, number, number], dist: d, azim: 0, elev: 0 }, { t: 1, target: [0, 0, 0] as [number, number, number], dist: d * 2, azim: 10, elev: 0 }]
const Null = () => null
for (const id of ['earth', 'moon', 'jupiter', 'gx-m31', 'ss-fx']) registerObject({ id, name: id, position: [0, 0, 0], radius: 1, Component: Null, focus: id === 'ss-fx' ? undefined : { distRadii: 3 } })
for (const [id, budget] of Z) registerZone({ id, title: id, tick: id, budget, unit: 1e6, scale: 'x', objects: [], beats: [], camera: cam(5) })
registerBranch('infall', [1, 2, 3].map((i) => ({ id: `fall-${i}`, title: `fall ${i}`, tick: `${i}`, budget: 200, unit: 1, scale: 'x', objects: [], beats: [], camera: cam(2) })))

// the driver: what Driver.tsx does for the UI-visible state
let last = performance.now()
const loop = (now: number) => { const dt = (now - last) / 1000; last = now; timeline.update(dt); publishZone(); stepFocus(dt); requestAnimationFrame(loop) }
requestAnimationFrame(loop)

function App() {
  return (<><ExperienceTop /><ScrollHint /><PlanetHint /><SoundFeed /><LinkSync /></>)
}
initScroll()
createRoot(document.getElementById('root')!).render(<App />)
setTimeout(() => useStore.setState({ phase: 'ready' }), 400)
;(window as any).__h = {
  state: () => { const s = st(); return { t: timeline.t, zone: s.zoneId, zoneIndex: s.zoneIndex, focusPhase: s.focusPhase, focusId: s.focusId, timelineId: s.timelineId, gate: !!s.gate, phase: s.phase, motion: s.motion } },
  ranges: () => ranges('main').map((z) => ({ id: z.id, t0: z.t0, t1: z.t1 })),
  jumpT: (T: number) => { scrollToT(T, true) },
  focus: (id: string) => { void focus(id); return 1 },
  release: () => { void release(); return 1 },
  enterInfall: () => { void import('@/engine/api').then((a) => a.enterBranch('infall')); return 1 },
  /** a wheel: move the scroll position, Lenis' scroll event sets the timeline target */
  wheelTo: (y: number) => { const l = (window as any).__lenis; l.scroll = y; l.cb.forEach((f: any) => f(l)) },
  /** harness only: what <SolarFx/> publishes when Jupiter is on screen */
  planetOnScreen: (on: boolean) => { hintPos.x = 640; hintPos.y = 300; hintPos.on = on },
  sound, buildLink, currentTarget, hintPos,
}
