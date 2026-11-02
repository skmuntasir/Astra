/**
 * Chapter 10 — Humanity. Pure data and maths (no React, no DOM).
 *
 * The chapter is one idea told two ways: for five thousand years we learned where we are by LOOKING; for the last 69 we have
 * also been able to GO. Every event here sits at a distance from Earth (`at`), and three monotone records (`SEEN`, `MACHINES`,
 * `PEOPLE`) say how far each of those reached by a given year. The map, the chart and the timeline all read from this file.
 *
 * Honesty notes (also shown in the UI):
 *  - Distances are rounded, and `at` is the distance that best summarises an event (where a vehicle went, or what a measurement
 *    reached). Planets are placed at their orbital distance from the Sun unless a better Earth-distance is known.
 *  - Dates in the future are plans, not predictions. Each carries a `status`.
 *  - Facts about 2026 were checked against news and agency sources in October 2026 and will go stale.
 */

export const AU = 1.495978707e11 // metres
export const LY = 9.4607e15 // metres
export const MOON = 3.844e8 // metres, mean distance

export type Kind = 'see' | 'send' | 'crew' | 'loss'
/** projected = follows from physics; planned = funded programme with a target date; proposed = studied, no committed schedule. */
export type Status = 'projected' | 'planned' | 'proposed'

export interface HumanityEvent {
  id: string
  era: number
  /** Astronomical-style year for the true-scale minimap: negative = BCE. */
  year: number
  /** Display date, as precise as is honest. */
  when: string
  /** Big numeral override, e.g. "2040s". Defaults to the year. */
  big?: string
  /** Short axis label. */
  short: string
  title: string
  text: string
  who: string
  kind: Kind
  status?: Status
  /** Distance from Earth in metres of what the event reached or measured. null = on Earth, at the centre of the map. */
  at: number | null
}

export interface Era {
  id: string
  roman: string
  name: string
  span: string
}

export const ERAS: Era[] = [
  { id: 'looking-up', roman: 'I', name: 'Looking up', span: 'c. 3200 BCE – 1000 CE' },
  { id: 'measuring', roman: 'II', name: 'Measuring', span: '1543 – 1929' },
  { id: 'leaving', roman: 'III', name: 'Leaving', span: '1944 – 1998' },
  { id: 'present', roman: 'IV', name: 'The present', span: '2005 – 2026' },
  { id: 'next', roman: 'V', name: 'Next', span: 'Late 2026 onward' },
]

/** The date "today" is placed on the axis. The content was written and checked in October 2026. */
export const TODAY = { year: 2026.78, label: 'Oct 2026' }

