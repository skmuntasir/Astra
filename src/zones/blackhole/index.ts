import { registerObject, registerZone, registerBranch, ranges, type CameraKey, type Zone } from '@/engine/journey'
import { BHBody, BH_ID } from './BHBody'
import { RG, HOLE_G, camAngles } from './frame'
import { STAGES, R_RELEASE, R_END, FALLER, tidalM87Horizon, tidalStellarHorizon, sci, betaAt, insideSeconds, maxInsideSeconds, formatDuration } from './model'
import { properRemaining, tidalAccel, tgOf, M87_MASS_SUN, G_EARTH } from '@/lib/bh/infall'

/**
 * Final series, step 3: the M87* approach zone (300 svh, continues from M87_END) and the infall branch (900 svh, 6 stages, 19 text beats).
 * Origin = the hole, unit = r_g (GM/c^2 for 6.5e9 Msun), target = the hole itself, so every key is a pure distance + two angles.
 * Camera: approach = distance 2000 -> 60 r_g with the viewpoint swinging from our real direction (17 deg from the jet axis) to 68 deg;
 * the last 10 % is a HOLD (constant pose) and the choice appears inside it. The branch starts from the same pose, so Yes has no join to hide.
 */
export const GATE_THETA = 68, GATE_PHI = 28
const rs = (r: number) => r / 2 // Schwarzschild radii

