import { registerObject, registerZone, ranges, type CameraKey, type Beat, type V3 } from '@/engine/journey'
import { BH_ID } from '../blackhole/BHBody'
import { RG, HOLE_G } from '../blackhole/frame'
import { SUN_G, MLY, LY, eqDir, norm3, mul3, add3, sub3 } from '../galactic/units'
import { WebLayer, LaniakeaLayer } from './Cosmic'
import { SphereLayer } from './Sphere'
import { MultiverseLayer } from './Multiverse'
import { GLY, R_U, WEB_R_GLY, LANIAKEA, TEXT, T_REC_YR, R_U_GLY, DIAMETER_GLY, CMB_FRAC, round, fmt } from './model'

/**
 * Final series, step 4: 'universe' (400 svh) and 'multiverse' (300 svh), after the M87* approach (the "No" branch continues here).
 * Origin = the Sun (= the centre of OUR observable universe), unit = 1 Gly. Keys are authored in global metres and converted.
 * Seam with the black hole: the first key is a copy of the approach's last key (hole, 60 r_g, same angles); the hole dissolves over the
 * first ~12 % while the M87 glow, the Virgo members and the new layers fade in; objects are reused, never remounted.
 * Beats: see BEATS below. The multiverse is a hypothesis and says so on screen the whole time (HUD).
 */
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
/** portrait phones: the horizontal field of view is the narrow one, so the overview framings need a larger distance. 1 at the black-hole seam;
 *  the universe ends on the same multiplier the multiverse starts on, so that join stays continuous. */
const portraitK = (aspect: number) => Math.max(1, Math.min(2.4, 1 / Math.max(0.3, aspect)))
export const UNIVERSE_ID = 'universe', MULTIVERSE_ID = 'multiverse'
const gk = (t: number, target: V3, distM: number, azim: number, elev: number, hold = false): CameraKey => ({
  t, target: [(target[0] - SUN_G[0]) / GLY, (target[1] - SUN_G[1]) / GLY, (target[2] - SUN_G[2]) / GLY], dist: distM / GLY, azim, elev, fov: 35, hold,
})

