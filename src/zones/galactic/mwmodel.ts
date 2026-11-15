import { rngSeed } from '@/lib/rng'
import { R0_KPC } from './data'

/**
 * THE MILKY WAY PARTICLE MODEL (pure numbers, runs in Node for tests). Same geometry as the sky panorama (tools/texgen/gen/sky.ts) so
 * the inside view and the outside view agree. Frame: Sun-centred galactic Cartesian in LIGHT-YEARS (x toward the Galactic Centre,
 * y toward l = 90 deg, z toward the north galactic pole). Internally everything is kpc with the centre at the origin: gx = -R cos(az),
 * gy = R sin(az); the Sun sits at gx = -R0, az = 0; az grows toward l = 90 (the direction of Galactic rotation, clockwise seen from the NGP).
 *
 * STRUCTURE (what is drawn, and how sure it is)
 *  - bar: half-length ~5 kpc, angle 27 deg to the Sun-centre line, near end toward +l. // VERIFY (literature range 27-33 deg, half-length 4.5-5 kpc)
 *  - two MAJOR arms (Scutum-Centaurus, Perseus) heavier, two MINOR arms (Sagittarius-Carina, Outer), pitch 14.5 deg; radii at the
 *    Sun's azimuth 4.6 / 7.0 / 9.9 / 14.0 kpc (the sky model's stylised values). // VERIFY against Reid et al. 2019
 *  - Orion Spur: a short 10,000-ly-long, ~3,500-ly-wide spur through the Sun, pitch 10 deg. // VERIFY
 *  - warp: the outer disc bends up toward +l (l = 90) and down toward l = 270, from R ~ 9 kpc, ~ 0.85 kpc at 14.5 kpc. // VERIFY amplitude
 *  - disc: exponential, scale length 2.6 kpc, scale height 0.3 kpc, truncated at ~ 14.5 kpc. Halo: 1.5k faint points.
 * It is a PARTICLE MODEL (a few hundred thousand points for ~ 10^11 stars): schematic, not a map. The HUD says so.
 */
export const KPC_LY = 3261.5637769
export const BAR_DEG = 27
export const BAR_HALF_KPC = 5.0
const TAN_PITCH = Math.tan((14.5 * Math.PI) / 180)
export const ARMS = [
  { name: 'Scutum–Centaurus Arm', R: 4.6, w: 1.0, major: true },
  { name: 'Sagittarius–Carina Arm', R: 7.0, w: 0.3, major: false },
  { name: 'Perseus Arm', R: 9.9, w: 1.0, major: true },
  { name: 'Outer Arm', R: 14.0, w: 0.25, major: false },
]
export const SPUR = { R: 8.3, tanPitch: Math.tan((10 * Math.PI) / 180), lenKpc: 3.07, sigmaKpc: 0.25 }

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
export const warpZ = (R: number, az: number) => (R > 9 ? 0.028 * (R - 9) * (R - 9) * Math.sin(az) : 0) // kpc

/** GC-centred (R, az) -> Sun-centred galactic Cartesian, light-years (z includes the warp when asked). */
export function sunFrame(R: number, az: number, z = 0): [number, number, number] {
  const gx = -R * Math.cos(az), gy = R * Math.sin(az)
  return [(gx + R0_KPC) * KPC_LY, gy * KPC_LY, z * KPC_LY]
}
export const armR = (armR0: number, az: number, tanP = TAN_PITCH) => armR0 * Math.exp(-tanP * az)

export interface MwParticles {
  n: number
  pos: Float32Array // ly, Sun-centred galactic Cartesian
  col: Float32Array
  px: Float32Array // base size px (0 = use aSize)
  size: Float32Array // local units (ly) for the soft glows
  alpha: Float32Array
}