export const EVENTS: HumanityEvent[] = [
  // ---- I. Looking up ----------------------------------------------------------------------------------------------------
  {
    id: 'newgrange', era: 0, year: -3200, when: 'c. 3200 BCE', short: 'Newgrange', kind: 'see', at: AU,
    title: 'A tomb built to catch the winter Sun',
    text: 'In Ireland, builders aligned a passage so that the rising Sun at the winter solstice reaches the chamber floor. The Sun’s yearly cycle was known well enough to be set into stone.',
    who: 'Boyne Valley, Ireland',
  },
  {
    id: 'venus-tablet', era: 0, year: -1600, when: 'c. 1600 BCE', short: 'Babylon logs Venus', kind: 'see', at: 0.723 * AU,
    title: 'Writing the sky down',
    text: 'Babylonian scribes recorded when Venus rose and set, year after year. What survives is later copies. Predicting the sky starts with keeping a record of it.',
    who: 'Venus tablet of Ammisaduqa',
  },
  {
    id: 'aristarchus', era: 0, year: -270, when: 'c. 270 BCE', short: 'Aristarchus', kind: 'see', at: AU,
    title: 'Perhaps the Earth moves',
    text: 'Aristarchus of Samos proposed that Earth circles the Sun. He could not prove it, and almost no one followed him. It would take eighteen centuries for the idea to return.',
    who: 'Aristarchus of Samos',
  },
  {
    id: 'eratosthenes', era: 0, year: -240, when: 'c. 240 – 130 BCE', big: '240', short: 'Earth and Moon measured', kind: 'see', at: MOON,
    title: 'The world gets a size',
    text: 'Eratosthenes compared noon shadows in two Egyptian cities and worked out Earth’s circumference. A century later Hipparchus used Earth’s size to put the Moon about sixty Earth-radii away, close to the truth. How close Eratosthenes came depends on which length he meant by his unit, and that is still debated.',
    who: 'Eratosthenes · Hipparchus',
  },
  {
    id: 'ptolemy', era: 0, year: 150, when: 'c. 150 CE', short: 'Ptolemy’s Almagest', kind: 'see', at: null,
    title: 'A sky with Earth at the centre',
    text: 'Ptolemy’s Almagest gathered Greek astronomy into a model that predicted the planets well enough to use for fourteen centuries. It held Earth still at the middle. The answer to “where are we?” stayed “at the centre” for a very long time.',
    who: 'Claudius Ptolemy, Alexandria',
  },
  {
    id: 'alsufi', era: 0, year: 964, when: 'c. 964', short: 'Al-Sufi’s small cloud', kind: 'see', at: 2.5e6 * LY,
    title: 'A small cloud in Andromeda',
    text: 'In his Book of the Fixed Stars, the Persian astronomer ʿAbd al-Raḥmān al-Ṣūfī described a small cloud in the constellation Andromeda. It is the earliest surviving written description of what we now know is another galaxy, 2.5 million light-years away.',
    who: 'ʿAbd al-Raḥmān al-Ṣūfī',
  },

  // ---- II. Measuring ---------------------------------------------------------------------------------------------------
  {
    id: 'copernicus', era: 1, year: 1543, when: '1543', short: 'Copernicus', kind: 'see', at: AU,
    title: 'The Sun at the middle',
    text: 'Copernicus published a model with the Sun at the centre and Earth as one planet among several. At first it predicted no better than Ptolemy’s. But it made Earth a world with a position, not the point everything is measured from.',
    who: 'Nicolaus Copernicus',
  },
  {
    id: 'galileo', era: 1, year: 1610, when: '1610', short: 'Galileo’s telescope', kind: 'see', at: 5.2 * AU,
    title: 'Other worlds, with moons of their own',
    text: 'Pointing a telescope at Jupiter, Galileo found four moons circling it, so not everything circles Earth. He saw phases of Venus, mountains on the Moon, and the Milky Way dissolve into stars.',
    who: 'Galileo Galilei',
  },
  {
    id: 'cassini', era: 1, year: 1672, when: '1672', short: 'Cassini & Richer: the AU', kind: 'see', at: AU,
    title: 'The Solar System gets a size',
    text: 'Cassini in Paris and Richer in Cayenne measured Mars against the stars at the same time. The shift gave the distance to Mars and, through Kepler’s laws, to the Sun: about 140 million km, within 7% of the truth. The planets finally had distances in kilometres.',
    who: 'Giovanni Cassini · Jean Richer',
  },
  {
    id: 'newton', era: 1, year: 1687, when: '1687', short: 'Newton’s Principia', kind: 'see', at: MOON,
    title: 'One law, up there and down here',
    text: 'Newton showed that the force that drops an apple also holds the Moon in its orbit and steers the planets. The sky stopped being a different kind of place: the same rules applied everywhere we could look.',
    who: 'Isaac Newton',
  },
  {
    id: 'bessel', era: 1, year: 1838, when: '1838', short: 'Bessel: a star’s distance', kind: 'see', at: 11.4 * LY,
    title: 'A star’s distance, at last',
    text: 'Friedrich Bessel measured the tiny yearly shift of 61 Cygni against more distant stars and found it about ten light-years away (the modern value is 11.4). Stars were not painted on a dome. They were suns, and now one had a distance.',
    who: 'Friedrich Bessel',
  },
  {
    id: 'neptune', era: 1, year: 1846, when: '23 September 1846', short: 'Neptune, by calculation', kind: 'see', at: 30.07 * AU,
    title: 'A planet found on paper first',
    text: 'Le Verrier and Adams calculated where an unseen planet must lie to explain Uranus’s odd orbit. Johann Galle pointed a telescope at Le Verrier’s position and found Neptune within a degree. Gravity had been trusted thirty times farther than Earth is from the Sun.',
    who: 'Le Verrier · Adams · Galle',
  },
  {
    id: 'spectra', era: 1, year: 1859, when: '1859', short: 'Spectroscopy', kind: 'see', at: AU,
    title: 'Stars are made of what we are made of',
    text: 'Kirchhoff and Bunsen showed that each element leaves its own pattern of lines in light. Turned on the Sun and stars, the lines revealed iron, sodium and hydrogen: familiar elements. Distant things could now be analysed without being visited.',
    who: 'Gustav Kirchhoff · Robert Bunsen',
  },
  {
    id: 'shapley', era: 1, year: 1918, when: '1918', short: 'Shapley: not the centre', kind: 'see', at: 26000 * LY,
    title: 'The Sun is not at the middle of the Galaxy',
    text: 'Using Henrietta Leavitt’s discovery that some pulsing stars reveal their own distance, Harlow Shapley mapped the globular clusters. They centred on a point in Sagittarius, not on us. His distances were too large, but the picture held: the Sun lives out in the suburbs.',
    who: 'Harlow Shapley · Henrietta Leavitt',
  },
  {
    id: 'hubble-andromeda', era: 1, year: 1924, when: '1924', short: 'Hubble: Andromeda', kind: 'see', at: 2.5e6 * LY,
    title: 'The “nebula” is another galaxy',
    text: 'Edwin Hubble found a Cepheid variable in the Andromeda nebula and used Leavitt’s relation to measure its distance: far beyond the Milky Way. Andromeda was a galaxy in its own right, and ours was one of many.',
    who: 'Edwin Hubble',
  },
  {
    id: 'expansion', era: 1, year: 1929, when: '1929', short: 'The expanding universe', kind: 'see', at: 6e6 * LY,
    title: 'The galaxies are moving apart',
    text: 'The farther a galaxy, the more its light is shifted to the red. The simplest reading is that space itself is expanding. In such a universe there is no centre to be at: every place sees the others recede.',
    who: 'Edwin Hubble · Georges Lemaître',
  },

  // ---- III. Leaving ----------------------------------------------------------------------------------------------------
  {
    id: 'v2', era: 2, year: 1944, when: '20 June 1944', short: 'V-2 reaches space', kind: 'send', at: 1.76e5,
    title: 'The first object into space',
    text: 'A German V-2 test rocket climbed to about 176 km, the first human-made object to cross the edge of space. It was a weapon, built by forced labour; thousands of prisoners died making them. The rockets that followed descend in part from that work.',
    who: 'Peenemünde, Germany',
  },
  {
    id: 'sputnik', era: 2, year: 1957, when: '4 October 1957', short: 'Sputnik 1', kind: 'send', at: 9.39e5,
    title: 'A moon we made',
    text: 'A polished sphere the size of a beach ball went into orbit and beeped. It carried one instrument, a radio transmitter. Within months, spaceflight was a national priority on both sides of the Cold War.',
    who: 'Soviet Union',
  },
  {
    id: 'gagarin', era: 2, year: 1961, when: '12 April 1961', short: 'Gagarin', kind: 'crew', at: 3.27e5,
    title: 'A person, in orbit',
    text: 'Yuri Gagarin flew one orbit in 108 minutes aboard Vostok 1, the first human in space. His highest point was 327 km. On the map beside this text, that is a ring too small to see.',
    who: 'Yuri Gagarin · Soviet Union',
  },
  {
    id: 'mariner4', era: 2, year: 1965, when: '14 July 1965', short: 'Mariner 4 at Mars', kind: 'send', at: 2.16e11,
    title: 'Another planet, close up',
    text: 'Mariner 4 sent back twenty-one photographs of a cratered, thin-aired, Moon-like Mars, far less like Earth than many had hoped. It followed Mariner 2’s flyby of Venus in 1962 and was the first close look at any planet beyond Earth’s neighbour.',
    who: 'NASA · JPL',
  },
  {
    id: 'cmb', era: 2, year: 1965, when: '1964 – 65', short: 'The cosmic glow', kind: 'see', at: 46.5e9 * LY,
    title: 'The afterglow of the beginning',
    text: 'Arno Penzias and Robert Wilson found a faint microwave hiss coming equally from every direction. It is the oldest light we can see, released when the universe was about 380,000 years old and cooled ever since. Humanity had a picture of the farthest thing it can ever see.',
    who: 'Arno Penzias · Robert Wilson',
  },
  {
    id: 'apollo8', era: 2, year: 1968, when: '21 – 27 December 1968', short: 'Apollo 8: Earthrise', kind: 'crew', at: MOON,
    title: 'The first people to see Earth whole',
    text: 'Frank Borman, Jim Lovell and William Anders became the first humans to leave Earth orbit and circle another world. On the fourth orbit they photographed Earth rising over the grey lunar horizon: one small, bright, finite place.',
    who: 'Borman · Lovell · Anders',
  },
  {
    id: 'apollo11', era: 2, year: 1969, when: '20 July 1969', short: 'Apollo 11', kind: 'crew', at: MOON,
    title: 'Footprints',
    text: 'Neil Armstrong and Buzz Aldrin landed in the Sea of Tranquility while Michael Collins waited in orbit. The two walked on the surface for about two and a half hours.',
    who: 'Armstrong · Aldrin · Collins',
  },
  {
    id: 'salyut1', era: 2, year: 1971, when: '19 April 1971', short: 'Salyut 1', kind: 'crew', at: 2.0e5,
    title: 'A first place to live in orbit',
    text: 'The Soviet Union launched Salyut 1, the first space station. Its first resident crew lived aboard for 23 days. Stations since then (Skylab, Mir, the ISS, Tiangong) have turned spaceflight from a visit into a way of living.',
    who: 'Soviet Union',
  },
  {
    id: 'apollo17', era: 2, year: 1972, when: '7 – 19 December 1972', short: 'Apollo 17 · Blue Marble', kind: 'crew', at: MOON,
    title: 'The last footprints, so far',
    text: 'Eugene Cernan and Harrison Schmitt were the last of twelve people to walk on the Moon. On the way out the crew photographed the whole sunlit Earth, the “Blue Marble.” For the next fifty-three years no one went beyond low Earth orbit.',
    who: 'Cernan · Evans · Schmitt',
  },
  {
    id: 'pioneer10', era: 2, year: 1973, when: '3 December 1973', short: 'Pioneer 10 at Jupiter', kind: 'send', at: 5.2 * AU,
    title: 'Across the asteroid belt to Jupiter',
    text: 'Pioneer 10 was the first spacecraft to cross the asteroid belt and the first to fly past Jupiter. It carries a plaque: a man and a woman, and a map placing the Sun among fourteen pulsars. Our address, for anyone who finds it.',
    who: 'NASA',
  },
  {
    id: 'voyager', era: 2, year: 1977, when: '20 August & 5 September 1977', short: 'Voyager launches', kind: 'send', at: 9.58 * AU,
    title: 'The grand tour, and a record',
    text: 'Two probes used a rare alignment of the outer planets. Voyager 2 visited Jupiter, Saturn, Uranus and, in 1989, Neptune, and is the only spacecraft to have seen the last two. Each probe carries a gold-plated disc of sounds and images of Earth.',
    who: 'NASA · JPL',
  },
  {
    id: 'shuttle', era: 2, year: 1981, when: '12 April 1981', short: 'Space Shuttle', kind: 'crew', at: 4.0e5,
    title: 'A spacecraft that came back',
    text: 'Columbia was the first reusable orbiter. In thirty years five orbiters flew 135 missions, put Hubble in orbit and helped build the International Space Station. Two were lost, with fourteen crew.',
    who: 'NASA',
  },
  {
    id: 'cost', era: 2, year: 1986, when: '1967 – 2003', big: '1986', short: 'The cost', kind: 'loss', at: null,
    title: 'Crews who did not come home',
    text: 'Apollo 1 (1967), Soyuz 1 (1967), Soyuz 11 (1971), Challenger (1986) and Columbia (2003) each killed their crews. After each, the programme stopped, found what had gone wrong, and flew again.',
    who: 'In memory of every crew lost',
  },
  {
    id: 'pale-blue-dot', era: 2, year: 1990, when: '14 February 1990', short: 'Pale Blue Dot', kind: 'send', at: 40.5 * AU,
    title: 'Home, from 6 billion kilometres',
    text: 'At Carl Sagan’s urging, controllers turned Voyager 1’s camera back toward home. In the frame, Earth is less than a pixel wide, caught in a band of scattered sunlight. Everything that has ever happened to humanity happened there.',
    who: 'Voyager 1 · Carl Sagan',
  },
  {
    id: 'hubble', era: 2, year: 1990, when: '24 April 1990', short: 'Hubble Space Telescope', kind: 'see', at: 5.4e5,
    title: 'A telescope above the air',
    text: 'Launched from the Shuttle, Hubble saw the sky without atmospheric blur. Astronauts fixed its flawed mirror in 1993. In 1995 it stared at an empty-looking patch of sky for ten days and found thousands of galaxies.',
    who: 'NASA · ESA',
  },
  {
    id: '51peg', era: 2, year: 1995, when: '6 October 1995', short: '51 Pegasi b', kind: 'see', at: 50.6 * LY,
    title: 'Planets around other suns',
    text: 'Michel Mayor and Didier Queloz found a Jupiter-sized planet circling a Sun-like star 50 light-years away, in four days. Within years it was clear that planets are the rule, not the exception.',
    who: 'Michel Mayor · Didier Queloz',
  },
  {
    id: 'iss', era: 2, year: 1998, when: '1998 · crewed since 2 Nov 2000', big: '1998', short: 'International Space Station', kind: 'crew', at: 4.1e5,
    title: 'A home that has not been empty since 2000',
    text: 'The first module, Zarya, launched in 1998. Since 2 November 2000 at least one person has been aboard at every moment: more than twenty-five years of continuous presence, built and run by five space agencies.',
    who: 'NASA · Roscosmos · ESA · JAXA · CSA',
  },

  // ---- IV. The present -------------------------------------------------------------------------------------------------
  {
    id: 'huygens', era: 3, year: 2005, when: '14 January 2005', short: 'Huygens lands on Titan', kind: 'send', at: 9.58 * AU,
    title: 'A landing in the outer Solar System',
    text: 'ESA’s Huygens probe, carried by Cassini, descended through Titan’s orange haze and landed on its surface about 1.4 billion km from the Sun, the most distant landing so far. It kept transmitting for over an hour on the ground.',
    who: 'ESA · NASA · ASI',
  },
  {
    id: 'voyager1', era: 3, year: 2012, when: '25 August 2012', short: 'Voyager 1: interstellar', kind: 'send', at: 121 * AU,
    title: 'Leaving the Sun’s bubble',
    text: 'Voyager 1 crossed the heliopause, the edge of the Sun’s wind, about 121 times Earth’s distance from the Sun: the first human-made object in interstellar space. It is still sending data.',
    who: 'NASA · JPL',
  },
  {
    id: 'new-horizons', era: 3, year: 2015, when: '14 July 2015', short: 'New Horizons: Pluto', kind: 'send', at: 33 * AU,
    title: 'Pluto, up close',
    text: 'After nine and a half years, New Horizons swept past Pluto at 14 km/s and found mountains of water ice, a heart-shaped plain of frozen nitrogen, and active geology. Nobody expected so small and cold a place to be so alive with change.',
    who: 'NASA · APL',
  },
  {
    id: 'ligo', era: 3, year: 2015, when: '14 September 2015', short: 'LIGO: gravitational waves', kind: 'see', at: 1.3e9 * LY,
    title: 'Hearing spacetime',
    text: 'Two detectors 3,000 km apart recorded the ripple from two black holes merging 1.3 billion light-years away, stretching four-kilometre arms by far less than the width of a proton. Astronomy gained a new sense, not just a new telescope.',
    who: 'LIGO Scientific Collaboration',
  },
  {
    id: 'eht', era: 3, year: 2019, when: '10 April 2019', short: 'Event Horizon Telescope', kind: 'see', at: 55e6 * LY,
    title: 'The shadow of a black hole',
    text: 'Radio dishes on four continents were linked into an Earth-sized telescope and imaged the glowing ring around the black hole at the centre of the galaxy M87, 55 million light-years away.',
    who: 'Event Horizon Telescope collaboration',
  },
  {
    id: 'crew-dragon', era: 3, year: 2020, when: '30 May 2020', short: 'Crew Dragon', kind: 'crew', at: 4.1e5,
    title: 'Crews on commercial rockets',
    text: 'Bob Behnken and Doug Hurley flew to the ISS on SpaceX’s Crew Dragon, the first crewed orbital flight by a private company. The first stage landed upright afterwards, as boosters had since 2015. Reuse was beginning to cut the cost of reaching orbit.',
    who: 'NASA · SpaceX',
  },
  {
    id: 'ingenuity', era: 3, year: 2021, when: '19 April 2021', short: 'Ingenuity flies on Mars', kind: 'send', at: 1.524 * AU,
    title: 'Flight on another world',
    text: 'A 1.8 kg helicopter rose three metres above Mars and hovered for 39 seconds, in air about one per cent as dense as Earth’s. Ingenuity flew 72 times, far beyond plan. Its host, Perseverance, has cached rock samples that are not yet on their way home.',
    who: 'NASA · JPL',
  },
  {
    id: 'jwst', era: 3, year: 2022, when: '12 July 2022', short: 'James Webb Space Telescope', kind: 'see', at: 13.5e9 * LY,
    title: 'Seeing the first galaxies',
    text: 'Launched on Christmas Day 2021 to a point 1.5 million km from Earth, Webb sees in the infrared with a 6.5-metre mirror. It has found galaxies whose light left them within about 300 million years of the Big Bang, and it is reading the air of planets around other stars.',
    who: 'NASA · ESA · CSA',
  },
  {
    id: 'dart', era: 3, year: 2022, when: '26 September 2022', short: 'DART', kind: 'send', at: 1.1e10,
    title: 'We moved an asteroid',
    text: 'NASA’s DART struck the small moonlet Dimorphos at about 6 km/s and shortened its orbit around Didymos by roughly half an hour. It was the first time humanity changed the motion of a celestial body: a harmless test of planetary defence.',
    who: 'NASA · APL',
  },
  {
    id: 'moon-landers', era: 3, year: 2023, when: '2019 – 2024', big: '2023', short: 'New landers at the Moon', kind: 'send', at: MOON,
    title: 'The Moon gets busy again',
    text: 'China landed on the far side in 2019 and brought back far-side samples in 2024. India landed near the south pole in 2023. Possible water ice in permanently shadowed craters is the draw for every programme heading there.',
    who: 'CNSA · ISRO',
  },
  {
    id: 'artemis2', era: 3, year: 2026.27, when: '1 – 10 April 2026', big: '2026', short: 'Artemis II', kind: 'crew', at: 4.0677e8,
    title: 'Beyond the Moon, with people again',
    text: 'Reid Wiseman, Victor Glover, Christina Koch and Jeremy Hansen looped around the Moon’s far side in Orion. On 6 April they passed Apollo 13’s 1970 distance record, reaching about 406,770 km from Earth: the first people beyond low Earth orbit in more than fifty-three years.',
    who: 'NASA · CSA',
  },
  {
    id: 'roman', era: 3, year: 2026.66, when: '30 August 2026', big: '2026', short: 'Roman Space Telescope', kind: 'see', at: 1.5e9,
    title: 'A wider eye',
    text: 'NASA’s Nancy Grace Roman Space Telescope launched on a Falcon Heavy and is on its way to the Sun–Earth L2 point. Each of its infrared pictures covers at least a hundred times the area of Hubble’s. First images are expected in early 2027.',
    who: 'NASA',
  },

  // ---- V. Next ---------------------------------------------------------------------------------------------------------
  {
    id: 'light-day', era: 4, year: 2026.88, when: '18 November 2026 (NASA projection)', big: '2026', short: 'Voyager 1: one light-day', kind: 'send', status: 'projected', at: 2.59e13,
    title: 'Twenty-four hours from home',
    text: 'NASA projects that on 18 November Voyager 1 will be 25.9 billion km from Earth, one light-day. A signal will take a full day to get there and another to come back. Its power is expected to run out in the 2030s.',
    who: 'NASA · JPL',
  },
  {
    id: 'artemis3', era: 4, year: 2027.9, when: 'Late 2027 (target)', big: '2027', short: 'Artemis III', kind: 'crew', status: 'planned', at: 4.67e5,
    title: 'Practising the landing, in Earth orbit',
    text: 'Artemis III has been rebuilt as a rehearsal: Orion will dock in low Earth orbit with prototype landers from SpaceX and Blue Origin. The crew was named in June 2026: Randy Bresnik, Luca Parmitano, Frank Rubio and Andre Douglas. Dates have moved before.',
    who: 'NASA · ESA',
  },
  {
    id: 'artemis4', era: 4, year: 2028, when: '2028 (target)', short: 'Artemis IV', kind: 'crew', status: 'planned', at: MOON,
    title: 'People on the Moon again',
    text: 'If the lander tests go well, Artemis IV is the planned return to the lunar surface, at the south pole. The schedule is ambitious, and earlier targets for a landing have slipped.',
    who: 'NASA',
  },
  {
    id: 'china-moon', era: 4, year: 2029.9, when: 'Before 2030 (stated goal)', big: '2030', short: 'China’s lunar landing', kind: 'crew', status: 'planned', at: MOON,
    title: 'A second nation on the Moon',
    text: 'China’s stated goal is to land astronauts on the Moon before 2030, using a Long March 10 rocket, a Mengzhou crew ship and a Lanyue lander, all in testing. Only the United States has put people on the Moon so far.',
    who: 'China Manned Space Agency',
  },
  {
    id: 'ocean-worlds', era: 4, year: 2030.3, when: '2030 – 2034', big: '2030', short: 'Europa & Titan', kind: 'send', status: 'planned', at: 9.58 * AU,
    title: 'Two ocean worlds, close up',
    text: 'Europa Clipper, launched in 2024, is due at Jupiter in 2030 to fly past the ice-covered ocean moon dozens of times. Dragonfly, a car-sized rotorcraft planned to launch in 2028, is due at Saturn’s moon Titan in 2034.',
    who: 'NASA · APL',
  },
  {
    id: 'iss-end', era: 4, year: 2031, when: 'Around 2030 – 31', big: '2031', short: 'The ISS comes down', kind: 'crew', status: 'planned', at: 4.1e5,
    title: 'The station comes down',
    text: 'NASA plans to bring the ISS down into the ocean around 2030–31 with a purpose-built SpaceX vehicle. Commercial stations are meant to replace it, though their launch dates have slipped repeatedly. China’s Tiangong will keep flying.',
    who: 'NASA · commercial partners',
  },
  {
    id: 'mars-crew', era: 4, year: 2040, when: 'No date', big: '2040s?', short: 'People on Mars', kind: 'crew', status: 'proposed', at: 2.28e11,
    title: 'A person on Mars',
    text: 'No agency has a funded, dated, tested plan to put people on Mars. The proposals depend on heavy launchers, refuelling in orbit, and a landing on a scale never attempted. It is a direction, not a schedule.',
    who: 'Proposed by several agencies and companies',
  },
  {
    id: 'hwo', era: 4, year: 2045, when: '2040s (in study)', big: '2040s', short: 'Habitable Worlds Observatory', kind: 'see', status: 'proposed', at: 25 * LY,
    title: 'A telescope to look at other Earths',
    text: 'In study at NASA: a telescope built to block a star’s glare and image around twenty-five Earth-sized planets in their stars’ habitable zones, then read the air of each. It is the instrument designed to ask whether any of them is alive.',
    who: 'NASA',
  },
  {
    id: 'gliese', era: 4, year: 42000, when: 'In about 40,000 years', big: '≈ 42,000', short: 'Voyager 1 meets Gliese 445', kind: 'send', status: 'projected', at: 2.2e16,
    title: 'The long way round',
    text: 'Voyager 1 is heading roughly toward the constellation Ophiuchus. In about forty thousand years it will pass within about 1.6 light-years of the star Gliese 445, long silent, still carrying its record of where it came from.',
    who: 'NASA · JPL',
  },
]

