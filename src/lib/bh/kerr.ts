/**
 * ASTRA v2 - Kerr black-hole physics (double precision, no three.js, no DOM).
 *
 * Geometrised units G = c = M = 1: lengths in r_g = GM/c^2, time in GM/c^3. (r_s = 2 r_g.) The spin a is a* = Jc/(GM^2), -1 < a < 1.
 * Used by (1) the renderer for look-up tables (disc temperature, blackbody colour), (2) tests/bh.physics.test.ts and tests/bh_gpu.mjs,
 * (3) the CPU REFERENCE TRACER at the bottom, which integrates exactly the same equations and the same step rule as the GLSL in shader.ts.
 * Equations are written out in docs/BLACKHOLE.md.
 */

export const G_SI = 6.6743e-11 // m^3 kg^-1 s^-2 (CODATA 2018)
export const C_SI = 299792458 // m/s
export const MSUN_KG = 1.98847e30 // kg (// VERIFY: IAU nominal GM_sun/G, 1.98841e30..1.98847e30 depending on G)
export const PARSEC_M = 3.0856775814913673e16
export const RAD_TO_MICROARCSEC = (180 / Math.PI) * 3600 * 1e6

/** gravitational radius GM/c^2 in metres */
export const rgMetres = (massSun: number) => (G_SI * massSun * MSUN_KG) / (C_SI * C_SI)

// ------------------------------------------------------------------------------------------------ horizon, ISCO, photon orbits
/** outer horizon r+ = 1 + sqrt(1 - a^2) */
export const horizon = (a: number) => 1 + Math.sqrt(Math.max(0, 1 - a * a))

/** ISCO radius (Bardeen, Press & Teukolsky 1972). prograde = true: orbit co-rotating with the hole. */
export function isco(a: number, prograde = true): number {
  const aa = Math.min(0.9999999, Math.max(-0.9999999, a))
  const z1 = 1 + Math.cbrt(1 - aa * aa) * (Math.cbrt(1 + aa) + Math.cbrt(1 - aa))
  const z2 = Math.sqrt(3 * aa * aa + z1 * z1)
  const s = prograde ? -1 : 1
  return 3 + z2 + s * Math.sqrt((3 - z1) * (3 + z1 + 2 * z2))
}

/** radius of the circular equatorial photon orbit: prograde (co-rotating) or retrograde. a = 0 -> 3 for both. */
export function photonOrbit(a: number, prograde = true): number {
  const s = prograde ? -1 : 1
  return 2 * (1 + Math.cos((2 / 3) * Math.acos(s * a)))
}

// ------------------------------------------------------------------------------------------------ circular equatorial orbits
export const omegaK = (r: number, a: number) => 1 / (Math.pow(r, 1.5) + a)
const dnm = (r: number, a: number) => Math.pow(r, 0.75) * Math.sqrt(r * Math.sqrt(r) - 3 * Math.sqrt(r) + 2 * a)
/** specific energy and angular momentum of a circular geodesic (prograde) */
export const circE = (r: number, a: number) => (Math.pow(r, 1.5) - 2 * Math.sqrt(r) + a) / dnm(r, a)
export const circL = (r: number, a: number) => (r * r - 2 * a * Math.sqrt(r) + a * a) / dnm(r, a)
/** u^t of the circular geodesic */
export const circUt = (r: number, a: number) => (Math.pow(r, 1.5) + a) / dnm(r, a)

// ------------------------------------------------------------------------------------------------ Novikov-Thorne (Page & Thorne 1974) flux
/**
 * F(r) ~ (-Omega,r / (E - Omega L)^2) * Int_{r_isco}^{r} (E - Omega L) L,r dr' / r   (arbitrary normalisation; Mdot/4pi dropped).
 * Zero-torque inner boundary at the ISCO. Returns F at the requested radii.
 */
