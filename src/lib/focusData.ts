/**
 * Focus-panel content (final series, step 1). One record per focusable object, keyed by registered object id.
 *
 * Planet / moon numbers follow the NASA planetary fact sheet (nssdc.gsfc.nasa.gov/planetary/factsheet) as remembered by the author; the
 * source line on screen says so. Every number that was typed from memory and not re-checked carries `// VERIFY` here and is listed in
 * docs/STATUS.md. A value with `v: true` is drawn with a dagger on screen ("not yet checked against a source").
 * Moon counts were checked on the web (NASA / Minor Planet Center news, March 2026) and keep rising: the panel says "as of March 2026".
 * Galaxy distances, sizes and star counts are rounded literature values from memory: all `v: true`.
 */
export type Row = [label: string, value: string, v?: boolean]

export interface FocusInfo {
  kind: 'planet' | 'moon' | 'star' | 'galaxy' | 'probe' | 'nebula' | 'blackhole'
  title: string
  subtitle: string
  rows: Row[]
  text: string
  /** the source line */
  source: string
  /** the honesty tag */
  tag: string
  /** moons to list as buttons (planet panels) */
  moons?: string[]
  /** parent planet (moon panels) */
  parent?: string
}

const NASA = 'Source: NASA planetary fact sheet (values rounded).'
const NASA_MOON = 'Source: NASA / JPL planetary satellite data (values rounded).'
export const TAG_PROC = 'Surface imagery: procedurally generated'
export const TAG_NASA = 'Surface imagery: NASA-derived'
export const TAG_GALAXY = 'Procedural illustration, not a Hubble/Webb photograph'
const TAG_SUN = 'Surface imagery: procedurally generated (granules exaggerated)'
const MOON_COUNT_NOTE = 'Mar 2026'