// ---------------------------------------------------------------------------------------------------------------------
// "Where are we?": the answer that was current at each point in the story.
// ---------------------------------------------------------------------------------------------------------------------
export interface Answer {
  id: string
  /** Event id at which this answer takes over. */
  from: string
  say: string
  since: string
  by: string
}

export const ANSWERS: Answer[] = [
  { id: 'centre', from: 'newgrange', say: 'At the centre. Everything turns around us.', since: 'As far back as records go', by: 'Every early sky-watching culture' },
  { id: 'planet', from: 'copernicus', say: 'On a planet, going round the Sun.', since: '1543 onward', by: 'Copernicus · Galileo · Newton' },
  { id: 'star', from: 'bessel', say: 'Beside one ordinary star, among stars too far to visit.', since: '1838 onward', by: 'Bessel · Kirchhoff · Bunsen' },
  { id: 'suburbs', from: 'shapley', say: 'In the suburbs of a galaxy, far from its middle.', since: '1918', by: 'Shapley · Leavitt' },
  { id: 'galaxies', from: 'hubble-andromeda', say: 'In one galaxy among countless others, in a universe that is growing.', since: '1924 – 1929', by: 'Hubble · Lemaître' },
  { id: 'outside', from: 'apollo8', say: 'On a small, bright planet, seen whole from outside by human eyes.', since: '1968', by: 'Apollo 8' },
  { id: 'many', from: '51peg', say: 'On one world among many, and still the only one known to host life.', since: '1995 onward', by: 'Mayor · Queloz and a generation of planet-hunters' },
  { id: 'open', from: 'light-day', say: 'Here, for now. The address is still being written.', since: 'Next', by: 'Everyone still looking' },
]

