/**
 * Ambient sound: the MOOD of each zone, as plain numbers (no Web Audio here, so it is unit-testable in Node).
 *
 * A mood is the set of parameters of the one ambient graph in ambient.ts. Zones are keyed by their registry id; an id that is not in the
 * table (a zone added later) falls back to DEFAULT_MOOD, so adding a zone never breaks the sound.
 *
 * Cross-fade with scroll: inside zone i the mood is  blend(mood(zone i-1), mood(zone i), smoothstep(0, XFADE, local)).  At local = 0 this is
 * exactly the previous zone's mood and at local >= XFADE exactly this zone's, so the mood is a continuous function of the scroll position
 * and every zone seam is seamless. (The blend sits at the START of a zone, not the end, so the black hole's closing hold, where the choice
 * gate waits, keeps its own mood until the person decides.)
 */
export interface Mood {
  /** fundamental of the pad, Hz. Never below ~98 Hz: nothing below 90 Hz is ever synthesized (laptop and phone speakers turn it into "pressure" and buzz) */
  root: number
  /** partial ratios (the pad is 4 pure sine partials, each a very slightly detuned pair) */
  ratio: [number, number, number, number]
  /** linear gain of each partial (before the master level) */
  gain: [number, number, number, number]
  /** low-pass cut-off of the pad, Hz */
  cutoff: number
  /** level of the "flow" bed (pink noise, low-passed). ZERO in every zone except the black hole and the fall: a continuous noise bed reads as hiss ("TV without signal") on small speakers */
  noise: number
  /** low-pass cut-off of the flow bed, Hz */
  noiseFreq: number
  /** 0..1: how far the flow bed's cut-off drifts (slow swells, like a current) */
  flow: number
  /** 0..1: the rising voice of the fall (two soft sines that climb in pitch); 0 = silent */
  tension: number
  /** reverb send, 0..1 (wide and cold = high) */
  space: number
  /** overall level of this mood, 0..1 */
  level: number
}

const m = (p: Mood): Mood => p

// FIVE PHASES, each with a character. Ratios are just-intonation intervals (3/2 fifth, 5/4 major third, 6/5 minor third).
export const MOODS: Record<string, Mood> = {
  // PHASE 1, Earth -> Solar System: warm, close, human. Low C / A / G, major third on top, soft low-pass, a little air.
  earth: m({ root: 130.81, ratio: [1, 1.5, 2, 2.5], gain: [0.3, 0.2, 0.2, 0.1], cutoff: 900, noise: 0, noiseFreq: 400, flow: 0.3, tension: 0, space: 0.3, level: 1 }),
  moon: m({ root: 110, ratio: [1, 1.5, 2, 2.5], gain: [0.3, 0.2, 0.2, 0.1], cutoff: 950, noise: 0, noiseFreq: 400, flow: 0.3, tension: 0, space: 0.36, level: 1 }),
  sun: m({ root: 98, ratio: [1, 1.5, 2, 3], gain: [0.32, 0.22, 0.2, 0.1], cutoff: 1050, noise: 0, noiseFreq: 400, flow: 0.3, tension: 0, space: 0.4, level: 1 }),
  'solar-system': m({ root: 123.47, ratio: [1, 1.5, 2, 2.25], gain: [0.28, 0.22, 0.2, 0.12], cutoff: 1250, noise: 0, noiseFreq: 400, flow: 0.3, tension: 0, space: 0.5, level: 1 }),
  // PHASE 2, beyond the Solar System -> galaxies: wide and cold. Bare fifths and octaves, longer reverb, thin airy bed.
  beyond: m({ root: 110, ratio: [1, 1.5, 3, 4], gain: [0.26, 0.24, 0.12, 0.08], cutoff: 1500, noise: 0, noiseFreq: 400, flow: 0.3, tension: 0, space: 0.66, level: 0.95 }),
  'milky-way': m({ root: 98, ratio: [1, 1.5, 3, 4], gain: [0.26, 0.24, 0.13, 0.09], cutoff: 1600, noise: 0, noiseFreq: 400, flow: 0.3, tension: 0, space: 0.72, level: 0.95 }),
  'local-group': m({ root: 98, ratio: [1, 1.5, 2, 3], gain: [0.25, 0.24, 0.16, 0.1], cutoff: 1650, noise: 0, noiseFreq: 400, flow: 0.3, tension: 0, space: 0.78, level: 0.92 }),
  'nearby-galaxies': m({ root: 103.83, ratio: [1, 1.5, 2, 3], gain: [0.25, 0.23, 0.16, 0.1], cutoff: 1600, noise: 0, noiseFreq: 400, flow: 0.3, tension: 0, space: 0.8, level: 0.92 }),
  // PHASE 3, the black hole: deep and FLOWING: a low minor cluster, a slow current in the noise bed, the first thread of tension.
  'bh-approach': m({ root: 92.5, ratio: [1, 1.2, 1.5, 2], gain: [0.32, 0.2, 0.2, 0.1], cutoff: 640, noise: 0.55, noiseFreq: 260, flow: 0.9, tension: 0.12, space: 0.6, level: 0.9 }),
  // PHASE 5, Laniakea / the universe: colder and emptier than anything before it
  universe: m({ root: 98, ratio: [1, 1.5, 2, 3], gain: [0.22, 0.2, 0.16, 0.12], cutoff: 1300, noise: 0, noiseFreq: 400, flow: 0.3, tension: 0, space: 0.86, level: 0.85 }),
  // ... and the multiverse: quiet and hollow: only odd partials (1, 3, 5), no body, a faint breath
  multiverse: m({ root: 116.54, ratio: [1, 3, 5, 7], gain: [0.16, 0.1, 0.06, 0.03], cutoff: 1500, noise: 0, noiseFreq: 400, flow: 0.3, tension: 0, space: 0.92, level: 0.7 }),
}
// PHASE 4, the fall into the black hole, is moodInfall() below: it starts exactly on the black-hole mood.

