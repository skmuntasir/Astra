# EHT-style orange look (display choice)
`look` (BHParams / SchwParams, uniform `uLook`) = 1 for M87* (journey, both renderers) and the M87* / Sgr A* lab presets; 0 for the stellar preset. The disc's physical brightness (beaming + redshift) is kept; its colour is a red -> orange -> amber false-colour ramp (`lookGlsl` in shader.ts), like the EHT releases (radio images, not true colour). Also in this mode: emission envelope 1/(1+(r/(2.15 r_in))^4) so the glow reads as a ring, extra g^1.5 asymmetry, softened turbulence, dim warm sky, orange fainter jet that adds no light inside the shadow. BH_TIERS scales raised (0.85 / 0.6 / 0.4). Sgr A* is drawn only in /bh-lab. Real-GPU speed NOT measured.

# Final series 5a - the spinning M87* in the journey (UNVERIFIED in a browser: see STATUS)

**What is rendered now.** The approach zone (and the seam to the universe) uses the Kerr renderer (`src/lib/bh/BlackHoleRenderer.ts`, a* = `KERR_SPIN` = 0.9) inside the same `BHBody` object and the same canvas. The infall branch keeps the non-rotating Schwarzschild tracer (`SchwRenderer`): option (b) of the brief. At the gate "Yes" the Kerr image cross-fades into the Schwarzschild one over `HANDOFF_S` = 1.2 s (both are drawn: Schwarzschild at full opacity, Kerr on top at 1 - w, an exact cross-fade while alpha = 1; the pose is identical because the branch starts from the last approach key). On screen: "The fall uses a non-rotating simplification" (gate prompt, gate note, first infall note).

**Why (b), not (a).** The Kerr observer path was written for static observers (`BHView` has no infall velocity). Extending it needs the Kerr free-fall (Carter / "rain") frame, the aberration of the camera tetrad and a new verification against the Schwarzschild infall at a = 0 on the GPU. I could not run the app or the GPU harness against new shader code in this session (no `three`/`vite`; see STATUS), so I did not ship an unverified shader change to a finished, tested path. The Schwarzschild fall is unchanged. Option (a) remains open work.

