import { ringStrip } from '../lib/ringstrip'
import { smoothstep, hash2, clamp } from '../lib/rng'
import { Simplex } from '../lib/noise'
import type { Ctx } from '../lib/ctx'

/**
 * Ring strips: 1D radial profile -> RGBA (straight alpha), `rows` identical rows; a ring shader maps radius -> u.
 * Radii are in km from the planet CENTRE. Every radius below is a published approximate value and carries // VERIFY.
 *
 * SATURN (u spans R0..R1 = 66,900..140,300 km; the strip's u range is unchanged from the first version so consumers keep working)
 *   D  66,900-74,510 (very faint) | C 74,658-91,975 (faint, grey) | B 91,975-117,507 (bright, dense)
 *   Cassini Division 117,507-122,050 (dim, with ringlets)         | A 122,050-136,774 (Encke gap 133,589 +-163, Keeler gap 136,505)
 *   F ring 140,180 (narrow, bright, braided)                       // VERIFY all
 * The brief quotes the Cassini Division as ~117,580-122,170 km: those numbers are used for the gap edges (they are within ~100 km of the above).
 *
 * URANUS (37,000..52,000 km): 6, 5, 4, alpha, beta, eta, gamma, delta, lambda, epsilon: narrow, dark (albedo ~0.03), epsilon the widest/brightest
 *   radii: 6 41,837 | 5 42,235 | 4 42,571 | alpha 44,718 | beta 45,661 | eta 47,176 | gamma 47,627 | delta 48,300 | lambda 50,024 | epsilon 51,149 (width 20-100 km)  // VERIFY
 * JUPITER (90,000..230,000 km): halo ring 92,000-122,500 (very faint, thick), main ring 122,500-129,000, Amalthea gossamer 129,000-182,000, Thebe gossamer 129,000-226,000  // VERIFY
 */
export const SATURN_R = [66900, 140300] as const
export const URANUS_R = [37000, 52500] as const
export const JUPITER_R = [90000, 230000] as const

const gauss = (r: number, c: number, w: number) => Math.exp(-Math.pow((r - c) / w, 2))
const box = (r: number, a: number, b: number, e: number) => smoothstep(a - e, a + e, r) * (1 - smoothstep(b - e, b + e, r))

