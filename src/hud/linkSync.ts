import { ranges, zoneAt, getObject, getBranchIds } from '@/engine/journey'
import { st } from '@/engine/store'
import { timeline } from '@/engine/timeline'
import { focusState } from '@/engine/api'
import { GATE_FROM } from '@/zones/blackhole/model'
import { encodeLink, parseLink, targetToT, type LinkEnv, type LinkTarget } from '@/lib/link'

/** Glue between the pure link codec (src/lib/link.ts) and the engine state. No React. */

/** Where a link taken inside the infall branch lands: the black hole's gate (inside the approach's closing hold, past GATE_FROM so the gate opens). */
export const GATE = { zone: 'bh-approach', p: Math.min(0.99, GATE_FROM + 0.03) }

export const linkEnv = (): LinkEnv => ({
  zones: ranges('main').map((z) => z.id),
  branchZones: getBranchIds().flatMap((id) => ranges(id).map((z) => z.id)),
  gate: GATE,
  isFocusable: (id) => !!getObject(id)?.focus,
})

/** The position the URL should describe right now (null until the journey is ready). */
export function currentTarget(): LinkTarget | null {
  const s = st()
  if (s.phase !== 'ready') return null
  if (s.timelineId !== 'main') return { zone: GATE.zone, p: GATE.p, focus: null } // no deep links into the infall
  const focused = s.focusPhase !== 'idle' && !!s.focusId
  const z = zoneAt(focused ? focusState.savedT : timeline.t, 'main') // while focused the scroll position is frozen at savedT: that is where "Back" returns
  if (!z) return null
  return { zone: z.zone.id, p: z.local, focus: focused ? s.focusId : null }
}

export const hashNow = (): string | null => { const t = currentTarget(); return t ? encodeLink(t) : null }

/** The full shareable URL (origin + path + hash; other query parameters such as ?test= are dropped). */
export function buildLink(): string {
  const h = hashNow() ?? location.hash
  return `${location.origin}${location.pathname}${h}`
}

export const parseNow = (hash: string) => parseLink(hash, linkEnv())
export const tOfTarget = (t: LinkTarget) => targetToT(t, ranges('main'))