export const FOCUS_INFO: Record<string, FocusInfo> = {
  sun: {
    kind: 'star', title: 'The Sun', subtitle: 'G-type main-sequence star (G2V)',
    rows: [
      ['Diameter', '1,392,700 km (109 Earths)'], ['Mass', '1.989 × 10³⁰ kg (333,000 Earths)'], ['Rotation', '≈ 25 days at the equator, ≈ 35 near the poles'],
      ['Age', '≈ 4.6 billion years'], ['Gravity', '274 m/s² (28 g)'], ['Surface temperature', '≈ 5,770 K (core ≈ 15 million K)'], ['Atmosphere', 'Photosphere, chromosphere, corona'], ['Moons', 'Eight planets in orbit'],
    ],
    text: 'The Sun holds 99.86 % of the Solar System’s mass and turns about 4 million tonnes of itself into light every second. The light that reaches Earth left it 8 minutes and 20 seconds ago.',
    source: NASA, tag: TAG_SUN,
  },
  mercury: {
    kind: 'planet', title: 'Mercury', subtitle: 'Terrestrial planet · 0.39 AU from the Sun',
    rows: [
      ['Diameter', '4,879 km'], ['Mass', '3.30 × 10²³ kg'], ['Day length', '175.9 Earth days (sunrise to sunrise)'], ['Year length', '88.0 Earth days'],
      ['Gravity', '3.7 m/s²'], ['Mean temperature', '167 °C (−173 to 427 °C)'], ['Atmosphere', 'Almost none (a thin exosphere)'], ['Moons', '0'],
    ],
    text: 'Mercury turns three times on its axis for every two orbits, so one Mercury day lasts two of its years. With no air to hold in the heat, the sunlit side is hot enough to melt lead while ice survives in shadowed polar craters.',
    source: NASA, tag: TAG_PROC,
  },
  venus: {
    kind: 'planet', title: 'Venus', subtitle: 'Terrestrial planet · 0.72 AU from the Sun',
    rows: [
      ['Diameter', '12,104 km'], ['Mass', '4.87 × 10²⁴ kg'], ['Day length', '116.8 Earth days (sunrise to sunrise)'], ['Year length', '224.7 Earth days'],
      ['Gravity', '8.9 m/s²'], ['Mean temperature', '464 °C'], ['Atmosphere', 'Carbon dioxide, ≈ 92 bar at the surface'], ['Moons', '0'],
    ],
    text: 'Venus turns backwards, so the Sun rises in the west, and it turns so slowly that one full turn takes longer than its year. Its clouds trap heat so well that the surface is hotter than Mercury’s.',
    source: NASA, tag: TAG_PROC,
  },
  earth: {
    kind: 'planet', title: 'Earth', subtitle: 'Terrestrial planet · 1.00 AU from the Sun',
    rows: [
      ['Diameter', '12,756 km'], ['Mass', '5.97 × 10²⁴ kg'], ['Day length', '24.0 hours'], ['Year length', '365.25 days'],
      ['Gravity', '9.8 m/s²'], ['Mean temperature', '15 °C'], ['Atmosphere', 'Nitrogen 78 %, oxygen 21 %'], ['Moons', '1'],
    ],
    text: 'Earth is the only place we know that has liquid water on its surface and anyone living on it. Its thin shell of air, 100 km deep, is all that separates the oceans from the vacuum.',
    source: NASA, tag: TAG_NASA,
    moons: ['moon'],
  },
  moon: {
    kind: 'moon', parent: 'earth', title: 'The Moon', subtitle: 'Earth’s moon · 384,400 km from Earth',
    rows: [
      ['Diameter', '3,475 km'], ['Mass', '7.35 × 10²² kg'], ['Day length', '29.5 Earth days (locked: one face to Earth)'], ['Year length', '27.3 days around Earth'],
      ['Gravity', '1.62 m/s²'], ['Mean temperature', '−20 °C (−173 to 117 °C)', true], ['Atmosphere', 'None (a trace exosphere)'], ['Moons', '0'], // VERIFY mean temperature
    ],
    text: 'The Moon is about a quarter of Earth’s width, large for a moon, and drifts away from us by 3.8 cm a year. It is probably what is left of a collision between the young Earth and a Mars-sized body.',
    source: NASA_MOON, tag: TAG_NASA,
  },
  mars: {
    kind: 'planet', title: 'Mars', subtitle: 'Terrestrial planet · 1.52 AU from the Sun',
    rows: [
      ['Diameter', '6,792 km'], ['Mass', '6.42 × 10²³ kg'], ['Day length', '24.7 hours'], ['Year length', '687 Earth days'],
      ['Gravity', '3.7 m/s²'], ['Mean temperature', '−65 °C'], ['Atmosphere', 'Thin carbon dioxide, < 1 % of Earth’s pressure'], ['Moons', '2 (Phobos, Deimos)'],
    ],
    text: 'Mars has the tallest volcano and the longest canyon we know of, and dry riverbeds that show water once flowed. Its day is almost the length of ours, which is why the planet feels familiar.',
    source: NASA, tag: TAG_PROC,
  },
  ceres: {
    kind: 'planet', title: 'Ceres', subtitle: 'Dwarf planet · 2.77 AU from the Sun',
    rows: [
      ['Diameter', '≈ 940 km'], ['Mass', '9.4 × 10²⁰ kg'], ['Day length', '9.07 hours'], ['Year length', '4.6 Earth years'],
      ['Gravity', '0.28 m/s²'], ['Mean temperature', '≈ −105 °C', true], ['Atmosphere', 'None (a trace of water vapour)'], ['Moons', '0'], // VERIFY mean temperature
    ],
    text: 'Ceres is the largest object in the asteroid belt and holds about a third of its mass. The Dawn spacecraft found bright salt deposits in its craters, left by brine that reached the surface.',
    source: NASA_MOON, tag: TAG_PROC,
  },
  jupiter: {
    kind: 'planet', title: 'Jupiter', subtitle: 'Gas giant · 5.20 AU from the Sun',
    rows: [
      ['Diameter', '142,984 km'], ['Mass', '1.898 × 10²⁷ kg (318 Earths)'], ['Day length', '9.9 hours'], ['Year length', '11.86 Earth years'],
      ['Gravity', '23.1 m/s²'], ['Mean temperature', '−110 °C (at the 1-bar level)'], ['Atmosphere', 'Hydrogen 90 %, helium 10 %'], ['Moons', '101 (' + MOON_COUNT_NOTE + '; rising)', true],
    ],
    text: 'Jupiter is more than twice as massive as all the other planets together. The Great Red Spot is a storm wider than Earth that has been watched for at least 150 years, and it is slowly shrinking.',
    source: NASA, tag: TAG_PROC,
    moons: ['io', 'europa', 'ganymede', 'callisto'],
  },
  saturn: {
    kind: 'planet', title: 'Saturn', subtitle: 'Gas giant · 9.54 AU from the Sun',
    rows: [
      ['Diameter', '120,536 km'], ['Mass', '5.68 × 10²⁶ kg (95 Earths)'], ['Day length', '10.7 hours'], ['Year length', '29.4 Earth years'],
      ['Gravity', '9.0 m/s²'], ['Mean temperature', '−140 °C (at the 1-bar level)'], ['Atmosphere', 'Hydrogen 96 %, helium 3 %'], ['Moons', '285 (' + MOON_COUNT_NOTE + '; rising)', true],
    ],
    text: 'Saturn is so light that it would float in a bathtub big enough to hold it. Its main rings span about 280,000 km yet are mostly only about ten metres thick, made of ice from dust-sized grains to house-sized blocks.',
    source: NASA, tag: TAG_PROC,
    moons: ['titan', 'enceladus'],
  },
  uranus: {
    kind: 'planet', title: 'Uranus', subtitle: 'Ice giant · 19.2 AU from the Sun',
    rows: [
      ['Diameter', '51,118 km'], ['Mass', '8.68 × 10²⁵ kg (14.5 Earths)'], ['Day length', '17.2 hours (backwards)'], ['Year length', '84.0 Earth years'],
      ['Gravity', '8.7 m/s²'], ['Mean temperature', '−195 °C (at the 1-bar level)'], ['Atmosphere', 'Hydrogen, helium, methane'], ['Moons', '29 (' + MOON_COUNT_NOTE + '; rising)', true],
    ],
    text: 'Uranus rolls around the Sun on its side: its axis is tilted 98°, so each pole gets 42 years of sunlight, then 42 of darkness. The cause is probably an ancient collision.',
    source: NASA, tag: TAG_PROC,
  },
  neptune: {
    kind: 'planet', title: 'Neptune', subtitle: 'Ice giant · 30.1 AU from the Sun',
    rows: [
      ['Diameter', '49,528 km'], ['Mass', '1.02 × 10²⁶ kg (17 Earths)'], ['Day length', '16.1 hours'], ['Year length', '164.8 Earth years'],
      ['Gravity', '11.0 m/s²'], ['Mean temperature', '−200 °C (at the 1-bar level)'], ['Atmosphere', 'Hydrogen, helium, methane'], ['Moons', '16 (' + MOON_COUNT_NOTE + '; rising)', true],
    ],
    text: 'Neptune was found by calculation before anyone saw it, from the way it tugged on Uranus. Its winds, the fastest measured on any planet, reach about 2,000 km/h.',
    source: NASA, tag: TAG_PROC,
    moons: ['triton'],
  },
  pluto: {
    kind: 'planet', title: 'Pluto', subtitle: 'Dwarf planet · 39.5 AU from the Sun (mean)',
    rows: [
      ['Diameter', '2,376 km'], ['Mass', '1.30 × 10²² kg'], ['Day length', '6.39 Earth days (backwards)'], ['Year length', '248 Earth years'],
      ['Gravity', '0.62 m/s²'], ['Mean temperature', '−225 °C'], ['Atmosphere', 'Thin nitrogen, methane, carbon monoxide'], ['Moons', '5'],
    ],
    text: 'New Horizons flew past in 2015 and found mountains of water ice and a heart-shaped plain of frozen nitrogen. Pluto and its largest moon Charon circle a point in the space between them.',
    source: NASA, tag: TAG_PROC,
    moons: ['charon'],
  },
  // ---- moons (size, mass, orbit: NASA / JPL satellite data from memory)
  io: {
    kind: 'moon', parent: 'jupiter', title: 'Io', subtitle: 'Moon of Jupiter · 421,700 km from the planet',
    rows: [
      ['Diameter', '3,643 km'], ['Mass', '8.93 × 10²² kg'], ['Day length', '1.77 days (locked to Jupiter)'], ['Year length', '1.77 days around Jupiter'],
      ['Gravity', '1.80 m/s²'], ['Mean temperature', '≈ −143 °C', true], ['Atmosphere', 'Thin sulphur dioxide'], ['Moons', '0'], // VERIFY mean temperature
    ],
    text: 'Io is the most volcanically active body in the Solar System, with over 400 active volcanoes. Jupiter and its neighbouring moons squeeze and flex it, and the friction melts its interior.',
    source: NASA_MOON, tag: TAG_PROC,
  },
  europa: {
    kind: 'moon', parent: 'jupiter', title: 'Europa', subtitle: 'Moon of Jupiter · 671,100 km from the planet',
    rows: [
      ['Diameter', '3,122 km'], ['Mass', '4.80 × 10²² kg'], ['Day length', '3.55 days (locked to Jupiter)'], ['Year length', '3.55 days around Jupiter'],
      ['Gravity', '1.31 m/s²'], ['Mean temperature', '≈ −171 °C', true], ['Atmosphere', 'Very thin oxygen'], ['Moons', '0'], // VERIFY mean temperature
    ],
    text: 'Under Europa’s cracked ice shell lies an ocean with more water than all of Earth’s oceans. It is one of the places where we might one day look for life.',
    source: NASA_MOON, tag: TAG_PROC,
  },
  ganymede: {
    kind: 'moon', parent: 'jupiter', title: 'Ganymede', subtitle: 'Moon of Jupiter · 1,070,400 km from the planet',
    rows: [
      ['Diameter', '5,268 km'], ['Mass', '1.48 × 10²³ kg'], ['Day length', '7.15 days (locked to Jupiter)'], ['Year length', '7.15 days around Jupiter'],
      ['Gravity', '1.43 m/s²'], ['Mean temperature', '≈ −163 °C', true], ['Atmosphere', 'Very thin oxygen'], ['Moons', '0'], // VERIFY mean temperature
    ],
    text: 'Ganymede is the largest moon in the Solar System, bigger than Mercury, and the only moon known to have its own magnetic field. A salty ocean probably sits beneath its ice.',
    source: NASA_MOON, tag: TAG_PROC,
  },
  callisto: {
    kind: 'moon', parent: 'jupiter', title: 'Callisto', subtitle: 'Moon of Jupiter · 1,882,700 km from the planet',
    rows: [
      ['Diameter', '4,821 km'], ['Mass', '1.08 × 10²³ kg'], ['Day length', '16.69 days (locked to Jupiter)'], ['Year length', '16.69 days around Jupiter'],
      ['Gravity', '1.24 m/s²'], ['Mean temperature', '≈ −139 °C', true], ['Atmosphere', 'Trace carbon dioxide'], ['Moons', '0'], // VERIFY mean temperature
    ],
    text: 'Callisto has the most heavily cratered surface we know of, so old that almost nothing has changed on it for four billion years. It sits outside Jupiter’s worst radiation.',
    source: NASA_MOON, tag: TAG_PROC,
  },
  titan: {
    kind: 'moon', parent: 'saturn', title: 'Titan', subtitle: 'Moon of Saturn · 1,221,900 km from the planet',
    rows: [
      ['Diameter', '5,150 km'], ['Mass', '1.35 × 10²³ kg'], ['Day length', '15.95 days (locked to Saturn)'], ['Year length', '15.95 days around Saturn'],
      ['Gravity', '1.35 m/s²'], ['Mean temperature', '−179 °C'], ['Atmosphere', 'Thick nitrogen, 1.5 × Earth’s surface pressure'], ['Moons', '0'],
    ],
    text: 'Titan is the only moon with a dense atmosphere, and the only other place with rivers and lakes on its surface. They are made of liquid methane and ethane, not water.',
    source: NASA_MOON, tag: TAG_PROC,
  },
  enceladus: {
    kind: 'moon', parent: 'saturn', title: 'Enceladus', subtitle: 'Moon of Saturn · 238,000 km from the planet',
    rows: [
      ['Diameter', '504 km'], ['Mass', '1.08 × 10²⁰ kg'], ['Day length', '1.37 days (locked to Saturn)'], ['Year length', '1.37 days around Saturn'],
      ['Gravity', '0.11 m/s²'], ['Mean temperature', '≈ −198 °C', true], ['Atmosphere', 'Water vapour plumes'], ['Moons', '0'], // VERIFY mean temperature
    ],
    text: 'Geysers at Enceladus’s south pole spray water from a hidden ocean into space, and feed Saturn’s E ring. Cassini flew through the plumes and tasted salt, organic molecules and hydrogen.',
    source: NASA_MOON, tag: TAG_PROC,
  },
  triton: {
    kind: 'moon', parent: 'neptune', title: 'Triton', subtitle: 'Moon of Neptune · 354,800 km from the planet',
    rows: [
      ['Diameter', '2,707 km'], ['Mass', '2.14 × 10²² kg'], ['Day length', '5.88 days (locked to Neptune)'], ['Year length', '5.88 days around Neptune (backwards)'],
      ['Gravity', '0.78 m/s²'], ['Mean temperature', '−235 °C'], ['Atmosphere', 'Very thin nitrogen'], ['Moons', '0'],
    ],
    text: 'Triton orbits Neptune backwards, which suggests it is a captured Kuiper Belt object like Pluto. Voyager 2 saw nitrogen geysers there, and it is slowly spiralling in toward Neptune.',
    source: NASA_MOON, tag: TAG_PROC,
  },
  charon: {
    kind: 'moon', parent: 'pluto', title: 'Charon', subtitle: 'Moon of Pluto · 19,600 km from the planet',
    rows: [
      ['Diameter', '1,212 km'], ['Mass', '1.59 × 10²¹ kg'], ['Day length', '6.39 days (locked to Pluto)'], ['Year length', '6.39 days around Pluto'],
      ['Gravity', '0.29 m/s²'], ['Mean temperature', '≈ −220 °C', true], ['Atmosphere', 'None'], ['Moons', '0'], // VERIFY mean temperature
    ],
    text: 'Charon is half the width of Pluto, so large that the two circle a point in space between them. Each keeps the same face toward the other, so from Pluto, Charon hangs fixed in one part of the sky.',
    source: NASA_MOON, tag: TAG_PROC,
  },
}