export function registerBlackHole() {
  registerObject({
    id: BH_ID, name: 'M87* (simulation)', position: [...HOLE_G], radius: RG, Component: BHBody,
    info: { title: 'M87*', lines: ['Black hole of 6.5 billion Suns (EHT 2019)', 'Simulation: ray-traced spinning (Kerr) model, a* = 0.9 chosen by us. Not an observation.'] },
  })
  const prevZ = ranges('main').find((z) => z.id === 'nearby-galaxies')
  if (!prevZ) throw new Error('registerBlackHole: nearby-galaxies must be registered first')
  const pk = prevZ.camera[prevZ.camera.length - 1]
  const startDist = (pk.dist * prevZ.unit) / RG
  const end = camAngles(GATE_THETA, GATE_PHI)
  const key = (t: number, dist: number, theta: number, phi: number, hold = false): CameraKey => {
    const a = camAngles(theta, phi)
    return { t, target: [0, 0, 0], dist, azim: a.azim, elev: a.elev, fov: 35, hold }
  }
  const sw = (x: number) => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u) }
  const sched: Array<[number, number]> = [[0.1, 1100], [0.22, 520], [0.34, 250], [0.46, 150], [0.58, 105], [0.7, 78], [0.8, 64]]
  const swing = (t: number) => sw((t - 0.34) / 0.56) // 0 at t = 0.34, 1 at t = 0.9
  const keys: CameraKey[] = [
    { t: 0, target: [0, 0, 0], dist: startDist, azim: pk.azim, elev: pk.elev, fov: 35 },
    ...sched.map(([t, d]) => key(t, d, 17 + (GATE_THETA - 17) * swing(t), GATE_PHI * swing(t))),
    key(0.9, R_RELEASE, GATE_THETA, GATE_PHI, true),
    key(1, R_RELEASE, GATE_THETA, GATE_PHI, true),
  ]
  const NOTE_SIM = 'Simulation: ray-traced spinning (Kerr) hole, a* = 0.9. EHT favours a spin pointing away from us (disc clockwise on the sky) but did not measure its size: 0.9 is a model choice. This is not the EHT image.'
  const NOTE_DISC = 'Disc: simplified thin disc. Jet: schematic. Backdrop: a star-field texture, not M87’s real sky.'
  registerZone({
    id: 'bh-approach', title: 'M87*', tick: 'Black hole', budget: 300, unit: RG, origin: HOLE_G, scale: 'Event-horizon scale',
    objects: ['gx-m87', BH_ID], stillT: 0.7, notes: [NOTE_SIM, NOTE_DISC], camera: keys,
    beats: [
      { id: 'bh-1', kicker: `M87* · ${Math.round(startDist / 2)} Schwarzschild radii`, title: 'Two light-years out, it is a speck.', body: `A non-rotating hole of this mass has a horizon radius of 1.92×10¹³ m: 128 AU, about four times Neptune’s orbit. Spin 0.9 shrinks it to 72 % of that. // mass from EHT 2019`.replace(' // mass from EHT 2019', ''), w: [0.03, 0.08, 0.22, 0.28], side: 'left' },
      { id: 'bh-2', kicker: 'The shadow', title: 'A dark disc far wider than the horizon.', body: 'Light bends so hard that anything aimed inside about five gravitational radii of the hole cannot reach you; spin shifts and slightly shrinks this. The 2019 EHT image showed a ring of this kind, about 42 µas across. This picture is a simulation.', w: [0.36, 0.41, 0.5, 0.55], side: 'left' },
      { id: 'bh-3', kicker: 'The photon ring', title: 'Light that has circled the hole piles up in a thin ring.', body: 'Each lap gives a fainter, sharper copy of the scene. One side of the disc is brighter: Doppler beaming. The model spins clockwise on the sky, its axis pointing away from us.', w: [0.57, 0.62, 0.7, 0.75], side: 'left' },
      { id: 'bh-4', kicker: 'The jet', title: 'A jet leaves along the spin axis.', body: 'M87’s real jet is visible for thousands of light-years, pointing 17° from our line of sight. Here it is a schematic cone along the spin axis, not a measurement.', w: [0.76, 0.8, 0.88, 0.93], side: 'left' },
    ],
  })

  // ---------------- the infall branch
  const T = (b: number) => b
  const total = STAGES.reduce((s, z) => s + z.budget, 0)
  void T; void total
  const kk = (t: number, r: number, hold = false): CameraKey => ({ t, target: [0, 0, 0], dist: r, azim: end.azim, elev: end.elev, fov: 35, hold })
  // first key copies the approach's last key exactly
  const lastKey = keys[keys.length - 1]
  const stageKeys = (r0: number, r1: number, first: boolean): CameraKey[] => (first
    ? [{ ...lastKey, t: 0, hold: false }, kk(0.5, Math.sqrt(r0 * r1)), kk(1, r1)]
    : [kk(0, r0), kk(0.5, Math.sqrt(r0 * r1)), kk(1, r1)])
  const tidal = `${sci(tidalM87Horizon)} g`
  const tidalEnd = `${sci(tidalAccel(M87_MASS_SUN, R_END) / G_EARTH)} g`
  const tidalMid = `${sci(tidalAccel(M87_MASS_SUN, 0.2) / G_EARTH)} g`
  const leftAt02 = formatDuration(properRemaining(FALLER, 0.2) * tgOf(M87_MASS_SUN))
  type B = Zone['beats'][number]
  const L = (id: string, kicker: string | undefined, title: string, body: string | undefined, w: B['w']): B => ({ id, kicker, title, body, w, side: 'left' })
  const texts: Record<string, Pick<Zone, 'beats' | 'notes' | 'stillT'>> = {
    'fall-1': { stillT: 0.2, beats: [
      L('f1', `Released from rest · r = ${R_RELEASE} r_g (${R_RELEASE / 2} Schwarzschild radii)`, 'You let go.', `A free-falling observer feels no force. M87* is so massive that tides across 2 m of you at the horizon are only ${tidal}: harmless. For a 10-solar-mass hole it would be ${sci(tidalStellarHorizon)} g, and you would be torn apart long before.`, [0.03, 0.09, 0.4, 0.48]),
      L('f1b', 'Quiet', 'Nobody is coming with you.', 'Anything you send outward now reaches the distant universe a little late and a little stretched. For you, nothing changes: your pulse, your breath and your clock keep their own steady rate.', [0.52, 0.58, 0.9, 0.97]),
    ] },
    'fall-2': { stillT: 0.2, beats: [
      L('f2', `r = 7 r_g · speed ${betaAt(7).toFixed(2)} c`, 'The sky crowds ahead.', 'Aberration: moving inward, you see the whole outside sky pushed toward the direction of travel. It brightens and turns blue.', [0.03, 0.08, 0.28, 0.34]),
      L('f2b', 'The stars lean', 'Everything you left behind slides toward one point.', 'Like rain streaking toward a windscreen. Behind you the sky stretches thin and dim; ahead, the dark patch keeps growing.', [0.38, 0.44, 0.62, 0.68]),
      L('f2c', 'Clocks drift apart', 'Time is already uneven.', 'Seen from far away, your clock is slowing without limit. Light arriving from the outside is blueshifted, and the far universe seems to be speeding up. Both statements are true.', [0.72, 0.78, 0.92, 0.97]),
    ] },
    'fall-3': { stillT: 0.2, beats: [
      L('f3', 'r = 3 r_g · the photon sphere', 'Here light itself can orbit.', 'The disc and its rings swing around you. The shadow ahead grows until it fills most of the view.', [0.03, 0.08, 0.3, 0.36]),
      L('f3b', 'A hall of mirrors', 'A thin ring is light that went round once, twice, many times.', 'Each lap shows the same scene again, fainter and a little older. The closer you come, the more laps you can see at once.', [0.4, 0.46, 0.64, 0.7]),
      L('f3c', 'In principle', 'A still observer here could see the back of their own head.', 'Light leaving sideways at this radius can circle the hole and return. You are falling too fast to linger and look.', [0.74, 0.8, 0.92, 0.97]),
    ] },
    'fall-4': { stillT: 0.5, beats: [
      L('f4a', 'r ≈ 2.3 r_g', 'There is no sign.', 'No wall, no marker. At the horizon itself, light aimed straight outward does not climb away: it holds its place.', [0.03, 0.08, 0.3, 0.36]),
      L('f4', 'r = 2 r_g · the event horizon', 'Nothing special happens. Locally.', 'No flash, no jolt. But no signal from here can ever get out again. A distant observer never sees you cross: your image freezes and fades.', [0.38, 0.44, 0.6, 0.66]),
      L('f4b', 'Your last light', 'In their sky, you never fall in.', 'The last light you emitted is still on its way out, redder and slower, and will take forever to finish. From far away you simply fade.', [0.69, 0.75, 0.92, 0.98]),
    ] },
    'fall-5': { stillT: 0.2, beats: [
      L('f5', 'Inside', 'Every path leads inward.', 'Ahead, no light reaches you at all. The outside universe is squeezed into a region behind you that keeps narrowing.', [0.03, 0.08, 0.22, 0.27]),
      L('f5b', 'Time becomes a place', 'The radius is now a clock.', 'Inside the horizon the inward direction behaves like time. You can no more stop moving inward than you can stop tomorrow from arriving.', [0.3, 0.35, 0.5, 0.55]),
      L('f5c', 'You can still see', 'The whole sky lives in one thin band.', 'Light from the entire outside universe still reaches you, folded into a bright sliver. Past its edge, straight ahead and around you, it is dark.', [0.58, 0.63, 0.77, 0.82]),
      L('f5d', 'The silence', 'Whatever you say from here is never heard.', 'The outside will never receive a word from this side. The model is still solid here. What comes next is where it stops being so.', [0.85, 0.9, 0.97, 1.02]),
    ] },
    'fall-6': { stillT: 0.8, beats: [
      L('f6a', `r = 0.2 r_g · about ${leftAt02} left on your clock`, 'Space is being drawn into a thread.', `Tides now rise as 1/r³, yet for a hole this large they are still gentle: ${tidalMid} over 2 m here, only ${tidalEnd} at r = 0.01 r_g.`, [0.04, 0.1, 0.28, 0.34]),
      L('f6b', 'No place to stand', 'r = 0 is not somewhere you walk to. It is a moment you reach.', 'Every path inside ends there, in finite time. Nothing can be done to avoid it, or to slow it by choice.', [0.38, 0.44, 0.6, 0.66]),
      L('f6c', 'The mystery', 'Something is there. Nobody knows what.', 'A singularity, a bounce, another region of spacetime, a boundary of space itself: these are proposals, not observations. Answering it needs a theory of quantum gravity, and none is finished.', [0.7, 0.76, 0.86, 0.91]),
      L('f6', 'The end of the model', 'The equations stop here.', undefined, [0.93, 0.96, 1.0, 1.1]),
    ] },
  }
  const zones: Zone[] = STAGES.map((s, i): Zone => ({
    id: s.id, title: ['Released', 'Aberration', 'Photon sphere', 'Horizon', 'Inside', 'Singularity region'][i], tick: ['Fall', 'Sky', 'Ring', 'Horizon', 'Inside', 'End'][i],
    budget: s.budget, unit: RG, origin: HOLE_G, scale: 'Infall', objects: [BH_ID], enter: 0.05, exit: 0.05,
    stillT: texts[s.id].stillT, beats: texts[s.id].beats,
    notes: i === 0 ? ['The fall uses a non-rotating simplification. Model: Schwarzschild free fall from rest at 60 r_g. Readouts are computed from the formulas.', 'The fall is compressed: scroll distance is not time. Whole fall from rest at 60 r_g: 2,500 hours of your own time.'.replace('2,500 hours', `${formatDuration(properTotalSeconds())}`)] : i === 3 ? [`Longest possible time inside a non-rotating horizon: π GM/c³ = ${formatDuration(maxInsideSeconds)} for 6.5×10⁹ Suns. This fall: ${formatDuration(insideSeconds)}.`] : [],
    camera: stageKeys(s.r0, s.r1, i === 0),
  }))
  registerBranch('infall', zones)
  void rs
}
function properTotalSeconds() { return properRemaining(FALLER, R_RELEASE) * tgOf(M87_MASS_SUN) }