export const eventIndex = (id: string) => EVENTS.findIndex((e) => e.id === id)

/** Index of the answer in force at event index i. */
export function answerAt(i: number): number {
  let best = 0
  ANSWERS.forEach((a, n) => {
    if (eventIndex(a.from) <= i) best = n
  })
  return best
}

/** First event index of each era (for axis marks and the list). */
export const ERA_FIRST: number[] = ERAS.map((_, e) => EVENTS.findIndex((ev) => ev.era === e))
/** Index of the first event that has not happened yet (the "Today" mark sits just before it). */
export const FIRST_FUTURE = EVENTS.findIndex((e) => e.status !== undefined)

// ---------------------------------------------------------------------------------------------------------------------
// The radial distance scale used by the map and the chart: log10(metres), from the edge of space to the visible edge.
// ---------------------------------------------------------------------------------------------------------------------
export const LOG_MIN = 5 // 100 km, the Kármán line
export const EDGE = 46.5e9 * LY // comoving radius of the observable universe, ≈ 4.4e26 m
export const LOG_MAX = Math.log10(EDGE)

/** 0 at the edge of space, 1 at the edge of the visible universe. */
export function radial(m: number): number {
  const f = (Math.log10(m) - LOG_MIN) / (LOG_MAX - LOG_MIN)
  return Math.min(1, Math.max(0, f))
}

