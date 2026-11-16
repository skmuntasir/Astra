import { getObject, ranges, type WorldObjectSpec } from './journey'
import { neighbour, groupOf } from './focusGroups'
import { cam } from './world'
import { st, useStore, type GateOption, type GateSpec } from './store'
import { timeline } from './timeline'
import { lock, unlock, holdScroll, releaseScroll, scrollToT, scrollY, scrollLimit, enterBranchScroll, exitBranchScroll, stillOf } from './scroll'
import type { Pose } from './path'

/**
 * Public hooks later prompts fill in:
 *   focus(objectId) / release()          pause the scroll camera, fly to an object, return to the EXACT saved t
 *   choiceGate.open({...})               overlay with options that can branch the timeline into a sub-timeline and return
 *   enterBranch(id) / exitBranch()       sub-timelines (see registerBranch in journey.ts)
 *   jumpToZone(index)                    rail jumps: near = fly, far = cross-fade
 */
const clonePose = (p: Pose): Pose => ({ target: [...p.target], dist: p.dist, azim: p.azim, elev: p.elev, fov: p.fov, roll: p.roll })

export const focusState = {
  f: 0,
  dir: 0 as 0 | 1,
  from: null as Pose | null,
  to: null as Pose | null,
  savedT: 0,
  savedY: 0,
  waiters: [] as Array<() => void>,
  /** seconds for the fly-in / fly-out / hop between objects (1.5 - 2 s per the brief) */
  duration: 1.8,
  /** hop from one focused object to the next: blend from the pose we left to the new `to` */
  swap: null as { from: Pose; f: number; arc?: boolean } | null,
  /** azimuth of the pose for the current object (before the slow drift) and the drift accumulated since arriving, degrees */
  baseAzim: 0,
  drift: 0,
  /** 0..1 speed of the slow orbit drift: it eases in after arriving and eases out when leaving, so there is no sudden start / stop of motion */
  driftRate: 0,
  /** 1..1.45: a longer trip (bigger change of distance) takes proportionally longer, so the speed never feels rushed */
  stretch: 1,
  /** reduced motion: no flight, a short cross-fade instead */
  instant: false,
  /** the element that had keyboard focus before the first focus(), so Back / Esc can give it back */
  returnEl: null as HTMLElement | null,
}
/** Zoom while focused (only objects whose `focus.zoom` is set). `target` / `cur` are natural logs of the distance factor (0 = the framing from focus()). */
export const zoomState = { target: 0, cur: 0, baseDist: 1 }
export const zoomOf = () => { const id = st().focusId; return id ? getObject(id)?.focus?.zoom ?? null : null }
/** factor > 1 zooms in, factor < 1 zooms out */
export function focusZoomBy(factor: number) {
  const z = zoomOf()
  if (!z || !(factor > 0)) return
  zoomState.target = Math.min(Math.log(z.out), Math.max(-Math.log(z.in), zoomState.target - Math.log(factor)))
}
export const zoomLevel = () => { const z = zoomOf(); return z ? (zoomState.target + Math.log(z.in)) / (Math.log(z.in) + Math.log(z.out)) : 0 }
/** Longer flights (the camera zooms by a large factor) get up to 45 % more time. */
const stretchFor = (a: Pose, b: Pose) => 1 + 0.15 * Math.min(3, Math.max(0, Math.abs(Math.log10(a.dist / b.dist))))
const flush = () => { const w = focusState.waiters.splice(0); w.forEach((f) => f()) }
const RAD = Math.PI / 180
const DRIFT_DEG_PER_S = 1.6

/** Camera pose that frames object `o` (aspect-aware distance, sunward side if the object asks for it). */
function poseFor(o: WorldObjectSpec, fov: number, refAzim: number): Pose {
  const f = o.focus ?? {}
  const asp = cam.aspect || 1.6
  let azim = f.azim ?? refAzim + 24
  if (f.litFrom) {
    const dx = f.litFrom[0] - o.position[0], dz = f.litFrom[2] - o.position[2]
    azim = Math.atan2(dx, dz) / RAD + (f.swing ?? 35)
  }
  let dist = o.radius * (f.distRadii ?? 3.4)
  if (asp < 1) dist *= Math.min(2.4, 1 / asp) // portrait: the horizontal field of view is the narrow one
  return { target: [...o.position], dist, azim, elev: f.elev ?? 10, fov, roll: 0 }
}