export function ntFlux(radii: number[], a: number): number[] {
  const rin = isco(a, true)
  const dL = (r: number) => { const h = 1e-6 * r; return (circL(r + h, a) - circL(r - h, a)) / (2 * h) }
  const dO = (r: number) => { const h = 1e-6 * r; return (omegaK(r + h, a) - omegaK(r - h, a)) / (2 * h) }
  const integrand = (r: number) => (circE(r, a) - omegaK(r, a) * circL(r, a)) * dL(r)
  // cumulative Simpson on a fine log grid from r_in
  const out: number[] = []
  for (const r of radii) {
    if (r <= rin * (1 + 1e-9)) { out.push(0); continue }
    // substitution x = sqrt(r - rin) removes the sqrt behaviour at the ISCO (integrand ~ finite, but L,r -> 0 there)
    const xm = Math.sqrt(r - rin), N = 400
    let s = 0
    for (let i = 0; i <= N; i++) {
      const x = (xm * i) / N, rr = rin + x * x
      const w = i === 0 || i === N ? 1 : i % 2 ? 4 : 2
      s += w * (rr <= rin ? 0 : integrand(rr) * 2 * x)
    }
    s *= xm / N / 3
    const E = circE(r, a), L = circL(r, a), Om = omegaK(r, a)
    const f = (-dO(r) / Math.pow(E - Om * L, 2)) * s / r
    out.push(Math.max(0, f))
  }
  return out
}

export const DISC_LUT_N = 64
/**
 * Disc temperature look-up: T(r)/T_max for r in [r_isco, r_out], sampled at q_i = i/(N-1), r = r_isco * (r_out/r_isco)^(q^2) (dense near the ISCO).
 * T ~ F^(1/4) (black body, optically thick). Returns the table and the radius of the temperature peak.
 */
export function discTemperatureLUT(a: number, rOut: number, n = DISC_LUT_N): { lut: Float32Array; rPeak: number; rIn: number } {
  const rin = isco(a, true), ratio = rOut / rin
  const rs: number[] = []
  for (let i = 0; i < n; i++) { const q = i / (n - 1); rs.push(rin * Math.pow(ratio, q * q)) }
  const F = ntFlux(rs, a)
  const T = F.map((f) => Math.pow(f, 0.25))
  const mx = Math.max(...T)
  const lut = new Float32Array(n)
  let ip = 0
  for (let i = 0; i < n; i++) { lut[i] = T[i] / mx; if (T[i] > T[ip]) ip = i }
  return { lut, rPeak: rs[ip], rIn: rin }
}

// ------------------------------------------------------------------------------------------------ black body -> sRGB
/** CIE 1931 colour matching functions, multi-lobe Gaussian fit (Wyman, Sloan & Shirley 2013, JCGT 2(2); // VERIFY coefficients) */
function cmf(l: number): [number, number, number] {
  const g = (x: number, mu: number, s1: number, s2: number) => { const t = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * t * t) }
  return [
    1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2),
    0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1),
    1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8),
  ]
}
/** Planck spectral radiance B_lambda(T), W sr^-1 m^-3 */
export function planckLambda(lambdaM: number, T: number): number {
  const h = 6.62607015e-34, c = C_SI, k = 1.380649e-23
  const x = (h * c) / (lambdaM * k * T)
  if (x > 700) return 0
  return (2 * h * c * c) / (Math.pow(lambdaM, 5) * (Math.exp(x) - 1))
}
/** linear sRGB (D65) from XYZ */
export const xyzToLinearSrgb = (X: number, Y: number, Z: number): [number, number, number] => [
  3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
  -0.969266 * X + 1.8760108 * Y + 0.041556 * Z,
  0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
]
export const BB_N = 128, BB_TMIN = 300, BB_TMAX = 3e5
/**
 * Black-body look-up, 128 entries log-spaced in T from 300 K to 3e5 K. Each entry = (r, g, b, lnY): the chromaticity (max channel = 1, out-of-gamut
 * negatives removed by adding white) and ln of the visible-band luminance relative to a 6500 K body. Colour = (r,g,b) * exp(lnY).
 * Observed spectrum of a Doppler/gravitationally shifted black body of temperature T is exactly a black body of g*T (I_nu / nu^3 is invariant),
 * so the renderer only needs this table at T_obs = g * T_emitted.
 */