// ---- galaxies. Distances: data.ts (// VERIFY). Sizes = visible diameter, rounded. Star counts: rounded estimates.
const G = (title: string, subtitle: string, rows: Row[], text: string): FocusInfo => ({
  kind: 'galaxy', title, subtitle, rows, text, source: 'Source: published literature values, rounded (not yet re-checked).', tag: TAG_GALAXY,
})
const gx = (type: string, dist: string, size: string, stars: string, facts: string): Row[] => [
  ['Type', type, true], ['Distance', dist, true], ['Size', size, true], ['Stars', stars, true], ['Notable', facts],
]
// VERIFY every galaxy row below
FOCUS_INFO['gx-m31'] = G('Andromeda (M31)', 'The nearest big galaxy', gx('Spiral (SA(s)b)', '2.5 million light-years', '≈ 220,000 light-years across', '≈ 1 trillion', 'Approaching the Milky Way at ≈ 110 km/s'),
  'Andromeda is one of the farthest things the naked eye can see, a faint smudge in a dark sky. It is larger than the Milky Way and heading our way; whether the two will merge is still debated.')
FOCUS_INFO['gx-m33'] = G('Triangulum (M33)', 'Third-largest of the Local Group', gx('Spiral (SA(s)cd)', '2.7 million light-years', '≈ 60,000 light-years across', '≈ 40 billion', 'Holds NGC 604, one of the biggest star-forming nebulae known'),
  'M33 is a loose, bluish spiral with almost no central bulge, so it is full of young stars. It is probably a satellite of Andromeda, and on a very dark night it is just visible without a telescope.')