export const DEFAULT_MOOD: Mood = MOODS['solar-system']
export const XFADE = 0.25

export const mood = (id: string | null | undefined): Mood => (id && MOODS[id]) || DEFAULT_MOOD
export const mk = (): Mood => ({ root: 1, ratio: [1, 1, 1, 1], gain: [0, 0, 0, 0], cutoff: 1, noise: 0, noiseFreq: 1, flow: 0, tension: 0, space: 0, level: 0 })

const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1))); return t * t * (3 - 2 * t) }
const lin = (a: number, b: number, f: number) => a + (b - a) * f
const log = (a: number, b: number, f: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * f)

/** out = a + (b - a) f, in place (frequencies in the log domain, so a glide sounds even). */
export function blendMood(a: Mood, b: Mood, f: number, out: Mood): Mood {
  out.root = log(a.root, b.root, f)
  for (let i = 0; i < 4; i++) { out.ratio[i] = log(a.ratio[i], b.ratio[i], f); out.gain[i] = lin(a.gain[i], b.gain[i], f) }
  out.cutoff = log(a.cutoff, b.cutoff, f)
  out.noise = lin(a.noise, b.noise, f)
  out.noiseFreq = log(a.noiseFreq, b.noiseFreq, f)
  out.flow = lin(a.flow, b.flow, f)
  out.tension = lin(a.tension, b.tension, f)
  out.space = lin(a.space, b.space, f)
  out.level = lin(a.level, b.level, f)
  return out
}

/** Mood while scrolling the main timeline: zone `id`, progress `local` (0..1) in it, previous zone `prevId` (null for the first). */
export function moodAt(id: string, local: number, prevId: string | null, out: Mood): Mood {
  const here = mood(id)
  if (!prevId) return blendMood(here, here, 0, out)
  return blendMood(mood(prevId), here, sm(0, XFADE, local), out)
}

/**
 * PHASE 4: the fall. Progress p = 0..1 of the whole branch. Starts EXACTLY on the black-hole mood (so choosing "Yes" is seamless). Then the
 * current quickens and brightens (the flow bed's cut-off climbs from a murmur to a rush, like wind past a falling body), the pad closes in,
 * a soft sine voice climbs and swells, and the last 8 % fades to silence together with the picture.
 */
export function moodInfall(p: number, out: Mood): Mood {
  const base = mood('bh-approach')
  const x = Math.min(1, Math.max(0, p))
  const e = x * x * (3 - 2 * x)
  blendMood(base, base, 0, out)
  out.tension = lin(base.tension, 1, e)
  out.noise = lin(base.noise, 1.0, sm(0, 0.8, x))
  out.noiseFreq = log(base.noiseFreq, 620, e) // the rush: a low wash like wind past you, never above ~600 Hz (higher reads as hiss / "TV without signal")
  out.flow = lin(base.flow, 1, e)
  out.cutoff = log(base.cutoff, 380, e)
  // the fall closes in (space 0.6 -> 0.3), then in the last 45 % the reverb opens again, hollow and wide: the quiet of being past the horizon
  out.space = lin(base.space, 0.3, e) + 0.2 * sm(0.55, 0.92, x)
  out.level = base.level * (1 - sm(0.92, 1, x))
  return out
}