export function blackbodyLUT(): Float32Array {
  const out = new Float32Array(BB_N * 4)
  const ys: number[] = [], cols: Array<[number, number, number]> = []
  const lum = (T: number) => {
    let X = 0, Y = 0, Z = 0
    for (let l = 380; l <= 780; l += 5) { const b = planckLambda(l * 1e-9, T), [x, y, z] = cmf(l); X += b * x; Y += b * y; Z += b * z }
    return [X, Y, Z] as const
  }
  const ref = lum(6500)[1]
  for (let i = 0; i < BB_N; i++) {
    const T = BB_TMIN * Math.pow(BB_TMAX / BB_TMIN, i / (BB_N - 1))
    const [X, Y, Z] = lum(T)
    let [r, g, b] = xyzToLinearSrgb(X, Y, Z)
    const mn = Math.min(r, g, b, 0)
    r -= mn; g -= mn; b -= mn
    const m = Math.max(r, g, b) || 1
    cols.push([r / m, g / m, b / m]); ys.push(Math.log(Math.max(Y / ref, 1e-30)))
  }
  for (let i = 0; i < BB_N; i++) { out[i * 4] = cols[i][0]; out[i * 4 + 1] = cols[i][1]; out[i * 4 + 2] = cols[i][2]; out[i * 4 + 3] = ys[i] }
  return out
}
/** CPU lookup (for tests): colour of a black body of temperature T, relative visible luminance 1 at 6500 K */
export function blackbodyRGB(T: number, lut = blackbodyLUT()): [number, number, number] {
  const x = (Math.log(Math.min(BB_TMAX, Math.max(BB_TMIN, T)) / BB_TMIN) / Math.log(BB_TMAX / BB_TMIN)) * (BB_N - 1)
  const i = Math.min(BB_N - 2, Math.floor(x)), f = x - i
  const q = (c: number) => lut[i * 4 + c] * (1 - f) + lut[(i + 1) * 4 + c] * f
  const y = Math.exp(q(3))
  return [q(0) * y, q(1) * y, q(2) * y]
}

// ------------------------------------------------------------------------------------------------ shadow (critical curve) - Bardeen 1973
/** (alpha, beta) of the critical curve for an observer at infinity, inclination theta0 (radians from the spin axis). Returns points; a = 0 -> circle of radius 3 sqrt(3). */
export function shadowCurve(a: number, theta0: number, n = 720): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  const rp = photonOrbit(a, true), rr = photonOrbit(a, false)
  const lo = Math.min(rp, rr), hi = Math.max(rp, rr)
  const s0 = Math.sin(theta0), c0 = Math.cos(theta0)
  for (let i = 0; i <= n; i++) {
    const r = lo + ((hi - lo) * i) / n
    let lam: number, eta: number
    if (Math.abs(a) < 1e-9) { lam = 0; eta = 27 } else {
      lam = -(r * r * r - 3 * r * r + a * a * r + a * a) / (a * (r - 1))
      eta = (r * r * r * (4 * a * a - r * (r - 3) * (r - 3))) / (a * a * (r - 1) * (r - 1))
    }
    const beta2 = eta + a * a * c0 * c0 - (lam * lam * c0 * c0) / (s0 * s0)
    if (beta2 < 0) continue
    const alpha = -lam / s0
    pts.push([alpha, Math.sqrt(beta2)])
  }
  return pts
}

