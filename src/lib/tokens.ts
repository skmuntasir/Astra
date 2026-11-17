/** JS mirror of the CSS tokens in styles/index.css, for Three.js / canvas use.
 *  Keep in sync with the @theme block there. */
export const colors = {
  void: '#03040A',
  deep: '#070A12',
  abyss: '#0B1020',
  ink: '#E8ECF4',
  inkDim: '#9AA3B8',
  inkFaint: '#7d869c',
  signal: '#8FB4FF',
} as const

/** Star tints used by canvas/StarField. Canvas-only, so intentionally not CSS tokens. */
export const starTints = {
  neutral: colors.ink,
  cool: colors.signal,
  warm: '#FFD9B0',
} as const

/** Earth scene tints (canvas-only). Atmosphere stays on the single cool-blue accent; the warm tones are
 *  used sparingly: sunrise at the terminator and city lights on the night side. */
export const earthTints = {
  atmosphere: colors.signal,
  twilight: '#FF9A66',
  cityLight: starTints.warm,
} as const

/** Moon scene tints (canvas-only). Regolith is near-neutral: cool grey over the maria, a touch warmer on the
 *  highlands. The rim is the single cool-blue accent, very faint, so the unlit limb still reads against space. */
export const moonTints = {
  mare: '#EDF2FA',
  highland: '#FFFBF4',
  rim: colors.signal,
} as const

/** Solar System scene tints (canvas-only). The Sun is the one warm source of light; planets are muted, true-to-colour
 *  discs; orbit hairlines are the page's ink, with Earth's in the single cool-blue accent ("you are here"). */
export const solarTints = {
  sunCore: '#FFF3DA',
  sunLimb: '#FF8B3E',
  sunGlow: '#FFB677',
  orbit: colors.ink,
  orbitEarth: colors.signal,
  mercury: '#A39E96',
  venus: '#E6D3A6',
  earth: '#5E8FE8',
  mars: '#C4663F',
  jupiter: '#D6B58C',
  saturn: '#E3D4A5',
  uranus: '#A6DDE0',
  neptune: '#4C74D9',
} as const
