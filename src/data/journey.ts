/**
 * The ASTRA journey — the spine of the whole experience.
 * Sections, navigation and (later) scroll-driven scene transitions all read from here.
 * To make a chapter live: build its component, render it in App.tsx, and set status to 'live'.
 */
export type ChapterStatus = 'planned' | 'live'

export interface Chapter {
  id: string
  title: string
  /** Approximate scale of the chapter, shown as a scientific label. */
  scale: string
  summary: string
  status: ChapterStatus
}

export const chapters: Chapter[] = [
  { id: 'earth', title: 'Earth', scale: '12,742 km', summary: 'A pale blue starting point, seen from orbit.', status: 'live' },
  { id: 'moon', title: 'Moon', scale: '384,400 km', summary: 'Our nearest neighbour and first destination.', status: 'live' },
  { id: 'solar-system', title: 'Solar System', scale: '~9 billion km', summary: 'Eight planets, one star, and a long way between them.', status: 'live' },
  { id: 'cosmic-scale', title: 'Cosmic Scale', scale: '93 billion light-years', summary: 'Ten times wider, twenty-seven times over: from a human to the observable universe.', status: 'live' },
  { id: 'black-holes', title: 'Black Holes', scale: 'Event horizon', summary: 'Where spacetime itself is pushed to its limit.', status: 'live' },
  { id: 'observatory', title: 'Observatory', scale: 'One night sky', summary: 'Back to where every measurement was made: a real sky, for a real place and night.', status: 'live' },
  { id: 'star-map', title: 'Star Map', scale: 'Stars to 2,600 light-years', summary: 'The named stars, charted where they sit on the sphere of the sky: zoom, pan, select.', status: 'live' },
  { id: 'deep-space', title: 'Deep Space', scale: 'Interstellar space to 580 light-years', summary: 'Out past the last planet, across the dark between stars, toward a distant sun and the worlds that circle it.', status: 'live' },
  { id: 'search-for-life', title: 'Search for Life', scale: 'Habitable zones to biosignatures', summary: 'Thousands of worlds found; one known to host life. What would count as evidence, and how sure can we be?', status: 'live' },
  { id: 'humanity', title: 'Humanity', scale: '5,000 years of looking, 69 of going', summary: 'How a species that learned to read the sky went to look back, and what each step said about where we are.', status: 'live' },
  { id: 'stars', title: 'Stars', scale: '4.2 light-years', summary: 'Nuclear furnaces, from birth to collapse.', status: 'planned' },
  { id: 'milky-way', title: 'Milky Way', scale: '100,000 light-years', summary: 'Our home galaxy, and our place within it.', status: 'planned' },
  { id: 'galaxies', title: 'Galaxies', scale: '2.5 million light-years', summary: 'Hundreds of billions of galaxies, each a universe of stars.', status: 'planned' },
  { id: 'universe', title: 'Universe', scale: '93 billion light-years', summary: 'The observable whole.', status: 'planned' },
]