// ------------------------------------------------------------------------------------------------ presets
export interface BHPreset {
  id: 'm87' | 'sgra' | 'stellar'
  name: string
  massSun: number
  /** dimensionless spin a* (illustrative where the observations do not constrain it) */
  spin: number
  /** observer inclination from the spin axis, degrees */
  inclinationDeg: number
  distanceM: number
  /** disc outer radius drawn, r_g */
  discOutRg: number
  /** colour temperature at the hottest point of the (visualisation) disc, K. NOT a measured value: see docs/BLACKHOLE.md */
  discTmaxK: number
  jet: boolean
  /** 1 = EHT-style false-colour (red-orange) look; 0 = black-body colours. A display choice only. */
  look: number
  source: string
}
export const PRESETS: Record<BHPreset['id'], BHPreset> = {
  m87: {
    id: 'm87', name: 'M87*', massSun: 6.5e9, // EHT 2019 Paper VI: (6.5 +- 0.7) x 10^9 Msun  // VERIFY
    spin: 0.9, // NOT measured by EHT 2019 (illustrative; GRMHD fits favour a high spin)  // VERIFY
    inclinationDeg: 17, // jet-axis inclination to the line of sight ~17 deg (EHT 2019 Paper V)  // VERIFY
    distanceM: 16.8e6 * PARSEC_M, // 16.8 Mpc (EHT 2019)  // VERIFY
    discOutRg: 40, discTmaxK: 7000, jet: true, look: 1,
    source: 'EHT Collaboration 2019, ApJL 875 L1-L6: M = 6.5e9 Msun, ring diameter 42 +- 3 microarcsec, jet-axis inclination ~17 deg, D = 16.8 Mpc. Spin not measured.',
  },
  sgra: {
    id: 'sgra', name: 'Sagittarius A*', massSun: 4.3e6, // GRAVITY / Keck 4.3e6 Msun; EHT 2022 Paper I quotes ~4.0e6 (+1.1 -0.6) from the ring alone  // VERIFY
    spin: 0.9, // not constrained  // VERIFY
    inclinationDeg: 30, // EHT 2022 favours a nearly face-on view (i < ~30-50 deg)  // VERIFY
    distanceM: 8.277e3 * PARSEC_M, // GRAVITY 2022: 8.277 kpc  // VERIFY
    discOutRg: 30, discTmaxK: 6000, jet: false, look: 1,
    source: 'EHT Collaboration 2022, ApJL 930 L12: ring diameter 51.8 +- 2.3 microarcsec; mass ~4.3e6 Msun (stellar orbits, GRAVITY / Keck); D = 8.28 kpc; nearly face-on.',
  },
  stellar: {
    id: 'stellar', name: '10 M\u2609 stellar black hole', massSun: 10, spin: 0.7, inclinationDeg: 75,
    distanceM: 300 * rgMetres(10), // nominal; the lab uses its own distance slider (in r_g)
    discOutRg: 24, discTmaxK: 12000, jet: false, look: 0,
    source: 'Illustrative: a 10 solar-mass hole with a thin accretion disc (X-ray binary like). Spin 0.7 is a typical fitted value for such systems, not a specific object.',
  },
}

/** apparent diameter of the shadow (Schwarzschild 2 * 3 sqrt(3) r_g) seen from distance d, microarcseconds */
export const shadowDiameterMicroArcsec = (massSun: number, distanceM: number) => (2 * 3 * Math.sqrt(3) * rgMetres(massSun)) / distanceM * RAD_TO_MICROARCSEC

// ------------------------------------------------------------------------------------------------ CPU reference tracer
/**
 * Integrates the null geodesic of a Kerr photon backwards from a ZAMO observer, in Mino time s = -tau (Boyer-Lindquist, M = 1, E = 1):
 *   r'' = 2 r P - (r-1)(eta + (lam-a)^2),   P = r^2 + a^2 - a lam
 *   mu'' = mu (a^2 - eta - lam^2 - 2 a^2 mu^2),   mu = cos(theta)
 *   dphi/dtau = lam/(1-mu^2) - a + a P/Delta,   dt/dtau = -a (a (1-mu^2) - lam) + (r^2+a^2) P/Delta
 * (2nd-order form: no turning-point sign logic, no square roots). RK4, adaptive step, same rule as the GLSL.
 * Equatorial-plane crossings are located with a cubic Hermite interpolation; a crossing at r_in <= r <= r_out ends the trace (opaque disc).
 */
