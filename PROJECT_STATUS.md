# ASTRA — Project Status (project memory — DO NOT DELETE)

Last updated: Chapter 10 — Humanity (2026-10-12), see §23 (typecheck + build pass; looked at in headless Chromium at 1440×900, 390×844 and reduced motion; interactions clicked). Before that: Chapter 09 — Search for Life (2026-10-11), see §22 (typecheck + build pass; looked at in headless Chromium). Before that: Chapter 08 — Deep Space (2026-10-10), see §21 (typecheck + build pass; looked at in headless Chromium). It also VERIFIED Chapter 07 (npm ci + typecheck + build passed unchanged at the start of the session, so §20's "not run" warning is resolved; Chapter 07's real Tailwind styling still unreviewed by eye). Before that: Chapter 07 — Star Map (2026-10-09), see §20. Before that: Chapter 06 — Observatory (2026-10-09), see §19 (typecheck + build pass; looked at in headless Chromium). Before that: Chapter 05 — Black Holes (2026-10-09), see §18; it also verified Chapter 04 (typecheck + build pass, §18). Before that: Chapter 04 — Cosmic Scale (2026-10-08) — had been written without a working npm (its §17 note about being unverified is now partly superseded): the npm registry returned 403 for every package in that session, so there was no node_modules; see §17 "Verification" before trusting anything in it. Before that: Chapter 03 — Solar System, opening + Moon→Solar hand-off (2026-10-07). Before that: Chapter 02 — Moon (2026-10-06). Before that: Chapter 01 — Earth (2026-10-06), Star-field pass (2026-10-05). Install / typecheck / build now VERIFIED, and the hero + stars were seen in headless Chromium (software GL) — see §7 and §13. Not yet seen on a real GPU / real display.

## 1. Completed
- Phase 0 foundation: build tooling, design tokens, journey data model, layout primitives, lazy-loaded 3D star backdrop, render-performance profile.
- Hero ("WE ARE HERE.") — built in the Hero session, see §12. Plus a data-driven Journey index (11 chapters).
- Chapter 01 — Earth (status `live`) — cinematic pinned scene after the hero, see §14.
- Chapter 02 — Moon (status `live`) — cinematic pinned Earth→Moon transit directly after Earth, see §15.
- Chapter 03 — Solar System, OPENING ONLY (status `live`) — the Moon pulls away, the Sun is revealed, the planets are laid out in order with restrained labels, see §16. No planet interaction/zoom yet. - Chapter 04 — Cosmic Scale (status `live`, UNVERIFIED — §17) — one scroll-driven zoom, human → observable universe, 26.6 powers of ten. The journey now has 12 entries; Black Holes was moved up to 05 (§17). - Chapter 05 — Black Holes (status `live`) — ray-traced Schwarzschild black hole, scroll-driven approach, §18. - Chapter 06 — Observatory (status `live`) — a real, locally computed night sky for a real place and night, with scroll-driven arrival from Chapter 05, then free exploration, §19. - Chapter 07 — Star Map (status `live`, typecheck/build NOT yet run — §20) — an interactive equatorial star chart: dense field, constellation figures, 148 selectable stars + deep-sky objects, info panel with distance/luminosity/HR diagram, zoom/pan/fly-to, search. The journey now has 14 entries (Star Map inserted before the planned Stars chapter). Chapter 08 — Deep Space (status `live`, §21) — a pinned flight Sun → Kepler-186 (580 ly) through real 3D star positions, nebulae and a deep-field of galaxies, arriving at a to-scale planetary system, followed by an interactive exoplanet atlas. `deep-space` was moved up in `journey.ts` to sit right after Star Map (still 14 entries). Chapter 09 — Search for Life (`live`, §22). Chapter 10 — Humanity (`live`, §23) — a pinned, scroll-driven timeline of 54 events (early astronomy → future exploration) with a log-scale "reach" map, plus a scrubbable records chart and the address of Earth. `humanity` was moved up in `journey.ts` to position 10 (still 14 entries). The remaining planned chapters (Stars, Milky Way, Galaxies, Universe) are still "In development".

## 2. Architecture
```
src/
  main.tsx                 entry
  App.tsx                  page composition; lazy-loads the 3D layer
  styles/index.css         Tailwind v4 import + @theme design tokens + layered .label/.fade-up classes
  lib/tokens.ts            JS mirror of colour tokens (for Three.js)
  data/journey.ts          THE SPINE: ordered chapters (id, title, scale, summary, status)
  assets/earth/            Earth textures (§14) — imported by URL from EarthScene and MoonScene (same files, one download)
  assets/moon/             Moon albedo map (§15) — MoonScene only
  lib/beat.ts              CSS text-beat helper shared by every pinned chapter (extracted from ChapterEarth in §15)
  lib/lunarDetail.ts       runtime crater-relief generator for the Moon (§15)
  lib/moonRelief.ts        page-wide cache around lunarDetail: generated once, shared by Chapters 02 and 03 (§16)
  lib/solarSystem.ts       planet table, compressed orbit radii, ecliptic frame (§16)
  lib/clock.ts             one page-wide seconds clock (R3F's per-canvas clock restarts at every mount) (§16)
  lib/astro.ts             Chapter 06 astronomy core: time, precession, sidereal time, Sun/Moon/planets, sites, "tonight" (§19)
  lib/skyView.ts           Chapter 06 stereographic view maths (mirrors the shader), horizon ridge, shared SkyControl object (§19)
  lib/deepSpace.ts         Chapter 08 pure core: exoplanet data, route + camera pose, nebulae, labels, beats, milestones (§21)
  components/canvas/DeepSpaceScene.tsx   Chapter 08 R3F scene: custom-projected sky, galaxies, nebulae, stars, Kepler-186 system (§21)
  components/sections/ChapterDeepSpace.tsx   Chapter 08 pinned flight; ExoplanetAtlas.tsx = Chapter 08's DOM/SVG discovery + atlas
  lib/searchForLife.ts     Chapter 09 pure core: habitable-zone fit, candidate worlds, spectrum + signal-size model, odds arithmetic, evidence data (§22)
  components/sections/ChapterSearchForLife.tsx + sections/life/*   Chapter 09: pinned SVG opening + five DOM/SVG instruments (no canvas) (§22)
  lib/starMap.ts           Chapter 07 pure core: view state + flights, equatorial projection, figures, search, object facts, HR points, deep-field builder (§20)
  components/canvas/StarMapScene.tsx   Chapter 07 2D-canvas renderer + pointer/touch/wheel/keyboard (NOT R3F; no three.js)
  components/sections/ChapterStarMap.tsx   Chapter 07 section: stage, search, layers, info panel, HR diagram
  lib/skyGeometry.ts       Chapter 06 star/line buffers, B–V colour, procedural faint field (§19)
  lib/skyInfo.ts           Chapter 06 object descriptions + "Sky Tonight" snapshot (§19)
  data/sky.ts              Chapter 06 catalogue: 148 stars, 7 deep-sky objects, 24 figures (§19)
  lib/cosmicScale.ts       Chapter 04 world + timeline + labels + number formatting; pure data/maths, no three.js (§17)
  lib/cosmicField.ts       Chapter 04 procedural point clouds: Oort, neighbour stars, Milky Way, Local Group, web, grain (§17)
  lib/sky.ts               foreground-camera rotation published for the global StarField (§16)
  hooks/useStageLifecycle  near / visible / ready lifecycle of a pinned chapter's canvas, with teardown when far (§16)
  lib/humanity.ts          Chapter 10 pure data/maths: 54 events, eras, "where are we?" answers, seen/machine/people records, distance scale, address rungs (§23)
  hooks/useRenderProfile   one place deciding star count / DPR / animation by device + reduced-motion
  hooks/useSectionProgress scroll progress (0→1) through a tall track that pins a sticky stage; ref + `--p` CSS var, no React state
  components/
    layout/                Navigation, SectionShell (anchor + width + spacing for every section)
    sections/              Hero, ChapterEarth, ChapterMoon, ChapterSolarSystem, ChapterCosmicScale, JourneyIndex (one file per page section; page order: Hero → Earth → Moon → Solar System → Cosmic Scale → JourneyIndex)
    canvas/                R3F scenes (StarField, EarthScene, MoonScene, SolarScene, CosmicScene) + CanvasBoundary. Always lazy-imported.
```
Path alias: `@/` → `src/`. Three.js is split into its own chunk (vite.config.ts).

## 3. Important components
- `SectionShell` — wrap every new section in this for consistent layout. `bleed` (added in §14) = full-bleed pinned stage with no max-width/padding/eyebrow; the chapter places its own content width inside. Use it for every cinematic chapter.
- `useSectionProgress(track, stage, enabled, mirror?)` — (`mirror` = optional CSS var name also published on `<html>`, used for the Moon→Solar hand-off, §16) the pattern for a pinned chapter: tall `track`, `sticky h-svh` `stage`; read the returned ref in `useFrame`, drive DOM text with CSS `calc()` on `--p`. Reduced motion → `enabled=false` → progress fixed at 1 (see ChapterEarth for the unpinned still layout).
- `useRenderProfile` — every canvas component must read this; never sniff devices elsewhere.
- `data/journey.ts` — navigation, section ordering and future scroll transitions should derive from this.
- `StarField` — fixed full-viewport backdrop; the persistent "universe" behind all sections. Three depth layers (far/mid/near), custom shader points, per-layer parallax (scroll + cursor), faint twinkle, opening fade-in. Colours come from `lib/tokens.ts` (`starTints`), not hardcoded hex. Details and tuning knobs in §13.
- `lib/tokens.ts` — JS mirror of the CSS `@theme` colours (`colors`) plus canvas-only `starTints`. Any new Three.js/canvas colour must come from here; if you change a colour in `index.css`, change it here too.

## 4. Dependencies
Runtime: react, react-dom, three, @react-three/fiber.
Dev: vite, @vitejs/plugin-react, typescript, tailwindcss + @tailwindcss/vite (v4), @types/react, @types/react-dom, @types/three, @types/node (added in verification: vite.config.ts imports node:url; Vite only lists it as an optional peer).
Deliberately NOT added yet: framer-motion/GSAP, drei, state libs, router. Add only when a feature needs them.

## 5. Working features (intended)
Hero (staged reveal, planetary-limb horizon, beacon full stop, CTA), nav (transparent → glass on scroll), journey index, layered star backdrop (depth parallax from scroll + cursor, shallow twinkle, fade-in; no cursor parallax on touch devices; static under prefers-reduced-motion). Hero + stars viewed once in headless Chromium (see §13); not yet reviewed by a human on a real display.

## 6. Incomplete
The rest of Chapter 03 (planet interaction / zoom-to-planet / orbital motion / asteroid belt / moons — §16 "Not built"), Chapters 04–11 (Stars … Universe), a global chapter-driven scroll/transition system (hand-offs are still wired by hand between two chapters), SolarSystem / BlackHole / CosmicScale / Observatory / StarMap / MissionTimeline / CosmicClock / CosmicPassport / InformationPanel, real fonts, imagery assets, SEO/OG metadata, tests.

## 7. Known bugs / caveats
### Verification status (updated 2026-10-05)
- `npm install`, `npm run typecheck`, `npm run build` have now been RUN in a sandbox with npm access and all pass (react 19.3, @react-three/fiber 9.8.1, three 0.170.0 — dependency ranges resolve; R3F 9 ↔ React 19 OK; `three` / `@types/three` both 0.170). `package-lock.json` was generated but is NOT yet committed.
- Hero + star field were rendered in headless Chromium (SwiftShader software GL) at 1440×900: no page errors, no shader compile errors; only SwiftShader "GPU stall due to ReadPixels" console noise. This is a sanity check, not a design review: real-GPU look, frame rate, and mobile have NOT been checked. `npm run dev` was not run (preview of the production build was used).
- Build warning: the `three` chunk is ~878 kB (238 kB gzip) — expected for three + R3F, lazy-loaded; not addressed.

### Defects found by code inspection and fixed in the verification pass
- Stray literal directory `src/{components/{layout,...}}` (shell brace-expansion accident) and an unused empty `public/` — removed.
- `<body>` had an opaque background that would have painted over the fixed `-z-10` star canvas (stars invisible). Background now lives on `<html>` only. Keep it that way.
- `.label` / `.fade-up` were unlayered CSS and would have overridden Tailwind v4 utilities (e.g. `hover:text-ink`). Now inside `@layer components`. Any new custom class must be layered too.
- tsconfig: removed deprecated `baseUrl` (paths now `./src/*`), removed `types: ["vite/client"]` (covered by `src/vite-env.d.ts`).
- Scripts: `tsc -b` replaced by `tsc --noEmit` (no project references in use).
- vite alias now uses `fileURLToPath(new URL('./src', import.meta.url))` instead of a root-relative `/src`.

### Remaining caveats
- Hero horizon/vignette values were chosen by calculation (§12 "Tuning knobs"). Star values were tuned against headless screenshots only (§13).
- Fonts are system stacks (serif display = Iowan/Palatino/Georgia); no webfont chosen.
- Nav has a single link; scroll-to uses native anchors.
- `package-lock.json` exists locally but is uncommitted.