function aim(o: WorldObjectSpec) {
  const to = poseFor(o, focusState.to?.fov ?? Math.min(cam.pose.fov, 38), focusState.to?.azim ?? cam.pose.azim)
  focusState.baseAzim = to.azim
  focusState.drift = 0
  focusState.driftRate = 0
  focusState.to = to
  zoomState.target = 0; zoomState.cur = 0; zoomState.baseDist = to.dist
}

/**
 * Called by the Driver every frame while an object is focused: keeps the target on the object (moons move), adds the slow orbit drift,
 * and shifts the look-at point sideways (landscape, panel on the right) or down (portrait, panel at the bottom) so the object sits in the
 * free part of the screen.
 */
export function updateFocusTarget(dt: number) {
  const s = st()
  const to = focusState.to
  if (!s.focusId || !to) return
  const o = getObject(s.focusId)
  if (!o) return
  if (s.motion === 'full') {
    const step = Math.min(dt, 0.1)
    const want = s.focusPhase === 'focused' ? 1 : 0
    focusState.driftRate += (want - focusState.driftRate) * (1 - Math.exp(-step * (want ? 1.2 : 3)))
    focusState.drift += step * DRIFT_DEG_PER_S * focusState.driftRate
  }
  to.azim = focusState.baseAzim + focusState.drift
  if (o.focus?.zoom) {
    zoomState.cur = s.motion === 'reduced' ? zoomState.target : zoomState.cur + (zoomState.target - zoomState.cur) * (1 - Math.exp(-Math.min(dt, 0.1) * 7))
    to.dist = zoomState.baseDist * Math.exp(zoomState.cur)
  }
  const a = to.azim * RAD
  const tanH = Math.tan((to.fov * RAD) / 2)
  const asp = cam.aspect || 1.6
  let sx = 0, sy = 0
  if (asp >= 1.25) sx = to.dist * tanH * asp * Math.min(0.3, 230 / ((typeof innerWidth === 'number' ? innerWidth : 1280) / 2))
  else sy = -to.dist * tanH * 0.2
  to.target = [o.position[0] + Math.cos(a) * sx, o.position[1] + sy, o.position[2] - Math.sin(a) * sx]
}

/** The pose the camera is blending toward: `to`, or the eased hop from the previous object to `to`. */
const hopOut: Pose = { target: [0, 0, 0], dist: 1, azim: 0, elev: 0, fov: 35, roll: 0 }
export function focusBase(blend: (a: Pose, b: Pose, f: number, o: Pose) => Pose, sm: (x: number) => number): Pose | null {
  const to = focusState.to
  if (!to) return null
  const w = focusState.swap
  if (!w) return to
  return w.arc ? arcPose(w.from, to, w.f) : blend(w.from, to, sm(w.f), hopOut)
}

/**
 * A hop between objects that are thousands of light-years apart (Orion Nebula, Crab Nebula, Sagittarius A*). The ordinary hop blend ties the
 * look-at point to the change of distance, which is right for neighbours (planet to moon) but for these it leaves the camera next to the object it
 * came from almost to the end and then sweeps thousands of light-years in the last instant: the new object seems to appear out of nowhere.
 * Here the camera first pulls back until both objects are in view, glides across (the destination is then on screen as a dot) and flies in to it.
 */
const ARC_GROUP = 'deep-objects', ARC_STRETCH = 1.8
const arcOut: Pose = { target: [0, 0, 0], dist: 1, azim: 0, elev: 0, fov: 35, roll: 0 }
const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
function arcHop(prevId: string | null, o: WorldObjectSpec, from: Pose, to: Pose): boolean {
  const prev = prevId ? getObject(prevId) : undefined
  if (!prev || groupOf(prevId)?.name !== ARC_GROUP || groupOf(o.id)?.name !== ARC_GROUP) return false
  const S = Math.hypot(prev.position[0] - o.position[0], prev.position[1] - o.position[1], prev.position[2] - o.position[2])
  return S > 8 * Math.max(from.dist, to.dist)
}
function arcPose(a: Pose, b: Pose, u: number): Pose {
  const o = arcOut
  const S = Math.hypot(b.target[0] - a.target[0], b.target[1] - a.target[1], b.target[2] - a.target[2])
  const asp = cam.aspect || 1.6
  const D = Math.max(a.dist, b.dist, S * 2.1 * (asp < 1 ? Math.min(2.4, 1 / asp) : 1)) // far enough that both objects fit on screen
  const up = ss(0, 0.5, u), down = ss(0.5, 1, u), pan = ss(0.25, 0.75, u), turn = ss(0.2, 0.8, u)
  const l0 = Math.log(a.dist), l1 = Math.log(b.dist), lD = Math.log(D)
  o.dist = Math.exp(l0 + (lD - l0) * up - (lD - l1) * down)
  for (let i = 0; i < 3; i++) o.target[i] = a.target[i] + (b.target[i] - a.target[i]) * pan
  let da = b.azim - a.azim
  while (da > 180) da -= 360
  while (da < -180) da += 360
  o.azim = a.azim + da * turn
  o.elev = a.elev + (b.elev - a.elev) * turn
  o.fov = a.fov + (b.fov - a.fov) * turn
  o.roll = a.roll + (b.roll - a.roll) * turn
  return o
}