export function registerUniverse() {
  registerObject({ id: 'uni-web', name: 'Cosmic web (simulated)', position: [...SUN_G], radius: WEB_R_GLY * GLY, Component: WebLayer })
  registerObject({ id: 'uni-lan', name: 'Laniakea (schematic)', position: [...SUN_G], radius: MLY, Component: LaniakeaLayer })
  registerObject({ id: 'uni-sphere', name: 'Observable universe', position: [...SUN_G], radius: R_U, Component: SphereLayer })
  registerObject({ id: 'mv-field', name: 'Multiverse (hypothesis)', position: [...SUN_G], radius: R_U, Component: MultiverseLayer })

  const prevZ = ranges('main').find((z) => z.id === 'bh-approach')
  if (!prevZ) throw new Error('registerUniverse: bh-approach must be registered first')
  const pk = prevZ.camera[prevZ.camera.length - 1]
  const a0 = pk.azim, e0 = pk.elev
  const C = mul3(norm3(eqDir(LANIAKEA.gaRa, LANIAKEA.gaDec)), 200 * MLY) // Laniakea centre, relative to the Sun
  const LAN: V3 = add3(SUN_G, C)
  const MID: V3 = add3(SUN_G, mul3(sub3(HOLE_G, SUN_G), 0.5))
  const dUni = 3.4 * R_U // the whole sphere fits
  const keys: CameraKey[] = [
    { t: 0, target: [(HOLE_G[0] - SUN_G[0]) / GLY, (HOLE_G[1] - SUN_G[1]) / GLY, (HOLE_G[2] - SUN_G[2]) / GLY], dist: (pk.dist * prevZ.unit) / GLY, azim: a0, elev: e0, fov: 35 },
    gk(0.05, HOLE_G, 300 * RG, a0, e0),
    gk(0.1, HOLE_G, 2000 * RG, a0, e0),
    gk(0.15, HOLE_G, 8.7e17, a0 + 3, e0 + 2),
    gk(0.2, HOLE_G, 4e19, a0 + 6, e0 + 4),
    gk(0.25, HOLE_G, 1.8e21, a0 + 11, e0 + 9),
    gk(0.3, HOLE_G, 8 * MLY, a0 + 16, e0 + 16),
    gk(0.37, MID, 160 * MLY, a0 + 28, e0 + 38),
    gk(0.42, LAN, 900 * MLY, a0 + 38, 28, true),
    gk(0.5, LAN, 900 * MLY, a0 + 50, 28, true),
    gk(0.58, SUN_G, 2.6 * GLY, a0 + 64, 26, true),
    gk(0.66, SUN_G, 2.6 * GLY, a0 + 76, 24, true),
    gk(0.74, SUN_G, 28 * GLY, a0 + 86, 22),
    gk(0.82, SUN_G, dUni, a0 + 96, 20),
    gk(0.86, SUN_G, dUni, a0 + 98, 20, true),
    gk(1, SUN_G, dUni, a0 + 148, 20, true),
  ]
  const tRec = fmt(round(T_REC_YR, 1000))
  const B = (id: string, w: Beat['w'], b: Partial<Beat>): Beat => ({ id, w, title: '', side: 'left', ...b })
  const beats: Beat[] = [
    B('u-1', [0.03, 0.06, 0.12, 0.15], { kicker: 'Zooming out', title: 'From a black hole to its galaxy to a cluster.' }),
    B('u-2', [0.26, 0.3, 0.35, 0.38], { kicker: 'The Virgo Cluster', title: 'Over a thousand galaxies, about 55 million light-years away.', body: 'M87 sits near its middle. Members shown are positions from the catalogue layer; the glow around them is simulated.' }),
    B('u-3', [0.43, 0.46, 0.5, 0.53], { kicker: 'Laniakea', title: `Our home supercluster: about ${LANIAKEA.diameterMly} million light-years across.`, body: 'Around 100,000 galaxies, all drifting toward a region called the Great Attractor. The Milky Way sits toward its edge. Its boundary is defined by galaxy motions (Tully et al. 2014); the picture here is schematic.' }),
    B('u-4', [0.59, 0.62, 0.66, 0.69], { kicker: 'The cosmic web', title: 'Galaxies trace sheets and filaments around huge voids.', body: 'Laniakea is one small patch. Schematic, based on large-scale structure surveys: a simulated look-alike, not a survey map.' }),
    B('u-5', [0.72, 0.74, 0.78, 0.8], { kicker: 'Zoom out further', title: 'On the largest scales the web blurs into near-uniform fog.' }),
    B('u-6', [0.81, 0.83, 0.88, 0.9], { kicker: 'The observable universe', title: `About ${Math.round(DIAMETER_GLY)} billion light-years across.`, body: 'We are at the centre of our observable universe, and only ours: anyone elsewhere has a different sphere. Its edge is not a wall. It is as far as light could have come since the Big Bang, with the expansion of space included.' }),
    B('u-7', [0.9, 0.92, 0.95, 0.965], { kicker: 'The first light', title: 'The shell is the cosmic microwave background.', body: `Released about ${tRec} years after the Big Bang (often quoted as ~380,000), when the universe first turned transparent. Map: simulated, in the style of Planck.` }),
    B('u-8', [0.965, 0.975, 1.0, 1.05], { kicker: 'Still unsettled', title: 'How fast is space expanding? Two good answers disagree.', body: 'The early universe (Planck 2018) points to 67.4 km/s per megaparsec; local distance-ladder measurements give about 73. This “Hubble tension” is unresolved.' }),
  ]
  registerZone({
    id: UNIVERSE_ID, title: 'The universe', tick: 'Universe', budget: 400, unit: GLY, origin: SUN_G, scale: 'Cosmic scale',
    objects: ['gx-m87', 'gx-virgo', BH_ID, 'uni-web', 'uni-lan', 'uni-sphere'], stillT: 0.45,
    notes: [TEXT.webNote, TEXT.cmbNote, TEXT.sphereNote], camera: keys, beats,
    framing: (l, aspect) => 1 + (portraitK(aspect) - 1) * sm(0.28, 0.42, l),
  })

  // ---- multiverse: starts on the last pose of the universe zone
  const last = keys[keys.length - 1]
  const mk = (t: number, d: number, az: number, el: number, hold = false): CameraKey => ({ t, target: [0, 0, 0], dist: (d * R_U) / GLY, azim: az, elev: el, fov: 35, hold })
  const mkeys: CameraKey[] = [
    { ...last, t: 0 },
    mk(0.15, 9, last.azim + 14, 21),
    mk(0.3, 22, last.azim + 30, 23),
    mk(0.55, 70, last.azim + 55, 26),
    mk(0.8, 160, last.azim + 82, 28),
    mk(0.88, 170, last.azim + 92, 28, true),
    mk(1, 170, last.azim + 100, 28, true),
  ]
  const H = TEXT.hypothesis
  const mbeats: Beat[] = [
    B('m-1', [0.04, 0.08, 0.2, 0.24], { kicker: 'Beyond the horizon', title: 'Nothing says the universe stops where our view does.', body: 'The edge we see is a limit of light travel, not a boundary of space. What lies past it is unknown.' }),
    B('m-2', [0.26, 0.3, 0.4, 0.44], { kicker: `Eternal inflation · ${H}`, title: 'Inflation may never have stopped everywhere.', body: 'In some models, rapid expansion carries on across most of space while bubbles where it ended keep forming. Each bubble would be a universe, and ours would be one of them.' }),
    B('m-3', [0.46, 0.5, 0.6, 0.64], { kicker: `Different constants · ${H}`, title: 'Each bubble might have different constants.', body: 'Some theories allow the strengths of forces, particle masses and dark energy to take other values in other bubbles; the string landscape is often said to hold 10⁵⁰⁰ possibilities. That is a feature of some models, not an observation.' }),
    B('m-4', [0.66, 0.7, 0.8, 0.84], { kicker: 'Can it be tested?', title: 'Probably not, and that is the problem.', body: 'Other bubbles lie far beyond our horizon, and space between us expands too fast for any signal to cross. A collision with a neighbour might have marked the microwave background; searches in WMAP data (Feeney et al. 2011) found no convincing mark. A framework that can accommodate almost any outcome is hard to falsify, and whether it counts as science is argued among physicists.' }),
    B('m-5', [0.88, 0.92, 0.99, 1.05], { style: 'hero', side: 'center', title: 'One sphere we can never leave. Beyond it, we have only begun to ask.' }),
  ]
  registerZone({
    id: MULTIVERSE_ID, title: 'The multiverse', tick: 'Multiverse', budget: 300, unit: GLY, origin: SUN_G, scale: 'Beyond the horizon',
    objects: ['uni-sphere', 'mv-field'], stillT: 0.7, notes: ['Bubbles and colours: schematic, not a prediction.'], camera: mkeys, beats: mbeats,
    framing: (l, aspect) => { const k = portraitK(aspect); return k + (1 + (k - 1) * 0.35 - k) * sm(0.2, 0.7, l) },
  })
  void R_U_GLY; void CMB_FRAC
}