**Orientation (all // VERIFY, sources found by web search, none re-derived):**
- Jet inclination to the line of sight ~17 deg: Walker et al. 2018 (ApJ 855, 128) give 17 deg (Mertens et al. 2016: 14-17 deg); jet sky position angle ~288 deg east of north (Walker et al. 2018). Already in `src/zones/galactic/M87.tsx` / `frame.ts` (EZ = approaching jet, toward us).
- Spin sense: EHT Collaboration 2019, paper V (ApJL 875, L5), arXiv:1906.11242: models favour a hole whose spin axis points away from Earth, i.e. disc/hole rotating clockwise on the sky. Used as given.
- Spin size: NOT measured by the EHT. a* = 0.9 is a model choice (inside the GRMHD-favoured range; also Tamburini et al. 2020, MNRAS 492 L22, a twisted-light method that is not an EHT result). The screen says so.
- Spin frame (`kerrFrame.ts`): jet frame turned 180 deg about x: KX = EX, KY = -EY, KZ = -EZ (angular momentum points away from us; the jet cones are symmetric about it, the bright approaching one is toward us, along the same axis as the jet drawn in the galaxy). Both renderers use it, so the disc plane and its sense of rotation agree across the hand-off. Tested: `tests/kerrframe.test.ts`.
- The camera path, hold, gate, `bhFade` fades and the universe seam are unchanged (they use the jet frame; the Kerr view numbers are computed from the same camera axes, `kerrObserver`).

**Texts changed:** approach notes (spin 0.9 a model choice, disc clockwise, "simulation", "not the EHT image", thin disc, schematic jet), HUD info, beats 1-4, gate note/prompt, first infall note. The unchanged claims "thin disc" and "schematic jet" still hold for both renderers.

**Cost (not measured on a real GPU).** The Kerr tracer integrates the geodesic in Boyer-Lindquist-like variables with the Carter constant (more work per step than the closed-form Schwarzschild plane orbit, which is why `BH_TIERS` scales are set per renderer); expect the Kerr approach to cost roughly 1.5-2x the old approach per pixel at equal scale (ESTIMATE from the lab renderer; MEASURE on device). The shared `FrameGuard` now drives both renderers' resolution scale. Only one renderer is traced outside the 1.2 s hand-off, so the cross-fade is the single moment both run (the guard sees it and can step down).

# Kerr black-hole renderer (step 2)

Standalone module `src/lib/bh/` + lab page `/bh-lab` (or `?bhlab`). Not wired into the journey (step 3 does that). Everything it draws is a **simulation**
(real-time geodesic ray tracing). No observational image is used; the EHT results are described in text only.

Files: `kerr.ts` (physics, LUTs, presets, CPU reference tracer) · `shader.ts` (GLSL: trace, accumulate, present) · `BlackHoleRenderer.ts` (three render targets + passes,
no React, no canvas) · `BlackHole.tsx` (R3F component, mounts inside an existing canvas) · `src/lab/BhLab.tsx` (lab) · `tests/bh.physics.test.ts`, `tests/bh_gpu.py` + `tests/bh/page.ts`.

## Mounting it in the persistent canvas (step 3)
```tsx
<BlackHole sky={getTexture('milkyway')} noise={getTexture('bh-disc-noise')} tier="medium" visible={zoneActive} alpha={fade}
           params={{ spin, discOutRg, discTmaxK, jet, exposure }} getPose={() => ({ posRg, camToHole, holeToWorld, time, beta })} />
```
* One `THREE.WebGLRenderer` (the canvas's) renders into the component's own render targets; no second context. Hidden = not traced, not disposed.
* `getPose()` is called every frame. `posRg` is the camera position in hole-local cartesian coordinates in r_g (z = spin axis), computed in double precision by the
  caller (floating origin). `camToHole` rotates camera space into hole-local space. `holeToWorld` orients the hole in the world (for the Milky Way lookup).
  `beta` (optional) is the observer's velocity relative to its ZAMO (infall; implemented, only lightly tested, see below).
* The textures must come from the manifest (`milkyway`, `bh-disc-noise`) and be created by the preloader. The component draws a full-screen quad at `renderOrder` -900 (after the sky), no depth test.
* Shaders are compiled on first `render`; step 3 must call `renderer.render()` once during the preload (via `onReady`) so no compile hitch occurs while scrolling. **Not yet done: nothing mounts it.**

## Equations (G = c = M = 1; lengths in r_g = GM/c^2; a = J c/(G M^2))
Boyer-Lindquist: Sigma = r^2 + a^2 mu^2, Delta = r^2 - 2r + a^2, mu = cos(theta), horizon r+ = 1 + sqrt(1 - a^2).

**Photon constants** (E = 1): lambda = L/E, eta = Q/E^2. Null geodesics in **Mino time** tau (d tau = d lambda_affine / Sigma), second-order form:
```
r''   = 2 r P - (r-1) (eta + (lambda-a)^2),         P = r^2 + a^2 - a lambda        ( = R'(r)/2,  R = P^2 - Delta (eta + (lambda-a)^2) )
mu''  = mu (a^2 - eta - lambda^2 - 2 a^2 mu^2)                                       ( = M'(mu)/2, M = (1-mu^2)(eta + a^2 mu^2) - lambda^2 mu^2 )
phi'  = lambda/(1-mu^2) - a + a P/Delta
t'    = -a (a (1-mu^2) - lambda) + (r^2 + a^2) P / Delta
```
Chosen because no turning-point sign logic and no square roots are needed (works through r and theta turning points). First integrals r'^2 = R(r), mu'^2 = M(mu)
are used as a **projection** after each RK4 step (only where R, M > 0; this removes the unstable radial mode that plain RK4 amplifies).

**Observer** = ZAMO (zero angular momentum observer) at (r0, theta0): alpha = sqrt(Sigma Delta / A), omega = 2 a r / A, varpi = sqrt(A sin^2(theta)/Sigma), A = (r^2+a^2)^2 - a^2 Delta sin^2(theta).
Pixel ray -> propagation direction N (reverse of the look direction) in the ZAMO tetrad; optional Lorentz boost for a moving observer. Then
`E/nu_ZAMO = w = alpha + omega varpi N_phi`, `lambda = varpi N_phi / w`, `eta = Sigma N_theta^2 / w^2 + mu^2 (lambda^2/(1-mu^2) - a^2)`, `r' = sqrt(Delta Sigma) N_r / w`, `theta' = sqrt(Sigma) N_theta / w`.
The ray is integrated **backwards** (s = -tau). Escape: the local direction at r > max(r0, 300) is rebuilt from the constants and reversed to give the sky direction (a null-vector check |N| = 1 is part of the tests).

**Step control** (identical in GLSL and TS): `h = min(eps / rate, 0.35)`, `rate = max(|r'|/r, 0.5 sqrt(|r''|/r)) + 0.5 min(|phi'|, 4000) + 0.3 |mu'| + 0.5 min(|mu mu'| / (1-mu^2), 4000) + 0.2`.
The last term anticipates a pole pass (phi jumps by pi in ~1e-4 Mino time for rays in the plane of the spin axis; without it the two central image columns were wrong, found and fixed in this session).
eps = 0.07 / 0.10 / 0.14 for high / medium / low. Capture at r < r+ + min(0.02, 0.3 (r_ph,pro - r+)).

**Disc**: infinitely thin, opaque, in the equatorial plane, between the ISCO and `discOutRg`. Crossing found by a cubic Hermite root of mu(s) inside the step, then Hermite interpolation of r, phi, t.
* ISCO: Bardeen-Press-Teukolsky: Z1 = 1 + (1-a^2)^(1/3)[(1+a)^(1/3) + (1-a)^(1/3)], Z2 = sqrt(3a^2 + Z1^2), r_isco = 3 + Z2 - sqrt((3-Z1)(3+Z1+2Z2)) (prograde).
* Temperature: Page & Thorne (1974) flux, F ∝ (-Omega,r / (E - Omega L)^2) (1/r) ∫_{r_isco}^{r} (E - Omega L) L,r dr' (zero torque at the ISCO), T ∝ F^(1/4), tabulated (64 entries, dense near the ISCO). Checked against the closed form (eq. 15n) in the tests.
* g-factor: g = nu_obs / nu_em = (1/(nu_Z w)) / (u^t (1 - Omega lambda)), u^t = (r^1.5 + a)/(r^0.75 sqrt(r^1.5 - 3 r^0.5 + 2a)), Omega = 1/(r^1.5 + a). Contains gravitational redshift, transverse and longitudinal Doppler, and the observer's own redshift.
* Colour and beaming: the observed spectrum of a shifted black body is exactly a black body of g T (I_nu/nu^3 is invariant), so the shader looks up the CIE-weighted colour and **visible-band luminance** of a black body at T_obs = g T (CIE 1931 via the Wyman-Sloan-Shirley 2013 fit, 128-entry table). Doppler beaming and redshift therefore appear as both brightness and colour changes with no extra g^4 fudge.
* Turbulence: the existing `bh-disc-noise` strip modulates T by about ±12 % and intensity; its azimuth is rotated with the local Keplerian Omega and the photon's coordinate time relative to the light-travel time (so patterns shear correctly and are seen at the right retarded phase).
* Outer 38 % (in log radius) of the disc fades to transparent so the sky shows through (visual choice).

**Photon ring / higher-order images**: rays are traced through multiple equatorial crossings until they hit an emitting radius, so the secondary (underside) image, the third image and the thin ring near the critical curve appear without any special casing. They are as sharp as the step budget and temporal accumulation allow.
**Shadow, frame dragging**: pure consequence of the Kerr geodesics (the shadow is displaced and flattened on the prograde side, validated against the Bardeen curve).
**Event-horizon marker**: optional faint 30-degree grid drawn on rays that are captured, in ingoing coordinates phi~ = phi + a/(r+ - r-) ln((r - r+)/(r - r-)) (regular at the horizon). Off by default.
**Jet (M87*)**: schematic. Two parabolic-ish emission cones along the spin axis, emissivity ∝ exp(-(rho/w)^2) z^-1.2 with moving knots, bulk beta = 0.85, Doppler factor from the local photon direction, I ∝ g^2.7 (alpha = 0.7). Not fitted to any data; the gain is arbitrary.
**Sky**: the existing Milky Way panorama (`milkyway`, galactic coordinates, same lookup as Sky.tsx), mip level from the pixel angular size. Surface brightness is conserved under lensing; the sky is not redshifted for the (finite-r) observer.

## Presets (`kerr.ts`, all numbers marked // VERIFY, see STATUS)
| | M (Msun) | spin | i | D | source |
|---|---|---|---|---|---|
| M87* | 6.5e9 | 0.9 (illustrative, not measured) | 17° (jet axis) | 16.8 Mpc | EHT 2019 ApJL 875 L1-L6 (ring 42 ± 3 µas) |
| Sgr A* | 4.3e6 | 0.9 (illustrative) | 30° | 8.277 kpc | EHT 2022 ApJL 930 L12 (ring 51.8 ± 2.3 µas); mass from stellar orbits (EHT alone gave ~4.0e6) |
| stellar | 10 | 0.7 (illustrative) | 75° | slider | textbook X-ray-binary picture |
Computed Schwarzschild shadow diameters: M87* 39.9 µas, Sgr A* 53.2 µas (consistent with the rings; tested). **Web verification was not possible in this session; the numbers are from memory.**
Colour temperatures (`discTmaxK`) are display choices. Real M87* / Sgr A* images are radio (1.3 mm) synchrotron emission from hot, geometrically thick plasma, not a thin optical disc.

## Performance design
Per frame: trace at reduced resolution (scale 0.75 / 0.5 / 0.33 of the canvas; steps ≤ 360 / 240 / 160) with a Halton sub-pixel jitter -> accumulate into a full-resolution history (bilinear tap, 3x3 neighbourhood clamp, rotation-only reprojection; history weight 0.9, 0.55 while the camera translates, 0 when any look parameter changes) -> tone-map when presented
(colour-preserving filmic curve on luminance; hue kept; no per-channel tone map). Rays that never come near the hole exit after ~50 steps, near-hole rays use up to the cap; rays that exhaust the budget (only within ~1 % of the critical curve) are black.
**Real-GPU performance is UNMEASURED**: the sandbox only had software GL (SwiftShader: ~1.5 s for a 256x256 max-quality frame, which says nothing about a GPU). The 60 fps at "medium" target is a design target, not a result. Expect to tune `BH_TIERS` on real hardware.

## Validation (what was actually run; see STATUS for the log)
* `npm run test:bh` (Node, double precision; 56 checks): ISCO a = 0, 0.5, 0.9, 0.998 vs published values and an independent dE/dr = 0 check; photon orbit 3 (R(3) = R'(3) = 0 for b = 3 sqrt 3; prograde/retrograde a = 0.9); CPU-tracer shadow radius = 3 sqrt 3 by capture/escape bisection (to 0.003 r_g); closest approach of near-critical rays -> 3; Kerr shadow edges for a = 0.5, 0.9, 0.998 vs the Bardeen critical curve (to 0.01 r_g); Novikov-Thorne profile vs Page-Thorne closed form; g-factor; step-size convergence (eps 0.1 vs 0.004: < 0.1 mrad); black-body colours; preset angular sizes.
* `npm run test:bh-gpu` (python + playwright + esbuild; the **real GLSL** in raw WebGL2 on software GL; 31 checks): GPU shadow radius (spin 0) within 0.01 % of 3 sqrt 3; closest approach vs exact periapsis; Kerr shadow edges vs Bardeen (a = 0.998 left edge is 0.03 r_g off because rays winding at r ≈ 1.07 exhaust the 600-step budget: known limit); GPU vs CPU on every pixel of three configurations: 100 % agreement on capture/escape/disc, disc radius and g to ~1e-5, sky direction median 0, p99 < 0.5 pixel, a handful of pole-adjacent rays up to 11 mrad (float32); face-on disc inner edge = ISCO; accumulation shader (no-history identity, fixed point, ghost clamp) and present shader compile.
* Not tested: the three.js wrapper (`BlackHoleRenderer.ts`, `BlackHole.tsx`, `BhLab.tsx`) was written but could not be compiled or run (no `three` in the sandbox); the observer-velocity (`beta`) path is exercised only in the CPU/GLSL code paths with beta = 0.

## Not modelled / approximations
* Polarization (EHT's other observable), radiative transfer and MHD turbulence (the texture is a stand-in), geometrically thick discs / RIAFs, disc self-irradiation and returning radiation, emission inside the ISCO (plunging region), disc opacity changes other than the outer fade, magnetic fields, time-dependent flares, light-travel-time effects on the jet, corona.
* Observer: BL (r, theta, phi) are taken as the spherical coordinates of the camera position (exact for a = 0; differs by ~a^2/r^2 otherwise); ZAMO inside the ergosphere with E < 0 photons is treated as captured.
* The pattern rotation uses the photon coordinate time, not a full emission-time model of the plasma.
* Single scattering/Compton, spectral hardening and colour-correction factors are ignored (colour is a pure black body).
* Float32: rays within ~3e-4 rad of the polar axis, and rays winding > ~2 times at the photon sphere for a -> 1, are not resolved.

## Infall (final series, step 3): `schw.ts`, `schwShader.ts`, `SchwRenderer.ts`, `infall.ts`
The journey's black hole is NON-ROTATING (Schwarzschild; M87*'s spin is not measured, and the brief's check pi GM/c^3 is the non-rotating one). The Kerr renderer above stays
for the lab. One tracer serves both the approach (static observer) and the fall (radial free fall), so the hand-over at the gate is the same image.

**Why it works inside the horizon.** Null geodesics are planar with constants E = -p_t and L = p_phi, identical in Schwarzschild and Painleve-Gullstrand / ingoing
Eddington-Finkelstein coordinates, so `(dr/ds)^2 = E^2 - L^2 (1 - 2/r)/r^2`, `dphi/ds = L/r^2` hold for every r > 0. Integrated as `r'' = L^2 (r-3)/r^4` (no square roots, no sign flips).
**Observer**: radial geodesic released from rest at r_i = 60 r_g, E_o = sqrt(1 - 2/r_i), speed P = |dr/dtau| = sqrt(E_o^2 - (1 - 2/r)) (valid on both sides; E_o = 1 gives the Painleve-Gullstrand rain frame).
A look direction at angle psi from the OUTWARD radial gives, for observed frequency 1: `E = E_o + P cos psi`, `L = r sin psi`, backward radial rate `P + E_o cos psi` (the identity (r')^2 = E^2 - L^2 f/r^2 is tested to 4e-16).
**Rules** (backward tracing): E <= 0 -> dark (would come from the other asymptotic region; nothing there for a collapsed star) | r < 3 and r' < 0 -> dark (the shadow, and inside the horizon the "white hole" family)
| r > 3 and r' > 0 -> escapes to the sky | equatorial plane crossing with 6 <= r <= r_out -> thin Novikov-Thorne disc, g = 1/(u^t (E + Omega |L| N_z)).
Sky light is shifted by g = 1/E with a 3-band model (RGB read as I_nu at three frequencies, I_nu/nu^3 invariant; Rayleigh-Jeans-like tail on the red side). Disc colour uses g T through the blackbody LUT.
**Visible effects (computed, not scripted):** aberration of the shadow edge equals the textbook formula applied to the static shadow (tested); inside the horizon the forward cone of half-angle acos(E_o/P) is dark
(0 deg at r = 2, 88.7 deg at r = 0.001), the sky is squeezed into a bright band at its edge. The camera looks ahead outside, then turns to just past that edge (`infallYawDeg`, a function of r).
**Numbers** (`infall.ts`, `tests/infall.test.ts`): proper time `tau = sqrt(r_i^3/8)(eta + sin eta)` (cycloid); inside the horizon `pi` GM/c^3 at most (r_i = 2; scanned), 4/3 from rest at infinity, 12.0 h for r_i = 60;
GM/c^3 = 32,015 s for 6.5e9 Msun, so pi GM/c^3 = 27.94 h ("about 28 hours" confirmed). Distant-observer time `t(r)` has a closed form (pole subtracted), checked against a numeric integral; it diverges at r = 2.
Tides over 2 m at the horizon: 5e-11 g (M87*), 2.1e7 g (10 Msun). The HUD shows all of these computed from the camera radius (`zones/blackhole/Hud.tsx: readouts`).
**Approximations / not modelled:** non-rotating (no inner horizon, no Kerr interior); the matter that formed the hole is not drawn (those rays are dark); the disc is thin; nothing the infaller does perturbs the flow;
disc pattern time uses Painleve-Gullstrand-regularised time only for phase continuity; backdrop is the Milky Way panorama used as a stand-in star field.
**Float32:** deep inside (r < 0.5) the step is tiny; GPU-vs-CPU disc radius agrees to ~0.4 % (p99) there instead of 1e-6 outside.
