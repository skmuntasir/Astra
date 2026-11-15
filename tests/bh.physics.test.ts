/**
 * Black-hole physics validation (Node, double precision). Run: npx tsx tests/bh.physics.test.ts
 * Checks the formulas in src/lib/bh/kerr.ts against closed-form results and against each other (independent routes where possible),
 * and validates the CPU reference geodesic tracer (the thing the GLSL is later compared against, tests/bh_gpu.mjs).
 */
import {
  isco, photonOrbit, horizon, circE, circUt, shadowCurve, traceCPU, discTemperatureLUT, ntFlux, blackbodyRGB, PRESETS,
  shadowDiameterMicroArcsec, rgMetres,
} from '../src/lib/bh/kerr'

let fails = 0, checks = 0
const ok = (name: string, cond: boolean, info = '') => { checks++; if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '   ' + info : ''}`) }
const near = (name: string, got: number, want: number, tol: number, unit = '') => ok(name, Math.abs(got - want) <= tol, `got ${got.toFixed(6)}${unit} want ${want.toFixed(6)}${unit} (tol ${tol})`)

// ---------------------------------------------------------------- ISCO (formula) + independent check: dE/dr = 0 at the ISCO
console.log('--- ISCO')
const iscoRef: Array<[number, number]> = [[0, 6], [0.5, 4.233], [0.9, 2.3209], [0.998, 1.2370]] // published values (Bardeen, Press & Teukolsky 1972)
for (const [a, want] of iscoRef) near(`ISCO a=${a}`, isco(a), want, 0.001)
for (const [a] of iscoRef) {
  const r = isco(a), h = 1e-5 * r
  const dE = (circE(r + h, a) - circE(r - h, a)) / (2 * h)
  ok(`dE/dr = 0 at the ISCO (independent check) a=${a}`, Math.abs(dE) < 1e-6, `dE/dr = ${dE.toExponential(2)}`)
  ok(`E(r) is minimal at the ISCO a=${a}`, circE(r * 1.02, a) > circE(r, a) && circE(r * 0.985, a) > circE(r, a) - 1e-9 + 0)
}
near('retrograde ISCO a=0.9 (known 8.7172)', isco(0.9, false), 8.7172, 0.001)
near('E_isco(a=0) = sqrt(8/9)', circE(6, 0), Math.sqrt(8 / 9), 1e-12)
near('radiative efficiency 1 - E_isco at a=0.998 (known 0.321)', 1 - circE(isco(0.998), 0.998), 0.3213, 0.002)

// ---------------------------------------------------------------- photon orbit 3 GM/c^2, horizon
console.log('--- photon orbit / horizon')
near('photon orbit a=0 = 3', photonOrbit(0), 3, 1e-12)
near('photon orbit a=0.9 prograde (known 1.5576)', photonOrbit(0.9), 1.5576, 0.0005)
near('photon orbit a=0.9 retrograde (known 3.9107)', photonOrbit(0.9, false), 3.9107, 0.0005)
near('horizon a=0.9', horizon(0.9), 1 + Math.sqrt(0.19), 1e-12)
{
  const b = 3 * Math.sqrt(3), R = (r: number) => r ** 4 - b * b * (r * r - 2 * r), dR = (r: number) => 4 * r ** 3 - b * b * (2 * r - 2)
  near('Schwarzschild: R(3) = 0 for b = 3 sqrt 3', R(3), 0, 1e-9)
  near("Schwarzschild: R'(3) = 0 (double root = photon orbit at 3)", dR(3), 0, 1e-9)
}

// ---------------------------------------------------------------- CPU tracer: shadow radius (spin 0) by bisection of capture/escape
console.log('--- CPU tracer: Schwarzschild shadow')
{
  const r0 = 1e4, alp = Math.sqrt(1 - 2 / r0)
  const kindAt = (bImp: number, a = 0, mu0 = 0.3) => {
    const th = Math.asin((bImp * alp) / r0) // static observer: sin(angle) = b sqrt(1 - 2/r0) / r0
    return traceCPU({ a, r0, mu0, n: [-Math.cos(th), 0, Math.sin(th)], rIn: 6, rOut: 0, maxSteps: 1500, eps: 0.05 })
  }
  let lo = 4.5, hi = 6.0
  for (let i = 0; i < 40; i++) { const mid = 0.5 * (lo + hi); if (kindAt(mid).kind === 'captured') lo = mid; else hi = mid }
  const bc = 0.5 * (lo + hi)
  near('critical impact parameter b_c = 3 sqrt(3) GM/c^2 = 5.196152 (shadow radius)', bc, 3 * Math.sqrt(3), 0.003)
  const just = kindAt(bc * (1 + 3e-5))
  ok('ray just outside the shadow escapes', just.kind === 'escaped', just.kind)
  near('...and its closest approach is the photon orbit r = 3 GM/c^2', just.rMin, 3, 0.05)
  const far = kindAt(bc * 1.2)
  { // independent: periapsis of a Schwarzschild null geodesic solves 1/b^2 = u^2 (1 - 2u), u = 1/r_min (the larger-r root)
    const b = bc * 1.2; let lo2 = 3, hi2 = 20; for (let i = 0; i < 80; i++) { const m = 0.5 * (lo2 + hi2), u = 1 / m; if (u * u * (1 - 2 * u) < 1 / (b * b)) hi2 = m; else lo2 = m }
    near(`ray at 1.2 b_c: periapsis = root of 1/b^2 = u^2(1-2u) (${(0.5 * (lo2 + hi2)).toFixed(4)})`, far.rMin, 0.5 * (lo2 + hi2), 0.01)
  }
  ok('null condition at escape: |N| = 1 to 1e-3 (whole integration is consistent)', Math.abs((just.nullNorm ?? 0) - 1) < 1e-3, `${just.nullNorm}`)
}

// ---------------------------------------------------------------- spin shifts the shadow (Bardeen curve) - equatorial observer
console.log('--- CPU tracer: Kerr shadow edges, equatorial observer (inclination 90 deg), beta = 0 line')
for (const a of [0.5, 0.9, 0.998]) {
  const r0 = 1e4
  const curve = shadowCurve(a, Math.PI / 2, 20000)
  const left = curve[0][0], right = curve[curve.length - 1][0]
  const aMin = Math.min(left, right), aMax = Math.max(left, right)
  const kind = (alpha: number) => {
    const th = Math.asin((alpha * Math.sqrt(1 - 2 / r0)) / r0)
    return traceCPU({ a, r0, mu0: 1e-12, n: [-Math.cos(th), 0, Math.sin(th)], rIn: 0, rOut: 0, maxSteps: 4000, eps: 0.05 }).kind
  }
  const edge = (outside: number, inside: number) => { let o = outside, i = inside; for (let k = 0; k < 40; k++) { const m = 0.5 * (o + i); if (kind(m) === 'captured') i = m; else o = m } return 0.5 * (o + i) }
  const eL = edge(aMin - 1.0, aMin + 1.0), eR = edge(aMax + 1.0, aMax - 1.0)
  near(`a=${a}: left edge alpha (Bardeen ${aMin.toFixed(4)})`, eL, aMin, 0.01)
  near(`a=${a}: right edge alpha (Bardeen ${aMax.toFixed(4)})`, eR, aMax, 0.01)
  ok(`a=${a}: shadow centre shifted to +alpha`, 0.5 * (eL + eR) > 0.4, `centre ${(0.5 * (eL + eR)).toFixed(3)}`)
}

// ---------------------------------------------------------------- redshift factor
console.log('--- g-factor')
{
  const r0 = 1e4, alp = Math.sqrt(1 - 2 / r0)
  const best = traceCPU({ a: 0, r0, mu0: 0.9999999, n: [-Math.cos(10 / r0), Math.sin(10 / r0), 0], rIn: 6, rOut: 30, eps: 0.05, maxSteps: 3000 })
  ok('face-on ray hits the disc', best.kind === 'disc', best.kind)
  const rh = best.rHit
  near(`Schwarzschild face-on g at r=${rh.toFixed(3)} = sqrt(1-3/r)/alpha_obs`, best.g, Math.sqrt(1 - 3 / rh) / alp, 2e-4)
  ok('u^t = 1/sqrt(1-3/r) for a = 0', Math.abs(circUt(10, 0) - 1 / Math.sqrt(1 - 3 / 10)) < 1e-12)
}
console.log('--- Doppler: edge-on')
{
  const r0 = 1e4
  const hitAt = (x: number) => traceCPU({ a: 0.9, r0, mu0: 1e-12, n: [-Math.cos(x), 0.3 * Math.sin(x), Math.sin(x)], rIn: 2.4, rOut: 30, eps: 0.05, maxSteps: 3000 })
  const L = hitAt(-9 / r0), R = hitAt(9 / r0)
  ok('both rays hit the disc', L.kind === 'disc' && R.kind === 'disc', `${L.kind} ${R.kind}`)
  console.log(`      left (alpha=-9): r_hit ${L.rHit.toFixed(2)}  g ${L.g.toFixed(4)}    right (alpha=+9): r_hit ${R.rHit.toFixed(2)}  g ${R.g.toFixed(4)}`)
  ok('Doppler asymmetry between the two sides > 20 %', Math.max(L.g, R.g) / Math.min(L.g, R.g) > 1.2)
  ok('left side (photon co-rotating with the disc, lambda > 0) is the blueshifted one', L.g > R.g, `g_left ${L.g.toFixed(3)} g_right ${R.g.toFixed(3)}`)
}

// ---------------------------------------------------------------- step-size convergence
console.log('--- convergence of the adaptive step')
{
  const r0 = 2000
  const dir = (x: number): [number, number, number] => [-Math.cos(x), 0.1 * Math.sin(x), Math.sin(x)]
  let worst = 0
  for (const b of [5.3, 5.6, 6.5, 8, 12, 30]) {
    const x = Math.asin(b / r0)
    const A = traceCPU({ a: 0.7, r0, mu0: 0.5, n: dir(x), rIn: 3, rOut: 0, eps: 0.1, maxSteps: 600 })
    const B = traceCPU({ a: 0.7, r0, mu0: 0.5, n: dir(x), rIn: 3, rOut: 0, eps: 0.004, maxSteps: 20000 })
    if (A.kind !== 'escaped' || B.kind !== 'escaped') { console.log(`      b=${b}: ${A.kind}/${B.kind}`); continue }
    const dot = A.sky[0] * B.sky[0] + A.sky[1] * B.sky[1] + A.sky[2] * B.sky[2]
    const ang = Math.acos(Math.min(1, dot)); worst = Math.max(worst, ang)
    console.log(`      b=${b}: eps 0.1 -> ${A.steps} steps, eps 0.004 -> ${B.steps}; sky-direction difference ${(ang * 1e3).toFixed(4)} mrad`)
  }
  ok('eps = 0.1 agrees with eps = 0.004 to < 0.3 mrad (half a 1080p pixel at fov 35 deg)', worst < 3e-4, `worst ${(worst * 1e3).toFixed(4)} mrad`)
}

// ---------------------------------------------------------------- Novikov-Thorne profile
console.log('--- Novikov-Thorne disc')
{
  const rin = isco(0), { lut, rPeak } = discTemperatureLUT(0, 40)
  ok('flux is zero at the ISCO (zero-torque boundary)', lut[0] === 0)
  near('Schwarzschild: temperature (= flux) peak at r ~ 9.5-10 r_g', rPeak, 9.6, 1.2)
  ok('T/Tmax within [0,1], 1 at the peak', Math.max(...lut) === 1 && Math.min(...lut) >= 0)
  // independent closed form: Page & Thorne 1974 eq. 15n (x = sqrt(r), x_i roots of x^3 - 3x + 2a = 0)
  const ptFlux = (r: number, a: number) => {
    const x = Math.sqrt(r), x0 = Math.sqrt(isco(a)), th = Math.acos(a) / 3
    const x1 = 2 * Math.cos(th - Math.PI / 3), x2 = 2 * Math.cos(th + Math.PI / 3), x3 = -2 * Math.cos(th)
    const t = (xi: number, xj: number, xk: number) => (3 * (xi - a) ** 2) / (xi * (xi - xj) * (xi - xk))
    const br = x - x0 - 1.5 * a * Math.log(x / x0) - t(x1, x2, x3) * Math.log((x - x1) / (x0 - x1)) - t(x2, x1, x3) * Math.log((x - x2) / (x0 - x2)) - t(x3, x1, x2) * Math.log((x - x3) / (x0 - x3))
    return br / (x ** 4 * (x ** 3 - 3 * x + 2 * a))
  }
  for (const a of [1e-4, 0.5, 0.9, 0.998]) {
    const rs = [isco(a) * 1.3, isco(a) * 2.5, isco(a) * 6, 40].filter((r) => r > isco(a) * 1.05)
    const mine = ntFlux(rs, a), ref = rs.map((r) => ptFlux(r, a))
    const k0 = ref[0] / mine[0]
    let worst = 0; rs.forEach((_, i) => { worst = Math.max(worst, Math.abs(mine[i] * k0 / ref[i] - 1)) })
    ok(`a=${a}: numerical flux profile equals the Page-Thorne closed form (shape, max deviation ${(worst * 100).toFixed(3)} %)`, worst < 2e-3)
  }
  const k = discTemperatureLUT(0.998, 40)
  ok('a=0.998: temperature peak inside 5 r_g and closer than for a=0', k.rPeak < 5 && k.rPeak < rPeak, `rPeak ${k.rPeak.toFixed(2)}`)
  void rin
}

// ---------------------------------------------------------------- blackbody colour
console.log('--- black body -> sRGB')
{
  const w = blackbodyRGB(6500), cool = blackbodyRGB(3000), hot = blackbodyRGB(20000)
  ok('6500 K is close to white (channel spread < 25 %)', (Math.max(...w) - Math.min(...w)) / Math.max(...w) < 0.25, w.map((x) => x.toFixed(3)).join(' '))
  ok('3000 K is orange/red (R > G > B)', cool[0] > cool[1] && cool[1] > cool[2])
  ok('20000 K is blue-white (B > R)', hot[2] > hot[0])
  ok('visible luminance rises with temperature (1000 K < 3000 K < 6500 K)', Math.max(...blackbodyRGB(1000)) < Math.max(...cool) && Math.max(...cool) < Math.max(...w))
}

// ---------------------------------------------------------------- presets vs published angular sizes
console.log('--- presets')
{
  const m = PRESETS.m87, s = PRESETS.sgra
  const dM = shadowDiameterMicroArcsec(m.massSun, m.distanceM), dS = shadowDiameterMicroArcsec(s.massSun, s.distanceM)
  console.log(`      M87*   Schwarzschild shadow diameter ${dM.toFixed(1)} uas (EHT 2019 ring 42 +- 3 uas); r_g = ${rgMetres(m.massSun).toExponential(3)} m`)
  console.log(`      Sgr A* Schwarzschild shadow diameter ${dS.toFixed(1)} uas (EHT 2022 ring 51.8 +- 2.3 uas)`)
  ok('M87* shadow 36-46 uas (consistent with the 42 +- 3 uas ring)', dM > 36 && dM < 46)
  ok('Sgr A* shadow 48-58 uas (consistent with the 51.8 +- 2.3 uas ring)', dS > 48 && dS < 58)
}

console.log(`\n${fails === 0 ? 'ALL PASSED' : fails + ' FAILED'} (${checks} checks)`)
process.exit(fails === 0 ? 0 : 1)