export interface TraceInput {
  a: number
  r0: number
  /** cos(theta) of the observer (theta from the spin axis) */
  mu0: number
  phi0?: number
  /** look direction in the observer's local (r-hat, theta-hat, phi-hat) components, unit vector */
  n: [number, number, number]
  /** observer velocity relative to its ZAMO, in the same local components (|beta| < 1). Default at rest. */
  beta?: [number, number, number]
  rIn: number
  rOut: number
  maxSteps?: number
  eps?: number
}
export type TraceKind = 'captured' | 'escaped' | 'disc' | 'lost'
export interface TraceResult {
  kind: TraceKind
  steps: number
  /** smallest radius reached */
  rMin: number
  /** disc hit: radius, azimuth, time of emission relative to the observer's time (negative = earlier) */
  rHit: number; phiHit: number; tHit: number
  /** escaped: direction at infinity (unit, local-cartesian of the hole; z = spin axis), pointing to where the photon CAME from */
  sky: [number, number, number]
  /** observer-to-emitter frequency ratio g = nu_obs / nu_em for a disc hit (circular prograde orbit); 0 otherwise */
  g: number
  /** conserved constants of the photon */
  lam: number; eta: number
  /** number of equatorial-plane crossings seen (any radius) */
  crossings: number
  /** |N| of the reconstructed local direction at escape (must be 1: a null-vector check of the whole integration) */
  nullNorm?: number
}

export const STEP_EPS_DEFAULT = 0.1
export const R_STOP_MIN = 300

