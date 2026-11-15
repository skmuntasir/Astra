import type { ComponentType } from 'react'

/**
 * THE ZONE REGISTRY — the single place the journey is described.
 *
 * A zone = { id, budget (svh), unit, camera path, objects, text beats, scale label, enter/exit visibility }.
 * Later prompts add zones by calling `registerZone()` (and `registerObject()` for what lives in them) from a file under
 * src/zones/ that is imported by src/zones/index.ts. They never touch the engine.
 *
 * COORDINATES. Every position is authored in a zone's own units (`unit` metres per unit, e.g. Earth radii for the
 * inner system, AU for the planets, light-years beyond) relative to the zone's `origin` (global metres, default 0).
 * The engine converts to doubles in global METRES and renders camera-relative (floating origin), so a zone author
 * never has to think about float32.
 */
export type V3 = [number, number, number]

export interface CameraKey {
  /** 0..1 inside the zone. First key must be 0, last must be 1. */
  t: number
  /** Look-at point, zone units. */
  target: V3
  /** Camera distance from the target, zone units (interpolated logarithmically). */
  dist: number
  /** Degrees. azim 0 = camera on +Z looking toward -Z; positive swings the camera toward +X. */
  azim: number
  /** Degrees above the horizontal plane. */
  elev: number
  fov?: number
  roll?: number
  /** Zero velocity here (a pause). Default false: the path flows through. */
  hold?: boolean
}

/** A text beat: `w` = [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd] in zone-local t. */
export interface Beat {
  id: string
  kicker?: string
  title: string
  body?: string
  w: [number, number, number, number]
  /** 'hero' = the big opening title. */
  style?: 'hero' | 'beat'
  side?: 'left' | 'right' | 'center'
}

export interface Zone {
  id: string
  title: string
  /** Short label for the rail tick. */
  tick: string
  /** Scroll length in svh. */
  budget: number
  /** Metres per zone unit. */
  unit: number
  origin?: V3
  camera: CameraKey[]
  /** Ids of registered world objects visible while this zone is active. */
  objects: string[]
  beats: Beat[]
  /** Static scale caption shown with the live readout, e.g. "Planet scale". */
  scale: string
  /** Small honesty notes shown in the HUD (what is compressed, simulated or procedural in this zone). */
  notes?: string[]
  /** Fraction of the zone's own length over which it stays visible before entering / after leaving (cross-over). */
  enter?: number
  exit?: number
  /** Local t used for the reduced-motion still. */
  stillT?: number
  /**
   * Optional camera-distance multiplier by viewport aspect (width / height) and zone-local t. MUST be 1 at local t = 0 and 1 so zone joins stay
   * continuous. Used e.g. to keep the whole Solar System in view on a portrait phone.
   */
  framing?: (local: number, aspect: number) => number
}

export interface WorldObjectSpec {
  id: string
  name: string
  /** Global metres. Mutable on purpose (moons, test harness). */
  position: V3
  /** Metres. The component draws a unit-radius body; the engine scales it. */
  radius: number
  /** What focus(id) frames. */
  focus?: {
    distRadii?: number; azim?: number; elev?: number
    /** Final-series step 1: when set, the focus camera sits on the sunward side of the object (azimuth toward this global point + `swing` deg), so the lit side faces the viewer. */
    litFrom?: V3
    swing?: number
    /** Sagittarius A*: the camera can zoom while focused (wheel / pinch / + - keys). `in` / `out` = the largest factors the distance may shrink / grow by. */
    zoom?: { in: number; out: number }
  }
  /** Rendered by <Scene/>; mounted once, forever. */
  Component: ComponentType
  info?: { title: string; lines: string[] }
}

export interface Timeline {
  id: string
  zones: Zone[]
}

export interface ZoneRange extends Zone {
  t0: number
  t1: number
  index: number
}

const MAIN: Zone[] = []
const branches = new Map<string, Zone[]>()
const objects = new Map<string, WorldObjectSpec>()
let version = 0
export const registryVersion = () => version