export interface Landmark {
  id: string
  name: string
  m: number
}

export const LANDMARKS: Landmark[] = [
  { id: 'moon', name: 'The Moon', m: MOON },
  { id: 'sun', name: 'The Sun · 1 AU', m: AU },
  { id: 'neptune', name: 'Neptune · 30 AU', m: 30.07 * AU },
  { id: 'helio', name: 'Edge of the Sun’s wind · 120 AU', m: 121 * AU },
  { id: 'proxima', name: 'Nearest star · 4.2 ly', m: 4.246 * LY },
  { id: 'centre', name: 'Galactic centre · 26,000 ly', m: 26000 * LY },
  { id: 'andromeda', name: 'Andromeda · 2.5 million ly', m: 2.5e6 * LY },
  { id: 'edge', name: 'Edge of the visible · 46 billion ly', m: EDGE },
]

// ---------------------------------------------------------------------------------------------------------------------
// Records: the farthest we had SEEN, SENT a machine, and SENT people, as of a given year. Each series is monotone.
// ---------------------------------------------------------------------------------------------------------------------
export interface RecordPoint {
  year: number
  m: number
  label: string
}

/** The farthest distance humanity had measured, or whose light it had seen. Early planetary values follow Cassini's scale. */
export const SEEN: RecordPoint[] = [
  { year: -240, m: 6.371e6, label: 'Earth’s size · Eratosthenes' },
  { year: -130, m: MOON, label: 'The Moon · Hipparchus' },
  { year: 1672, m: 9.58 * AU, label: 'Saturn’s orbit · Cassini & Richer' },
  { year: 1781, m: 19.2 * AU, label: 'Uranus · Herschel' },
  { year: 1838, m: 11.4 * LY, label: '61 Cygni · Bessel' },
  { year: 1918, m: 1e5 * LY, label: 'The Milky Way’s span · Shapley' },
  { year: 1924, m: 2.5e6 * LY, label: 'Andromeda · Hubble' },
  { year: 1963, m: 2.4e9 * LY, label: 'Quasar 3C 273 · Schmidt' },
  { year: 1965, m: EDGE, label: 'The microwave glow · Penzias & Wilson' },
]