export function traceCPU(inp: TraceInput): TraceResult {
  const { a, r0, mu0 } = inp
  const phi0 = inp.phi0 ?? 0
  const rp = horizon(a), rCap = rp + Math.min(0.02, 0.3 * (photonOrbit(a, true) - rp)) // stay inside the prograde photon orbit for a -> 1
  const a2 = a * a
  const res: TraceResult = { kind: 'lost', steps: 0, rMin: r0, rHit: 0, phiHit: 0, tHit: 0, sky: [0, 0, 1], g: 0, lam: 0, eta: 0, crossings: 0 }
  // ---- observer tetrad (ZAMO)
  const s2 = 1 - mu0 * mu0, sin0 = Math.sqrt(s2)
  const Sig = r0 * r0 + a2 * mu0 * mu0, Del = r0 * r0 - 2 * r0 + a2
  const AA = Math.pow(r0 * r0 + a2, 2) - a2 * Del * s2
  const alpha = Math.sqrt((Sig * Del) / AA), omega = (2 * a * r0) / AA, varpi = Math.sqrt((AA * s2) / Sig)
  // photon direction of propagation (real photon) in the observer frame is -n; boost to the ZAMO frame
  let Nz: [number, number, number] = [-inp.n[0], -inp.n[1], -inp.n[2]]
  let nuZ = 1
  const b = inp.beta
  if (b && (b[0] || b[1] || b[2])) {
    const b2 = b[0] * b[0] + b[1] * b[1] + b[2] * b[2], gam = 1 / Math.sqrt(1 - b2)
    const bn = b[0] * Nz[0] + b[1] * Nz[1] + b[2] * Nz[2]
    const k = ((gam - 1) * bn) / b2 + gam
    const den = gam * (1 + bn)
    Nz = [(Nz[0] + k * b[0]) / den, (Nz[1] + k * b[1]) / den, (Nz[2] + k * b[2]) / den]
    nuZ = gam * (1 + bn)
  }
  const w = alpha + omega * varpi * Nz[2] // E / nu_ZAMO
  if (w <= 1e-9) { res.kind = 'captured'; return res }
  const lam = (varpi * Nz[2]) / w
  const eta = (Sig * Nz[1] * Nz[1]) / (w * w) + mu0 * mu0 * ((lam * lam) / s2 - a2)
  res.lam = lam; res.eta = eta
  const nuObs = 1 / (nuZ * w) // observer-measured frequency when E = 1 (nu_obs = 1 in the observer frame, E_photon = nuZ*w)
  // real-photon Mino-time derivatives, then flip for the backward trace
  let r = r0, pr = -(Math.sqrt(Del * Sig) * Nz[0]) / w
  let mu = mu0, pm = -(-sin0 * (Math.sqrt(Sig) * Nz[1]) / w) // mu' = -sin(theta) theta'
  let phi = phi0, t = 0
  const rStop = Math.max(r0, R_STOP_MIN)
  const maxSteps = inp.maxSteps ?? 400, eps = inp.eps ?? STEP_EPS_DEFAULT

  const rdd = (r: number) => { const P = r * r + a2 - a * lam; return 2 * r * P - (r - 1) * (eta + (lam - a) * (lam - a)) }
  const mdd = (m: number) => m * (a2 - eta - lam * lam - 2 * a2 * m * m)
  const dphi = (r: number, m: number) => { const D = r * r - 2 * r + a2, P = r * r + a2 - a * lam; return -(lam / (1 - m * m) - a + (a * P) / D) } // backward: sign flipped
  const dtt = (r: number, m: number) => { const D = r * r - 2 * r + a2, P = r * r + a2 - a * lam; return -(-a * (a * (1 - m * m) - lam) + ((r * r + a2) * P) / D) }

  let prevR = r, prevMu = mu, prevPr = pr, prevPm = pm, prevPhi = phi, prevT = t
  for (let it = 0; it < maxSteps; it++) {
    res.steps = it
    // ---- step size
    const ph = Math.abs(dphi(r, mu))
    const rate = Math.max(Math.abs(pr) / r, 0.5 * Math.sqrt(Math.abs(rdd(r)) / r)) + 0.5 * Math.min(ph, 4000) + 0.3 * Math.abs(pm) + 0.5 * Math.min(Math.abs(mu * pm) / Math.max(1 - mu * mu, 1e-7), 4000) /* anticipates a pole pass: relative rate of change of sin^2(theta) */ + 0.2
    const h = Math.min(eps / rate, 0.35)
    // ---- RK4 on (r, pr, mu, pm, phi, t)
    const f = (rr: number, ppr: number, mm: number, ppm: number): [number, number, number, number, number, number] => [ppr, rdd(rr), ppm, mdd(mm), dphi(rr, mm), dtt(rr, mm)]
    const k1 = f(r, pr, mu, pm)
    const k2 = f(r + 0.5 * h * k1[0], pr + 0.5 * h * k1[1], mu + 0.5 * h * k1[2], pm + 0.5 * h * k1[3])
    const k3 = f(r + 0.5 * h * k2[0], pr + 0.5 * h * k2[1], mu + 0.5 * h * k2[2], pm + 0.5 * h * k2[3])
    const k4 = f(r + h * k3[0], pr + h * k3[1], mu + h * k3[2], pm + h * k3[3])
    prevR = r; prevMu = mu; prevPr = pr; prevPm = pm; prevPhi = phi; prevT = t
    r += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
    pr += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
    mu += (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])
    pm += (h / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3])
    phi += (h / 6) * (k1[4] + 2 * k2[4] + 2 * k3[4] + k4[4])
    t += (h / 6) * (k1[5] + 2 * k2[5] + 2 * k3[5] + k4[5])
    // ---- project onto the first integrals (pr^2 = Rr(r), pmu^2 = Mu(mu)): removes the unstable radial mode that plain RK4 amplifies; keeps the sign
    { const P = r * r + a2 - a * lam, Dd = r * r - 2 * r + a2
      const Rr = P * P - Dd * (eta + (lam - a) * (lam - a)); if (Rr > 0) pr = Math.sign(pr || 1) * Math.sqrt(Rr) // only where the first integral is positive: at an overshoot the 2nd-order equation must bring the ray back
      const Mm = (1 - mu * mu) * (eta + a2 * mu * mu) - lam * lam * mu * mu; if (Mm > 0) pm = Math.sign(pm || 1) * Math.sqrt(Mm) }
    if (r < res.rMin) res.rMin = r
    // ---- equatorial crossing
    if (prevMu * mu < 0) {
      res.crossings++
      // cubic Hermite root of mu(x), x in [0,1]
      const m0 = prevMu, m1 = mu, d0 = prevPm * h, d1 = pm * h
      let lo = 0, hi = 1
      const H = (x: number) => { const x2 = x * x, x3 = x2 * x; return (2 * x3 - 3 * x2 + 1) * m0 + (x3 - 2 * x2 + x) * d0 + (-2 * x3 + 3 * x2) * m1 + (x3 - x2) * d1 }
      for (let k = 0; k < 24; k++) { const mid = 0.5 * (lo + hi); if (H(lo) * H(mid) <= 0) hi = mid; else lo = mid }
      const x = 0.5 * (lo + hi), x2 = x * x, x3 = x2 * x
      const h00 = 2 * x3 - 3 * x2 + 1, h10 = x3 - 2 * x2 + x, h01 = -2 * x3 + 3 * x2, h11 = x3 - x2
      const rh = h00 * prevR + h10 * prevPr * h + h01 * r + h11 * pr * h
      if (rh >= inp.rIn && rh <= inp.rOut) {
        const phh = h00 * prevPhi + h10 * dphi(prevR, prevMu) * h + h01 * phi + h11 * dphi(r, mu) * h
        const th = h00 * prevT + h10 * dtt(prevR, prevMu) * h + h01 * t + h11 * dtt(r, mu) * h
        const ut = circUt(rh, a), Om = omegaK(rh, a)
        res.kind = 'disc'; res.rHit = rh; res.phiHit = phh; res.tHit = th
        res.g = nuObs / (ut * (1 - Om * lam))
        return res
      }
    }
    if (r < rCap) { res.kind = 'captured'; return res }
    if (r > rStop && pr > 0) {
      // Local direction of the REAL photon at the end point in the ZAMO frame, from its constants of motion; the sky direction is its reverse.
      //   N_phi = lam alpha / (varpi (1 - lam omega)),  w = E/nu = alpha/(1 - lam omega),
      //   N_r = r'_real w / sqrt(Delta Sigma),  N_theta = theta'_real w / sqrt(Sigma),  r'_real = -pr, theta'_real = -mu'_real/sin(theta) = pm/sin(theta)
      const s2e = 1 - mu * mu, sine = Math.sqrt(s2e)
      const Se = r * r + a2 * mu * mu, De = r * r - 2 * r + a2
      const Ae = Math.pow(r * r + a2, 2) - a2 * De * s2e
      const al = Math.sqrt((Se * De) / Ae), om = (2 * a * r) / Ae, vp = Math.sqrt((Ae * s2e) / Se)
      const wE = al / (1 - lam * om)
      const Nr = (-pr * wE) / Math.sqrt(De * Se)
      const Nt = ((pm / sine) * wE) / Math.sqrt(Se)
      const Np = (lam * al) / (vp * (1 - lam * om))
      const sr = -Nr, st = -Nt, sp = -Np
      const norm = Math.hypot(sr, st, sp) || 1
      const cp = Math.cos(phi), sph = Math.sin(phi)
      const rh_: [number, number, number] = [sine * cp, sine * sph, mu], th_: [number, number, number] = [mu * cp, mu * sph, -sine], ph_: [number, number, number] = [-sph, cp, 0]
      res.sky = [
        (sr * rh_[0] + st * th_[0] + sp * ph_[0]) / norm,
        (sr * rh_[1] + st * th_[1] + sp * ph_[1]) / norm,
        (sr * rh_[2] + st * th_[2] + sp * ph_[2]) / norm,
      ]
      res.nullNorm = norm
      res.kind = 'escaped'
      return res
    }
  }
  return res
}
