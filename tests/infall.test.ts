/** Physics checks for src/lib/bh/infall.ts (pure Node). Run: npx tsx tests/infall.test.ts */
import { faller, properRemaining, properInside, properSinceRelease, coordSinceRelease, tgOf, rgOf, M87_MASS_SUN, STELLAR_MASS_SUN, tidalAccel, speedP, betaStatic, photonConstants, aberrate, staticShadowAngle, G_EARTH } from '../src/lib/bh/infall'

let fail = 0, n = 0
const ok = (c: boolean, m: string) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++ }
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))

// ---- the non-rotating check from the brief: maximum proper time inside the horizon is pi GM/c^3 (28 h for 6.5e9 Msun)
const tg = tgOf(M87_MASS_SUN)
console.log(`  GM/c^3 for 6.5e9 Msun = ${tg.toFixed(1)} s = ${(tg / 3600).toFixed(3)} h;  r_g = ${rgOf(M87_MASS_SUN).toExponential(4)} m`)
ok(near(properInside(faller(2)), Math.PI, 1e-12), 'release at the horizon (E = 0): proper time inside = pi GM/c^3')
let best = 0, bestRi = 0
for (let ri = 2; ri < 5000; ri *= 1.01) { const v = properInside(faller(ri)); if (v > best) { best = v; bestRi = ri } }
ok(near(best, Math.PI, 1e-9) && bestRi === 2, `scanning r_i = 2..5000: the maximum is at r_i = 2 and equals pi (max ${best.toFixed(6)})`)
ok(near(properInside(faller(1e7)), 4 / 3, 1e-4), 'from rest at infinity: horizon -> singularity = (4/3) GM/c^3')
ok(near(properRemaining(faller(Infinity), 2), 4 / 3, 1e-12), 'closed form (2/3) r^1.5 / sqrt 2 at r = 2 is 4/3')
const hours = (Math.PI * tg) / 3600
ok(hours > 27.8 && hours < 28.1, `pi GM/c^3 for 6.5e9 Msun = ${hours.toFixed(2)} h ("about 28 hours")`)
// numeric proper time integral dtau = dr / P agrees with the cycloid
{
  const f = faller(60)
  let tau = 0
  const N = 200000, a = 1e-9, b = 60
  // integrate remaining from r=10 to 0 with substitution r = x^2 to tame the sqrt singularity at 0
  const x0 = Math.sqrt(10); let s = 0
  for (let i = 0; i < N; i++) { const x = ((i + 0.5) / N) * x0, r = x * x; s += (2 * x) / speedP(f, r) * (x0 / N) }
  tau = s
  void a; void b
  ok(near(tau, properRemaining(f, 10), 1e-4), `numeric int dr/P from r=10 to 0 = ${tau.toFixed(5)} vs cycloid ${properRemaining(f, 10).toFixed(5)}`)
  ok(near(properSinceRelease(f, 10) + properRemaining(f, 10), Math.PI * Math.sqrt(60 ** 3 / 8), 1e-12), 'since-release + remaining = total pi sqrt(r_i^3/8)')
}
// coordinate time: closed form vs a numeric integral of |dt/dr| = E / ((1 - 2/r) P) between two radii (away from the turning-point singularity at release)
{
  const f = faller(60)
  const dtdr = (r: number) => f.E / ((1 - 2 / r) * speedP(f, r))
  let s = 0; const N = 400000, r1 = 50, r2 = 5
  for (let i = 0; i < N; i++) { const r = r1 - ((i + 0.5) / N) * (r1 - r2); s += dtdr(r) * ((r1 - r2) / N) }
  const cf = coordSinceRelease(f, r2) - coordSinceRelease(f, r1)
  ok(near(cf, s, 2e-5), `coordinate time r=50 -> r=5: closed form ${cf.toFixed(4)} vs numeric ${s.toFixed(4)}`)
  ok(coordSinceRelease(f, 2.0001) > coordSinceRelease(f, 2.01) && coordSinceRelease(f, 2.0000001) > 200, 'coordinate time diverges as r -> 2 (distant observer never sees the crossing)')
}
// tidal forces: harmless at the horizon of M87*, lethal for 10 Msun
{
  const a87 = tidalAccel(M87_MASS_SUN, 2) / G_EARTH, a10 = tidalAccel(STELLAR_MASS_SUN, 2) / G_EARTH
  console.log(`  tidal stretch over 2 m at the horizon: M87* ${a87.toExponential(2)} g, 10 Msun ${a10.toExponential(2)} g`)
  ok(a87 < 1e-9, 'M87*: tidal stretch over 2 m at the horizon is below 1e-9 g')
  ok(a10 > 1e6, '10 Msun: tidal stretch over 2 m at the horizon exceeds 1e6 g')
}
// local frame identities (outside and inside): radial rate squared = E^2 - L^2 (1 - 2/r)/r^2, for several directions
{
  const f = faller(60)
  let worst = 0
  for (const r of [50, 10, 3, 2.5, 2.0001, 1.5, 0.5, 0.05]) for (const c of [-1, -0.7, -0.2, 0, 0.4, 0.9, 1]) {
    const k = photonConstants(f, r, c)
    const lhs = k.rdot * k.rdot, rhs = k.E * k.E - (k.L * k.L * (1 - 2 / r)) / (r * r)
    worst = Math.max(worst, Math.abs(lhs - rhs) / Math.max(1, Math.abs(rhs)))
  }
  ok(worst < 1e-12, `null-geodesic identity (dr/dlambda)^2 = E^2 - L^2 f / r^2 at 56 (r, direction) pairs, worst ${worst.toExponential(1)}`)
}
// aberration of the shadow edge for a faller outside the horizon vs the textbook formula applied to the static shadow
{
  const f = faller(60)
  let worst = 0
  for (const r of [40, 20, 10, 6, 4, 3.3]) {
    // look direction psi from OUTWARD radial; b = L/E = r sin psi / (E + P cos psi). Shadow = the directions near inward (cos = -1) where b < 3 sqrt 3: find the first crossing scanning up from -1
    const g = (c: number) => { const k = photonConstants(f, r, c); return k.L / k.E - 3 * Math.sqrt(3) }
    let lo = -1, hi = -1
    for (let i = 1; i <= 20000; i++) { const c = -1 + (2 * i) / 20000; if (g(c) >= 0) { hi = c; lo = c - 2 / 20000; break } }
    for (let i = 0; i < 100; i++) { const m = 0.5 * (lo + hi); if (g(m) < 0) lo = m; else hi = m }
    const thetaF = Math.acos(-0.5 * (lo + hi)) // angle from the inward (motion) direction
    const want = aberrate(staticShadowAngle(r), betaStatic(f, r))
    worst = Math.max(worst, Math.abs(thetaF - want))
  }
  ok(worst < 1e-9, `shadow edge seen by the faller = aberration of the static shadow (r = 40..3.3), worst ${worst.toExponential(1)} rad`)
}
// inside the horizon: sky light needs Killing energy E_ph > 0, i.e. cos psi > -E/P. The dark cone around the inward direction has half-angle acos(E/P).
{
  const f = faller(60)
  const cone = (r: number) => (Math.acos(f.E / speedP(f, r)) * 180) / Math.PI
  console.log(`  dark cone half-angle ahead: r=1.999 ${cone(1.999).toFixed(1)} deg, r=1 ${cone(1).toFixed(1)}, r=0.1 ${cone(0.1).toFixed(1)}, r=0.001 ${cone(0.001).toFixed(2)}`)
  ok(cone(1.999) < 3 && cone(0.001) > 85 && cone(1) > cone(1.999) && cone(0.1) > cone(1), 'dark cone ahead grows monotonically from ~0 at the horizon toward 90 deg half-angle near the singularity')
}
console.log(`\n${n - fail}/${n} passed`)
process.exit(fail ? 1 : 0)