FOCUS_INFO['gx-lmc'] = G('Large Magellanic Cloud', 'Satellite of the Milky Way', gx('Irregular (barred)', '160,000 light-years', '≈ 14,000 light-years across', '≈ 30 billion', 'Home of the Tarantula Nebula and Supernova 1987A'),
  'The LMC is the Milky Way’s largest satellite, visible to the naked eye from the Southern Hemisphere. It is forming stars furiously, and its gravity is distorting our own galaxy’s outer disc.')
FOCUS_INFO['gx-smc'] = G('Small Magellanic Cloud', 'Satellite of the Milky Way', gx('Dwarf irregular', '200,000 light-years', '≈ 7,000 light-years across', '≈ 3 billion', 'Used to find the period–luminosity law for Cepheids'),
  'The SMC is being pulled apart by the Milky Way and the LMC; a stream of gas joins the two clouds. A study of its variable stars gave astronomers their first yardstick for measuring distances to other galaxies.')
FOCUS_INFO['gx-m81'] = G('Bode’s Galaxy (M81)', 'Leader of the M81 group', gx('Grand-design spiral (SA(s)ab)', '12 million light-years', '≈ 90,000 light-years across', '≈ 250 billion', 'Hosts a central black hole of about 70 million Suns'),
  'M81 is one of the brightest galaxies in the northern sky and a textbook spiral, with two clean arms. It is slowly interacting with M82 next door, which has set off bursts of star formation in both.')