/** The farthest any machine had been from home. Early values are distance from Earth at the encounter; from 1976, from the Sun. */
export const MACHINES: RecordPoint[] = [
  { year: 1957.76, m: 9.39e5, label: 'Sputnik 1' },
  { year: 1958.8, m: 1.139e8, label: 'Pioneer 1' },
  { year: 1959.7, m: MOON, label: 'Luna 2 · the Moon' },
  { year: 1962.95, m: 5.8e10, label: 'Mariner 2 · Venus' },
  { year: 1965.54, m: 2.16e11, label: 'Mariner 4 · Mars' },
  { year: 1973.92, m: 5.2 * AU, label: 'Pioneer 10 · Jupiter' },
  { year: 1976, m: 9.6 * AU, label: 'Pioneer 10 · Saturn’s orbit' },
  { year: 1979, m: 19.2 * AU, label: 'Pioneer 10 · Uranus’s orbit' },
  { year: 1983.45, m: 30.07 * AU, label: 'Pioneer 10 · Neptune’s orbit' },
  { year: 1998.13, m: 69.4 * AU, label: 'Voyager 1 overtakes Pioneer 10' },
  { year: 2012.65, m: 121 * AU, label: 'Voyager 1 · interstellar space' },
  { year: 2026.78, m: 172.8 * AU, label: 'Voyager 1 · today' },
]