export function saturnProfile(W: number) {
  const N = new Simplex(31337), N2 = new Simplex(4242)
  const km = (u: number) => SATURN_R[0] + u * (SATURN_R[1] - SATURN_R[0])
  return (u: number) => {
    const r = km(u)
    // ringlet noise at several radial scales (1D noise sampled along a line)
    const f1 = N.noise(r / 2600, 1.1, 0.3), f2 = N.noise(r / 520, 5.2, 1.7), f3 = N2.noise(r / 90, 2.2, 9.1), f4 = N2.noise(r / 22, 7.3, 3.3)
    const fine = (s: number) => clamp(1 + s * (0.35 * f1 + 0.3 * f2 + 0.22 * f3 + 0.12 * f4), 0, 2)
    let tau = 0
    tau += 0.012 * box(r, 66900, 74510, 400) * (0.5 + 0.5 * (f1 + 1)) // D
    // C: faint, with the Maxwell gap (87,500) and plateaus (Bond/Dawes gaps, Titan ringlet) as bumps
    tau += 0.09 * box(r, 74658, 91975, 250) * fine(0.9) * (0.7 + 0.3 * smoothstep(74658, 90000, r))
    tau += 0.10 * gauss(r, 77500, 700) + 0.12 * gauss(r, 84000, 400) // plateaus // VERIFY
    tau -= 0.08 * gauss(r, 87491, 130) // Maxwell gap
    // B: bright dense, with strong radial structure: opaque inner/outer parts, a darker band near 104,000 and 98,000 // VERIFY
    const bProfile = 0.75 + 0.25 * smoothstep(91975, 99000, r) - 0.18 * gauss(r, 104500, 1500) - 0.22 * gauss(r, 98200, 700)
    tau += 1.55 * bProfile * box(r, 91975, 117507, 150) * fine(1.0) * (0.92 + 0.12 * f2)
    tau = Math.max(tau, 0)
    // Cassini Division: dim, not empty (tau ~ 0.05-0.15), with a few ringlets; Huygens gap (117,848) and the Huygens ringlet
    tau += (0.1 + 0.07 * f2) * box(r, 117507, 122050, 150) * fine(1.0)
    tau += 0.25 * gauss(r, 120000, 320) + 0.18 * gauss(r, 121100, 180)
    tau -= 0.1 * gauss(r, 117848, 80)
    // A ring
    const aProfile = 0.55 + 0.2 * smoothstep(122050, 126000, r) - 0.06 * smoothstep(131000, 136774, r)
    let a = 0.62 * aProfile * box(r, 122050, 136774, 120) * fine(0.8) * (0.9 + 0.1 * f1)
    a *= 1 - 0.9 * gauss(r, 133589, 190) // Encke gap (~325 km wide) with a ringlet in it
    a *= 1 - 0.9 * gauss(r, 136505, 38) // Keeler gap (35 km)
    a += 0.15 * gauss(r, 133745, 14) // Encke ringlet
    tau += a
    // F ring: narrow, bright, braided; a faint strand either side
    tau += (0.52 + 0.25 * f3) * gauss(r, 140180, 45) + 0.12 * gauss(r, 140350, 90)
    // Janus/Epimetheus ring is ignored (extremely faint)
    const alpha = 1 - Math.exp(-tau) // optical depth -> opacity
    // tint: D/C cool grey-brown, B warm cream-tan, Cassini Division greyer, A cooler cream, F pale
    const tB = smoothstep(91000, 99000, r) * (1 - smoothstep(116000, 119000, r))
    const tA = smoothstep(121500, 126000, r)
    const R = 0.50 + 0.38 * tB + 0.32 * tA, G = 0.46 + 0.34 * tB + 0.3 * tA, B = 0.40 + 0.28 * tB + 0.26 * tA
    const shade = clamp(0.86 + 0.14 * f2 + 0.08 * f3, 0.6, 1.1) // brightness variation of the ring material itself
    return { r: clamp(R * shade), g: clamp(G * shade), b: clamp(B * shade), a: alpha }
  }
}
export function uranusProfile() {
  const N = new Simplex(5151)
  const rings: Array<[number, number, number]> = [[41837, 12, 0.35], [42235, 12, 0.3], [42571, 12, 0.3], [44718, 12, 0.4], [45661, 14, 0.4], [47176, 3, 0.35], [47627, 4, 0.5], [48300, 6, 0.5], [50024, 4, 0.6]]
  return (u: number) => {
    const r = URANUS_R[0] + u * (URANUS_R[1] - URANUS_R[0])
    let tau = 0
    for (const [c, w, t] of rings) tau += t * gauss(r, c, w * 1.4)
    tau += 1.3 * gauss(r, 51149, 28) * (0.8 + 0.2 * N.noise(r / 25, 1, 1)) // epsilon (eccentric, 20-96 km wide), the strongest
    tau += 0.025 * box(r, 37000, 41000, 600) * (0.6 + 0.4 * N.noise(r / 900, 3, 3)) // 1986U2R faint sheet
    const alpha = (1 - Math.exp(-tau)) * 0.5 // very dark material: the opacity is capped so the strip stays faint
    return { r: 0.34, g: 0.33, b: 0.32, a: alpha }
  }
}
export function jupiterProfile() {
  const N = new Simplex(6161)
  return (u: number) => {
    const r = JUPITER_R[0] + u * (JUPITER_R[1] - JUPITER_R[0])
    const f = 1 + 0.15 * N.noise(r / 3000, 1, 2)
    let tau = 0.0035 * box(r, 92000, 122500, 1800) * (0.35 + 0.65 * smoothstep(92000, 122000, r)) // halo
    tau += 0.012 * box(r, 122500, 129000, 300) * f // main ring (Adrastea/Metis inside it)
    tau += 0.0025 * box(r, 129000, 181350, 2500) * (1 - 0.5 * smoothstep(129000, 181350, r)) // Amalthea gossamer
    tau += 0.0015 * box(r, 129000, 221900, 3000) * (1 - 0.7 * smoothstep(129000, 221900, r)) // Thebe gossamer
    tau *= 1 + 0.3 * (f - 1)
    return { r: 0.52, g: 0.46, b: 0.42, a: clamp(1 - Math.exp(-tau), 0, 0.4) } // reddish dust
  }
}

export async function genRings(ctx: Ctx) {
  const sat = ctx.preview ? 1024 : 4096
  const save = async (file: string, w: number, prof: (u: number) => { r: number; g: number; b: number; a: number }, usage: string) => {
    const raw = ringStrip(w, 8, (u) => prof(u))
    await ctx.save({
      file, kind: 'procedural', generator: 'tools/texgen/gen/rings.ts (1D radial optical-depth profile -> RGBA strip, fine ringlet noise)',
      zone: 'solar-system', usage, credit: 'ASTRA procedural from published radial structure (all radii // VERIFY); not a Cassini image', tier: 'core', colorSpace: 'srgb', note: 'straight alpha',
    }, raw, w, 8, 4, { format: 'png' })
  }
  await save('saturn_rings_4k.png', sat, saturnProfile(sat), `Saturn ring strip (u = radius ${SATURN_R[0].toLocaleString('en')}..${SATURN_R[1].toLocaleString('en')} km from the centre, alpha = opacity)`)
  await save('uranus_rings_2k.png', ctx.preview ? 512 : 2048, uranusProfile(), `Uranus ring strip, faint (u = radius ${URANUS_R[0].toLocaleString('en')}..${URANUS_R[1].toLocaleString('en')} km)`)
  await save('jupiter_ring_1k.png', ctx.preview ? 256 : 1024, jupiterProfile(), `Jupiter faint ring system (u = radius ${JUPITER_R[0].toLocaleString('en')}..${JUPITER_R[1].toLocaleString('en')} km)`)
  void hash2
}