## 8. Next recommended step
(Chapter 10 session: typecheck/build pass. Next chapters: Stars (use the HR diagram + Star Map data), Milky Way, Galaxies, Universe (Search for Life §22 and Humanity §23 are done; Humanity's address section already previews the Milky Way / Local Group / Laniakea / Universe rungs, so those chapters can pick up from it). A real-GPU/phone review of Chapters 04–08 is still the biggest open item.)
0. Install/typecheck/build pass (§7). Remaining: commit `package-lock.json`, run `npm run dev`, and review the hero + stars on a real display/GPU and a phone (star brightness, twinkle, cursor feel).
1. ~~Round star sprites + subtle scroll parallax~~ — done in the Hero session (§12).
2. ~~Build Chapter 01 (Earth)~~ — done, §14. Review it by eye on a real GPU + phone (§14 tuning knobs).
3. ~~Chapter 02 (Moon)~~ — done, §15. Review it by eye on a real GPU + phone (§15 tuning knobs).
4. ~~Chapter 03 opening~~ — done, §16 (Moon→Solar hand-off, Sun reveal, system overview). Review it by eye on a real GPU + phone (§16 tuning knobs).
5. Continue Chapter 03 (the actual Solar System interaction: select/zoom to a planet, orbital motion, facts panel — the scene already has per-planet positions, spin axes and a min-size system to build on), or move to Chapter 04. Consider a global scroll/transition layer driven by `chapters`: the Moon→Solar hand-off (§16) is the second hand-wired seam and the pattern is now clear enough to generalise.

## 9. Design decisions
- Palette: #03040A / #070A12 / #0B1020 backgrounds; ink #E8ECF4; single cool-blue accent #8FB4FF used sparingly.
- Typography: large serif display, small tracked monospace "scientific labels" (`.label`), thin 1px hairlines instead of cards/borders-with-glow. No neon, minimal rounding, restrained glass (nav only).
- The journey is data (`journey.ts`), not hard-coded markup — chapters are honest about status ("In development") rather than faked.
- Performance first: lazy 3D chunk, DPR cap, device-tiered particle counts, reduced-motion respected.
- Tailwind v4 tokens live in CSS `@theme`; no tailwind.config file.

## 10. APIs / data integrations
None. Chapter facts in journey.ts are static approximate figures (verify before treating as authoritative). Likely future sources: NASA APIs, exoplanet archive, JPL Horizons — add via a `src/lib/api/` layer with caching.

## 11. Session log — handover audit & cleanup (2026-10-01)
Context: project continued from another Claude account. Archive extracts to a nested `astra/astra/`; the project root is the inner folder (the one containing `package.json` and `.git`).

**Audit result — what the previous Claude left:**
- Git tree was clean, 2 commits (`Phase 0: ASTRA foundation`, `Phase 0 verification: ...`), `git fsck` clean. No TODO/FIXME markers, no stray or half-written files, no work in progress. The previous session ended at a finished verification pass, not mid-feature.
- Implemented: everything listed in sections 1 and 5. Not implemented: everything in section 6. Nothing was found that is partially implemented in the code.

**Changes made this session (all small, no new features):**
1. `src/lib/tokens.ts` — was documented as the Three.js colour mirror but was imported nowhere. Completed it with the missing `inkDim` / `inkFaint` values (matching `--color-ink-dim` / `--color-ink-faint` in `index.css`) and added a canvas-only `starTints` export (neutral / cool / warm).
2. `src/components/canvas/StarField.tsx` — replaced three hardcoded hex strings with `starTints` from `@/lib/tokens`. Behaviour is unchanged (same colours, same thresholds).
3. `PROJECT_STATUS.md` — removed an empty dangling item ("1. (after verification)") in section 8 and renumbered; documented `tokens.ts` in section 3; added this log.

**Verification performed this session (honest account):**
- No network; `npm install` was not attempted (per instructions). No `node_modules`.
- Parser-level syntax check of all 11 `.ts/.tsx` files: 0 syntax errors.
- A global `tsc` (v6.0.3 — NOT the project's pinned ~5.6) run: 78 errors, every one attributable to uninstalled packages (`react`, `three`, `@react-three/fiber` modules/JSX types → TS2307/TS7026/TS2875/TS7006; `vite/client` CSS import → TS2882; `@types/node` → TS2591). No error pointed at a genuine logic/type problem in project code, but this is NOT a substitute for a real typecheck: with React/three types missing, most of the code is effectively unchecked.
- `npm run typecheck`, `npm run build`, `npm run dev` have **still never been run**. The project is **not confirmed to build**, and the star backdrop has **never been seen in a browser**.

**What remains (unchanged priority):**
- FIRST: with network access run `npm install && npm run typecheck && npm run build && npm run dev`; commit `package-lock.json`; confirm stars are visible; replace section 7's verification block with real results. Confirm dependency versions resolve (R3F 9 ↔ React 19; `three` / `@types/three` on matching 0.17x).
- Then section 8 steps (round star sprites + parallax → Chapter 01 Earth → scroll-progress hook).
- Everything in section 6 remains unbuilt.

## 12. Session log — Hero section (2026-10-01)
Scope: hero only. No other section was started; `SectionShell`, `JourneyIndex`, `journey.ts`, `useRenderProfile`, `tokens.ts` untouched. No dependencies added. Not built or run (no npm access) — see verification below.

**Changed files**
- `components/sections/Hero.tsx` — rewritten. h1 "WE ARE / HERE." (display serif, uppercase, `clamp(3.5rem,13vw,11.5rem)`), the full stop is `text-signal` with a slow `.pulse-soft` "you are here" beacon. Supporting line is the exact requested copy. CTA "EXPLORE THE UNIVERSE ↓" → `#journey` (hairline rule that extends on hover, arrow nudges, visible focus ring). Staged `.fade-up` reveal (0.3s → 2.4s). Small "Position / Galactic centre" label block, desktop only. Two decorative `aria-hidden` layers at `-z-[5]` (above the star canvas at -z-10, below content): a faint planetary limb (oversized dark circle with a thin lit rim, peeking ~15vh above the fold, centred at 74% so it clears the type) and a vignette weighted to the lower-left. Section is `overflow-hidden`.
- `components/layout/Navigation.tsx` — still minimal (ASTRA wordmark + "Journey"). Now transparent over the hero; hairline + blur appear after 24px of scroll (passive listener). Height 14→16.
- `components/canvas/StarField.tsx` — soft round sprite texture (canvas-generated, disposed on unmount), `size` 0.14→0.4, opacity 0.9→0.85, scroll parallax via damped `rotation.x` from `window.scrollY` (only when `animate`; no React state, runs in `useFrame`). Star counts still come solely from `useRenderProfile`.
- `styles/index.css` — `astra-pulse-soft` keyframe, `.pulse-soft` in `@layer components`, and `.pulse-soft { animation: none }` under `prefers-reduced-motion` (the global 0.01ms rule would otherwise strobe an infinite animation).

**Verification (honest)**
- Parser check of all 11 files: 0 syntax errors.
- Global `tsc` (v6.0.3, not pinned ~5.6): 101 errors, all in the uninstalled-package categories (TS2307/TS7026/TS2875/TS7006/TS2882/TS2591); none of another kind. React/three types are absent, so this does NOT prove the hero typechecks.
- Tailwind class validity, visual layout, z-order, text contrast, the horizon geometry, and the look of the stars were reasoned about, never rendered. `npm install/typecheck/build/dev` remain NEVER RUN.

**Tuning knobs (first browser pass)**
- Star size/brightness/parallax: superseded by the layered StarField — see §13 tuning knobs.
- Horizon: `Hero.tsx` first decorative div — `left: 74%`, `calc(100% - 15vh)` (rise), rim alpha 0.28, glow alpha 0.12/0.07. Check it doesn't collide with the headline at common aspect ratios (ultrawide, portrait phones).
- Vignette strength: 0.65 alpha in second decorative div.
- Type: headline clamp may need a mobile check — "WE ARE" must fit one line at 320px.
- Facts in the Position block (Orion Spur, ≈26,000 ly) are approximate; verify before treating as authoritative.

**Remaining**
- Real verification (§7) is still step 0 for the project.
- Web font choice (hero currently uses the system serif stack; this is the single biggest lever for the "premium" feel).
- OG/SEO metadata; hero has no imagery by design.
- Optional polish if wanted: cursor-driven star parallax, a one-time page-load fade of the star canvas to avoid a pop-in when the lazy chunk resolves (Suspense fallback is null).
- All journey chapters and other components in §6 still unbuilt.

## 13. Session log — Star-field pass (2026-10-05)
Scope: star field only. Hero markup/styling, nav, journey index, tokens, CSS untouched. No dependencies added.

**Changed files**
- `components/canvas/StarField.tsx` — rewritten (same default export, same fixed `-z-10` canvas, same lazy import).
  - Three layers (far 68% / mid 29% / near 3% of `starCount`), each one `THREE.Points` + shared `ShaderMaterial` = 3 draw calls, static geometry, no per-frame allocation, no React state per frame.
  - Natural: seeded PRNG (identical sky every load); steep power-law magnitudes (many faint, few bright; size follows brightness); near-white stars with a gentle cool/warm lean (colours still from `starTints`); ~40% of far stars drawn into a faint tilted galactic-plane density band.
  - Subtle/cinematic: tight-core soft-falloff points (no hard discs); additive blending; shallow slow twinkle on a minority of stars (amplitude ≤ ~0.2, per-star rate/phase, no flashing); very slow drift; 2.4 s eased fade-in on mount (removes the lazy-chunk pop-in).
  - Deep: per-layer parallax multipliers (0.35 / 0.7 / 1.25) for scroll and cursor, so depth comes from relative motion.
  - Cursor parallax: ±0.014 rad × layer depth at screen edge, heavily damped; eases back to centre on pointer leave; passive listener; no-op on touch.
  - Scroll parallax kept (was `0.00012`/px on one rotation; now `0.0001`/px × depth, damped).
  - Robustness: frame step capped at 50 ms (no jump after tab was hidden); geometry/materials disposed on unmount; layers never frustum-culled.
- `hooks/useRenderProfile.ts` — added `cursorParallax` (fine pointer + hover + motion allowed); raised `starCount` 1500/5000 → 3500/9000 (low/high). Points are now ~1–2 px and cheap, and only ~10% of the sphere is in view, so the old counts looked sparse.

**Verification**
- `npm run typecheck` / `npm run build` pass.
- Headless Chromium (SwiftShader) 1440×900: stars render, no page errors; cursor move shifts stars slightly (≈450 changed px in a 500×400 crop over a 3.5 s move), scroll shifts them more; with `prefers-reduced-motion` stars still render and ignore the mouse (frameloop `demand`, uFade starts at 1).
- NOT checked: real GPU / frame rate, mobile devices, high-DPI (dpr 2), the look of twinkle in motion (screenshots are stills), light-pollution on very bright monitors.

**Tuning knobs (all in `StarField.tsx` unless noted)**
- `LAYERS[]`: `share`, `size` (CSS px), `gain` (brightness), `depth` (parallax), `twinkle.share/amount`, `band` (galactic-band fraction). Biggest levers for "more/less visible": `gain` and `size`.
- Motion: `DRIFT` 0.0025 rad/s, `SCROLL` 0.0001 rad/px, `CURSOR` 0.014 rad, damping rates 2.2 (cursor) / 3 (scroll), `FADE_IN_S` 2.4.
- Fragment falloff `exp(-d*d*3.0)`: lower = softer/larger glow, higher = crisper points.
- Counts: `useRenderProfile` (`starCount`).
- Band orientation: `BAND_TILT` Euler.

**Remaining (star field)**
- Human review on a real display and a phone; adjust `gain`/`size`/counts by eye.
- If a scene later wants a different sky density or no cursor motion, pass props rather than forking `StarField`.

## 14. Session log — Chapter 01: Earth (2026-10-06)
Scope: Chapter 01 only. Solar System and all other chapters untouched. Dependencies unchanged (no drei, no post-processing).

**What it is.** A pinned scroll scene directly after the hero. A 340svh track pins a full-viewport stage; scroll progress drives a camera pull-back and the sun. It opens on the *night-side limb* (continuing the hero's horizon: city lights, thin dawn rim), the sun swings round, the terminator sweeps across, and the camera settles on a whole globe at right-of-centre (Africa / Arabia / India facing us) with text on the left. Three text beats: title + `journey.ts` summary → one statement → fact readout + "Next · Moon · 384,400 km". A hairline progress bar sits under the "01 — Earth" label.

**New files**
- `components/sections/ChapterEarth.tsx` — section, text beats (CSS-driven fades from `--p`), IntersectionObservers (mount scene within 1 viewport; idle render loop when off-screen; canvas fades in once textures are ready). Chapter title/scale/summary/number and the "next" cue are read from `journey.ts`.
- `components/canvas/EarthScene.tsx` — R3F scene, **2 draw calls**: (1) planet = one custom shader (day map, night lights, ocean glint, clouds drifting against the surface with a cheap cloud shadow, terminator warmth, limb haze); (2) atmosphere = back-faces of a 1.09× sphere, analytic "how high does this ray pass above the surface" glow with sunrise (forward-scatter) flare. Camera uses a lens shift (`setViewOffset`) so the globe stays a perfect circle wherever it sits. Zoom is geometric in apparent radius. No allocations per frame.
- `components/canvas/CanvasBoundary.tsx` — a failed WebGL context/texture removes the scene, not the page (text stays). **StarField is not wrapped in one** (pre-existing; same failure mode there).
- `hooks/useSectionProgress.ts` — see §3.
- `assets/earth/` — `earth-day.jpg` 2048×1024 (313 KB), `earth-night.jpg` 2048×1024 (94 KB, city lights extracted), `earth-ocean.png` 1024×512 (108 KB, ocean mask), `earth-clouds.jpg` 2048×1024 greyscale (397 KB). ≈ 0.9 MB total, loaded only when the chapter is within a viewport of the screen.

**Changed files**
- `data/journey.ts` — Earth `status: 'live'`.
- `App.tsx` — `<ChapterEarth />` between Hero and JourneyIndex.
- `components/layout/SectionShell.tsx` — added optional `bleed` prop (backwards compatible).
- `lib/tokens.ts` — added `earthTints` (atmosphere = signal blue, twilight, city light). Canvas colours still come from tokens.
- `components/sections/Hero.tsx` — **one attribute**: CTA `href` `#journey` → `#earth` (otherwise the CTA would skip the chapter). Nothing else touched.
- `components/sections/JourneyIndex.tsx` — live chapters link to `#id` (so "Open" is true). Index now sits *after* Earth, reading as "the road ahead".

**Texture provenance — verify before shipping publicly.** Derived from the example images in the MIT-licensed `three-globe` npm package (4096×2048 originals: Blue Marble day map, Black Marble night map, water mask, cloud mask), which are NASA-derived imagery. I could not verify the images' own licence/attribution terms from here; check them (and add credit if required) before a public release. Night lights were extracted from the blue-tinted night composite by thresholding warm pixels (`max(R,G·1.05) − 0.62·B`), so they are approximate. The day map is a January composite (northern snow cover).

**Accessibility / motion.** `prefers-reduced-motion`: no pinning, no camera move, no spin/drift, no cursor lens-shift; the finished composition renders once in its own block above the stacked text. Canvas is `aria-hidden`; all text is real DOM. Cursor lens-shift only on fine pointers (`cursorParallax`).

**Performance design.** Scene code + textures lazy-load near the viewport; render loop idles when the chapter is off-screen; DPR capped by profile; MSAA only on the `high` tier; sphere 96 vs 64 segments by tier; shaders are 4 texture reads. No measured frame rate — see below.

**Verification (honest)**
- `npm run typecheck` and `npm run build` pass.
- Headless Chromium (SwiftShader software GL), 1440×900 and 390×844, at several scroll positions, plus a `reduced_motion` run: scene renders, no page errors, no shader compile errors. Seen: night-limb opening, mid-sweep terminator, final composition, mobile composition, reduced-motion layout.
- NOT checked: real GPU, frame rate (SwiftShader cannot tell), real phone/touch scrolling, URL-bar resize behaviour on mobile Safari/Chrome, MSAA edge quality (SwiftShader showed a slightly dashed limb edge with AA off), `npm run dev`, human art review.
- Typecheck/build run with `npm ci` from the committed lockfile state; `package-lock.json` is still uncommitted (§7). Nothing from this or the star-field session has been git-committed.

**Tuning knobs** (`EarthScene.tsx` unless noted)
- Story/camera: `R_START` (opening limb size), `rEnd` in `useFrame` (final globe size, 0.7 of half-height), `cx0/cx1/cy0/cy1` (composition), `SUN_START` / `SUN_END`, `YAW_START` / `YAW_SWEEP` / `SPIN`, `CURSOR`. Scroll length: `340svh` in `ChapterEarth.tsx`; beat windows: the `beat(...)` calls there.
- Look: shader constants — surface gain `1.25`, glint (`320.0`, `0.2`), cloud opacity `0.8`, cloud shadow `0.16`, city light gain `2.4`, haze `0.9`; atmosphere `ATMOSPHERE` (shell height; real value ≈1.016, 1.09 is deliberately exaggerated), falloff exponent `3.6`, flare `2.2`; colours in `earthTints`.
- Camera damping `3.5` (higher = snappier follow of scroll).

**Known caveats / ideas**
- Close-up at the opening is a 2048 map stretched large: slightly soft. A 4096 day map (or a normal map) would sharpen it at ~4× the bytes; not done.
- Cloud map is a static NASA-style mask looped by UV drift: fine at this scale, would show a seam only if watched for long.
- Atmosphere is a stylised, not physically-based, scattering model.
- Facts in the readout are approximate textbook values (sidereal day 23 h 56 min, 29.8 km/s, 149.6 M km, 4.54 Gyr; "71% ocean", "nearly all air within 30 km"); verify per §10.
- Two WebGL contexts exist while Earth is mounted (StarField + EarthScene). Acceptable now; if more chapters stack up, consider one shared canvas.
- Hero's decorative limb (DOM) and the Earth's night limb are matched by eye only (x ≈ 74%); no pixel-level hand-off.

## 15. Session log — Chapter 02: Moon (2026-10-06)
Scope: Chapter 02 only. Solar System and all later chapters untouched. Dependencies unchanged (no drei, no post-processing, nothing added to package.json).

**What it is.** A pinned scroll scene (420svh track) directly after Earth. Its first frame IS Chapter 01's last frame (same framing, tilt, yaw, sun, lens shift). Scroll then drives one continuous camera move: Earth recedes (≈0–28%) to a true wide shot of both bodies (≈28–30%: Earth lower-left, Moon right), then a constant-zoom-rate dolly in on the Moon (≈30–88%), settling right-of-centre on the near side with text on the left. Earth is visible through roughly the first 40% of the chapter and then leaves frame to the left. Three text beats: transit line ("Light crosses the gap in 1.3 seconds. The Apollo crews needed three days.") → title + `journey.ts` summary → fact readout + "Next · Solar System". Header row = "02 — Moon" + scale, progress hairline, and a live "Distance from Earth N km" readout with "Sizes true · distance compressed" beside it. Two surface markers (Tranquility Base 0.67°N 23.47°E; Mare Crisium 17.0°N 59.1°E, Ø 555 km) fade in on arrival, tracking their points on the disc every frame.

**New files**
- `components/sections/ChapterMoon.tsx` — section, mirrors ChapterEarth (SectionShell `bleed`, `useSectionProgress`, near/visible IntersectionObservers, `ready` fade, left scrim, `beat()` text). Owns the marker DOM (`data-lat`/`data-lon`) and the readout span; the scene only moves/fades/writes them (no React state per frame).
- `components/canvas/MoonScene.tsx` — one R3F scene holding both bodies, **3 draw calls** (Moon 1, Earth 2). Earth reuses EarthScene's shaders unchanged. Moon: custom shader — Lommel–Seeliger/Lambert blend (no limb darkening), hard terminator (no air), albedo contrast curve with cool-maria/warm-highland tint, tangent-space relief from a 2-layer normal map (base + 6× tiling), faint cool rim so the unlit limb reads. Camera is translation-only + lens shift (no rotation), like Earth. Libration ±0.7° (animate only).
- `lib/lunarDetail.ts` — runtime crater-relief generator: ~9,500 craters (high tier, 2048×1024) / ~3,000 (low tier, 1024×512), cumulative size law ∝ r⁻², bowl + rim + ejecta + central peaks, sparser on maria (read from the albedo's luminance), plus the albedo's high-pass so real photographed craters also catch light. Time-sliced (≈6 ms budget), deterministic seed (1969), canvas-readback of the albedo for luminance. Output RG slope map; the shader fades the detail in (`uDetail`) when it lands.
- `lib/beat.ts` — `beat()` extracted verbatim from ChapterEarth (now shared).
- `assets/moon/moon-albedo.jpg` — 1024×512 greyscale, 267 KB; polar rows blended out (they had bright streaks).

**Changed files (all small, behaviour of Chapter 01 unchanged — verified by screenshot)**
- `components/canvas/EarthScene.tsx` — added `export` to constants/shaders/`distanceFor` that MoonScene needs, and a new exported `earthFinalFraming(aspect)`; EarthScene's own `useFrame` now calls it (same numbers as before: r `min(0.7, aspect·0.86)`, cx `0.4·aspect` / 0 portrait, cy 0 / 0.3 portrait). This is what guarantees the two chapters' frames match — change Earth's end composition in that one place.
- `components/sections/ChapterEarth.tsx` — imports `beat` from `lib/beat.ts` (local copy removed); "Next" cue now links to `#<next.id>` when that chapter is live (→ `#moon`), else `#journey`.
- `App.tsx` — `<ChapterMoon />` after `<ChapterEarth />`. `data/journey.ts` — Moon `status: 'live'` (JourneyIndex shows "Open" and links it automatically). `lib/tokens.ts` — added `moonTints`.

**Scale and physics (stated honestly in the UI)**
- Body sizes are true (Moon = 0.2727 Earth radii). The gap is compressed 60.3 → 14 Earth radii (`GAP`); otherwise the crossing is long empty black. The page says "Sizes true · distance compressed".
- Sun is fixed in the world, Earth and Moon are in full-Moon geometry, Moon is tidally locked: the lit hemisphere is the real near side. The camera sees the Moon obliquely: selenographic longitude 60°E is at the disc centre (Crisium near middle, Tranquillitatis/Serenitatis toward the lit left limb). Only the Sun's direction eases (`SUN_END` → `SUN_MOON`, over the first ~45% of travel, while Earth is small) so the terminator crosses the disc and craters get long shadows.
- Readout = real km, linear in camera travel (0 at Chapter 01's frame, 384,400 on arrival); it is a presentation of progress, not a trajectory model.

**Accessibility / motion.** `prefers-reduced-motion`: no pinning, no camera move, no libration/drift, no cursor lens shift; one finished still (the Moon, markers visible, readout 384,400) above the stacked text — Earth/transit exist only in the animated path. Canvas is `aria-hidden`; marker text and all copy are real DOM. Markers are `md:` and up only (they overflow on phones).

**Performance design.** Scene code + Moon texture lazy-load within one viewport of the chapter (Earth textures are the same cache entries as Chapter 01); render loop idles off-screen; DPR capped by profile; MSAA high tier only; Moon sphere 128 / 80 segments and relief map 2048² / 1024² by tier; per-pixel cost is 3 texture reads on the Moon; no per-frame allocation (scratch vectors). Relief generation (Node benchmark on this sandbox's CPU): high ≈ 520 ms total, low ≈ 150 ms, spread over ~50 / ~16 slices with the worst single slice ≈ 17 ms (≈ one frame). The 8 MB (high) / 2 MB (low) RGBA texture upload + mipmap build happens in one frame on the GPU when it lands — not measured.

**Verification (honest)**
- `npm run typecheck` and `npm run build` pass (final run, after the last code change).
- Headless Chromium (SwiftShader software GL): 1440×900 at progress 0…1 in 10% steps (+ 30% re-shot with a long settle), 390×844 at 0/30/70/100%, `prefers-reduced-motion` on both sizes (confirmed unpinned, no console errors), Chapter 01 end frame re-checked after my edits. No page errors, no shader compile errors, no console warnings. Seen: opening frame matches Earth's end pose; wide shot; Moon arrival with relief, terminator, markers; mobile composition.
- NOT checked: real GPU, real frame rate (SwiftShader cannot tell; it also shows ~1 s long tasks that are software rasterisation, not the generator), real phone/touch scrolling, mobile URL-bar resize, the visual seam where Earth's stage scrolls off and the Moon's scrolls in on a real display, texture upload hitch, human art review.

**Texture provenance — verify before shipping publicly.** `moon-albedo.jpg` derives from `examples/textures/planets/moon_1024.jpg` in the MIT-licensed three.js repo (a NASA-derived lunar mosaic; I could not verify the image's own licence/attribution from here — check and add credit if required, same caveat as §14). It is a 1024×512 map: close-up sharpness comes from the generated relief, not from the photo. The generated craters are procedural and do not correspond to real named craters.

**Tuning knobs (`MoonScene.tsx` unless noted)**
- Story/camera: `GAP`, `BEARING` (which longitude faces us: 30° → 60°E at centre; also sets `MOON_YAW`), `WIDE` (wide-shot camera: both bodies in frame), `ARRIVAL_PX` (final Moon size), `PHASE_1_END` / `TRAVEL_A` / `TRAVEL_B` (scroll windows; keep phase lengths ∝ log of distance covered or the zoom speed lurches at the wide shot), the `1.3` exponent in the phase-2 `g` (front-loads Moon growth), `cyEnd` (portrait height), `SUN_MOON`. Scroll length: `420svh` and `beat(...)` calls in `ChapterMoon.tsx`; `facts` and `markers` arrays there.
- Look (MOON_FRAG): albedo curve `pow(a, 3.0) * 2.4`, relief weights `1.5` / `0.55`, LS/Lambert mix `0.6`, terminator `smoothstep(-0.015, 0.04, …)`, rim `0.018`, night trace `0.004`; tints in `moonTints`. Relief strength at the source: `K = 1.6`, `HP = 0.0085`, depth/rim ratios in `lib/lunarDetail.ts`; crater counts/radii per tier in the effect in `MoonScene.tsx`.

**Known caveats / ideas**
- Three WebGL contexts are alive once the Moon mounts (StarField, Earth, Moon); Earth's stays mounted but idles. If chapters keep stacking, move to one shared canvas / global scene (§8).
- Seam between chapters is a normal scroll hand-off of two pinned stages showing the same pose (no overlap/cross-fade); on a real display the Earth's text scrolls off while a second identical globe arrives from below. Earth's time-based spin means the continents may sit a few degrees differently at the join. Not reviewed by eye on a real device.
- The Moon's far-side half of the disc is mostly in shadow and the generated relief is not shadow-cast (no self-shadowing) — craters read from shading only.
- Observer/near/visible logic is now duplicated in ChapterEarth and ChapterMoon; extract a hook when the third pinned chapter lands.
- Facts are approximate textbook values (3,474 km; 1.62 m/s²; 27.3 d; −173…127 °C; 4.5 Gyr; 1.3 s light time; Apollo "three days"); verify per §10.

## 16. Session log — Chapter 03: Solar System, opening + Moon→Solar hand-off (2026-10-07)
Scope: the *beginning* of Chapter 03 and the seam between Chapters 02 and 03. No planet interaction. Dependencies unchanged (nothing added to package.json). Chapters 04–11 untouched.

**What it is.** A pinned scroll scene (600svh track) whose first frame IS Chapter 02's last frame. Camera timeline (chapter progress `s`, constants `T` in `SolarScene.tsx`):
- 0 – 0.05 hold on the Moon (Chapter 02's text lifts away / fades).
- 0.05 – 0.27 **Act 1, the Moon pulls away:** the camera replays Chapter 02's arrival route backwards (`moonRig`, exported from MoonScene), eased to rest at the wide Earth + Moon shot. Lunar surface markers fade out. 0.27 – 0.33 holds on the wide shot (Earth + Moon labelled).
- 0.33 – 0.84 **Act 2–3, pull-back and reveal:** geometric (constant-rate) retreat from the Earth–Moon pair to a tilted overview above the ecliptic, camera first leaning round (SWING), turning to face the Sun (TURN). The Sun swings in huge (≈ 0.55–0.62) and shrinks; orbits draw in Mercury→Neptune (0.6–0.86); planets labelled inner→outer (0.74 → 0.88). 0.84 – 1.0 rest on the overview.
- Text beats: header + hairline (0.085), "The Sun is 389 times farther away than the Moon." (0.12–0.36), "Of everything in the solar system, 99.86 % is the Sun." (0.55–0.75), title + `journey.ts` summary (0.76–0.93), facts + "Next · Stars" (0.92+). Beat/label windows live in `ChapterSolarSystem.tsx` and must be kept in step by hand with `T` (importing `T` would drag the whole scene out of its lazy chunk).

**The hand-off (the part that was asked to improve).** Before: two pinned stages showing the same pose, scrolled past each other (visible seam, second identical Moon arriving from below). Now:
1. `ChapterSolarSystem`'s section has `-mt-[100svh]`, so its sticky stage pins at exactly the scroll position where Chapter 02's unpins (Moon progress = 1).
2. Its canvas wrapper has `opacity: clamp(0, calc(var(--p) * 3000), 1)` — invisible until pinned, so the stage sliding in over Chapter 02 shows nothing.
3. Chapter 02's canvas+markers wrapper (`HAND_OFF` in `ChapterMoon.tsx`) drops out with `calc(1 - var(--solar-ready, 0) * clamp(0, calc(var(--solar-p, 0) * 3000), 1))` — a step, not a fade, because the two frames are the same. `--solar-p` is published on `<html>` by `useSectionProgress(..., '--solar-p')` (only while pinned/animating); `--solar-ready` by ChapterSolarSystem once its canvas is on the GPU (only when animating). If Chapter 03's WebGL fails or hasn't loaded, nothing is published and Chapter 02 behaves exactly as before.
4. Chapter 02's text layer fades with `--solar-p` (`TEXT_AWAY`) while it scrolls up with its unpinning stage; Chapter 03's header arrives only after it has cleared. Chapter 03's text layer is `pointer-events-none` (its Next link opts back in) so it does not block Chapter 02's link underneath.
5. For the frames to be identical: Moon scene code is shared (shaders, relief, lens shift, cursor offset), time-varying state uses the page-wide clock (`lib/clock.ts`, see below), the crater relief is the same pixels (`lib/moonRelief.ts`). Verified by screenshot: Chapter 02's final frame and Chapter 03 at progress 0.04 are visually the same Moon, markers included.
Reduced motion: no negative margin, no hand-off vars, no pinning; one still overview above the stacked text (no Earth/Moon textures are even loaded in that mode).

**New files**
- `components/sections/ChapterSolarSystem.tsx` — section, hand-off, beats, body labels (DOM, driven by `data-body` / `data-fade` / `data-limb` / `data-lat,lon` attributes; per-label leader offsets in `placement`; phones show only `phoneLabels`).
- `components/canvas/SolarScene.tsx` — one R3F scene, ≈ 8 draw calls: Earth 2 + Moon 1 (animating only), Sun sphere 1 (shader: limb darkening + animated granulation noise) + glow billboard 1 (analytic, additive), all planets 1 (InstancedMesh, per-instance colour/banding/spin axis), Saturn's ring 1, all 8 orbits 1 (LineSegments, per-orbit reveal in the shader). Camera is a pure function `solarPose(s, aspect, px, py)`; depth range follows scale (near ∝ distance to Earth/Moon, far clears the Sun). Planets keep true size with a 1.6 px floor that fades in with the reveal (so no stray dots during the Earth–Moon shot); Earth hands over from its dot to the textured globe when close.
- `lib/solarSystem.ts` — planet table, `AU_DISPLAY`, `orbitRadius`, `eclipticFrame`, `planetPosition`.
- `lib/moonRelief.ts`, `lib/clock.ts`, `lib/sky.ts`, `hooks/useStageLifecycle.ts` — see §2.

**Changed files**
- `components/canvas/MoonScene.tsx` — exports (constants, shaders, `surfaceDir`); camera path extracted into the pure, exported `moonRig(s, aspect, px, py, out)` (same maths, verified: Chapter 02 end frame unchanged); relief now via `lib/moonRelief`; `frame.clock` → `clockSeconds()`.
- `components/canvas/EarthScene.tsx` — `frame.clock.elapsedTime` → `clockSeconds()` (one line). This also fixes the §15 caveat that Earth's spin/cloud drift could differ by a few degrees across the Earth→Moon seam.
- `components/canvas/StarField.tsx` — the three layers sit in a `<group>` whose quaternion is `sky.q` (identity unless a chapter publishes one). Chapter 03 publishes the inverse of its camera rotation, so the stars swing with the camera when it turns to face the Sun. Hero/Earth/Moon are unaffected (identity).
- `components/sections/ChapterEarth.tsx`, `ChapterMoon.tsx` — the duplicated near/visible/ready block replaced by `useStageLifecycle` (the §15 "extract a hook when the third pinned chapter lands" note). Behaviour change: a chapter's canvas is now **unmounted once it is > 2.5 viewports away** and re-mounted (fades back in) on return. Chapter 02 also gains the hand-off styles above.
- `hooks/useSectionProgress.ts` — optional `mirror` argument. `data/journey.ts` — Solar System `live`. `App.tsx` — `<ChapterSolarSystem />` after Moon. `lib/tokens.ts` — `solarTints`.

**Scale and honesty (stated in the UI: "Order true · scale compressed")**
- World units = Earth radii, Earth at origin (joins Chapter 02's world exactly); Sun direction = Chapter 02's light direction. Sizes true (Sun 109 R⊕, Jupiter 11.2 …); the only exaggeration is the 1.6 px marker floor.
- Distances compressed: planet at `a` AU sits `600·√a` Earth radii from the Sun (really 23,481 per AU); Earth–Sun = 600. From Earth the Sun therefore looks ≈ 10° in radius during the reveal, vs 0.27° in reality. Orbits are circles in one plane (real inclinations/eccentricities ignored).
- Heliocentric angles (`theta` in `PLANETS`) are hand-composed for a readable picture, not today's positions. Labels' AU values are semi-major axes (approximate; verify per §10). Facts are approximate textbook values (1.39 M km, 99.86 %, 8 min 20 s, 30.1 AU / 4.5 G km, 4.57 Gyr, "389×" = 149.6 M km / 384,400 km).

**Performance design.** Scene code lazy-loads (own 16 kB chunk; no new assets; no new textures for the Sun/planets — all procedural). Render loop idles off-screen; DPR/MSAA/segment counts from the profile; no per-frame allocation (scratch vectors; instance matrices rewritten in place); label DOM writes only when a value changes. Moon relief CPU work is done once per page. Canvases of far chapters are now torn down (see above), so the steady state is ≈ StarField + the 1–2 nearest chapter canvases rather than all of them. Briefly (≈ 100svh of scroll just before the hand-off) Chapter 02's and 03's canvases both render.

**Verification (honest)**
- `npm run typecheck` and `npm run build` pass (final run, after the last code change). Solar chunk 15.9 kB (6.1 kB gzip).
- Headless Chromium (SwiftShader software GL), 1440×900: Moon end (baseline vs after refactor, same), Solar progress 0.04 / 0.09 / 0.15 / 0.27 / 0.45 / 0.5 / 0.58 / 0.6 / 0.7 / 0.86 / 1.0, Chapter 01 end frame (unchanged), 390×844 at 1.0, `prefers-reduced-motion` at 1440×900 (still overview, unpinned, text stacked). No page errors, no shader compile errors, no console warnings during these runs.
- NOT checked: real GPU, real frame rate (SwiftShader cannot tell), real phone / touch scrolling, mobile URL-bar resize, the hand-off on a real display while actually scrolling (only still frames were compared; whether the 1–2 px crossfade is truly invisible, and whether both canvases rendering at once stays smooth, needs a human), the tear-down/re-mount of far canvases under fast back-and-forth scrolling, MSAA edge quality, `npm run dev` on a real machine, human art review. The mobile labelling pass was changed after its screenshot (phones now show only Sun / Earth / Jupiter / Saturn / Neptune) and was not re-shot.

**Tuning knobs (`SolarScene.tsx` unless noted)**
- Story/camera: `T` (scroll windows), `E_REF` / `R1` (wide-shot anchor), `SWING` / `TURN` (when the camera arcs round / turns to the Sun), `FIT` (system size in the final frame), `ELEV` / `ELEV_PORTRAIT` / `AZIMUTH` (overview angle), final lens shift in `solarPose` (`0.07 * aspect`), orbit reveal window (`remap(s.s, 0.6, 0.86)`), `MIN_PX`. Scroll length `600svh`, beat windows and label `fade` strings in `ChapterSolarSystem.tsx`; label leader offsets in `placement`.
- Layout (`lib/solarSystem.ts`): `AU_DISPLAY`, the `√a` compression, each planet's `theta`, colours in `solarTints`.
- Look: Sun shader (`limb` law, `col *= 1.55`, granulation scale), glow (`GLOW_K`, falloff constants in `GLOW_FRAG`), orbit alpha (`0.17` / `0.4` for Earth's), planet shading in `PLANET_I_FRAG`.

**Known caveats / ideas**
- The mid-chapter stretch (≈ 0.33–0.5) is deliberately quiet: Earth and Moon dwindle before the Sun arrives; shorten it by moving `TURN`/`SWING` earlier if it feels slow on a real display.
- Hand-off relies on the two canvases being identical at the instant of the swap. Anything that makes the Moon scene differ from the Solar scene's Moon (a new uniform, a different DPR/tier choice) will show as a pop. Change the Moon only in `MoonScene.tsx`'s shared exports.
- `--solar-ready` is published only while Chapter 03's canvas is mounted and ready; scrolling back up from far away re-mounts it, so briefly the old behaviour (a normal scroll seam) applies until it is ready.
- Star field turns with the camera (yaw/pitch) but its FOV is 60° vs the scene's 32°, so the stars move less on screen than the bodies: intentional (distance), but check by eye.
- Planets are static (no orbital motion), have no surface detail (procedural bands only), no moons, no asteroid belt, no Kuiper belt; the ring is a simple shader. All are natural next steps; the instancing, spin axes and min-size floor are built for them.
- Three WebGL contexts are alive at most places in the page now (StarField + up to two chapters); a single shared canvas / global scene is still the cleaner end state (§8).
- Nothing from this or the earlier sessions has been git-committed (`package-lock.json` still uncommitted, §7).

## 17. Session log — Chapter 04: Cosmic Scale (2026-10-08)
Scope: Chapter 04 and its seams with Chapter 03 (behind it) and Chapter 05 (ahead). Chapters 01–03 were not rebuilt; Chapter 03 got one small edit (below). No dependencies added; no new asset files (the Earth day/night textures are the ones Chapters 01–03 already ship).

### VERIFICATION — READ THIS FIRST
- In this session `npm ci` / `npm install` failed with HTTP 403 from registry.npmjs.org for the lockfile's `zustand` tarball, and then for every package (react, three, vite, typescript … even `npm view`). There was no `node_modules`, so **`npm run typecheck`, `npm run build`, `npm run dev` and every browser/headless render were NOT run**. Chapter 04 has never been compiled against real React / three / R3F types and has never been drawn.
- What WAS checked: (1) `tsc` (global v6.0.3, strict + noUnusedLocals/Parameters) on the three dependency-free files `lib/cosmicScale.ts`, `lib/cosmicField.ts`, `data/journey.ts` → 0 errors; (2) TypeScript syntax parse of `CosmicScene.tsx`, `ChapterCosmicScale.tsx`, `ChapterSolarSystem.tsx`, `App.tsx`, `JourneyIndex.tsx` → 0 syntax errors (this is NOT type checking); (3) a Node script that transpiled the pure modules and checked: scale is monotone in scroll and `pAt` inverts `scaleAt`; text-beat windows are sorted and do not collide; annotation fade windows are sorted; the camera path has no jumps; Earth–Sun = 1 AU, Sun–galactic centre = 26,000 ly, Sun sits at 232° (between two arms), Proxima is 4.246 ly from the Sun on the map; all six point generators produce finite, in-range data (ms on this CPU: Oort 5, neighbours 2, Milky Way 27, Local Group <1, web 37, grain 9; ≈ 80 ms total at the high tier); the circle signed-distance formulation, emulated in float32, gives the exact horizon at 0.005 m/px (1.3 billion px radius) to ≤ 1e-4 px; (4) the resolved fragment shader was read by hand for GLSL ES 1.0 errors (no validator was available); one real bug found and fixed that way: `RINGS.length` (13) did not match the shader's `NR` (was 14; the module would have thrown at load).
- NOT checked, and therefore the first things to do on a machine with npm: `npm ci && npm run typecheck && npm run build` (expect some type errors in `CosmicScene.tsx` / `ChapterCosmicScale.tsx`: R3F/three typings were only reasoned about), shader compile on a real GL driver (any error shows as a console message and a missing scene; the page text still works), how it LOOKS (every colour, brightness, size and timing here is by calculation, not by eye), frame rate, phones, the Ch03→Ch04 dissolve, reduced motion.

### What it is
A pinned scroll scene (1000svh track) that zooms from a 1.7 m person to the observable universe. One canvas whose unit is the CSS pixel; the camera is a centre plus `s = log10(metres per pixel)`, both functions of scroll progress (`lib/cosmicScale.ts`: `scaleAt(p)` piecewise-linear through knots, `centerAt(s)` person → Earth → Sun → galactic centre). Everything is positioned in float64 metres in JS and handed to shaders as pixel offsets, which is what makes 27 decades possible. Scale range: s = −2.3 (human ≈ 340 px tall) → 24.3 (observable universe ≈ 440 px across).
Scenes in order (s): human on the horizon at night (−2.3) → the horizon curves into Earth's limb (≈ 3–4.4) → Earth as a lit globe with night lights (4.4) → geostationary ring, Moon's orbit and the Moon (6.2) → the Sun appears, planetary orbits (8–10.3, true AU radii) → Neptune 30 AU, heliopause ≈ 120 AU (dashed) → Oort cloud shell to 100,000 AU (13.8) → nearby stars at their true distances (14.7) → Milky Way, 4 spiral arms + bar, 100,000 ly (18.3) → Local Group: Andromeda (inclined ellipse), M33, Magellanic Clouds, dwarfs (20.3) → cosmic web filaments (22.6) → the observable-universe edge with reddened grain and a mottled CMB-like glow (24.3).
Text: 11 short beats (scale label + serif line + one sentence), windows derived from the scale each belongs to (`MILESTONES`, `pAt`). Annotations (`NOTES`, 18 + the persistent "You are here") are DOM, pinned to real positions by the scene every frame, faded by scale window. HUD: live "Frame height" readout and a true-length scale bar (md+), both written to the DOM only when their text changes. Environmental change: a DOM "veil" behind the canvas (opacity + tint driven by the scene from `VEIL_STOPS`) hides the page's star field from ≈ s 8.5 on (we are leaving the sky) and shifts cool blue → violet → faint red at the edge.
Honesty/scale: every size and distance is TRUE (Moon 384,400 km, planets at real AU, Proxima 4.246 ly, galaxy 26,000 ly out, universe radius 46.5 Gly). Liberties, all stated or visible: flat 2D top-down map (stars keep their RA bearing and true distance, declination dropped); circular coplanar orbits at hand-picked angles; sub-pixel bodies drawn as 2–3.6 px dots; the Sun's glow is a fixed ~15 px bloom; the Oort cloud is theorised (text says so); the web is procedural, not a survey; Milky Way structure is a model (bar + 4 arms at 12° pitch), not Gaia data.

### New / changed files
- NEW `lib/cosmicScale.ts`, `lib/cosmicField.ts`, `components/canvas/CosmicScene.tsx`, `components/sections/ChapterCosmicScale.tsx`.
- `data/journey.ts` — added `cosmic-scale` (live) after Solar System and MOVED `black-holes` up to 05 (the brief names Chapter 05 = Black Holes); remaining planned order: Stars, Milky Way, Galaxies, Deep Space, Search for Life, Humanity, Universe. Note Cosmic Scale already touches the Milky Way and observable universe; Stars/Milky Way/Galaxies/Universe are now deeper dives, and the order is worth a rethink. `JourneyIndex` heading now "Twelve steps outward."
- `App.tsx` — `<ChapterCosmicScale />` after `<ChapterSolarSystem />`.
- `ChapterSolarSystem.tsx` — hand-off: new `COSMIC_AWAY` multiplies the canvas gate, scrim and text layer opacity (reads `--cosmic-ready` / `--cosmic-p`, which Chapter 04 publishes on <html>). Inert when those vars are absent (reduced motion, or Chapter 04's WebGL failing). Its "Next" link now reads "Cosmic Scale" and targets `#cosmic-scale` automatically.

### Architecture notes
- **Shader 1 (full-screen quad)**: Earth (sphere shading, day/night textures with city lights, atmosphere rim; at human scale the SAME formula is the ground and a 220 px band of sky), the human (SDF figure, pale so it reads on black), 13 rings (orbits, boundaries; modes solid / dashed / "horizon of the visible"), 4 soft glows (Sun, Milky Way, Andromeda, M33). Circles use `circSd`: with A = D0² − R² computed in float64 and passed in, `|c0+q|² − R²` is expanded without large cancellation (tested, above).
- **Point clouds** (6, positions in metres relative to an origin; vertex shader does `pos * (1/mpp) + origin_px`): counts 2600/140/30,000/46/15,000/7,000 (high) vs 1200/100/13,000/30/7,000/3,000 (low tier = phones / ≤ 4 cores). **Dots** (10, pixel positions rewritten per frame): Sun, Moon, Earth, 7 planets. Everything blends additively except Earth/human (premultiplied over). ≈ 10 draw calls.
- Earth textures are CLONED (`texture.clone()`, NoColorSpace) because the cached originals belong to Chapters 01–03 and carry sRGB settings; this scene writes raw display values and does no colour management.
- Lifecycle/idle/teardown via `useStageLifecycle` like the other chapters; DPR from `useRenderProfile`; the canvas fades in on `ready`.

### Seams
- **From Chapter 03:** same overlap trick (`-mt-[100svh]`, stage pins as Chapter 03's unpins). Not a pixel match: the person shrinks to 1.7 m again, so it is a dissolve (Chapter 04's canvas ramps in over its first ≈ 7 % of progress, Chapter 03's fades over ≈ 10 %) with the intro line "This is you." arriving as the solar-system overview leaves. If the dissolve feels long, change `GATE_IN` (Chapter 04) and the `* 10` in `COSMIC_AWAY` (Chapter 03).
- **To Chapter 05:** Chapter 04's canvas, scrim and gate already read `--bh-ready` / `--bh-p` (`HAND_OFF` in `ChapterCosmicScale.tsx`) exactly as Chapter 02 reads `--solar-*`; they do nothing until Chapter 05 publishes them. The chapter ends on the observable universe with the "You are here" dot, then a "Next · Black Holes" link (→ `#journey` while Black Holes is planned). Intended Chapter 05 opening: its stage pins as Chapter 04's unpins (`-mt-[100svh]`), publishes `--bh-p` / `--bh-ready`, and begins in darkness with a single point of light.
- **Reduced motion:** no pinning, no zoom; one still at s = 18.4 (the Milky Way, "You are here", galaxy labels) in a 80svh block above the same 11 beats as a stacked list.

### Tuning knobs
- Timeline: `KNOTS` (scroll → scale; segment length = how long you linger), `S_START`/`S_END`/`S_STILL`, track `1000svh`, `centerAt` smoothsteps (when the camera pans Earth/Sun/galaxy), camera damping `5` in `CosmicScene` (higher = snappier).
- Composition: `sx`/`sy` in `useFrame` (subject right of centre on wide screens, above centre on phones).
- Look (all in `CosmicScene.tsx`): shader constants (ground colour, sky band `0.12 + 0.88·lit`·0.6, night-light gain 2.2, atmosphere rim 0.9), ring `alpha`/`fade`/`width`, glow radii/intensities, dot sizes (`DOTS`, `PLANET_DOTS`), `mwGain` (stops the galaxy blowing out as it shrinks), `VEIL_STOPS`. Point sizes/brightness/counts in `lib/cosmicField.ts` (`put(..., k, size)` calls) and the `counts` table in the scene. Earth orientation: `TILT`, `LON0`; light direction `SUN_DIR` + z `0.32`.
- Text: `MILESTONES`, `NOTES` (label position, leader offsets, fade windows, `phone`).

### Known caveats / risks (all untested)
- Every brightness and size is a first guess. Likeliest by-eye fixes: the human may read too faint/bright; the Milky Way core may saturate (additive over 13k–30k points); web/grain may be too faint on a 1× display; the veil may hide the page stars too early/late.
- Texture sampling has no mipmaps (the equirect seam makes derivatives unusable), so Earth may shimmer slightly while it is 5–20 px across.
- Label collisions at s ≈ 8.4–10 (Earth, Sun, Jupiter, "You are here" all near each other) were placed by calculation; check by eye and nudge `dx/dy`.
- On narrow screens, the stage uses `sy = 0.1·h` to lift the subject above the text; unreviewed.
- Facts to verify (§10): Voyager 1 ≈ 170 AU in Oct 2026; Neptune light time ≈ 4 h; "Thirty Earths fit in the Moon's gap"; 230 million-year galactic year; Laniakea ≈ 500 million ly; the Andromeda merger wording; heliopause ≈ 120 AU.

### Chapter 05 — Black Holes: NOT started
The brief said to continue to Chapter 05 only if Chapter 04's implementation AND verification succeeded. Verification could not run (above), and stacking a second unverified WebGL chapter (accretion disc + lensing shaders) on an unverified one would multiply the risk, so I stopped here. First step next session: `npm ci && npm run typecheck && npm run build`, fix what Chapter 04 shows, look at it in a browser, THEN build Chapter 05 using the seam described above.

## 18. Session log — Chapter 05: Black Holes (2026-10-09)
Scope: Chapter 05 and its seam with Chapter 04. No dependencies added, no asset files. Chapters 01–03 untouched.

### Verification (honest)
- `npm ci` WORKED this session. `npm run typecheck` and `npm run build` pass for Chapter 04 as it was delivered (no fixes were needed) and for Chapter 05 (final run after the last edit). Chunk `BlackHoleScene` ≈ 12 kB (≈ 5 kB gzip).
- Headless Chromium (SwiftShader software GL, via the preinstalled Playwright): shader compiles, no console errors/warnings, no page errors. Seen at 800–1000 px wide: progress 0.03 (Ch04→Ch05 dissolve), 0.10, 0.45, 0.62, 0.68, 0.86, 0.90; 390×844 at 0.86 (before and after the portrait lens fix); `prefers-reduced-motion` at 1000×600 (still frame, unpinned, stacked text). Chapter 04's scene was NOT looked at by eye this session (only compiled and built; its 03→04 dissolve and shaders remain unreviewed).
- NOT checked: real GPU, real frame rate (SwiftShader cannot tell; the shader is heavy per pixel, the governor and pixel budget exist for that reason but are untuned), real phone, touch scrolling, URL-bar resize, human art review. Frames at 0.0, 0.2, 0.3, 0.78, 0.95, 1.0 were not rendered.

### What it is
Pinned scroll scene (1100svh track), directly after Chapter 04. One full-screen fragment shader (`components/canvas/BlackHoleScene.tsx`) ray-traces a NON-SPINNING 10-solar-mass black hole (1 rs = 29.53 km). Rays are stepped backwards from the camera with the Schwarzschild null-geodesic law (a = −1.5·h²·r̂/r⁴, rs = 1, leapfrog, adaptive step); lensing, the shadow (b = 2.598 rs), the photon ring and the multiple images of the disc come from that one rule. Disc: thin, equatorial, 3–12 rs; temperature from the standard thin-disc profile (zero at the ISCO, peak ≈ 4 rs); observed colour and brightness use the real shift g = Doppler (orbital speed √(0.5/(r−1))) × gravitational × camera, so the approaching side is brighter and bluer; blackbody ramp peak 5000 K; surface texture is periodic value noise sheared by differential rotation, two phases cross-faded every 45 s so it never winds up; alpha from an inclination-dependent optical depth. Sky: procedural stars + faint galactic band sampled in the escape direction. The camera is a static observer (local angle → coordinate angle correction included).
Camera path (`lib/blackHole.ts`: `cameraAt`): 3,000 rs → 14 rs (log-interpolated, damped), elevation 5° → 24°, slow orbit 25° → ~120°, 0.11 rad roll. Eight text beats (lensing, disc, beaming, photon ring, event horizon, singularity, scale ladder) with `label / title / line`; annotations (DOM, positioned by the scene each frame from the exact camera): lensed starlight, outer disc, approaching/receding side, ISCO, photon ring, shadow, singularity, and a dashed circle "horizon if light went straight" (1 rs); HUD: live distance (km + rs), true-length scale bar. Last beat has the horizon-radius ladder (Earth 8.9 mm … M87* 128 AU) and "Next · Stars".
Hand-off: `-mt-[100svh]`, publishes `--bh-p` / `--bh-ready`. Chapter 04 now fades its canvas, scrim and TEXT over ~8 % of Ch05 progress (was a ×3000 step; multiplier is now ×12 in `ChapterCosmicScale.tsx`, plus an opacity on its text layer). Ch05's canvas gate ramps in over the first 7 %. Reduced motion / failed WebGL: no vars published, Ch04 unchanged.
`data/journey.ts`: Black Holes `live`. `App.tsx`: `<ChapterBlackHoles />` after Cosmic Scale.

### Performance design
Internal resolution from a pixel budget (high 620k px, low 230k px, DPR ≤ 1.25 / 1), set via `setDpr`; frame-time governor lowers it by 15 % steps when 40-frame average > 26 ms (never raises); step cap 112 / 72; far camera (> 48 rs) skips the straight leg and bends missed rays analytically; escape at 64 rs with an analytic residual bend; renders every frame only while the camera moves, otherwise 24 fps; render loop idles off-screen and the canvas is torn down when far (`useStageLifecycle`). Own canvas is opaque (draws its own sky); the global StarField is hidden behind it while pinned.

### Scientific caveats (stated or visible)
- Non-rotating hole: real ones spin (a Kerr hole has an off-centre, flattened shadow and a smaller ISCO). Disc colours are illustrative (a 10 M☉ disc glows in X-rays); the UI says so. Thin disc only: no thick flow, corona, jets, or the plunging region inside the ISCO. Disc texture and rotation speed are for looks. Photon direction at the disc uses the coordinate ray direction (error grows near the horizon). Lensing of the disc's own light after multiple crossings is traced, but there is no light-travel-time delay.
- The dark disc is the SHADOW, not the horizon; the page says so. Facts: horizon 29.5 km, photon sphere 1.5 rs = 44 km, shadow edge 2.6 rs, ISCO 3 rs = 88.6 km, tidal ≈ 2×10⁷ g over 2 m at the horizon (c²L/rs²), Sgr A* 4.3 M M☉ → 12.7 M km / 0.085 AU, M87* 6.5 B M☉ → 19 B km / 128 AU. Verify per §10.

### Tuning knobs
`lib/blackHole.ts`: `D_KNOTS` / `E_KNOTS` / azimuth formula (camera), `FOV_HALF_TAN`, `ROLL`, beat windows `w`, `NOTES` (anchor kinds are placed in the scene's `switch`; leader offsets `dx/dy`), `HORIZON_FADE`. Scene: shader consts `R_OUT`, `T_PEAK`, exposure (`* 0.8`, `col *= 1.1`), `g^3.5`, star `dens`/brightness in `stars()`, disc texture frequencies, `budget`/`ratioCap`/`uSteps`, lens shift `sx`/`sy`, portrait lens widening `tanH`.

### Known issues / ideas
- Near the end (D < 20 rs) the disc is dim and brownish (gravitational redshift + low elevation); might want a brighter inner edge.
- Camera inside the disc's radial extent has not been tried; the path ends at 14 rs by design.
- Labels were placed by calculation and checked at a few sizes only; collisions at other aspect ratios are possible.
- A spinning (Kerr) option, a flyby of a star being torn apart, and gravitational-wave content are natural follow-ups. Stars/Milky Way/Galaxies ordering still deserves a rethink (§17).
- Nothing has been git-committed; `package-lock.json` still uncommitted.

## 19. Session log — Chapter 06: Observatory (2026-10-09)
Scope: Chapter 06 and its seam with Chapter 05. No dependencies added, no asset files, **no external API** (everything is computed in the browser). Chapters 01–04 untouched. Chapter 05 got one small edit (hand-off, below).

### Verification (honest)
- `npm ci`, `npm run typecheck`, `npm run build` all pass after the final edit. Chunk `SkyScene` ≈ 20 kB (≈ 8 kB gzip).
- Seen in headless Chromium (SwiftShader software GL): shader compiles, no console errors/page errors. Frames viewed: opening (≈ 0.22), mid-reveal (0.45), Galactic-Centre beat (0.55, with the guided time turn), explore state (0.92) at Mauna Kea, a pre-dawn scrub, the Moon selected with its info panel (clock mocked to 2026-10-14), a 390×844 phone, and `prefers-reduced-motion` (1000×640). Frames at 0.0–0.1 (the Ch05→Ch06 dissolve itself) were NOT captured: software GL timed out while Chapter 05's ray-tracer was still mounted, so the dissolve is unreviewed by eye.
- NOT checked: real GPU, real frame rate, touch gestures on a real phone (pinch, horizontal drag vs page scroll), URL-bar resize, the "My location" geolocation flow, sites other than Mauna Kea visually, human art review. Every colour/brightness is a by-eye first pass on one software-rendered display.
- Ephemeris checked numerically against known events (node script, not committed): GMST at J2000; Jupiter opposition (computed 2026-01-10, actual 2026-01-10); Venus inferior conjunction (24 Oct 2026); Saturn opposition (21 Sep 2025); new/full Moon within ≈ 30 min; Polaris declination of date 89.37°; Polaris altitude ≈ site latitude. Catalogue checked for duplicate ids, missing line endpoints, and ten known angular separations (Dubhe–Polaris 28.7°, Vega–Deneb 23.8°, …).

### What it is
Pinned scroll scene (1000svh), directly after Chapter 05. One WebGL canvas drawing a night sky for a real site and time, plus DOM labels and a minimal control strip.
- **Sky (`components/canvas/SkyScene.tsx`)**: stereographic projection of the horizontal sky. One full-screen shader draws the gradient sky, twilight (from the Sun's altitude), airglow, moonlight (halo + wash), the Milky Way (galactic coordinates: band, bulge, noise mottling, dust lanes) and a two-layer horizon ridge. Stars are shader-projected points (148 catalogue stars with real colour from B–V, plus a seeded procedural field of 4,200 / 2,200 fainter stars thickened toward the galactic plane); constellation lines are great-circle-subdivided shader lines. Planets and the Moon are a third point layer; the Moon is phase-correct (illuminated fraction, bright-limb direction on screen, earthshine) and topocentric (parallax).
- **Astronomy (`lib/astro.ts`)**: JPL Keplerian elements (planets), leading terms of Meeus' lunar series, IAU 1976 precession, GMST. Nutation, aberration, refraction, light-time are ignored (< 0.3°). Site list (Mauna Kea default, Paranal, La Palma, NamibRand) + opt-in "My location" via `navigator.geolocation` (browser API, not a network service; prompts only when chosen). Time is local MEAN time from longitude (no tz database).
- **"Sky Tonight"**: `tonight(site, now)` = the sunset→sunrise window (Sun < −0.83°), default 22:00 local mean time. The header shows a live one-line summary (Moon illumination, planets up). A list (md+) shows up to 6 objects above the horizon right now (Moon, planets, then bright stars/deep-sky/Galactic Centre), click = select + turn the view. Recomputed ≈ 1 Hz in React land (`snapshot`), only re-rendered when its key changes.
- **Selected objects / scientific info (`lib/skyInfo.ts`)**: click any named object (hit-test against projected positions, 26 px) or a list row. Panel shows altitude/azimuth (live), magnitude, distance, light-travel time and the year the light left, surface temperature from B–V (Ballesteros), visual luminosity, designation, J2000 position, peak altitude tonight, and a short note. Planets: AU + light-minutes, illuminated %, elongation, angular size. Moon: phase, age, distance, apparent size, magnitude. Galactic Centre: Sgr A* facts consistent with Chapter 05 (4.3 M M☉, 12.7 M km horizon, ≈ 50 µas shadow, ≈ 10¹² dimming by dust).
- **Controls (minimal)**: drag to turn (mouse: both axes; touch: horizontal only so vertical swipes still scroll the page), inertia, pinch / Ctrl-or-⌘ + wheel / − + to zoom (a plain wheel always scrolls the page), arrow keys / +/- / Esc on the focusable sky surface; site select; Play (time-lapse, 900×, stops at dawn; hidden under reduced motion); a dusk→dawn scrubber; Figures and Names toggles. Controls fade in at p ≈ 0.66 and become clickable at 0.68 (`data-explore` on the stage, set by a scroll listener because CSS cannot branch on `--p`).
- **Cinematic transition from Chapter 05**: Ch06's stage pins as Ch05's unpins (`-mt-[100svh]`), publishes `--obs-p` / `--obs-ready`. Ch05 (`ChapterBlackHoles.tsx`, new `HAND_OFF`) fades its canvas, scrim, HUD bar and whole text layer over the first ≈ 8 % of Ch06's progress; Ch06's canvas gates in over the first 7 %. Then, by scroll: exposure rises; stars come on in order of brightness (`uReveal`, dark adaptation; the Milky Way last); the view drops from near the zenith (Alt 84°) and a narrower field widens to the horizon composition. Three text beats (0.05–0.63): "Everything so far was measured from here." / "Let your eyes adjust." / "The black hole is up there." During beat 3, if the person has not touched the view, the night turns (time eases to when the Galactic Centre is highest in the dark) and the camera follows it; a ring marks it. A live caption states where it actually is, or that it is below the horizon.
- Journey data: `observatory` added as Chapter 06 (live) between Black Holes and Stars; Ch05's "Next" link now targets it automatically; the index heading says "Thirteen steps outward."
- Reduced motion / failed WebGL: no pinning, no intro, no time-lapse, no hand-off vars (Ch05 unchanged); the finished sky renders on demand, controls still work; beats stack below.

### Scientific caveats (stated or visible)
- Named stars are real (J2000 positions, magnitudes, colours, rounded distances; several distances carry 10 %+ uncertainty and are marked ≈). The **faint field is procedural, not a catalogue** (the UI says so). Constellation figures are simplified stick figures, not IAU boundaries. Only 148 stars: mid-bright (mag 3–4) real stars are missing, so mid-sky looks sparser than a real sky; a real catalogue (e.g. a bundled Hipparcos subset) is the obvious next step and was not added because it needs a data file.
- The Moon and planets are drawn larger than true at wide zoom (minimum Moon radius 4.5 px; true is ≈ 2 px at the default field); the panel gives the true angular size. Uranus, Neptune, asteroids, comets, satellites, the Sun's glare, atmospheric refraction, light pollution and real weather are not modelled. Saturn's ring-tilt brightness term is ignored. Planet brightness formulas are the standard approximations.
- The Milky Way is a procedural model (band + bulge + noise + lanes), not survey data; its structure is plausible, not accurate. Twilight is a simple colour model.
- Ephemeris is valid for roughly 1800–2050; `Date.now()` is used for "tonight", so a wrong system clock gives a wrong sky.
- Facts to verify (§10): the star notes in `data/sky.ts` (one error was caught and corrected this session — Alkaid is not in the Ursa Major moving group), Mars "seventyfold", Pleiades ≈ 100 Myr, M42 ≈ 24 ly across, Sgr A* shadow ≈ 50 µas.

### Tuning knobs
- Timeline: beat windows `BEATS[].w` in `ChapterObservatory.tsx`; track `1000svh`; `EXPLORE` fade and the 0.68 threshold; in `SkyScene.tsx`: `e` (view drop, 0.04–0.32), `reveal` (0.05–0.40), `expo`, guided window (0.40–0.66), ring window (0.44–0.65). Hand-off: `GATE_IN` (×14) here and `HAND_OFF` (×12) in Ch05.
- Look (shaders in `SkyScene.tsx`): star size/alpha lines in `STAR_VERT`, Milky Way gain (`0.14`), `zen`/`hor` sky colours, twilight terms, ridge shape (`ridgeNear/ridgeFar` in `lib/skyView.ts`, mirrored in GLSL), `uZoom`, label priorities, label reserved boxes (left list / right panel), `NIGHT_SPEED`.
- Data: `data/sky.ts` rows (`label` = priority), `CONSTELLATIONS` (`chain(...)` helper), `STAR_NOTES`, `SITES` in `lib/astro.ts`.

### Known issues / ideas
- Mid-reveal and default-time frames look sparse at 1× DPR; star/Milky Way brightness probably wants a pass on a real display.
- At the default 22:00 in autumn the Galactic Centre is already below the horizon at Mauna Kea; the guided beat handles this by turning the night. At other sites/seasons it may never be up in the dark; the caption then says so.
- Labels are culled greedily by priority with estimated box widths; crowded views can still look uneven. Constellation names and compass letters are best-effort placed.
- The Sky Tonight list is hidden on phones (the header summary and tap-to-select remain). Phone touch gestures are untested on a device.
- Ideas: real star catalogue subset; Uranus/Neptune; Sun/twilight visuals when the scrub range is widened to daytime; rise/set times; a date control; DSO imagery; hand the sky to the Stars chapter.
- Nothing has been git-committed; `package-lock.json` still uncommitted. The next recommended step (§8) is now the Stars chapter, or a real-GPU review of Chapters 04–06.


## 20. Session log — Chapter 07: Star Map (2026-10-09)
Scope: Chapter 07 only. No dependencies added, no assets, no network. Chapters 01–06 untouched except tiny, behaviour-neutral exports (below) and the index heading.

### Verification (honest) — READ FIRST
- **`npm ci` failed in this session (registry unreachable: ENOTFOUND), so there was no `node_modules`. `npm run typecheck` and `npm run build` have NOT been run.** First thing next session: `npm ci && npm run typecheck && npm run build` and fix whatever they report.
- What WAS checked instead: (1) global `tsc` 6.0.3 with this project's strict flags (incl. `noUnusedLocals/Parameters`) over `lib/starMap.ts`, `StarMapScene.tsx`, `ChapterStarMap.tsx`, `JourneyIndex.tsx` and everything they import, using a hand-written **React type stub** outside the repo — clean, but JSX attribute/event types were NOT verified against real `@types/react` (the stub types `input.onChange` only). (2) A node/tsx test of the pure core (projection equals `skyView.project` to 1e-12 px; east is left, north up; flights land exactly and take the short way across 0h; drag/zoom directions; zoom-at-cursor drift; Sirius absolute magnitude 1.4 vs known +1.42; search incl. diacritics; 25 figures valid; Galactic Centre at (266.40°, −28.94°)). (3) The real chapter was bundled with esbuild (React from a global install; no three.js is imported by Chapter 07) and run in headless Chrome 131 (software rendering, no GPU) at 1400×900, 1200×800 reduced-motion and 390×844 touch: intro flight, search → fly-to → selection reticle → panel, drag, ctrl-wheel zoom, `0` reset, constellation select (Crux). No console errors or page errors. Tailwind was NOT available, so those runs used a small hand-written CSS shim: **the real Tailwind styling of the overlays/panel has not been seen**; only the canvas is representative.
- Performance: in that software-rendered run a continuous drag averaged ≈ 23–27 ms/frame (73 of 162 frames > 33 ms). That is CPU-only canvas; a real GPU-accelerated canvas should be faster, but it is **unmeasured on real hardware**. If it is slow, lower `fieldCount`/`deepCount` (ChapterStarMap) first.
- Not checked: real GPU/display, touch pinch/drag on a real phone, `prefers-reduced-motion` toggled at runtime, the Ch06 → Ch07 scroll seam in the full page, Tailwind output of the new markup, human art review.

### What it is
Not pinned: a ~88svh instrument between a heading block and a footnote. After a night spent at one site (Ch06), the same catalogue is laid out as a chart of the whole equatorial sphere (J2000 RA/Dec, stereographic, north up, **east left**, as the sky looks from inside).
- **Reused (not duplicated):** `data/sky` (148 stars, 7 deep-sky objects incl. Sgr A*, 25 figures, notes), `buildStars` (catalogue colours + seeded faint field), `slerp`/`mulberry32`/`starTint`/`bvToKelvin` (skyGeometry), `tanQuarter` (skyView), and the formatters/`luminosity`/`starNote` in `skyInfo`. Exports added for this (no logic changed): skyInfo `group, fmtLy, fmtRa, fmtDec, luminosity, fmtSuns, starNote`; skyGeometry `slerp, mulberry32`. `lib/starMap.ts`' `projectTo` is a trig-free restatement of `skyView.project` (identical output, tested) so ~20k+ stars can be projected per frame.
- **Renderer (`StarMapScene`)**: 2D canvas, on-demand (renders only while moving, settling, or first-visible; idle otherwise). Smooth Milky Way (per-cell inverse projection → galactic b/l → brightness incl. bulge, mottling, dust lane; procedural, not survey data); graticule with RA/Dec labels whose step follows zoom; optional ecliptic; faint field splatted additively into one pixel buffer (≥ 22° field) or drawn star by star (closer); a second **deep procedural layer** (mag 6.4–10, built lazily on first zoom-in) so zooming reveals more stars; constellation figures as great-circle polylines (selected figure highlighted); catalogue stars with real colour + glow; deep-sky symbols (open cluster/nebula, galaxy, globular, Galactic Centre); greedy collision-culled labels by priority and zoom (names, designation + magnitude when close, constellation names last); selection reticle that settles in; hover ring; scale bar + field readout.
- **Interaction**: drag to pan (with inertia), pinch, Ctrl/⌘+wheel or wheel once the map has focus (a click) to zoom at the cursor (plain wheel scrolls the page until then), `+ − 0 Esc` and arrow keys (Shift = bigger), zoom/home buttons, click a star, deep-sky object or constellation name. Selection and search **fly** there along a great circle with a zoom-out arc scaled to distance (0.9–2.4 s); reduced motion jumps instead. Opening flight: whole sky → Orion/Taurus (3.8 s), once per page (`ctrl.introPlayed`; the canvas is torn down when far away by `useStageLifecycle`).
- **Info panel** (`describeObject`, time-independent): apparent and absolute magnitude, distance, the year the light left, luminosity (visual), surface temperature (B–V), spectral class, designation, J2000 position, note, plus a **Hertzsprung–Russell diagram** (148 stars, selected one ringed) and a link to its constellation. Constellation panel: its stars **nearest first with log-scale distance bars** — the figure joins stars that are nowhere near each other. Search covers 25 figures and 155 objects.
- Journey: `star-map` inserted as entry 7 (live) before the planned `stars` entry; index heading now "Fourteen steps outward"; Ch06's "Next" link points here automatically.

### Scientific caveats (stated in the UI footnote)
- Named stars are real data with rounded distances (several ≥ 10 % uncertain). **Luminosity is visual, not bolometric**: very hot and very cool stars are understated (Betelgeuse shows ≈ 17,000 × Sun; bolometric is several times higher). Only 148 stars exist, so mid-bright (mag 3–5) real stars are missing and the field (22k/9k procedural + 110k/30k deep) is texture, not a catalogue. Figures are simplified stick figures. Deep-sky objects are drawn as symbols, not at true angular size. Milky Way is a procedural model.

### Tuning knobs
`HOME`, `INTRO_FOV`, `FOV_MIN/MAX` (starMap.ts); flight timing in `flyTo`/`stepView`; `limMag`, `deepLim`, `labelFloor`, `MW_CELL`, Milky Way coefficients in `drawMilkyWay`, star size `sizeOf`, field brightness in `drawField` (StarMapScene); `fieldCount`/`deepCount` by tier (ChapterStarMap); label priorities in `data/sky.ts`.

### Known issues / ideas
- Run the real build (above). Review overlay styling and the Ch06→Ch07 seam by eye. Profile on a real GPU.
- Zooming into empty sky is still sparse at 4° (~45 faint stars): raise `deepCount` if wanted. Plain-wheel zoom needs a click first (deliberate, to avoid trapping page scroll); the hint says so.
- A real catalogue subset (Hipparcos/Yale BSC) would make the field real and enable selecting faint stars; needs a data file. Ideas: proper motion / "sky in 100,000 years", spectral-type filter, magnitude slider, line-of-sight "depth" view of a figure, link the Stars chapter to the HR diagram.
- Nothing git-committed; `package-lock.json` still uncommitted.


## 21. Session log — Chapter 08: Deep Space (2026-10-10)
Scope: Chapter 08 only. No dependencies added, no asset files, no network/API at runtime. Chapters 01–07 untouched except `data/journey.ts` (entry moved/made live) and `App.tsx`.

### Verification (honest)
- `npm ci` worked. At the START of the session `npm run typecheck` and `npm run build` passed on the delivered Chapter 07 with no changes (resolves §20's warning). After Chapter 08, typecheck and build pass (final run after the last edit). `DeepSpaceScene` chunk ≈ 18.5 kB (≈ 6.8 kB gzip).
- Headless Chromium (SwiftShader software GL): shader compiles, no console errors/warnings, no page errors. Frames seen at 1280×720 / 960×560: progress 0.05, 0.25, 0.40, 0.55, 0.62, 0.70, 0.82, 0.90, 0.97–0.99 (converged system view); atlas top, planet panel (HD 209458 b), detection scope (Kepler-186 f); 390×844 phone at 0.99; `prefers-reduced-motion` (unpinned, stacked beats). Software GL runs ~1–2 fps, so the damped follow of scroll lags in stills; screenshots need long waits.
- NOT checked: real GPU / real frame rate (the sky fragment shader does ~6 four-octave noise evaluations per pixel; if heavy, cut octaves or render it at lower resolution), real phone touch, mobile URL-bar resize, cursor look-around feel, the Ch07→Ch08 scroll seam on a real display (Ch07 is not pinned; Ch08's stage simply scrolls in over a black frame), play/scrub in the detection scope under real input, human art review.

### What it is
**Pinned flight (1200svh, `ChapterDeepSpace` + `DeepSpaceScene`).** One canvas, ≈ 14 draw calls, no depth buffer: a custom analytic pinhole camera in every shader (so the near plane is irrelevant). World unit = light-year, equatorial J2000 frame, Sun at the origin. The camera flies a straight line from the Sun to **Kepler-186** (RA 19h54m, Dec +44°, 580 ly), always looking at it. Progress → remaining distance is log-interpolated through `D_KNOTS` (580 ly → 1.4 AU), so one scroll covers ~9 orders of magnitude. Positions are computed in float64 in JS and handed to shaders camera-relative (the star's system is positioned by `uSys = target − camera`), which keeps a 1.5 AU view stable 580 ly from the origin.
- Layers (render order): sky (galactic-coordinate band, bulge, dust lanes, hydrogen/oxygen/reflection emission; procedural) → deep-field galaxies (260/130 point sprites, spiral/elliptical in the fragment shader, rejected inside |b| < 11°: the zone of avoidance) → 4 nebula billboards at real RA/Dec/distance/size (North America 2,590 ly, Veil 2,400 ly, Crescent 5,000 ly, Dumbbell 1,360 ly; textures procedural, drawn ≈ 2× true angular size) → stars → the Kepler-186 system (habitable-zone annulus, 5 orbits, star glow, 5 planets).
- Stars: all catalogue stars with a distance (`data/sky.ts`, the same 148 as Chapters 06–07) at TRUE 3D positions and real absolute magnitudes; the 7 other exoplanet hosts at true positions; plus ~23k/11.5k generated stars in three shells (thin-disc geometry, scale height 120–260 ly, galactic frame). Apparent brightness is computed per frame from absolute magnitude and distance, so stars brighten/thin as you pass them (parallax). Kepler-186 itself is 14.9 mag from the Sun: it stays invisible until ≈ 30 ly out, so a guide ring + label marks it.
- Kepler-186 system: periods/radii from Quintana 2014 / Torres 2015; semi-major axes COMPUTED from the periods (Kepler's third law, 0.48 M☉); habitable zone from L = 0.041 L☉ with flux limits 0.9 / 0.25 (approximate). Orbits true scale, planets NOT (min 5–7 px dots); one second = one day (`DAYS_PER_SECOND`). Final view 1.4 AU out, 31° above the orbital plane.
- Camera extras: slow 17° look-up out of the disc during beat 4 (`lift` in `poseAt`), cursor look-around ±2.6° yaw / 1.6° pitch (fine pointers only, damped), lens shift right on wide screens, up on portrait; label DOM positions are written by the scene each frame (`data-ds-label`, `data-ds-planet`, `data-hud`); labels avoid the lower-left text block.
- Six text beats (`BEATS`): interstellar space/Local Bubble, the neighbourhood (Proxima, Voyager 75,000 yr), looking back in time, beyond the disc (galaxies), Kepler-186, the system to scale + link to `#exoplanets`. HUD: distance from the Sun, distance to Kepler-186 (ly, then AU).
- Reduced motion / failed WebGL: no pinning, no flight, no orbit motion; one still of the system (`P_STILL` = 0.98) above the stacked beats.

**Exoplanet atlas (`ExoplanetAtlas`, DOM/SVG, id `#exoplanets`).** Timeline of nine milestones (1992 pulsar planets → 2025 six thousand); detection-method bars (NASA Exoplanet Archive tally: transit 4,653, RV 1,186, microlensing 278, imaging 97; total 6,298 — rounded, fetched 2026-10); eight worlds (Proxima b, TRAPPIST-1 e, 51 Peg b, HD 209458 b, HD 189733 b, 55 Cnc e, Kepler-186 f, K2-18 b), each with distance, discovery year/method, orbit (AU computed from period + host mass), radius, mass, temperature, four facts and who found it. Interactive: tabs ↔ a log-radial distance map (angle = RA, rings 10/100/1,000 ly) ↔ panel; artist's-impression SVG sphere; size-next-to-Earth; a **detection scope** (transit light curve with depth = (Rp/Rs)², duration = P/π · Rs/a; or the reflex-velocity curve with the real K), scrub + play (play only on screen, hidden under reduced motion).

### Scientific caveats (stated in the UI footnote unless noted)
- Real: positions, distances (rounded; several revised between papers and marked ≈), discovery years, periods, radii, masses, nebula positions/sizes, catalogue stars. Generated: faint stars, sky glow, nebula and galaxy textures. Galaxies and nebulae are drawn larger than life (stated). Planet "looks" are artist's impressions built from type and temperature.
- Distances to verify per §10: 51 Peg 50.6 ly, HD 209458 159 ly, Kepler-186 580 ly (was ≈ 500 in 2014), K2-18 124 ly, Veil/North America ≈ 2,400/2,590 ly, Crescent ≈ 5,000 ly; Kepler-186 star Teff 3,788 K, L ≈ 0.041; K2-18 b JWST claims are contested (wording is deliberately cautious); equilibrium temperatures are approximate; the transit/RV numbers (e.g. 51 Peg K = 55.9 m/s, Proxima K ≈ 1.2 m/s) are from memory of the discovery papers.
- The flight is a straight line to one star; nothing is on the route except what really lies near it. The speed is not a physical speed (the scroll is the clock).

### Tuning knobs
`lib/deepSpace.ts`: `D_KNOTS` (distance vs scroll), `P_SWING`, `FINAL_ELEV`/`FINAL_AZ`, `lift`, beat/label windows `w`, `NEBULAE` (gain/size/mode/palette), `EXOPLANETS` text. `DeepSpaceScene.tsx`: star brightness in `STAR_VERT` (limit magnitude 10, gain ×1.5, size 1.5–8 px), sky glow constants in `SKY_FRAG`, `uNeb`/`uGal` ramps, galaxy size/brightness in `buildGalaxies`, star counts in `buildStars`, lens `FOV_BASE`, `shiftX/shiftY`, nebula `uHalf` (× 1.25 of size), `P_STILL`. `ExoplanetAtlas.tsx`: `PALETTE`, `PlanetSphere`, the scope plots.

### Known issues / ideas
- Opening frames are deliberately sparse (Local Bubble) and may read too dark on a bright display; raise `uNeb` floor / star gain if so. On narrow phones the planet-f label can touch the right edge.
- The sky shader is the heaviest part; no frame-time governor (unlike Chapter 05). Nebula billboards share one fbm-based fragment shader.
- `Search for Life` (planned) now overlaps with the atlas; decide whether to re-scope it (biosignatures / habitable zone / JWST) or fold it in.
- Nothing git-committed; `package-lock.json` still uncommitted.

## 22. Session log — Chapter 09: Search for Life (2026-10-11)
Scope: Chapter 09 only. No dependencies added, no assets, no runtime network. Touched existing files: `data/journey.ts` (search-for-life moved to position 9 and made `live`, new scale/summary; same precedent as Black Holes in §17) and `App.tsx` (renders `ChapterSearchForLife` after Deep Space). Chapter 08's "Next" link now points here automatically (it reads `journey.ts`). Chapter 08's atlas already covered discovery methods and eight worlds, so this chapter does NOT repeat them: it covers habitability, comparison with Earth, atmospheres/biosignatures, evidence and odds.

### Verification (honest)
- `npm ci`, `npm run typecheck`, `npm run build` all pass after the final edit (main chunk ≈ 441 kB, 143 kB gzip; no new chunk, no three.js in this chapter).
- Headless Chromium (SwiftShader): no page errors; opening seen at 5/30/50/70/97 % progress; every instrument rendered and clicked once (zone lab at Proxima, candidates at K2-18 b, spectrum Earth + Early-Earth presets, ladder, odds); 390×844 reduced-motion page: no errors, no horizontal overflow.
- Model numbers were checked by script against published values: Sun conservative zone 0.99–1.71 AU, TRAPPIST-1 0.026–0.051 AU, Proxima 0.043–0.083 AU (Proxima b flux ≈ 0.66), Earth transiting the Sun ≈ 1 ppm, null-survey bound 11 % for 25 planets / 3 % for 100.
- A bug found and fixed in review: the odds text said "one in 10⁻¹¹" (inverted); now "one in ≈ 6 × 10¹⁰".
- NOT checked: real GPU/phone touch, a human art review, the slider feel on real input, keyboard walk-through beyond focus rings, screen-reader pass. Ch08→Ch09 seam is a plain scroll (Ch08's atlas ends, Ch09's pinned stage begins).

### What it is
- **Opening (pinned, 420svh, `ChapterSearchForLife`)**: one SVG diagram of the inner Solar System; Earth's orbit draws itself, the other orbits and the Sun's habitable zone fade in, Mars is marked "inside the zone, still a frozen desert". Four text beats; driven by CSS `--p`, no React renders. Reduced motion: unpinned, finished diagram above stacked text. Stats strip: 6,200+ confirmed planets · 1 known to host life · 0 biosignatures confirmed elsewhere.
- **HabitableZoneLab**: slider/presets from TRAPPIST-1 to an F5 star; zone from the Kopparapu et al. (2013) fit (conservative + optimistic), Earth's 1 AU always drawn, real planets shown when snapped to their star.
- **EarthComparison**: flux-vs-radius diagram of 8 candidates (Proxima b, TRAPPIST-1 e, LHS 1140 b, TOI-700 d, Kepler-186 f, Kepler-442 b, K2-18 b, 55 Cnc e) with Earth, Venus, Mars, Mercury; the shaded zone is the selected planet's own star's; comparison table; "air so far", measured vs not measured. Shares measurements with Chapter 08 via `EXOPLANET_BY_ID`.
- **SpectrumLab**: schematic transmission spectrum (real band centres, illustrative depths) for 4 planets × 6 atmospheres, per-gas toggles, cloud slider, "transits stacked" slider that scales simulated noise as 1/√N; the amplitude scale is computed (2·Rp·5H/Rs²); live interpretation (O₂/O₃ + CH₄ disequilibrium, abiotic false positives, clouds, S/N).
- **EvidenceLadder**: six-rung ladder + five claims that did not hold (ALH 84001, Mars methane, Venus phosphine, K2-18 b DMS, Perseverance's Cheyava Falls rock); hover lights the rungs a claim reached.
- **OddsLab**: Poisson arithmetic, N = stars × η × f, with f the single unknown (10⁻²⁰…1); break-even ≈ 10⁻¹¹; plus what a null survey could rule out (95 % bound ≈ (1 − 0.05^(1/N))/efficiency). Explicitly framed as assumptions, not predictions.
- **Closing**: "Nothing has been found. That is the starting position." plus six next steps (JWST rocky-worlds programme, PLATO, Ariel, ELT, Habitable Worlds Observatory, Europa Clipper/JUICE/Dragonfly).

### Scientific caveats (stated in the UI footnotes unless noted)
- No claim of extraterrestrial life is made anywhere; the status strip and closing footnote say so.
- Fluxes/zone status are COMPUTED from periods, host masses and luminosities, so they can differ ≈ 20 % from papers (e.g. Kepler-186 f computes to 0.27 S⊕ vs ≈ 0.3 in Ch08's text; K2-18 b to 1.0, "optimistic zone only"). Equilibrium temperatures here use Earth-like albedo (0.3); Chapter 08 cards quote some with zero albedo, so they differ by design.
- Zone fit is valid for 2,600–7,200 K; TRAPPIST-1 (2,566 K) is clamped and flagged.
- Spectrum heights and the 100 ppm single-transit noise are ASSUMPTIONS, not retrievals. "~5 scale heights" is a rule of thumb.
- Verified by web search 2026-10: K2-18 b DMS/DMDS (3σ claim 2025; independent re-analyses find insufficient evidence); TRAPPIST-1 e (JWST argues against a thick H₂ or CO₂ atmosphere; bare rock vs thin N₂ unresolved; ~15 more transits); PLATO launch now targeted for 2027. FROM MEMORY, please verify: LHS 1140 b (R 1.73, M 5.6, JWST N₂ hint), TOI-700 d and Kepler-442 b parameters and distances, the JWST 500-hour Rocky Worlds programme (wording is "hundreds of hours"), Ariel/ELT/Dragonfly/Europa Clipper/JUICE dates, HWO "around twenty-five" planets, the η range 0.1–0.9, ALH 84001 / Mars methane / phosphine / Cheyava Falls status wording, and the "rung" each claim stalled at (an editorial reading, labelled as such).

### Tuning knobs
`lib/searchForLife.ts`: `STAR_PRESETS`, `WORLDS` (add a world = one `makeWorld`/`fromAtlas` entry), `COMPOSITIONS` (mu, reach, gas strengths), `BANDS`, `SINGLE_TRANSIT_NOISE_PPM`, `SCALE_HEIGHTS_SPANNED`, `STAR_DENSITY_PER_LY3`, `LADDER`, `CASES`, `NEXT_STEPS`. `ChapterSearchForLife.tsx`: `PX_PER_AU`, `ORBITS` angles, beat windows, track height (420svh). `OddsLab.tsx`: slider ranges/defaults.

### Known issues / ideas
- The flux–radius chart is small in its column and the "≈ 1.6 R⊕" label crosses a few points; gas labels in the spectrum can nearly touch (H₂O 2.7 / CH₄ 3.3).
- Chapter 09 sections are plain page flow (no scene hand-off); a visual bridge from Ch08's Kepler-186 flight into the zone lab would be nice.
- Index chunk grew (Ch09 is eagerly bundled); could `lazy()` the five instruments if first-load matters.
- Nothing git-committed; `package-lock.json` still uncommitted. Real-GPU/phone review of Chapters 04–09 remains the biggest open item.
- Next chapters: Stars, Milky Way, Galaxies, Humanity, Universe (numbered 10–14 in the journey).

## 23. Session log — Chapter 10: Humanity (2026-10-12)
Scope: Chapter 10 only. No dependencies, no assets, no runtime network. Touched existing files: `data/journey.ts` (humanity moved to position 10, made `live`, new scale/summary — same precedent as §17/§22), `App.tsx` (renders `ChapterHumanity` after Search for Life), `styles/index.css` (one class, `.hum-in`, a 0.5 s fade-up for text that swaps during scroll). Chapter 09's "Next" link now points here automatically. Chapter 10 imports `Note`, `SectionHead`, `Slider`, `focusRing` from `sections/life/ui.tsx` (Chapter 09's shared bits; extract to a neutral folder if a third chapter needs them). Nothing from Chapters 01–09 was edited.

### Verification (honest)
- `npm run typecheck` and `npm run build` pass after the final edit (there is no `lint` script). Main chunk ≈ 500 kB (it was ≈ 441 kB after Ch09); the `three` chunk is unchanged and still triggers Vite's size warning, as before.
- Headless Chromium (SwiftShader), served with `vite preview`: no page errors or console errors in any run. Seen at 1440×900 at 0 / 20 / 50 / 75 / 93 / 98.5 % of the pinned stage, at 390×844 at 0 / 30 / 62 %, the chart, the address, the open list, and a reduced-motion page. Clicked: Next / Prev buttons (15→16→15), ArrowRight with focus in the stage, a node click (landed on Apollo 11), a minimap click (50 % along the true-scale line → Aristarchus), the chart year slider (1925 → "Andromeda" seen, nothing sent), reduced motion (not pinned, list open, 54 items).
- Defects found by looking and fixed: map label crossing the header rule; the phone layout (HUD collided with the event text, header wrapped, ruler labels unreadable → HUD and ruler labels hidden on phones, map smaller, active label scaled up); chart's left margin clipped "Galactic centre" and the "1970 → 2026" note overlapped the end label; the address ring label clipped at the top; in reduced motion the header rendered below the map and the map labelled the last event as "current"; Moon distance formatted as 384,000 km instead of 384,400.
- NOT checked: a real GPU / real phone touch (momentum scrolling through a 1250 svh pinned track is the main thing to feel), a human art review, a screen-reader pass (the list is the intended accessible form; the pinned stage has no live region), Safari/Firefox (CSS `transform-box: fill-box` on SVG circles and `calc()` on custom properties are used; both are standard, but only Chromium was run), landscape phones and very short laptop screens (720 px height was not tried).

### What it is
- **The stage (`ChapterHumanity`, pinned, 1250 svh)**: scroll moves through 54 events in five eras (I Looking up c. 3200 BCE–1000 CE · II Measuring 1543–1929 · III Leaving 1944–1998 · IV The present 2005–2026 · V Next). Event spacing on the sliding axis is ordinal (equal), NOT proportional to years, and the page says so: a **true-scale minimap** above it (3200 BCE → 2050) shows that everything after Sputnik is ≈ 1.3 % of the line; click it to jump. Event kinds have different glyphs (seen ○, sent-machine ◆, sent-people ●, lost |); future events are dashed and carry a status tag (Projected / Planned / Proposed).
- **The reach map (`humanity/ReachMap`)**: distance from Earth on a log scale (100 km at the centre, the visible edge at the rim). Three circles grow with the records (dashed = seen, white = machines, blue = people); each event leaves a dot at the distance it reached; a ruler of landmarks (Moon, Sun, Neptune, heliopause, nearest star, galactic centre, Andromeda, visible edge) runs up the vertical axis; a readout shows the current three records.
- **"Where are we?"** shows the answer in force at the current event (8 answers: the centre → a planet → beside one star → the galaxy's suburbs → one galaxy of many → a small planet seen from outside → one world among many → "still being written").
- **Controls**: scroll, Prev/Next, ←/→ while focus is in the stage, click an axis node, click the minimap. Reduced motion: no pinning, finished map, open list. A collapsible "read as a list" with all 54 events is always present.
- **10.1 How far (`ReachChart`)**: step chart of the three records 1600–2026 on a log axis (time axis stretches at 1900, marked), series toggles, a year scrubber with readouts. The point: seen reached the visible edge by 1965; people have been at the Moon since 1968, and only 1.6 % farther since 1970 (Artemis II, 406,770 km, vs Apollo 13, 400,171 km).
- **10.2 The address (`Address`)**: seven rungs (Earth, Solar System, Orion Spur, Milky Way, Local Group, Laniakea, observable universe), each with when/who/how it was learned, and a nested log-scale ring diagram.

### Facts checked by web search, October 2026 (state of the world as of 12 Oct 2026)
Artemis II flew 1–10 April 2026 and set the distance record on 6 April (≈ 406,771 km); Artemis III has been re-planned as a 2027 low-Earth-orbit docking test (crew named June 2026) and the first landing is now targeted for Artemis IV in 2028; Voyager 1 is projected to reach one light-day (≈ 173 AU) on 18 Nov 2026; Roman Space Telescope launched 30 Aug 2026 (Falcon Heavy), first images expected early 2027; ISS deorbit planned ≈ 2030–31, first commercial stations slipping (Haven-1 ≈ 2027); China's stated goal is a crewed landing before 2030.
FROM MEMORY, please verify: Dragonfly launch 2028 / arrival 2034; Europa Clipper arrival 2030; every historical date and figure not listed above (e.g. Mariner 2 at ≈ 58 million km from Earth, Pioneer 10 crossing Saturn's / Uranus's / Neptune's orbits in 1976 / 1979 / 1983, Gemini 11 ≈ 1,370 km, Apollo 8 "at the Moon" ≈ 380,000 km, Voyager 1 passing Gliese 445 at ≈ 1.6 ly in ≈ 40,000 years, the Orion Spur 1952 mapping, Laniakea 2014, the Shapley/Leavitt wording, Eratosthenes' accuracy, al-Ṣūfī as the earliest surviving description of Andromeda). NOT verified at all: the current state of Starship and Mars plans — crewed Mars is therefore shown as "Proposed", no date, and the footnote says so. I did not use Chang'e-7's date (sources conflicted).

### Simplifications (stated in the closing footnote)
Each dot sits at ONE representative distance (a planet at its orbital distance from the Sun unless a better Earth distance was known; "Seen" uses light-travel distance for galaxies and the ≈ 46-billion-ly comoving radius for the microwave background). The machine record uses distance from Earth at encounter before 1976 (a lower bound) and distance from the Sun after. The true-scale line ends at 2050; the Gliese 445 event pins to its edge. Some dots overlap heavily near the centre (a dozen events happened in low Earth orbit); that is intended.

### Tuning knobs
`lib/humanity.ts`: `EVENTS` (add an event = one object; `at` is the distance in metres or null; keep `year` ascending), `ANSWERS` (`from` = an event id), `SEEN` / `MACHINES` / `PEOPLE` (must stay sorted by year and non-decreasing in distance), `LANDMARKS`, `RUNGS`, `TODAY`. `ChapterHumanity.tsx`: `P0` / `P1` (where the first / last event sit in scroll progress), `TRACK_SVH` (1250 ≈ 21 svh per event), `GLOW` (era colours). CSS vars on the track: `--gap` (axis spacing per event) and `--ph` (playhead x), set responsively by Tailwind classes.

### Known issues / ideas
- 1250 svh is long; if it feels slow, cut events (the "1998–2012" gap is deliberate and thin) or lower `TRACK_SVH`. Fast flicks can pass several events in one frame; the Prev/Next buttons are the precise control.
- The stage uses `scroll` listeners + `setState` only when the active index changes; there is no `aria-live` region on purpose (it would announce on every scroll step).
- The map's "Neptune" and "edge of the Sun's wind" rings are 9 user-units apart and their labels alternate sides to avoid overlap; on a very small map they are close.
- Humanity ↔ other chapters: the Pale Blue Dot, Voyager and Apollo 8 events would benefit from a visual hand-off to/from Chapters 02–03; the Habitable Worlds Observatory node duplicates Chapter 09's closing list on purpose (different framing).
- Nothing git-committed; `package-lock.json` still uncommitted. Real-GPU/phone review of Chapters 04–10 remains the biggest open item.
- Next chapters: Stars, Milky Way, Galaxies, Universe (numbered 11–14 in the journey).