const reducedFade = async (mid: () => void) => {
  await curtain(1, 220)
  mid()
  await new Promise((r) => setTimeout(r, 60))
  await curtain(0, 320)
}

export function focus(objectId: string): Promise<void> {
  const o = getObject(objectId)
  if (!o) return Promise.reject(new Error(`focus: unknown object ${objectId}`))
  const phase = st().focusPhase
  if (phase === 'flying-out') return Promise.resolve()
  if (phase !== 'idle') return hop(objectId)
  focusState.savedT = timeline.t
  focusState.savedY = scrollY()
  focusState.returnEl = (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null)
  focusState.from = clonePose(cam.pose)
  focusState.to = null
  aim(o)
  focusState.stretch = stretchFor(focusState.from, focusState.to!)
  timeline.frozen = true
  lock()
  focusState.dir = 1
  const begin = () => {
    useStore.setState({ focusId: objectId, focusPhase: 'flying-in' })
    if (focusState.instant) focusState.f = 1
  }
  focusState.instant = st().motion === 'reduced'
  if (focusState.instant) void reducedFade(begin)
  else begin()
  return new Promise((res) => focusState.waiters.push(res))
}

/** Go from the focused object to another one without returning to the journey. Only when the current flight has arrived (or is itself a hop). */
function hop(objectId: string): Promise<void> {
  const o = getObject(objectId)
  const s = st()
  if (!o || objectId === s.focusId) return Promise.resolve()
  if (!(focusState.f >= 1 || focusState.swap)) return Promise.resolve()
  const go = () => {
    const prevId = s.focusId
    focusState.swap = { from: clonePose(cam.pose), f: focusState.instant ? 1 : 0 }
    aim(o)
    focusState.stretch = stretchFor(focusState.swap.from, focusState.to!)
    if (arcHop(prevId, o, focusState.swap.from, focusState.to!)) { focusState.swap.arc = true; focusState.stretch = ARC_STRETCH }
    useStore.setState({ focusId: objectId, focusPhase: 'flying-in' })
  }
  focusState.instant = s.motion === 'reduced'
  if (focusState.instant) void reducedFade(go); else go()
  return new Promise((res) => focusState.waiters.push(res))
}

/** Left / Right while focused: previous (-1) or next (+1) object of the same group. Returns false when there is nowhere to go. */
export function focusStep(delta: number): boolean {
  const id = neighbour(st().focusId, delta)
  if (!id) return false
  void hop(id)
  return true
}

export function release(): Promise<void> {
  if (st().focusPhase === 'idle') return Promise.resolve()
  if (st().focusPhase === 'flying-out') return Promise.resolve()
  // leaving in the middle of a hop: freeze the target where the camera is, so nothing jumps
  if (focusState.swap) { focusState.to = clonePose(cam.pose); focusState.baseAzim = focusState.to.azim - focusState.drift; focusState.swap = null }
  focusState.instant = st().motion === 'reduced'
  focusState.dir = 0
  const go = () => { useStore.setState({ focusPhase: 'flying-out' }); if (focusState.instant) focusState.f = 0 }
  if (focusState.instant) void reducedFade(go); else go()
  return new Promise((res) => focusState.waiters.push(res))
}

/** Called every frame by the driver: advances f and finalises transitions. Returns eased blend 0..1. */
export function stepFocus(dt: number): number {
  const s = st()
  if (s.focusPhase === 'idle') return 0
  const step = Math.min(dt, 0.1) / Math.max(0.05, focusState.duration * focusState.stretch)
  const sw = focusState.swap
  if (sw) {
    sw.f = Math.min(1, sw.f + step)
    if (sw.f >= 1) { focusState.swap = null; if (s.focusPhase !== 'flying-out') useStore.setState({ focusPhase: 'focused' }); flush() }
  } else {
    focusState.f = Math.min(1, Math.max(0, focusState.f + (focusState.dir ? step : -step)))
    if (focusState.dir === 1 && focusState.f >= 1 && s.focusPhase !== 'focused') { useStore.setState({ focusPhase: 'focused' }); flush() }
  }
  if (focusState.dir === 0 && focusState.f <= 0) {
    // back at the saved pose: restore the exact t and scroll position, then hand control back
    timeline.frozen = false
    timeline.snap(focusState.savedT)
    scrollToT(focusState.savedT, true)
    unlock()
    focusState.to = null
    focusState.swap = null
    useStore.setState({ focusId: null, focusPhase: 'idle' })
    flush()
    const el = focusState.returnEl
    focusState.returnEl = null
    if (el && typeof el.focus === 'function' && document.contains(el)) el.focus({ preventScroll: true })
    return 0
  }
  const x = focusState.f
  return x * x * x * (x * (x * 6 - 15) + 10) // smootherstep
}