/** The farthest any people had been from Earth. */
export const PEOPLE: RecordPoint[] = [
  { year: 1961.28, m: 3.27e5, label: 'Vostok 1 · Gagarin' },
  { year: 1966.7, m: 1.37e6, label: 'Gemini 11' },
  { year: 1968.97, m: 3.8e8, label: 'Apollo 8 · lunar orbit' },
  { year: 1970.28, m: 4.00171e8, label: 'Apollo 13' },
  { year: 2026.27, m: 4.0677e8, label: 'Artemis II' },
]

/** The record in force at `year`, or null if there is none yet. Series are sorted by year. */
export function recordAt(series: RecordPoint[], year: number): RecordPoint | null {
  let out: RecordPoint | null = null
  for (const p of series) {
    if (p.year <= year) out = p
    else break
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------------------------------------------------
const group = (n: number) => Math.round(n).toLocaleString('en-US')

/** n rounded to `s` significant figures, without trailing zeros. */
function sig(n: number, s: number): string {
  const p = Number(n.toPrecision(s))
  return p >= 1000 ? group(p) : String(p)
}

/** A distance in metres as a human-readable phrase. Chosen so every scale from a rocket to the cosmos reads naturally. */
export function fmtDistance(m: number): string {
  if (m < 1e9) return `${group(m / 1000)} km`
  if (m < 1e12) return `${sig(m / 1e9, 3)} million km`
  if (m < 5e14) return `${sig(m / AU, 3)} AU`
  const ly = m / LY
  if (ly < 1e6) return `${sig(ly, 3)} ly`
  if (ly < 1e9) return `${sig(ly / 1e6, 3)} million ly`
  return `${sig(ly / 1e9, 3)} billion ly`
}

/** "1543", "240 BCE", "2026.3" never shown; used for year-like text. */
export function yearText(year: number): string {
  if (year < 0) return `${Math.round(-year)} BCE`
  return String(Math.round(year))
}

/** The big numeral and optional suffix shown for an event. */
export function bigYear(e: HumanityEvent): { n: string; suffix?: string } {
  if (e.big) return { n: e.big, suffix: e.year < 0 ? 'BCE' : undefined }
  if (e.year < 0) return { n: String(Math.round(-e.year)), suffix: 'BCE' }
  return { n: String(Math.round(e.year)) }
}

export const KIND_LABEL: Record<Kind, string> = {
  see: 'Seen',
  send: 'Sent · machine',
  crew: 'Sent · people',
  loss: 'Lost',
}
export const STATUS_LABEL: Record<Status, string> = {
  projected: 'Projected',
  planned: 'Planned',
  proposed: 'Proposed',
}

// ---------------------------------------------------------------------------------------------------------------------
// The true-scale minimap: one straight line of time from the first event to 2050.
// ---------------------------------------------------------------------------------------------------------------------
export const MAP_START = EVENTS[0].year
export const MAP_END = 2050

/** 0..1 along the true-scale line. Events beyond the end (Gliese 445) pin to the right-hand edge. */
export function trueX(year: number): number {
  return Math.min(1, Math.max(0, (year - MAP_START) / (MAP_END - MAP_START)))
}

/** The share of the true-scale line that lies after Sputnik, in percent. */
export const SPACE_AGE_SHARE = ((TODAY.year - 1957.76) / (MAP_END - MAP_START)) * 100

/** Whole years since Sputnik 1 (4 October 1957). */
export function spaceAgeYears(now: number = Date.now()): number {
  return Math.floor((now - Date.UTC(1957, 9, 4)) / (365.2425 * 86400000))
}

/** A deterministic angle (degrees) for an event's dot on the map, so the map reads as a scatter and not a spiral. */
export function dotAngle(i: number): number {
  return (i * 137.508 + 23) % 360
}

// ---------------------------------------------------------------------------------------------------------------------
// The address: the nested places we now know we are in, and when each was learned.
// ---------------------------------------------------------------------------------------------------------------------
export interface Rung {
  id: string
  name: string
  /** Rough diameter in metres, for the nested-rings diagram (log scale). */
  size: number
  sizeText: string
  learned: string
  who: string
  how: string
}

export const RUNGS: Rung[] = [
  {
    id: 'earth', name: 'Earth', size: 1.2742e7, sizeText: '12,742 km across',
    learned: 'Size: c. 240 BCE · Seen whole: 1968', who: 'Eratosthenes · the crew of Apollo 8',
    how: 'Shadows of the same noon Sun in two cities gave its size. A camera on the way to the Moon gave the view from outside.',
  },
  {
    id: 'solar', name: 'The Solar System', size: 2.4e13, sizeText: 'Planets out to 30 AU; the Sun’s wind reaches about 120 AU',
    learned: '1543 – 1672', who: 'Copernicus · Kepler · Cassini & Richer',
    how: 'Kepler’s laws gave the planets’ relative distances. One real measurement, Mars seen from Paris and from Cayenne in 1672, fixed the scale in kilometres.',
  },
  {
    id: 'spur', name: 'The Orion Spur', size: 3.3e19, sizeText: 'A minor arm of the Galaxy, thousands of light-years long',
    learned: '1950s', who: 'Morgan · Sharpless · Osterbrock',
    how: 'Glowing hydrogen around hot young stars traced a short spiral arm segment, and the Sun sits in it. We live in a bridge between larger arms, not on one.',
  },
  {
    id: 'galaxy', name: 'The Milky Way', size: 9.46e20, sizeText: 'About 100,000 light-years across; the Sun is about 26,000 light-years from the centre',
    learned: 'Stars: 1610 · Not the centre: 1918', who: 'Galileo · Shapley · Leavitt',
    how: 'Globular clusters pile up around a point in Sagittarius, far from us. The Milky Way’s centre is over there and we are not at it.',
  },
  {
    id: 'local', name: 'The Local Group', size: 9.5e22, sizeText: 'Roughly 10 million light-years across; dominated by Andromeda and the Milky Way',
    learned: '1924 – 1936', who: 'Edwin Hubble',
    how: 'Cepheid stars in Andromeda gave its distance and made it a separate galaxy. Hubble named the neighbourhood the Local Group in 1936.',
  },
  {
    id: 'laniakea', name: 'Laniakea', size: 4.7e24, sizeText: 'About 500 million light-years across',
    learned: '2014', who: 'Tully · Courtois · Hoffman · Pomarède',
    how: 'Mapping how galaxies are moving, not just where they are, showed which way gravity makes them flow. The basin of galaxies that flows toward the same place as ours is Laniakea. It is a statement about motion, not a wall.',
  },
  {
    id: 'universe', name: 'The observable universe', size: 8.8e26, sizeText: 'About 93 billion light-years across',
    learned: '1965, refined since', who: 'Penzias & Wilson, then COBE, WMAP, Planck',
    how: 'The oldest light we can see has had 13.8 billion years to reach us. What lies beyond that horizon is more universe we cannot yet see, not an edge.',
  },
]