export function buildMilkyWay(scale = 1, seed = 20260): MwParticles {
  const r = rngSeed(seed)
  const g = () => { let s = 0; for (let i = 0; i < 4; i++) s += r(); return (s - 2) * 1.7320508 } // ~ N(0,1)
  const lap = (s: number) => -s * Math.log(1 - r() * 0.999) * (r() < 0.5 ? 1 : -1)
  const N = {
    disc: Math.round(30000 * scale), arms: Math.round(90000 * scale), bar: Math.round(18000 * scale), bulge: Math.round(6000 * scale),
    halo: Math.round(1500 * scale), spur: Math.round(900 * scale), glow: Math.round(5200 * scale),
  }
  const total = N.disc + N.arms + N.bar + N.bulge + N.halo + N.spur + N.glow + 40
  const pos = new Float32Array(total * 3), col = new Float32Array(total * 3), px = new Float32Array(total), size = new Float32Array(total), alpha = new Float32Array(total)
  let k = 0
  const MW_GAMMA = 2.2
  const put = (R: number, az: number, z: number, c: [number, number, number], p: number, s: number, a: number, jx = 0, jy = 0, jz = 0) => {
    const v = sunFrame(R, az, z)
    pos[k * 3] = v[0] + jx * KPC_LY; pos[k * 3 + 1] = v[1] + jy * KPC_LY; pos[k * 3 + 2] = v[2] + jz * KPC_LY
    // the sprite shader ends in <colorspace_fragment> (linear -> sRGB), so a palette written as display colours must be linearised here or
    // every star comes out lightened toward white (this was the 'washed-out, wrong colours' bug); the palette below is in display (sRGB) values
    col[k * 3] = Math.pow(c[0], MW_GAMMA); col[k * 3 + 1] = Math.pow(c[1], MW_GAMMA); col[k * 3 + 2] = Math.pow(c[2], MW_GAMMA)
    px[k] = p; size[k] = s; alpha[k] = a; k++
  }
  const OLD: [number, number, number] = [1.0, 0.86, 0.62], OLDW: [number, number, number] = [1.0, 0.88, 0.67], YOUNG: [number, number, number] = [0.42, 0.62, 1.0], HII: [number, number, number] = [1.0, 0.5, 0.65], BULGE: [number, number, number] = [1.0, 0.76, 0.46]
  // real discs are bluer outward (young stars dominate the light of the arms): the 'old' disc colour ramps golden (inside ~3 kpc) -> blue-white (beyond ~8 kpc).
  // This is the fix for 'the Milky Way looks yellow, the reference artist's concept is bluish'.
  const DISC_OUT: [number, number, number] = [0.72, 0.82, 1.0]
  const discCol = (R: number, c: [number, number, number]): [number, number, number] => { const q = smooth(3, 8, R); return [c[0] * (1 - q) + DISC_OUT[0] * q, c[1] * (1 - q) + DISC_OUT[1] * q, c[2] * (1 - q) + DISC_OUT[2] * q] }
  const rad = (Rd: number, max: number) => { for (;;) { const R = -Rd * (Math.log(1 - r()) + Math.log(1 - r())); if (R < max) return R } }

  // smooth disc (old stars)
  for (let i = 0; i < N.disc; i++) {
    const R = rad(2.6, 14.5), az = r() * 6.2831853
    put(R, az, lap(0.3) + warpZ(R, az), discCol(R, r() < 0.7 ? OLDW : OLD), 0, 0, 0.22 + 0.2 * r())
  }
  // spiral arms: pick an arm by weight, an azimuth, then scatter across it
  const wsum = ARMS.reduce((s, a) => s + a.w, 0)
  for (let i = 0; i < N.arms; i++) {
    let u = r() * wsum, arm = ARMS[0]
    for (const a of ARMS) { if ((u -= a.w) <= 0) { arm = a; break } }
    let R = 0, az = 0
    for (let t = 0; t < 40; t++) {
      az = (r() * 2 - 1) * 3 * Math.PI
      R = armR(arm.R, az) + g() * (0.28 + 0.022 * armR(arm.R, az))
      const keep = smooth(2.5, 4.5, R) * (1 - smooth(13, 17, R)) * Math.exp(-(R - 4) / 7)
      if (R > 3 && R < 16 && r() < keep * 1.6) break
      R = 0
    }
    if (R === 0) { R = 9; az = r() * 6.28 }
    const k2 = r()
    const z = lap(arm.major ? 0.16 : 0.2) + warpZ(R, az)
    if (k2 < 0.58) put(R, az, z, YOUNG, 0, 0, 0.62 * (0.5 + 0.7 * r()))
    else if (k2 < 0.7) put(R, az, z, HII, 1.8 + 1.4 * r(), 0, 0.5)
    else put(R, az, z, discCol(R, OLDW), 0, 0, 0.42)
  }
  // Orion Spur
  for (let i = 0; i < N.spur; i++) {
    const az = (r() - 0.5) * (SPUR.lenKpc / SPUR.R)
    const R = armR(SPUR.R, az, SPUR.tanPitch) + g() * SPUR.sigmaKpc
    put(R, az, lap(0.1), r() < 0.6 ? YOUNG : HII, r() < 0.1 ? 2.4 : 0, 0, 0.42)
  }
  // bar: a long ellipsoid, flatter than the disc; ends brighten (the arms leave from them)
  const th = (BAR_DEG * Math.PI) / 180, ux = -Math.cos(th), uy = Math.sin(th), vx = -uy, vy = ux
  for (let i = 0; i < N.bar; i++) {
    const a = (r() * 2 - 1) * BAR_HALF_KPC * (0.4 + 0.6 * Math.sqrt(r())), b = g() * 0.3, z = lap(0.18)
    const gx = a * ux + b * vx, gy = a * uy + b * vy
    const R = Math.hypot(gx, gy), az = Math.atan2(gy, -gx)
    put(R, az, z, OLD, 0, 0, 0.3)
  }
  // bulge: boxy, ~ 1.4 kpc
  for (let i = 0; i < N.bulge; i++) {
    const R = Math.abs(g()) * 0.7, c = Math.acos(2 * r() - 1), p = r() * 6.2831853
    const gx = R * Math.sin(c) * Math.cos(p), gy = R * Math.sin(c) * Math.sin(p), z = R * Math.cos(c) * 0.7
    put(Math.hypot(gx, gy), Math.atan2(gy, -gx), z, BULGE, 0, 0, 0.3)
  }
  // faint halo
  for (let i = 0; i < N.halo; i++) {
    const R = 2 + 33 * Math.pow(r(), 2.2), c = Math.acos(2 * r() - 1), p = r() * 6.2831853
    const gx = R * Math.sin(c) * Math.cos(p), gy = R * Math.sin(c) * Math.sin(p), z = R * Math.cos(c)
    put(Math.hypot(gx, gy), Math.atan2(gy, -gx), z, [0.9, 0.9, 1.0], 0, 0, 0.22)
  }
  // soft glows: big faint sprites that fill the gaps between stars (unresolved light)
  for (let i = 0; i < N.glow; i++) {
    const R = rad(2.9, 14), az = r() * 6.2831853
    const on = r() < 0.75 ? armR(ARMS[(Math.floor(r() * 4)) % 4].R, az) + g() * 0.45 : R
    const Rg = Math.max(0.3, Math.min(15, on))
    put(Rg, az, g() * 0.15 + warpZ(Rg, az), r() < 0.5 ? OLDW : [0.8, 0.88, 1.0], 0, 1500 + 1500 * r(), 0.05)
  }
  // the nucleus glow
  for (let i = 0; i < 40; i++) put(0.05 + Math.abs(g()) * 0.25, r() * 6.28, g() * 0.1, [1.0, 0.82, 0.55], 0, 900 + 700 * r(), 0.07)
  return { n: k, pos: pos.subarray(0, k * 3), col: col.subarray(0, k * 3), px: px.subarray(0, k), size: size.subarray(0, k), alpha: alpha.subarray(0, k) }
}

/** Label anchors (Sun-centred galactic Cartesian, ly) for the Milky Way zone. */
export function mwAnchors() {
  const pt = (R: number, az: number, z = 0) => sunFrame(R, az, z + warpZ(R, az))
  const th = (BAR_DEG * Math.PI) / 180
  return {
    centre: sunFrame(0, 0),
    bar: [(-Math.cos(th) * 3.3 + R0_KPC) * KPC_LY, Math.sin(th) * 3.3 * KPC_LY, 0] as [number, number, number],
    sct: pt(armR(4.6, -2.2), -2.2),
    sgr: pt(armR(7.0, 1.9), 1.9),
    per: pt(armR(9.9, -2.4), -2.4),
    outer: pt(armR(14.0, 0.9), 0.9),
    spur: pt(armR(SPUR.R, -0.25, SPUR.tanPitch), -0.25),
    warp: pt(14.6, Math.PI / 2),
    sun: [0, 0, 0] as [number, number, number],
  }
}