// ---------------- choice gate ----------------
let gateResolve: ((o: GateOption) => void) | null = null
export const choiceGate = {
  open(spec: GateSpec): Promise<GateOption> {
    timeline.frozen = true
    holdScroll()
    // The choice usually opens while a touch scroll is still gliding (momentum). On a phone the first tap then only stops that glide and no click
    // reaches the button, so it needed two taps. A programmatic scroll to the current position ends the glide at once.
    try { window.scrollTo({ top: window.scrollY, left: 0, behavior: 'instant' as ScrollBehavior }) } catch { /* old browser: harmless */ }
    useStore.setState({ gate: spec })
    return new Promise((res) => { gateResolve = res })
  },
  choose(optionId: string) {
    const g = st().gate
    const opt = g?.options.find((o) => o.id === optionId)
    if (!g || !opt) return
    useStore.setState({ gate: null })
    timeline.frozen = false
    if (opt.branch) {
      // enter the branch while the hold still remembers the exact gate position (enterBranchScroll saves it for Return), then let the page go
      // WITHOUT restoring that position: the branch starts at its own top
      enterBranch(opt.branch)
      releaseScroll(false)
    } else {
      releaseScroll(true) // "No": put the page back exactly where it was, then carry on
      if (opt.gotoT !== undefined) scrollToT(opt.gotoT, false)
    }
    gateResolve?.(opt)
    gateResolve = null
  },
  cancel() { if (st().gate) { useStore.setState({ gate: null }); timeline.frozen = false; releaseScroll(true) } },
}

// ---------------- branches ----------------
export function beginJoin() {
  cam.join = { from: clonePose(cam.pose), f: 0 }
}
export function enterBranch(id: string) {
  beginJoin()
  enterBranchScroll(id)
}
export function exitBranch(returnT?: number) {
  beginJoin()
  exitBranchScroll(returnT)
}

// ---------------- jumps ----------------
export const curtain = (to: number, ms: number, ease: (u: number) => number = (u) => u) =>
  new Promise<void>((res) => {
    const from = st().curtain
    const t0 = performance.now()
    const tick = () => {
      const u = Math.min(1, (performance.now() - t0) / ms)
      useStore.setState({ curtain: from + (to - from) * ease(u) })
      if (u < 1) requestAnimationFrame(tick); else res()
    }
    tick()
  })

/** Where a menu / rail jump lands: the zone's own representative view (its `stillT`), so "Moon" shows the Moon rather than the tail of the pull-back from Earth that opens its range. The first zone lands at the very start. */
const landingT = (index: number) => (index === 0 ? ranges(st().timelineId)[0].t0 + 0.002 : stillOf(index))

export async function jumpToZone(index: number) {
  const s = st()
  const rs = ranges(s.timelineId)
  const z = rs[index]
  if (!z || s.focusPhase !== 'idle' || s.gate) return
  const near = Math.abs(index - s.zoneIndex) <= 1 && s.motion === 'full'
  const T = s.motion === 'reduced' ? stillOf(index) : landingT(index)
  if (near) { scrollToT(T, false); return }
  await curtain(1, 380)
  scrollToT(T, true)
  timeline.snap(T)
  await new Promise((r) => setTimeout(r, 120))
  await curtain(0, 480)
}

export const scrollProgress = () => scrollY() / (scrollLimit() || 1)

/** Cross-fade jump to an exact main-timeline position T (0..1): used by shared links opened in a running page. Same curtain as the rail's far jumps; never a fly-through. */
export async function jumpToT(T: number) {
  const s = st()
  if (s.timelineId !== 'main' || s.focusPhase !== 'idle' || s.gate) return
  const x = Math.min(1, Math.max(0, T))
  await curtain(1, s.motion === 'reduced' ? 150 : 380)
  scrollToT(x, true)
  timeline.snap(x)
  await new Promise((r) => setTimeout(r, 120))
  await curtain(0, s.motion === 'reduced' ? 150 : 480)
}
