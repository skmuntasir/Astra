import { FOCUS_INFO, type FocusInfo, type Row } from '@/lib/focusData'
import { CRAB, LIGHT_DAY_AU, ORION, PULSAR_PERIOD_MS, PULSAR_SHOWN_S, PULSAR_SLOWDOWN, SGRA, VOYAGERS, NOW, lightDayLine, lightHoursFromSun, rAUat } from './data'

/** Focus-panel text for the 5c objects (same record shape as every other panel: source line + honest tag). Rows marked `true` carry the dagger (not yet checked against a primary source). */
const fmtDate = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const TAG_NEB = 'Procedural illustration, not a Hubble/Webb photograph'
const asOf = NOW.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function voyager(i: 0 | 1): FocusInfo {
  const v = VOYAGERS[i]
  const flyRows: Row[] = v.flybys.slice(1).map(([b, d]) => [b[0].toUpperCase() + b.slice(1) + ' flyby', fmtDate(d)])
  const rows: Row[] = [
    ['Launched', fmtDate(v.launch)], ...flyRows,
    ['Left the heliosphere', `${fmtDate(v.crossed.date)} (about ${v.crossed.au} AU)`],
    [`Distance from the Sun (${asOf})`, `≈ ${rAUat(v).toFixed(1)} AU`, true],
    ['Light travel time from the Sun', `≈ ${lightHoursFromSun(v).toFixed(1)} hours`, true],
  ]
  if (i === 0) rows.push(['One light-day', `${LIGHT_DAY_AU.toFixed(0)} AU from Earth`])
  const text = i === 0
    ? `${lightDayLine()} Its twin Voyager 2 took a longer road to also see Uranus and Neptune; it reaches one light-day only in 2035. The Golden Record on each probe is a gold-plated disc of sounds and images from Earth: a message in a bottle that nobody is likely to find.`
    : `Voyager 2 is the only spacecraft ever to visit Uranus and Neptune. It left the heliosphere in 2018 and reaches one light-day from Earth only around 2035. The Golden Record on each probe is a gold-plated disc of sounds and images from Earth: a message in a bottle that nobody is likely to find.`
  return {
    kind: 'probe', title: v.name, subtitle: i === 0 ? 'Humanity’s most distant spacecraft' : 'The only probe to visit all four giant planets',
    rows, text,
    source: 'Source: NASA/JPL mission status (the one-light-day moment and launch/flyby dates). Today’s distance is an estimate extrapolated from it at constant speed; NASA’s status page is the authority.',
    tag: 'Spacecraft model: schematic (not to scale for the booms). Position and trajectory: estimated.',
  }
}
FOCUS_INFO['voyager-1'] = voyager(0)
FOCUS_INFO['voyager-2'] = voyager(1)

FOCUS_INFO[ORION.id] = {
  kind: 'nebula', title: 'Orion Nebula (M42)', subtitle: 'The nearest large star-forming region',
  rows: [['Distance', '≈ 1,344 light-years'], ['Size', '≈ 24 light-years across'], ['Mass of gas', '≈ 2,000 Suns'], ['Heart', 'The Trapezium: four hot young stars'], ['Age of the stars', 'a few million years'], ['Where', 'Below Orion’s Belt; visible to the naked eye']],
  text: 'Ultraviolet light from the Trapezium stars makes the gas glow: pink-red hydrogen, teal oxygen. Dark lanes are dust that blocks the light behind it. Hundreds of newborn stars, many with planet-forming discs, sit inside.',
  source: 'Source: published values, several catalogues (distance 1,344 ± 20 ly, checked online).', tag: TAG_NEB,
}
FOCUS_INFO[CRAB.id] = {
  kind: 'nebula', title: 'Crab Nebula and Crab Pulsar', subtitle: 'Remains of the supernova of 1054',
  rows: [
    ['Distance', '≈ 6,500 light-years'], ['Size', '≈ 11 light-years across'], ['Expansion', '≈ 1,500 km/s'],
    ['Pulsar period', `≈ ${PULSAR_PERIOD_MS} ms (about 30 turns a second)`, true], ['Pulsar size', '≈ 20 km, ≈ 1.4 Suns'],
    ['Drawn rotation', `${PULSAR_SLOWDOWN}× slower than real (one turn in ${PULSAR_SHOWN_S} s)`],
  ],
  text: 'In 1054 Chinese and other astronomers recorded a “guest star” bright enough to see in daylight for about three weeks. It was a massive star exploding. The blast left this expanding cloud and, at its centre, a neutron star: the pulsar, spinning ~30 times a second. Its beams sweep past us like a lighthouse; the blue glow is its wind of fast electrons. At the real rate the beams would be a blur, so they are drawn slowed down.',
  source: 'Source: published values (distance 2.0 ± 0.5 kpc; SN 1054 records; pulsar period and slow-down 38 ns/day), checked online.',
  tag: `${TAG_NEB}. Beam geometry is schematic.`,
}
FOCUS_INFO[SGRA.id] = {
  kind: 'blackhole', title: 'Sagittarius A*', subtitle: 'The Milky Way’s central black hole',
  rows: [['Mass', '≈ 4.3 million Suns'], ['Distance', '≈ 27,000 light-years (8.28 kpc)'], ['Event horizon', '≈ 25 million km across (about 18 Suns)', true], ['EHT image', `${SGRA.imageDate} (ring ≈ 52 µas)`], ['S2 orbit', '16 years, passes within ≈ 120 AU']],
  text: 'Stars orbit an invisible point at the centre of our galaxy; tracking them for 30 years weighed the black hole. In 2022 the Event Horizon Telescope imaged it: a dark shadow inside a ring of hot gas, brighter on one side because the gas is moving toward us there. The ring here is drawn in that style, with its clumps slowly orbiting, and zooms in when you scroll, pinch or press + / −. The little swarm of “S-stars” is schematic, except that S2 follows its real orbit shape and period (time sped up: one year is 1.5 s). The Kerr simulator at /bh-lab has a Sagittarius A* preset (a simulation; spin is unconstrained).',
  source: 'Source: GRAVITY / Keck orbit fits (mass), EHT Collaboration 2022, GRAVITY 2021 (distance), values rounded.', tag: 'The ring is a procedural illustration in the style of the EHT image (not the data), drawn about 1,200× larger than true scale beside the schematic stars and orbits',
}
