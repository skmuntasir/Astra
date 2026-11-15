/**
 * Focus groups (final series, step 1): the ordered set of objects the Left / Right arrows (and swipes) step through while an object is
 * focused. An object belongs to at most one group. Registered by the zone that owns the objects (solar: planets + moons; galactic: galaxies).
 */
const groups = new Map<string, string[]>()
const owner = new Map<string, string>()

export function registerFocusGroup(name: string, ids: string[]) {
  groups.set(name, ids)
  for (const id of ids) owner.set(id, name)
}
export function groupOf(id: string | null): { name: string; ids: string[]; index: number } | null {
  if (!id) return null
  const name = owner.get(id)
  if (!name) return null
  const ids = groups.get(name)!
  return { name, ids, index: ids.indexOf(id) }
}
/** Neighbour id in the group (wraps round), or null. */
export function neighbour(id: string | null, delta: number): string | null {
  const g = groupOf(id)
  if (!g || g.ids.length < 2) return null
  return g.ids[(g.index + delta + g.ids.length * 4) % g.ids.length]
}
