import { useStore, st } from '@/engine/store'
import { timeline } from '@/engine/timeline'
import { cam, groups } from '@/engine/world'
import { uni } from '@/zones/universe/state'
import { focus, release, focusStep, focusState, choiceGate, enterBranch, exitBranch, jumpToZone, scrollProgress } from '@/engine/api'
import { registerBranch, unregisterBranch, ranges, zoneAt } from '@/engine/journey'
import { scrollY, scrollToT } from '@/engine/scroll'
import { bhStats, live } from '@/zones/blackhole/state'
import { readouts } from '@/zones/blackhole/Hud'
import { observerRg } from '@/zones/blackhole/frame'
import { sound } from '@/lib/audio/sound'
import { currentTarget, hashNow, buildLink, parseNow } from '@/hud/linkSync'

/** window.__astra: read-only inspection + the public hooks, used by tests/e2e.py and handy in the console. */
export function installDebug() {
  const errors: string[] = []
  window.addEventListener('error', (e) => errors.push(String(e.message)))
  window.addEventListener('unhandledrejection', (e) => errors.push('unhandled: ' + String(e.reason)))
  const ce = console.error
  console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')); ce(...a) }
  ;(window as unknown as { __astra: unknown }).__astra = {
    errors,
    state: () => ({ t: timeline.t, target: timeline.target, scrollY: scrollY(), scrollProgress: scrollProgress(), ...st(), zone: zoneAt(timeline.t, st().timelineId)?.zone.id, focusPhase: st().focusPhase, pose: cam.pose, k: cam.k }),
    ranges: (id = 'main') => ranges(id).map((z) => ({ id: z.id, t0: z.t0, t1: z.t1, budget: z.budget })),
    scrollToT, focus, release, focusStep, focusState, choiceGate, enterBranch, exitBranch, jumpToZone, registerBranch, unregisterBranch,
    store: useStore,
    world: { cam, groups },
    uni,
    sound,
    link: { current: currentTarget, hash: hashNow, build: buildLink, parse: parseNow },
    bh: { stats: bhStats, live, readouts, radius: () => observerRg(cam.pose).r },
  }
}
