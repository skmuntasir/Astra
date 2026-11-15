import { ranges, totalBudget, type ZoneRange } from '@/engine/journey'
import { formatLength } from '@/lib/scale'

/**
 * The Journey menu's text. One row per MAIN zone, in journey order, taken from the registry, so a zone added later appears automatically:
 * rows with no entry below get their summary-less title and a scale COMPUTED from the zone's camera path (the widest view it reaches).
 * Entries here are hand-written because a computed number can mislead (the Solar System is drawn compressed). Every figure is real and
 * matches the on-screen beats of the zone; the few not stated elsewhere in the app are marked // VERIFY (and listed in STATUS.md).
 */
export interface ZoneCopy { summary: string; scale: string }

export const COPY: Record<string, ZoneCopy> = {
  earth: { summary: 'Home, up close: a planet 6,371 km in radius with a thin edge of air, then the dark behind it.', scale: 'about 12,700 km across (Earth itself)' },
  moon: { summary: 'The pull-back to our nearest neighbour, a quarter of Earth’s width. Light needs 1.28 seconds to cross the gap.', scale: 'about 400,000 km across (Earth to Moon: 384,400 km)' },
  sun: { summary: 'The star we steer by: 109 Earths across, 8 minutes 20 seconds of light away (drawn closer than it really is).', scale: 'about 1.4 million km across (the Sun itself)' },
  'solar-system': { summary: 'Eight planets, Pluto and Ceres, with moons you can click. Sizes are true, distances are squeezed, and the flight ends beyond the heliopause.', scale: 'about 240 AU across to the heliopause // VERIFY (Voyager crossings at ~120 AU)' },
  beyond: { summary: 'Out through the Oort cloud to the nearest stars, each in its real position, with Alpha Centauri a little over four light-years away.', scale: 'about 70 light-years across' },
  'milky-way': { summary: 'A particle model of our galaxy: a bar, spiral arms and a warp, with the Sun in a small spur about 27,000 light-years from the centre.', scale: 'about 100,000 light-years across (the disc)' },
  'local-group': { summary: 'Two giants (the Milky Way and Andromeda), a few mid-size spirals and dozens of dwarfs. Andromeda is 2.5 million light-years away.', scale: 'about 10 million light-years across // VERIFY (commonly quoted ~3 Mpc)' },
  'nearby-galaxies': { summary: 'The galaxies around us, then the Virgo Cluster, over a thousand galaxies about 55 million light-years away, and the dive into M87.', scale: 'about 70 million light-years across' },
  'bh-approach': { summary: 'M87*, a black hole of 6.5 billion Suns, simulated: shadow, photon ring, Doppler-bright disc and jet. A choice waits at the end: fall in, or go on.', scale: 'from 2 light-years out to 60 gravitational radii (about 3,850 AU)' },
  universe: { summary: 'From the black hole out to the Virgo Cluster, our supercluster Laniakea, the cosmic web, and the edge of the observable universe.', scale: 'about 93 billion light-years across (the observable universe)' },
  multiverse: { summary: 'Speculative: what might lie beyond our horizon. Eternal inflation and bubble universes, labelled as a hypothesis, not an observation.', scale: 'beyond the horizon: no measured scale' },
}

/** the widest view the zone's camera reaches, as "about 70 million light-years across" (fallback for zones without a hand-written line) */
export function computedScale(z: ZoneRange): string {
  let w = 0
  for (const k of z.camera) w = Math.max(w, 2 * k.dist * z.unit * Math.tan(((k.fov ?? 35) * Math.PI) / 360))
  return w > 0 ? `about ${formatLength(w)} across` : z.scale
}

export interface MenuRow { id: string; index: number; title: string; summary: string; scale: string }
export function menuRows(): MenuRow[] {
  return ranges('main').map((z) => {
    const c = COPY[z.id]
    return { id: z.id, index: z.index, title: z.title, summary: c?.summary ?? '', scale: (c?.scale ?? computedScale(z)).replace(/ \/\/ VERIFY.*$/, '') }
  })
}

/** one line about the optional infall branch (its length comes from the registry) */
export const infallLine = (svh: number) =>
  `Optional: the fall into M87*, about ${Math.round(svh)} scroll-heights, a free fall from rest at 60 gravitational radii. It opens only from the black hole’s gate (“Fall into the black hole?”), so there is no direct jump into it.`
export const infallBudget = () => totalBudget('infall')
