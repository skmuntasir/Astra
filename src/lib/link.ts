/**
 * Shareable link codec (pure: no DOM, no engine). The URL hash carries   #z=<zone id>&p=<progress inside the zone, 0..1>[&f=<focused object id>]
 * It works on any static host (the hash never reaches the server). Parsing never throws: anything unknown or malformed gives null,
 * and the caller falls back to the start of the journey.
 *
 *   z  a MAIN-timeline zone id. A zone id of the infall branch is NOT a deep link: it resolves to the black-hole gate (see `gate`).
 *   p  decimal 0..1, 4 digits (0.0001 of a 250 svh zone = 0.025 svh). Outside 0..1 = invalid.
 *   f  optional: an object that can be focused (checked by the caller with `isFocusable`).
 */
export interface LinkTarget { zone: string; p: number; focus: string | null }

export interface LinkEnv {
  /** ids of the main-timeline zones */
  zones: string[]
  /** ids of zones that belong to a branch (the infall) -> resolve to `gate` */
  branchZones: string[]
  /** where a link into a branch lands */
  gate: { zone: string; p: number }
  isFocusable: (id: string) => boolean
}

const ID = /^[A-Za-z0-9_-]{1,48}$/

export const round4 = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 1e4) / 1e4

export function encodeLink(t: LinkTarget): string {
  const p = round4(Number.isFinite(t.p) ? t.p : 0).toFixed(4)
  return `#z=${t.zone}&p=${p}${t.focus ? `&f=${t.focus}` : ''}`
}

/** hash (with or without the leading #) -> a validated target, or null (= start of the journey) */
export function parseLink(hash: string, env: LinkEnv): LinkTarget | null {
  try {
    const raw = hash.replace(/^#/, '')
    if (!raw || raw.length > 200) return null
    const q = new URLSearchParams(raw)
    if (q.getAll('z').length > 1 || q.getAll('p').length > 1 || q.getAll('f').length > 1) return null // repeated keys are ambiguous: invalid
    const z = q.get('z')
    if (!z || !ID.test(z)) return null
    let zone = z, p: number
    const ps = q.get('p')
    if (ps !== null && !/^\d{1,6}(\.\d{1,8})?$/.test(ps)) return null
    p = ps === null ? 0 : Number(ps)
    if (!Number.isFinite(p) || p < 0 || p > 1) return null // out of range is invalid, not clamped: it falls back to the start
    p = round4(p)
    let focus: string | null = null
    if (env.branchZones.includes(z)) { zone = env.gate.zone; p = env.gate.p } // no deep links into the infall
    else if (!env.zones.includes(z)) return null
    const f = q.get('f')
    if (f && ID.test(f) && env.isFocusable(f) && zone === z) focus = f
    return { zone, p, focus }
  } catch { return null }
}

/** global timeline position T (0..1) of a target, given the zones' t0/t1 */
export function targetToT(t: LinkTarget, zones: Array<{ id: string; t0: number; t1: number }>): number | null {
  const z = zones.find((x) => x.id === t.zone)
  return z ? z.t0 + t.p * (z.t1 - z.t0) : null
}