FOCUS_INFO['gx-m82'] = G('Cigar Galaxy (M82)', 'Starburst galaxy', gx('Starburst (irregular)', '11.4 million light-years', '≈ 40,000 light-years across', '≈ 30 billion', 'Forms stars ≈ 10 times faster than the Milky Way'),
  'A close pass by M81 a few hundred million years ago squeezed M82’s gas and lit a burst of star formation. The galactic wind pouring out of its centre is a plume of glowing hydrogen thousands of light-years long.')
FOCUS_INFO['gx-cena'] = G('Centaurus A (NGC 5128)', 'Nearest active radio galaxy', gx('Peculiar elliptical', '12 million light-years', '≈ 60,000 light-years across', '≈ 100 billion', 'Central black hole ≈ 55 million Suns, with radio jets'),
  'Centaurus A looks like an elliptical galaxy cut by a broad lane of dust, the remains of a smaller spiral it swallowed. Its black hole launches jets that inflate radio lobes millions of light-years wide.')
FOCUS_INFO['gx-m101'] = G('Pinwheel Galaxy (M101)', 'Face-on spiral', gx('Spiral (SAB(rs)cd)', '21 million light-years', '≈ 170,000 light-years across', '≈ 1 trillion', 'Hosted supernovae in 1909, 1951, 1970 and 2011'),
  'M101 is almost exactly face-on, so its lopsided spiral arms and bright pink star-forming regions are easy to see. It is nearly twice the width of the Milky Way yet far less massive.')