export function registerZone(z: Zone, at?: number) {
  if (z.camera.length < 2) throw new Error(`zone ${z.id}: needs >= 2 camera keys`)
  if (z.camera[0].t !== 0 || z.camera[z.camera.length - 1].t !== 1) throw new Error(`zone ${z.id}: camera keys must span t=0..1`)
  if (MAIN.some((m) => m.id === z.id)) return
  if (at === undefined) MAIN.push(z)
  else MAIN.splice(at, 0, z)
  version++
}

/** A sub-timeline (an optional branch). It scrolls on its own page height and returns to the main timeline. */
export function registerBranch(id: string, zones: Zone[]) {
  branches.set(id, zones)
  version++
}
export function unregisterBranch(id: string) {
  branches.delete(id)
  version++
}
export const getBranchIds = () => [...branches.keys()]

export function registerObject(o: WorldObjectSpec) {
  objects.set(o.id, o)
  version++
}
export const getObject = (id: string) => objects.get(id)
export const allObjects = () => [...objects.values()]

/** Zones with computed ranges for a timeline ('main' or a branch id). Ranges come from budgets, so adding a zone re-flows them. */
const rangesCache = new Map<string, { ver: number; list: ZoneRange[] }>()
export function ranges(timelineId = 'main'): ZoneRange[] {
  // memoized per registry version: this is called several times per frame (zoneAt, activeZones, HUD) and used to rebuild every zone object each time (GC churn = micro-stutter)
  const hit = rangesCache.get(timelineId)
  if (hit && hit.ver === version) return hit.list
  const zs = timelineId === 'main' ? MAIN : (branches.get(timelineId) ?? [])
  const total = zs.reduce((s, z) => s + z.budget, 0) || 1
  let acc = 0
  const list = zs.map((z, index) => {
    const t0 = acc / total
    acc += z.budget
    return { ...z, t0, t1: acc / total, index }
  })
  rangesCache.set(timelineId, { ver: version, list })
  return list
}
export const totalBudget = (timelineId = 'main') => (timelineId === 'main' ? MAIN : (branches.get(timelineId) ?? [])).reduce((s, z) => s + z.budget, 0)

export function zoneAt(T: number, timelineId = 'main'): { zone: ZoneRange; local: number } | null {
  const rs = ranges(timelineId)
  if (!rs.length) return null
  const x = Math.min(1, Math.max(0, T))
  for (const z of rs) if (x < z.t1 || z === rs[rs.length - 1]) return { zone: z, local: Math.min(1, Math.max(0, (x - z.t0) / (z.t1 - z.t0))) }
  return null
}

/** Zones whose visibility window (range padded by enter/exit) contains T. */
export function activeZones(T: number, timelineId = 'main'): ZoneRange[] {
  return ranges(timelineId).filter((z) => {
    const span = z.t1 - z.t0
    return T >= z.t0 - (z.enter ?? 0.12) * span && T <= z.t1 + (z.exit ?? 0.12) * span
  })
}

/** Adds already-registered object ids to a main-timeline zone's visible set (additive; used by content that lives inside an existing zone, e.g. Voyager in "beyond"). */
export function addZoneObjects(zoneId: string, ids: string[]) {
  const z = MAIN.find((m) => m.id === zoneId)
  if (!z) throw new Error(`addZoneObjects: zone ${zoneId} is not registered`)
  for (const id of ids) if (!z.objects.includes(id)) z.objects.push(id)
  version++
}

/** Adds a text beat to an already-registered main-timeline zone (additive; content that lives inside an existing zone brings its own caption). */
export function addZoneBeat(zoneId: string, beat: Beat) {
  const z = MAIN.find((m) => m.id === zoneId)
  if (!z) throw new Error(`addZoneBeat: zone ${zoneId} is not registered`)
  if (!z.beats.some((b) => b.id === beat.id)) z.beats.push(beat)
  version++
}