FOCUS_INFO['gx-m51'] = G('Whirlpool Galaxy (M51)', 'Interacting spiral', gx('Spiral (SA(s)bc), interacting', '28 million light-years', '≈ 76,000 light-years across', '≈ 100 billion', 'Its companion NGC 5195 is pulling on its arms'),
  'M51 was the first galaxy in which spiral structure was seen, by Lord Rosse in 1845. The smaller galaxy at the tip of one arm is dragging the gas and stars into the grand pattern we see.')
FOCUS_INFO['gx-m104'] = G('Sombrero Galaxy (M104)', 'Edge-on spiral', gx('Spiral with a huge bulge (SA(s)a)', '31 million light-years', '≈ 50,000 light-years across', '≈ 100 billion', 'A black hole of about a billion Suns at its centre'),
  'We see M104 almost edge-on, so a dark lane of dust cuts across a glowing bulge like the brim of a hat. Its halo holds about 2,000 globular clusters, many times the Milky Way’s count.')
FOCUS_INFO['gx-n1365'] = G('NGC 1365', 'Great Barred Spiral', gx('Barred spiral (SB(s)b)', '56 million light-years', '≈ 200,000 light-years across', '≈ 200 billion', 'The bar funnels gas into a growing central black hole'),
  'NGC 1365 is one of the largest barred spirals known, with a bright bar and two sharp arms. The bar channels gas toward the nucleus, where a supermassive black hole is feeding.')
FOCUS_INFO['gx-m87'] = G('M87 (Virgo A)', 'Giant elliptical at the heart of the Virgo Cluster', gx('Giant elliptical (E0–1)', '55 million light-years', '≈ 120,000 light-years (halo much larger)', '≈ 1 trillion', 'Its black hole, M87*, was the first ever imaged (EHT, 2019)'),
  'M87 is among the most massive galaxies nearby and carries thousands of globular clusters. A jet of plasma 5,000 light-years long shoots from its core, powered by a black hole of 6.5 billion Suns.')

export const infoFor = (id: string | null): FocusInfo | null => (id ? FOCUS_INFO[id] ?? null : null)
