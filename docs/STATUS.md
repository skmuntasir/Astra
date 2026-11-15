# Final series - step 5c (extra content + final timeline)

## Summary
DONE: (1) Voyager 1 + 2, (2) Orion Nebula + Crab Nebula/Pulsar, (3) Sagittarius A* (marker + panel), (4) the last zone "Looking back" (cosmic timeline, 350 svh) before the end card. Total main path now 3650 svh. Textures: NONE added (reuses `cmb-color` and `galaxy-irregular`); `public/textures` and docs/TEXTURE_REPORT.md are byte-identical to 5b.

### Memory report before / after (docs/TEXTURE_REPORT.md, unchanged files)
| | before (5b) | after (5c) |
|---|---|---|
| desktop GPU MB (est.) | 728.39 (limit 750) | 728.39 |
| mobile GPU MB (est.) | 328.39 (soft 300, already over) | 328.39 (not grown) |
New objects are particles/shaders only: sprite geometries (Orion ~16k, Crab ~12k, Sgr A* ~0.5k, disc ~10k points; scaled by quality tier 0.4/0.7/1.0), a ~12-mesh spacecraft, one full-screen triangle shader. Vertex memory is a few MB.

### What was built
- `src/zones/content/` data.ts (all numbers, // VERIFY), craft.ts (Voyager geometry + shader, no scene lights), Voyager.tsx, Nebulae.tsx (Orion / Crab+pulsar / Sgr A* / labels), info.ts (panels into FOCUS_INFO), index.ts (registration). Engine additions (additive): `addZoneObjects`, `addZoneBeat` in journey.ts; `Overlay.suppressed` in solar/overlay.ts.
- `src/zones/looking/` model.ts (pure: beats, log axis with ONE drawn scale break, stage weights), Fx.tsx (full-screen layer 'tl-fx' + protoplanetary disc 'tl-disc' + growth of the REAL Sun/Earth/Moon objects), Hud.tsx (time readout, ruler, "Theory, not directly observed" label), index.ts (zone + camera keys).
- Edits to finished work (all small, all needed by the new last zone): multiverse beat m-5 now fades out at l 0.99-1.05 (was 1.2-1.3); Sphere.tsx/Multiverse.tsx multiply their opacities by `lbKeep()` so the universe sphere and bubbles dissolve under the timeline's white-out (no pop); UniverseHud: the hypothesis chip is multiverse-only (hidden for l > 1) and the end card moved to the end of Looking back; `stepSolar()` forces simulated day 0 inside Looking back (Earth then sits at the origin = the hero view; the real objects are hidden until the late part, so the reset is invisible); the zone menu/rail/link ids come from the registry automatically; zoneInfo copy and an audio mood were added for 'looking-back'.

### Decisions, honestly
- Sgr A*: MARKER + panel + S-star swarm with S2's real orbit shape/period (time sped up, panel says so). NOT the Kerr renderer in focus: a third full-resolution tracer (or re-pointing the M87 one) could not be proven hitch-free without a real GPU. The panel mentions the /bh-lab Sgr A* preset (labelled simulation, spin unconstrained).
- Voyager positions: directions are approximate (Heavens-Above / theSkyLive RA-Dec, parallax <= 0.4 deg). Distances: NASA/JPL says Voyager 1 is exactly one light-day (25,902,068,356 km) FROM EARTH on 2026-11-18 10:16:07 UTC; heliocentric 172.4 AU at that epoch is DERIVED by me (Earth ~1 AU off), Voyager 2 144.3 AU likewise derived; both propagated at constant speed (3.569 / 3.219 AU/yr) to the date the page is opened (clamped to >= 2026-06-01). Error: a few tenths of an AU. The page says "estimated". The light-day ring is centred on the Sun (Earth is 1 AU off-centre: 0.6%).
- Camera in Beyond was NOT changed: the Voyagers are on screen for roughly local 0.19-0.35 while the camera pulls back through 100-1000 AU (checked numerically and in a screenshot); a beat "Voyager 1 and 2" (local 0.15-0.34) points at them.
- The timeline axis: log10(seconds since the Big Bang) up to the Sun's birth, then log10(years before today) (a single log axis cannot show the last 300,000 years). The break is drawn on the ruler and stated in the zone notes.
- Early-universe visuals (plasma, inflation lattice, nuclei, dark ages, star/galaxy fields) are procedural illustrations; the CMB is the project's simulated map (not Planck data). The Sun/Earth/Moon shown for 4.6 Gyr ago are today's, grown into place (the beat says so).

### // VERIFY list (5c)
Voyager: RA/Dec of both probes, derived heliocentric distances (172.4 / 144.3 AU), speeds, heliopause crossing distances (121 / 119 AU), Voyager 2 "one light-day around 2035" (my arithmetic: 173 AU at 3.2 AU/yr from 144 AU in 2026 = ~2035; unverified). Crab: pulsar period 33.8 ms (grows ~13 microseconds a year), 11 ly, 1,500 km/s, "about three weeks in daylight" (SN 1054 record). Orion: 1,344 ly (measurements range ~1,260-1,350), "~2,000 Suns" of gas, 24 ly. Sgr A*: 4.3 million Suns, horizon ~25 million km, ring 52 microarcsec, S2 a ~ 1,000 AU / 16.05 yr / periapsis ~120 AU. Timeline: Planck time 5.4e-44 s; inflation window 1e-36..1e-32 s and factor "at least ~1e26" (the beat says "a huge factor"); BBN 3-20 min, ~25% helium; CMB ~380,000 yr, 3,000 K; first stars 100-200 Myr (models) and JWST ~300 Myr; peak star formation z~1.9 (age from the project's cosmology constants), "about ten times today's rate"; Solar System 4.57 Gyr, Earth 4.54 Gyr; oldest widely accepted life ~3.5 Gyr (chemical hints 3.7-3.8 Gyr debated); Homo sapiens ~300,000 yr; "written history under 6,000 years". Web-checked in this session: Crab/Orion/Voyager light-day facts only (search snippets); the rest are from memory.

### Tests (what was actually run)
- RAN and PASS: `npx tsc --noEmit`, `npm run build`, `tests/path.test.ts` (seams, per-step bounds incl. the new zone; max dAngle 0.050 deg right at the limit: see NOTE), `tests/content.test.ts` (new: Voyager numbers, light-day line, nebula distances, pulsar slow-down, seam multiverse -> looking-back, LOOP last key == Earth hero key, beats, readout monotonicity, stage weights, no "Hypothesis" wording), `tests/link.test.ts`.
- RAN (software GL / swiftshader, NOT a real GPU): screenshots by hand of Voyager focus, Orion, Crab, Sgr A*, the Voyager overview, Milky Way labels, and timeline stages: Big Bang, inflation, nuclei, CMB, peak, Sun/disc, life, humans, final frame (= Earth hero, verified side by side). `tests/e2e_content.py` (new) was started in the background; see the result block at the bottom of this section.
- NOT run: tests/e2e_universe.py (patched for the new last zone, not executed), the 390x844 pass, audio tests, every real-GPU question (frame rate, compile hitches, the "no hitch" claim for sprite counts), the other pre-existing e2e scripts after my edits. Preloader warm-up: the two new shaders (craft, tl-fx) are drawn once under `cam.solo` (patched late in the session, see below); not exercised on a real GPU.
- NOTE path test: the angle bound is 0.05 deg per 0.03 svh and the worst step is ~0.050 (it passes); it is the multiverse-to-hero rotation spread over the whole zone. If a later session lengthens/shortens the zone, re-run it.

### e2e result (tests/e2e_content.py, 1440x900, software GL, NOT a real GPU)
Ran to the end: Voyager 1/2 labels + focus + return, Orion/Crab/Sgr A* focus + return, all 11 timeline stages (no hypothesis chip in any), theory label during inflation and gone after, end card, restart to Earth, no console errors. One check failed ("4.6 billion years ago" text at the Sun beat): the HUD polls at 110 ms and is starved in software GL; a targeted retry check found the text within 2 s, and the e2e now retries (the patched e2e was not re-run in full). NOT run: the 390x844 pass, tests/e2e_universe.py (patched, unexecuted), audio tests, real-GPU anything.
Final state: tsc OK, build OK, path.test OK (dAngle 0.050 right at its 0.05 limit), content.test OK, link.test OK.

### Known issues / for the QA prompt
- The software-GL screenshots needed ~10 s settle time after a jump; frame times there are seconds, so any "hitch" conclusion needs a real GPU.
- In Looking back, the Earth only becomes visible from about local 0.84 (camera arrives late); the life beat (0.83) therefore plays while the Earth is still small. A later session could pull the approach earlier (mind the 0.33 e-fold/svh zoom bound).
- The Orion/Crab labels sit close together on screen (both near the Sun's line of sight) at Milky Way local 0.4-0.55.
- The Voyager model's Golden Record disc is tiny and not visible in the default focus pose; the model is schematic.
- Galaxy field (timeline) is a screen-space illusion (cells re-scaled by scroll), not a 3D flight.


# Final series - step 5b-fix3 (smoother scrolling + Interstellar-style black hole) - DONE in code; look checked in software GL, scroll feel NOT

1. SCROLL: two stacked smoothers retuned. Lenis `lerp` 0.14 -> 0.085 and `wheelMultiplier` 0.9 -> 0.8 (src/engine/scroll.ts); timeline critical damper OMEGA 8.5 -> 6.0 (src/engine/timeline.ts); `overscroll-behavior: none` on html (no rubber-band). Model (tests/scroll_smooth.test.ts, PASS): for one wheel notch the camera's start acceleration drops to 44 % and jerk to 50 % of before; arrival (90 %) 0.62 s -> 0.92 s (a bit more glide, still responsive). ASSUMPTION: Lenis' lerp is time-corrected (k = -ln(1-lerp)*60/s); VERIFY against the installed Lenis. NOT measured: real frame times / hitches on a device. If it still stutters, that is GPU/scene cost (software GL here), not input smoothing: next steps would be the quality tier / BH render scale, measured on the device. Old e2e waits that assumed the 0.45 s settle may need slightly longer sleeps.
2. BLACK HOLE LOOK (Kerr approach AND the Schwarzschild fall share the grade): disc peak 5200 K -> 3100 K, exposure 1.1 -> 55 to compensate, `dopplerHue` 0.3 (colour shift damped: approaching side stays gold, receding side deepens to red) and `beam` 0.45 (relativistic brightness asymmetry softened so the receding side does not vanish). New uniforms uHue / uBeam in shader.ts and schwShader.ts discShade (1 / 1 = the old physical look, still the default for /bh-lab and the tests), new params in BlackHoleRenderer / SchwRenderer, set from SCHW_DEFAULTS in BHBody.tsx. GEOMETRY UNCHANGED (shadow, photon ring, lensing): tests/bh_gpu.py ALL PASSED (31 checks) and tests/schw_gpu.py ALL PASSED (28) after the change. Render comparison: `python3 tests/bh_look.py [tmax exposure hue beam]` -> /tmp/bh_look/*_old_new.png (software GL pictures; real GPU colours/brightness may differ slightly, and the journey's tone-mapping/bloom path was not in the harness).
HONEST: the journey views M87* at ~17 deg (physical jet-axis angle), nearly face-on, so it shows a lensed RING of orange disc, not the film's edge-on arch (that needs ~80-85 deg, i.e. a different object than M87*). The edge-on picture was rendered only to tune the colour against the reference. Offer: an optional edge-on "cinematic" camera for the approach, if wanted (it would trade away the 17 deg fact; label it). The jet stays blue and faint (schematic, jetGain 0.03; exposure no longer multiplies it).
Also: tests/bh/page.ts + schwPage.ts accept exposure / hue / beam / skyGain; tests/bh_look.py new.

# Final series - step 5b-fix2 (sound v3: "TV without signal" + "website slow") - DONE in code, numbers verified, EARS NOT

Reports after v2: (1) Sun, Solar System etc. sounded like "TV without signal" (= a continuous noise bed: broadband hiss on small speakers); (2) the page got slower with sound on.
Changes (src/lib/audio/*):
- The noise bed now exists ONLY in `bh-approach` and the fall (mood.noise = 0 in every other zone; test-enforced). It is darker: two low-pass stages (<= 620 Hz even at the end of the fall), pink, 2 sources not 3. The other zones are pure tones; their motion is a slow +-6 cent chorus (detune LFO) and the slow amplitude LFOs.
- CPU: the 4 s ConvolverNode is replaced by 4 small feedback delays (micro-benchmark, same machine, 60 s of audio offline: convolver @44.1k 2207 ms, 4 delays @24k 76 ms = 29x cheaper for that stage); the AudioContext runs at 24 kHz (sound.ts, falls back to the default rate if the browser refuses the option); parameters are written only when they changed by > 0.4 % (a steady zone writes nothing); the feed runs 2 Hz not 4 Hz. Whole graph: busiest mood (the fall) renders 38x faster than real time offline (test requires > 20x). Mood/gain tweak: MASTER_GAIN 0.09.
Measured (tests/audio_levels.py at the app's 24 kHz, all PASS): peak <= 0.12 (-18 dBFS), RMS <= 0.037; energy < 80 Hz <= 0.06 %, > 4 kHz = 0, tone zones < 2 % above 1.2 kHz (measured 0.00 %); crest <= 4; whole sweep and mute ramps click-free (0.05 x peak); noise seam keeps colour.
NOT verified: how it sounds (listen to astra-sound-preview.wav, re-rendered, true quiet level); real-device CPU in the browser next to WebGL (offline x-real-time is a proxy, not a frame-rate measurement; with software GL the page is slow anyway). If the page is still slow with sound on, measure with sound muted vs on in the browser's performance panel before blaming audio: the Journey/URL code is a 450 ms / 500 ms interval and cannot cost frames; suspect the WebGL scene first.

# Final series - step 5b-fix (sound redesign after the "pressure / sparks" report) - DONE in code, numbers verified, EARS NOT

Report: the first ambient sound put "pressure" on the speaker with a spark-like crackle. Probable causes in v1 (not provable without the person's device, but all are classic): a 38 Hz sub-bass sine + low-passed noise (small speakers cannot reproduce it and buzz), sawtooth voices (harsh harmonics), white noise through a Q = 6 band-pass (hiss / whistle), swept filter Q, and a compressor. v2 removes every one of them (see the header of src/lib/audio/ambient.ts):
- sine oscillators only; nothing synthesized below ~98 Hz; 70 Hz high-pass and 5 kHz low-pass at the output; pink noise (high-passed 110 Hz, low-passed <= 1.5 kHz, fixed Q 0.5-0.6) instead of white; no Q automation; smoother, darker reverb tail (4 s, 50 ms attack); slower glides (tau 2.4 s); safety compressor only far above the levels used; MASTER_GAIN 0.1.
- FIVE PHASES (moods.ts): 1 Earth -> Solar System (warm, close: C/A/G + major third, soft low-pass); 2 beyond -> nearby galaxies (wide, cold: bare fifths and octaves, long reverb); 3 black hole (deep and FLOWING: low minor cluster, a slow "current" = noise cut-off drifting with two LFOs); 4 the fall (starts exactly on the black-hole mood; the current quickens and brightens into a rush, a soft sine voice climbs 196 -> 450 Hz, fades with the picture); 5 universe (Laniakea is inside this zone) -> multiverse (colder, then quiet and hollow: odd partials only). Cross-fades happen over the first 25 % of each zone, continuous at every seam.
Measured (tests/audio_levels.py, real graph, OfflineAudioContext, all PASS): peak <= 0.133 (-17.5 dBFS), RMS <= 0.036 (-29 dBFS); energy below 80 Hz <= 0.11 % in every zone (limit 0.5 %); energy above 4 kHz <= 0.0001 % (limit 0.1 %); crest factor <= 3.9 (limit 5: no spikes); the fall also clean; whole 78 s sweep: biggest sample step 0.03 x peak (no clicks); mute/unmute ramps click-free, muted = exact silence; noise seam keeps variance and colour (lag-1 0.82 vs 0.83, pink). The old v1 was never measured spectrally, so there is no before/after number, only the removal of the causes above.
NOT verified: how it SOUNDS. `python3 tests/render_preview.py out.wav` renders the real graph (12 s per zone + 24 s fall, 22.05 kHz) so it can be listened to without building; a copy was delivered next to the zip (astra-sound-preview.wav, true app levels = quiet, turn the player up). If something still crackles on a real device, suspects left: AudioContext under-run on a slow device (CPU), the browser's own audio path, or Bluetooth; try `latencyHint` 'playback' (already set) -> then 'balanced', and tell me which device/browser. Mood numbers are all in moods.ts, the single level knob is MASTER_GAIN.
Also changed: Mood fields (rumble / noiseQ removed, `flow` added), sound.ts feedMood copy, audio_levels.py (spectral + crest checks), tests/render_preview.py (new). e2e_experience harness: still all pass.

# Final series - step 5b (experience features) - DONE in code, PARTLY VERIFIED (no app build was possible)

## ENVIRONMENT (honest, read first)
`npm ci` could NOT run again (registry ENOTFOUND; the zip's node_modules was hollow, I removed it). So: `npm run typecheck`, `npm run build`, `tests/path.test.ts`, the old e2e suites, `tests/e2e_experience.py app` and every screenshot are UNVERIFIED (never run). The previous step's UNVERIFIED items (5a: Kerr BHBody.tsx, Earth/Scene sun direction) are still uncompiled: first job next session with a network: `npm ci && npm run typecheck && npm run build`, then fix whatever 5a and 5b left.
What I could run: tsc (TS 6, sandbox) on the pure modules only; tsx for pure tests; esbuild bundles; headless Chromium (no WebGL needed) for the audio graph and for a DOM harness that runs the REAL `src/hud/Experience.tsx` + the REAL engine core (store, journey, timeline, scroll, api) with stubbed `zustand`/`lenis` and fake zones (`tests/exp/`). esbuild strips types, so `Experience.tsx`, `linkSync.ts`, `zoneInfo.ts`, the Fx.tsx / App.tsx / debug.ts / api.ts edits are PARSED and EXECUTED but NOT TYPE-CHECKED against real react / three types.

## What was added (all four features)
1. Sound: `src/lib/audio/{moods,ambient,sound}.ts`. All synthesized (4 detuned-pair partials with 30-90 mHz LFOs, 3 noise sources with different loop periods through a band-pass, generated reverb tail, rumble, rising-tension saw pair, soft focus bell). One mood per zone id (earth/moon warm, solar-system, beyond..nearby-galaxies wide and cold, bh-approach rumble + tension, universe colder, multiverse hollow: odd partials, narrow whistling band, quiet), blended over the first 25 % of each zone (continuous at every seam; the hold at the gate keeps its mood). Infall: starts EXACTLY on the approach mood, rumble swells, tension climbs, fades out in the last 8 %. Updated 4x/s by `<SoundFeed/>`; no per-frame work, no allocation in the graph after creation. AudioContext is created ONLY inside a gesture handler (`sound.ts start()`), never before. Pref in localStorage `astra.sound` ('on'/'off', try/catch); no stored value = on, except under prefers-reduced-motion = off until the person turns it on. M key + "Sound" button (`aria-pressed`, `aria-keyshortcuts`, state pending/on/off). Hidden tab fades and suspends; visible resumes if wanted. Mute = 0.18 s fade then suspend.
2. Hints: `ScrollHint` (chevron, dismissed by wheel / touchmove / nav keys / any scroll movement; never shown on a link into the journey) and `PlanetHint` (one-time, pulse ring on Jupiter + "Click a planet to fly to it" / "Tap..."; in zone `solar-system` local 0.32..0.45; any click, focus, or Enter on a button dismisses it for good (`astra.hint.planet`), also if seen >= 1.5 s and scrolled past; no pulse under reduced motion; pointer-events none). `solar-system` Fx.tsx now publishes Jupiter's screen position into `src/hud/hint.ts` (4 added lines in its existing label loop).
3. Journey menu: `ExperienceTop` (top-right: Journey + Sound, the only permanent HUD additions) and `JourneyPanel` (aria-modal dialog, focus trap, Esc, Arrow/Home/End among zones, backdrop click, focus returns to the button, current zone marked, jumps with the engine's `jumpToZone`: adjacent = fly, far = cross-fade). Rows come from the registry (`src/hud/zoneInfo.ts`: hand-written summary + scale per zone id; a zone without an entry gets a scale COMPUTED from its camera path). An infall line after the black-hole row explains the gate (no direct jump). Disabled button while focused / gate open; inside the infall the rows are disabled with an explanation.
4. Link: `src/lib/link.ts` (pure codec) + `src/hud/linkSync.ts` + `<LinkSync/>`. Hash `#z=<zone>&p=<0..1, 4 decimals>[&f=<object>]`. replaceState only, only on change, every 450 ms max. Opens after the preloader by placing the position under the loading screen's fade (no fly-through); `&f=` then calls `focus()` after 0.9 s. Invalid / unknown / out-of-range / repeated keys -> start, no error, URL rewritten. Infall (and a hand-made `z=fall-N`) -> the gate position (`bh-approach` local 0.97; the gate opens there because the watcher is armed on load). Copy link (clipboard API, textarea fallback, "Copied" for 2.2 s, honest failure text), Web Share button only where `navigator.share` exists AND the pointer is coarse. Hash edits in a live tab cross-fade there (`jumpToT`, new in api.ts, same curtain as the rail).
Engine changes: `api.ts` + `jumpToT()` (additive). Nothing else in the engine. Other edits: `App.tsx` (5 mounts), `Fx.tsx` (hint position), `debug.ts` (`__astra.sound`, `__astra.link`), `index.css` (2 keyframes), `tsconfig.json` (exclude `tests/exp`), `package.json` (scripts).

## Tested (what actually ran) 
| test | result | where |
|---|---|---|
| `npx tsx tests/link.test.ts` (codec: 77 round trips, 21 invalid inputs, infall -> gate, focus) | ALL PASS | Node |
| `python3 tests/audio_levels.py` (the real graph rendered with OfflineAudioContext in Chromium) | ALL PASS | see table |
| `python3 tests/e2e_experience.py` (harness mode, 77 checks: sound gesture/AudioContext count/persistence/M/hidden tab/reduced motion; both hints incl. reload; menu keyboard flow, trap, jumps, disabled states, infall; link round trip for 11 zones, focus target, invalid links, history not spammed, rate, hashchange, Copy, no-Clipboard fallback, Web Share; no console errors) | ALL PASS | Chromium, no WebGL, real Experience.tsx |
| `tsc` on moods/ambient/sound/link | PASS | sandbox TS 6 |
Bugs found by these tests and fixed: Sound button did not re-render after a tab-hide pause (missing emit); out-of-range `p` was clamped instead of rejected; repeated keys were accepted.

Audio levels (44.1 kHz, offline; steady state, left/right max; full-scale = 1.0):
| zone | peak dBFS | RMS dBFS |
|---|---|---|
| earth / moon / sun | -18.6 / -19.6 / -19.1 | -29.3 / -29.0 / -29.4 |
| solar-system / beyond / milky-way | -19.3 / -18.7 / -18.5 | -28.8 / -28.9 / -29.0 |
| local-group / nearby-galaxies | -19.7 / -19.7 | -29.6 / -30.3 |
| bh-approach | -16.7 | -28.7 |
| universe / multiverse | -21.2 / -28.5 | -31.5 / -37.9 |
| infall p = 0 / .5 / .9 / 1 | peak 0.13 / 0.15 / 0.15 / 0 (silent) | RMS 0.032 / 0.035 / 0.037 / 0 |
Whole 78 s sweep (every zone, 4 Hz updates, then the infall, then mute): peak 0.141, biggest sample-to-sample step 0.0056 (0.04 x peak: no clicks); mute and unmute ramps: steps 0.02 x peak, muted = exactly silent; noise loop seam keeps variance and stays white.
CANNOT be judged without ears: whether it sounds pleasant, whether the cross-fades are musical, the multiverse "hollow" character, the black-hole "tension". The noise bed repeats mathematically every 12.0 / 12.9 / 11.2 s (three different rates, so the sum never lines up); inaudible by design but NOT verified by ear. First real-device listen is needed; levels are intentionally quiet (peak <= -16 dBFS) and the master (`MASTER_GAIN` in ambient.ts) is the one knob.

## NOT verified
- Everything in the real app: build, typecheck of the React/TSX files, the real Preloader -> `phase=ready` -> link-apply timing, the planet hint over the real SolarFx projection (`hintPos` is faked in harness mode; the real publisher is 4 lines in Fx.tsx), the real gate opening from a `bh-approach` link, `focus()` from a link on real objects, Safari/iOS audio (webkitAudioContext path untested), real clipboard permission prompts, real Web Share, real frame-rate impact of the audio (it is ~25 AudioParam writes 4x/s plus the graph on the audio thread; not measured on a device).
- `tests/e2e_experience.py app` is written (same 77 checks plus the gate) but never ran.
- Layout: the Journey/Sound chips share the top row with the title (left) and the multiverse "Hypothesis" chip (centre) on 390 px phones: not looked at in a screenshot. The menu panel on a phone is untested visually.
- Texture memory: nothing in public/textures or tools/texgen was touched, so docs/TEXTURE_REPORT.md is byte-for-byte unchanged (mobile total did not grow; desktop unchanged).
- `// VERIFY` numbers (zoneInfo.ts, shown in the menu): Solar System "about 240 AU across" (twice ~120 AU Voyager heliopause crossings), Local Group "about 10 million light-years" (commonly ~3 Mpc); beyond "about 70 light-years" and nearby-galaxies "about 70 million" are the widest camera view (2 x dist x tan(17.5 deg)); 3,850 AU = 60 r_g with r_g = 9.6e12 m (from the zone's own 1.92e13 m horizon).

## Next
1. With a network: `npm ci`, `npm run typecheck`, `npm run build`; fix any 5a / 5b compile errors; run the old e2e suites, `npm run test:experience-app`, and eyeball the top-right chips on 390x844 and 1440x900. 2. Listen to every zone and the infall on real speakers; adjust moods.ts / MASTER_GAIN. 3. Prompt C.


# Final series - step 5a (realism upgrades) - PARTIAL: item 3 done+tested, item 1 written but unverified, item 2 not done

## ENVIRONMENT (honest, read first)
`npm ci` could NOT run: no network, and the zip's `node_modules` was hollow (I deleted it). `/opt/npm-tools` has tsc 6.0.3, tsx, esbuild, sharp, playwright + Chromium (software GL only) but NO `three`, `vite`, `@react-three/fiber`, `zustand`, `lenis`, `@types/*`.
=> `npm run typecheck` and `npm run build` of the whole app were NOT run (UNVERIFIED). Every `.tsx` edit in this step is UNVERIFIED (never compiled). The browser e2e suites and screenshots could not run (they need `vite preview`).
Pure-math tests that import `src/zones/common.ts` ran against a throwaway `three` stub (Vector3 only) kept OUTSIDE the project (`../node_modules/three`, not shipped).

## Item 3 - Earth's Sun direction: DONE in code, numeric test PASSES, visual check NOT done
Audit (every lit body):
- Planets, rings (and their shadows on the planet / of the planet on the rings), planet atmospheres: already used `solar.sunDir.get(id)` = normalize(Sun - body position), rewritten every frame by `stepSolar()`. OK, unchanged.
- Moons of the giant planets: use the PARENT's direction (parent -> Sun). Error vs the moon's own direction < 0.01 deg at Jupiter, < 0.002 deg beyond (moon distance / Sun distance). Left as is.
- Earth (surface, clouds, atmosphere, `src/zones/Earth.tsx`): used the constant `SUN_DIR` -> now `solar.sunDir.get('earth')` (one persistent Vector3 mutated in place, so the shared uniforms follow). The map entry now starts at `SUN_DIR` (was (0,0,1)), so the first frames before `stepSolar()` runs are identical to the old look.
- Moon (`MeshStandardMaterial`, lit by the scene's ONE directional light, which was fixed at SUN_DIR): `src/engine/Scene.tsx` now mounts `<SunLight/>`, which each frame sets the light position to `solar.moonSunDir x 50`; `moonSunDir` = normalize(SUN_POS - Moon position), computed at the end of `stepSolar()` (after `stepMoons()`). Nothing else in the scene uses that light. (Engine change, 8 lines.)
- Sun: self-luminous, nothing to do. Focus framing `litFrom` is an absolute Sun point (SUN_POS), already correct for a displaced Earth.
- Not modelled: irradiance changes with the (compressed) distance; intensity stays constant on purpose ("look identical").
- Hero: at days = 0 Earth is at the origin and the direction equals SUN_DIR exactly (0.0 deg, tested), so the Earth/Moon look cannot change.
- Test `tests/sundir.test.ts` (`npm run test:sundir`): Earth at days 0/7.5/15/22.5/30 vs the independent expectation (negated heliocentric direction from the ephemeris, YAW applied): <= 0.01 deg (the 0.0025 deg residual is the scene Sun sitting exactly in the ecliptic plane); the old constant was 7.5 / 15.1 / 22.7 / 30.3 deg wrong; turn rate ~0.99 deg/day; Moon within 1.14 deg of Earth's direction. ALL PASS (Node, stub three).
- NOT done: the before/after screenshot of Earth in focus late in the Solar System zone (needs the running app).

## Item 1 - Kerr M87* in the journey: CODE WRITTEN, NEVER COMPILED OR RUN (UNVERIFIED)
- Choice for the infall: **(b)** Schwarzschild kept for the branch only, 1.2 s cross-fade at the branch start, on-screen "The fall uses a non-rotating simplification". Why: (a) needs a new Kerr free-fall frame + a GPU verification against the Schwarzschild infall at a = 0, which I could not run here. Details in docs/BLACKHOLE.md.
- Files: `src/zones/blackhole/kerrFrame.ts` (new, pure), `frame.ts` (SPIN frame + `holeToGalacticSpin`), `model.ts` (`KERR_SPIN`, `HANDOFF_S`), `BHBody.tsx` (Kerr renderer + second present mesh + cross-fade; Schwarzschild now also uses the SPIN frame, so its disc turns the same way as the Kerr one: this MIRRORS the old Schwarzschild image's bright side), `BlackHoleRenderer.ts` (+`framesDrawn` getter), `index.ts` (texts), `tests/e2e_bh.py` (hand-off screenshots + non-rotating text check).
- Run OK (Node): `tests/kerrframe.test.ts` ALL PASS (frame orthonormal/right-handed, spin opposite the approaching jet, camRot), `tests/bh.physics.test.ts` 56/56, `tests/infall.test.ts` 14/14.
- NOT run: `npm run typecheck`, `npm run build`, `tests/path.test.ts` (stops on missing `react` in this sandbox), e2e, GPU harness, screenshots, the seam continuity tests (galaxy dive -> approach, approach -> gate, gate -> infall, approach -> universe). **Nothing in BHBody.tsx has been compiled.** First thing to do next session: `npm ci && npm run typecheck && npm run build`, fix any error in BHBody.tsx / frame.ts / Scene.tsx / Earth.tsx / state.ts, then run `npm run test:e2e-bh` and look at /tmp/e2e_bh_approach_kerr.png and the hand-off screenshots.
- Known risks to check by eye: Kerr vs Schwarzschild exposure/sky gain match (Kerr uses the Schw defaults for exposure, skyGain, disc size, disc temperature; the Kerr disc reaches the ISCO at 2.3 r_g instead of 6, so the inner disc is visibly different at the hand-off: that is physical); jet gain; whether the preloader warm-up compiles the Schwarzschild shader (it is drawn only when w > 0, i.e. in the infall timeline warm-up; confirm `framesBeforeReady`); `R_RELEASE` import was dropped from BHBody (only a comment mentions it).
- The "approach radius" `r < R_RELEASE` Schwarzschild switch was removed: the Kerr hole is used for the whole main path.

## Item 2 - sharper galaxy pictures: NOT DONE
Not started: it needs texgen regeneration + the running app for before/after crops, the shader detail layer cannot be checked without a GPU view, and the memory report cannot change. The texture report is therefore UNCHANGED (mobile total did not grow; desktop unchanged). Plan stays as in the brief (4k Milky Way on desktop, 3072/4096 for the softest focusable galaxies, procedural detail layer in the galaxy shader).

## Next
1. Restore a real toolchain (`npm ci`), compile, fix, run e2e and the screenshots for items 1 and 3. 2. Item 2. 3. If the Kerr image looks right, consider option (a) (Kerr infall) later.


# Final series - step 4 (universe 400 svh + multiverse 300 svh) - DONE, software-GL verified only

## Done
- `tools/texgen/gen/web3d.ts` -> `cosmicweb3d.bin` (262,144 pts, 2 MB) + `cosmicweb3d_lo.bin` (35 %, mobile). SIMULATED Voronoi-foam cosmic web (a Zel'dovich attempt gave blobs, not filaments). Manifest row `cosmicweb3d` (data); desktop manifest 39.9 MB, mobile 25.1 MB.
- `src/zones/universe/`: `model.ts` (numbers computed from `src/lib/cosmology.ts`), `Cosmic.tsx` (`uni-web`, `uni-lan`: Laniakea, schematic), `Sphere.tsx` (`uni-sphere`: haze, CMB globe from `cmb-color`, horizon rim, you-are-here), `Multiverse.tsx` (`mv-field`: instanced bubbles + inflating-space glow, growth driven by scroll progress), `index.ts` (zones `universe` + `multiverse`, portrait `framing`), `Hud.tsx` (persistent "Hypothesis. Not observed." chip for the whole multiverse; end card "Begin again from Earth": curtain dissolve, then Earth).
- Seam: first universe key = copy of bh-approach last key. `BHBody.tsx`: past the approach the hole alpha *= 1 - bhOut (universe local 0.02..0.12), M87 glow returns, tracing stops when alpha < 0.002. `Fields.tsx`: Virgo layer and the nearby-galaxy labels fade out with distance (needed once the camera goes far beyond them).
- The black-hole "No" branch continues into the universe; the old end card never shows.
- Tests touched: `tests/galactic.test.ts` (two stale assertions assumed M87 is the last zone), `tests/e2e_bh.py` (no end card after No; reopen the gate by scrolling back and forward). New: `tests/e2e_universe.py WxH OUT [mobile]`. `window.__astra` gained `world`, `uni`.
- LESSON (big): a ShaderMaterial shell whose INNER faces face the viewer (`BackSide`, or reversed winding) froze the page in headless software GL (1 frame / 8 s in EVERY zone, even hidden). Not understood; the shell is now a plain front-face globe seen from outside (u flipped). Do not reintroduce inner-face shells without testing on a real GPU.

## Tested (software GL / swiftshader, 1 core, NOT a real GPU)
- typecheck, build, `tests/path.test.ts` all PASS (dlnD 0.0090, dAngle 0.050), `tests/galactic.test.ts` 0 FAIL.
- `tests/e2e_universe.py`: 640x360 and 390x844 (mobile UA): ALL checks PASS, no console errors: whole main path walked, gate "No" continues, hypothesis label only in the multiverse, end card, restart back at Earth. Seam frame-to-frame grey diff max 9.5 (640x360) / 36 (390x844, frames ~5 svh apart: the hole shrinking, not a cut). Software-GL rAF: 4.0 fps (640x360), 3.9 fps (390x844), 1.1 fps (1440x900). Screenshots reviewed by eye at 640x360 and 390x844.
- 1440x900: ALL checks PASS (second run; the first run was killed after a >15 min stall at ~1 fps in the restart step, the second completed): seam diff max 10.8, restart back at Earth. Fine-step seam test (0.33 svh steps, +-2 svh, 480x270): max diff 4.1, which is the HUD title/notes swapping; the hole image is continuous.

## Not verified
- Real-GPU frame rate / smoothness (none available). The universe zone has ~500k additive sprites in the worst frame (web 262k desktop / 92k low tier, haze ~88k, Laniakea ~20k, bubbles' glow 24k): needs a real-GPU check, and may need lower counts on the low tier.
- At 1440x900 the original long closing line ran off the bottom; shortened to "One sphere we can never leave. Beyond it, we have only begun to ask." (rebuilt, typecheck + path test pass, NOT re-screenshotted).
- Portrait (390x844) text/label overlap was only eyeballed at one frame per beat; the multiverse closing line is large on a phone.
- `// VERIFY` numbers (model.ts): Z_REC 1089.92 (Planck 2018), Great Attractor (RA 243.75, Dec -60.9, 214 Mly; Laniakea centre placed 200 Mly toward it), Shapley 650 Mly, Perseus-Pisces 235 Mly, Coma 320 Mly, supergalactic pole (l, b) = (47.37, 6.32). Checked online: Laniakea ~500 Mly across / ~100,000 galaxies (Tully 2014), H0 67.4 (Planck) vs ~73 (local) unresolved, no convincing bubble-collision signal in WMAP (Feeney 2011). The string-landscape "10^500" line is hedged as "often said".
- The CMB texture is a simulated look-alike; the cosmic web is a simulated look-alike. Both are labelled on screen.

## Next: step 5 (QA / polish / release)

# Final series - step 3 (black-hole zone + infall branch) - DONE (software-GL verified only)

## START checks
`npm ci` OK (network available, node_modules real), `npm run typecheck` PASS, `npm run build` PASS. Step 2's previously uncompiled files compile and bundle.

## What exists now
* **Physics** `src/lib/bh/infall.ts` (cycloid proper time, coordinate time closed form, tides, aberration helpers) + **tracer** `schw.ts` (CPU reference) / `schwShader.ts` (GLSL) / `SchwRenderer.ts`. Equations: docs/BLACKHOLE.md "Infall". Non-rotating hole, observer in radial free fall, valid INSIDE the horizon.
* **Zone** `src/zones/blackhole/` (registered at the end of `src/zones/index.ts`): `bh-approach` 300 svh (origin = hole, unit = r_g, from M87_END = 2000 r_g = 1000 rs down to 60 r_g, view swings from our real 17 deg to 68 deg from the jet axis; final 10 % is a HOLD, the gate opens inside it), `BHBody.tsx` (the one object `bh-m87`, never disposed), `Hud.tsx` (infall panel, horizon flag, ending text, end card), `model.ts` (stages, texts, numbers), `frame.ts` (hole frame), `state.ts`.
* **Branch `infall`** 600 svh = 6 stages (90/110/100/80/120/100): released 60 -> 24 r_g, aberration -> 7, photon sphere -> 2.6, horizon -> 1.5, inside -> 0.2, singularity region -> 0.01 r_g. Distance is log-linear per stage. Starts from the exact last approach key (radius 60.00000 -> 60.00000 in the e2e), P = 0 there (released from rest) so Yes has no pop. Ends with "What the model says / What is observed" text, fade to black (`infallFade`), auto-return; the Return button fades through the curtain and restores the exact scroll position.
* **Gate** opens at local t >= 0.94 of `bh-approach` (`BHBody.tsx: watchGate`, re-arms below 0.85). No = unfreeze, and because no zone follows yet an end card ("The journey so far ends here": fall in after all / back to Earth). **Step 4: register the next zone AFTER `registerBlackHole()`; its first key must equal `bh-approach`'s last key (60 r_g, theta 68, phi 28, hold); then the end card never shows (it only shows when `bh-approach` is the last main zone) and No simply lets the scroll go on.**
* **Seam from the galaxy dive**: BH image fades in over the first 12 % of the zone while M87's glow/stars/jet (`zones/galactic/M87.tsx`, multiplied by `bhFade.m87`, 3-line change) dissolve over local t 0.02-0.11; `gx-m87` is in the zone's object list so nothing pops when the previous zone's window closes.
* **Preloader**: the zone warm-up renders the hole in every zone of both timelines, so both shaders compile and 18 frames are drawn before `ready` (`bh.stats.framesBeforeReady`, asserted in e2e). No engine change.
* **Performance guard** `src/lib/bh/guard.ts`: smoothed frame time > 22 ms for 0.6 s lowers the trace resolution (x0.85, min 0.16) then the step budget (min x0.55); recovers after 4 s below 13 ms. Hitches > 1 s ignored. Unit-tested; wired in `BHBody` (`bh.stats.scale`).
* **Reduced motion**: the 6 infall stages are 6 stills (`stillT`), each with a caption beat; e2e checks every one. Static disc (time = 0).
* Texts are honest: on-screen notes say simulation / non-rotating / not the EHT image / thin disc / schematic jet / backdrop is a star-field texture. Tides line says harmless for M87*, 2x10^7 g for 10 Msun (both computed).
* Changes outside the new files: `src/zones/index.ts` (+2 lines), `src/App.tsx` (mount `BlackHoleHud`), `src/test/debug.ts` (`__astra.bh`), `src/zones/galactic/M87.tsx` (bhFade), `package.json` (scripts).

## Tested (what actually ran)
| test | result | where |
|---|---|---|
| `tests/infall.test.ts` (14 checks: pi GM/c^3 max scanned, 4/3, 27.94 h, cycloid vs numeric, coordinate time vs numeric, tides, null identity, aberration of the shadow edge, dark cone) | 14/14 PASS | Node |
| `tests/schw.test.ts` (static shadow analytic, aberrated shadow, 1200 rays vs the independent Kerr tracer a=0, continuity across the horizon, E>0 only) | PASS | Node |
| `tests/guard.test.ts` | 5/5 PASS | Node |
| `tests/schw_gpu.py` (GLSL vs float64 CPU, 7 views incl. 3 inside the horizon, 28 checks) | 28/28 PASS | **software GL (SwiftShader)**: correctness only |
| `tests/path.test.ts` (contiguity, continuity, seamless joins incl. into `bh-approach`) | PASS | Node |
| `tests/e2e_bh.py` (preloader warm-up, no gate early, gate appears, No / end card / reopen / Yes, continuity r 60 -> 60, HUD numbers decrease, horizon status + flag, ending text, Return exact place, auto-return at the end, reduced-motion stills) | see "e2e result" below | **software GL** |
| screenshots `tests/shots.py` (approach) and `tests/shots_infall.py` (infall) | taken, looked at | software GL, tier low (0.33 scale) so soft |

NOT verified: any real-GPU frame time (the guard is logic-tested only); how the hole looks at tier medium/high; mobile; the full old `tests/e2e.py` was not re-run end to end in this session (it takes hours in software GL; the unchanged parts are exercised by `path.test.ts` and `e2e_bh.py`). Visual tuning (exposure 1.1, disc 5200 K, outer radius 20 r_g, sky gain 0.3) was done by eye at low resolution.

## Honest caveats / VERIFY list (new)
* Mass 6.5e9 Msun and shadow ~42 uas (EHT 2019) // VERIFY. Horizon radius 1.92e13 m = 128 AU = "about 4x Neptune's orbit" (Neptune 30 AU) from the mass above.
* "M87's jet is visible for thousands of light-years" (text only) // VERIFY wording.
* Release radius 60 r_g, gate pose theta = 68 deg / phi = 28 deg, disc outer 20 r_g, stage radii: design choices, not data.
* Inside the horizon only the dark cone ahead and the squeezed sky are drawn; the matter that made the hole and any rotation-related structure are not.
* The software-GL e2e initially showed a join artefact when the branch is entered from a far-away pose (the 1.6 s camera join); in the real flow the pose is identical (checked: radius 60.00000 both sides).

## Next: step 4 (cosmic web, observable universe, multiverse)
Append zones after `registerBlackHole()`; match `bh-approach`'s last key; keep `bhFade`/gate untouched. Run `npm run test:infall`, `npm run test:e2e-bh` (needs `vite preview`).

---
(older sections follow)
# Final series - step 2 (black-hole renderer + lab) - DONE except what is listed UNVERIFIED

## Environment (honest)
`npm ci` could NOT run (no network; node_modules in the zip is hollow: three, typescript, vite, react empty). So **`npm run typecheck` and `npm run build` of the whole app were NOT run (UNVERIFIED)**.
Available: `/opt/npm-tools` (tsc, tsx, esbuild, playwright) + Chromium with **software GL only (SwiftShader)**. `sharp` was borrowed from /opt/npm-tools through a temporary symlink to run texgen (not shipped).
Verified with those: pure modules (`kerr.ts`, `shader.ts`, tests, texgen galaxies) typecheck clean under `strict` with `tsc`; tests below ran.
**UNVERIFIED (never compiled or run): `src/lib/bh/BlackHoleRenderer.ts`, `src/lib/bh/BlackHole.tsx`, `src/lab/BhLab.tsx`, the `src/main.tsx` lab routing, the MW particle-disc colour change in `mwmodel.ts`.** First thing to do next session with network: `npm ci && npm run typecheck && npm run build`, open `/bh-lab`, fix whatever three/R3F typing complains about.

## Done
- MY BUG NOTES (Milky Way yellowish -> bluish): `milkyWayTopDown()` in `tools/texgen/gen/galaxies.ts` rewritten from the look of your reference (not pasted): warm only in the bar/bulge, radial ramp to blue-white in the disc, 2 strong + 2 minor arms, pink H II knots along the arm inner edges, brown dust lanes inside the arms. New optional `Cfg.colOuter/ramp`, `extra()` gets the resolution scale. `galaxy_milkyway_topdown_2k/1k.webp` regenerated, manifest rebuilt (desktop 37.2 MB unchanged). `mwmodel.ts` `discCol()`: particle disc ramps golden -> blue-white with radius (3-D layer; NOT seen running). The picture was checked as a flat composite only.
- `src/lib/bh/kerr.ts`: Kerr physics + CPU reference tracer (double). `shader.ts`: GLSL trace / accumulate / present. `BlackHoleRenderer.ts`: reduced-res trace + temporal accumulation, tiers. `BlackHole.tsx`: R3F component for the persistent canvas (`getPose()`, visible/alpha, no second context). `src/lab/BhLab.tsx` at `/bh-lab` or `?bhlab` (sliders spin/inclination/distance/mass, presets M87*/Sgr A*/10 Msun, EHT text only, "SIMULATION" labels). `docs/BLACKHOLE.md` (equations, approximations, not modelled). Sample renders: `docs/img/bh-sim-*.png` (software-GL, simulation).
- Scripts: `npm run test:bh`, `npm run test:bh-gpu` (python3 tests/bh_gpu.py needs playwright + chromium + esbuild).

## Tests actually run (results)
- `tsx tests/bh.physics.test.ts`: **56/56 PASS** (ISCO 6 / 4.233 / 2.3209 / 1.2370 + dE/dr = 0; photon orbit 3 and R(3) = R'(3) = 0; shadow radius 3*sqrt(3) = 5.196 to 0.003; Kerr shadow edges vs Bardeen for a = 0.5, 0.9, 0.998 to 0.01; Novikov-Thorne vs Page-Thorne closed form; g-factor; convergence; colours; preset sizes M87* 39.9 uas, Sgr A* 53.2 uas).
- `python3 tests/bh_gpu.py` (real GLSL, raw WebGL2, **software GL**): **31/31 PASS**. GPU shadow radius within 0.01 % of analytic; GPU vs CPU: 100 % identical capture/escape/disc on 3 x 9216 px, disc r and g ~1e-5, sky direction median 0 / p99 < 0.5 px / max 11 mrad (pole-adjacent float32 rays); ISCO inner edge face-on; accumulation + present shaders. Known limit: a = 0.998 left shadow edge 0.03 r_g off (step budget at the near-extremal photon orbit).
- Bugs found and fixed by these tests this session: step-size control missed pole passes (central image columns wrong); projection onto first integrals froze rays at mu = 1 in float32; disc pattern winding by the light-travel time (moire); jet NaN on the axis; hard black outer disc rim (now translucent).

## NOT tested / honest gaps
- Real-GPU frame rate: UNMEASURED (software GL ~1.5 s for 256x256 max quality). "60 fps at medium" is a design target, expect to tune `BH_TIERS`.
- Temporal accumulation in motion (reprojection ghosting) never seen; only the shader's math was tested on synthetic inputs.
- The observer-velocity `beta` path (for step 3 infall) has no test beyond beta = 0.
- Preset numbers (M87* 6.5e9 Msun, 17 deg, 16.8 Mpc, 42 uas; Sgr A* 4.3e6, 8.277 kpc, 51.8 uas; spins 0.9 illustrative; Wyman CMF coefficients; IAU Msun) are from memory, no web check: all marked `// VERIFY` in `kerr.ts`.
- `docs/ASSETS.md` was not regenerated (texture set and budget unchanged; only the MW picture changed).
- Nothing in the journey mounts the renderer: shader compile must be done in the preloader by step 3.

## Next: step 3 (black-hole zone + infall branch)
Mount `<BlackHole>` from a zone (floating-origin `getPose`), call `render` once in the preloader, add the beta/infall pose, check real-GPU timing first.

# Final series - step 1 (focus-mode polish) - DONE on software GL only (no real-GPU run)

## Tested (headless Chromium, SwiftShader software GL ~1-2 fps; `npm ci`, `npm run typecheck`, `npm run build` all pass)
- `python3 tests/e2e.py` (extended): every solar object (Sun, 8 planets, Moon, Ceres, Pluto + 8 moons = 20), the 4 Local Group galaxies and the 7 nearby galaxies: focus -> panel (title, honest tag, >= 5 rows; planets exactly 8 rows) -> Back -> exact `t`, scrollY and zone restored; NASA-derived tag on Earth/Moon, procedural tag elsewhere; NASA planetary fact sheet source line; ArrowRight/Left follow group order (Jupiter -> Io, Jupiter <- Ceres, M31 -> M33) and never jump zones; Tab stays in the panel; Esc restores exact scroll; synthetic swipe (Saturn -> Titan); reduced motion (cross-fade focus + Esc); no console errors. (Flight length shortened to 0.25 s in the test through `__astra.focusState.duration`; logic identical.)
- Screenshots reviewed by eye: Jupiter, Saturn, Io, Earth hero + focus, Uranus, M31/M33/M81/M101/M104 in focus, Milky Way zone, Local Group, portrait (390x844) Solar System overview and Jupiter focus.

## Not tested / unverified
- **Real GPU**: no frame-rate, hitch or shader-compile-time measurement on a real GPU; 1.8 s flight smoothness is only logic-checked.
- Real touch devices (swipe tested with synthetic TouchEvents only); screen readers; Safari/Firefox.
- M87 as a focus target reached from the dive zone (it is in the arrow order after NGC 1365; focus works through the same code, not exercised in a test).
- Detail-noise strengths (`bodyMaterial.ts DETAIL`), Jupiter flow amplitude (exaggerated, said nowhere on screen except the generic note), ringlet strength: judged on software-GL screenshots only.
- Uranus's 98 deg tilt: axis is the IAU pole (82.3 deg from ecliptic north = 97.7 deg obliquity, checked numerically); not judged visually as a "tilted" look, the rings there are very faint.

## Step 0: galaxy colour verification (the fix was never run before)
Ran the build: M31, M33 (Local Group), M81, M101, M104 (nearby) in the zone and in focus, and the Milky Way zone. **No galaxy washed toward white** (only the very centre of each core burns to white, as in real long exposures); uGain / uOpacity left alone. BUT (from MY BUG NOTES: "colours and sharpness not real per galaxy") two real problems found and fixed:
1. M81 / M101 / M51 share one face-on picture, so they looked identical. Added a mild per-galaxy multiplicative picture grade (`PIC_GRADE` in `Galaxy.tsx`, <= +-12 % per channel, multiplicative only, no tone mapping, no additive stacking): M101/M33/SMC bluer, M81/M104/Cen A warmer, M82 redder, etc.
2. Milky Way particles: the sprite shader ends in `<colorspace_fragment>`, so a palette written in display colours was lightened toward white (the arms looked white-speckled). `mwmodel.ts` now linearises the palette (gamma 2.2): golden bar/bulge, blue arms, pink H II knots. NOT applied to the other particle layers (galaxy halos / fields use the same shader and are probably also slightly pastel: candidate for step 5 QA).
Sharpness: the screenshots were taken in quality "low" (1k maps); high-tier 2k textures are sharper. In focus the galaxy picture is magnified ~3x, so it stays soft: a real fix needs higher-res generated pictures (texgen) - not done (out of scope).

## What changed (files)
- `engine/api.ts`, `engine/Driver.tsx`, new `engine/focusGroups.ts`, `engine/journey.ts` (focus.litFrom/swing, Zone.framing): flight 1.8 s, hop between objects, release restores exact t + scroll, tracking of moving targets, slow azimuth drift (1.6 deg/s, off in reduced motion), reduced-motion cross-fade.
- `hud/Hud.tsx`: new panel + keys/swipe/wheel lock; beats and bottom notes hidden while focused.
- `lib/focusData.ts`: all panel text and numbers (see VERIFY list below).
- Moons: `zones/solar/satellites.ts`, `Satellite.tsx`, registration in `zones/solar/index.ts`; `stepMoons()` is called at the end of `stepSolar()` (also keeps Earth's Moon at Earth + 384,400 km: identical to the old fixed position wherever Earth is at the origin).
- Close-up: `zones/solar/bodyMaterial.ts` (+ `shaders.ts`: `vO` varying, detail noise, Jupiter flow, ringlets).
- Allowed fixes: (a) Earth tilt fixed (see below); (b) `Zone.framing` for the Solar System zone widens the overview / Saturn close-up on portrait phones (checked at 390x844); (c) beat/panel/notes overlap in focus removed; solar orbit lines fade out while focused.
- `zones/index.ts`: Earth/Moon/Sun focus cameras now use `litFrom` (Earth distRadii 3.7).
- `tests/e2e.py` extended; `src/test/debug.ts` exposes `focusStep`, `focusState`.

## Earth axial tilt (known issue, FIXED)
`poleOf(0, 90)` (celestial north pole in the scene's world frame) = (-0.002, 0.918, -0.398); dot with SUN_DIR = -0.282 = sin(-16.4 deg), the real solar declination for 8 Nov (~ -16.5 deg). The old tilt (toward -X, +23.4 deg) lit the north pole. `Earth.tsx` now tilts the globe with a quaternion from UP to that pole. Lighting direction unchanged (SUN_DIR). Side effect: the visible hemisphere at the hero changed slightly (looked good in the screenshot: Africa / Atlantic with the sun glint). Known limitation: Earth's shader still uses the constant SUN_DIR, which is wrong by up to ~30 deg if you focus Earth late in the Solar System zone (Earth has moved along its orbit); not fixed.

## Moons (real data typed from memory, all `// VERIFY`)
Radii, semi-major axes, periods in `satellites.ts`; orbit speed x8000 (1 day = 10.8 s), orbits in the planet's equatorial plane (IAU pole), tidally locked, Triton retrograde. Stated on screen in the panel ("Orbit shown x8,000 faster than real"). Moon counts (Jupiter 101, Saturn 285, Uranus 29, Neptune 16) checked on the web (NASA Space Place / press, March 2026) and shown as "(Mar 2026; rising)".

## VERIFY list (typed from memory, shown with a dagger on screen where marked)
Moon mean temperatures (Moon, Io, Europa, Ganymede, Callisto, Enceladus, Charon), Ceres mean temperature, all galaxy type/distance/size/star-count rows (`focusData.ts`, dagger on every galaxy row), M82/Cen A/M51/NGC 1365/M87 star counts in particular, all moon radii/orbit/period values, the claims in editorial texts (Io > 400 volcanoes, Saturn rings ~10 m thick, etc.). Planet rows follow the NASA fact sheet from memory but carry no dagger: re-check against nssdc.gsfc.nasa.gov/planetary/factsheet before release.

## Known issues / notes for later steps
- Moons are real size and real distance, so in the Solar System overview they are invisible; they exist for focus (buttons in the planet panel, arrows). Jupiter in focus does not show its moons (it fills the view).
- Planet detail noise and Jupiter flow cannot be judged on software GL; if it reads as noisy on a real GPU lower `DETAIL` amplitudes in `bodyMaterial.ts`.
- Galaxy focus: the pictures are procedural 1k/2k and look soft at full screen (see above).
- Left over from earlier: heavy cost of 2 extra textures per moon is zero (reuse manifest textures); `check:budget` not re-run (no new textures).
- Next: **step 2 - black-hole renderer + lab.**

# STATUS — galaxy colour fix (applied on top of the Prompt 5 zip; read this first)

Galaxies looked almost black-and-white. Causes found in the code: (1) `tools/texgen/gen/galaxies.ts` tone-mapped each channel on its own (`1 - exp(-x)`), which pushes bright areas to white, and a blue + yellow star mix is already grey; (2) dust attenuated all channels equally (grey lanes); (3) `data.ts` tints were 0.85–1.0 (near white) and `Galaxy.tsx` multiplied the picture by them and built the particles from them.

Changes (all colour only; no geometry, camera, zone, scroll or focus change):
- `gen/galaxies.ts`: tone map is now on LUMINANCE with the colour ratios kept and boosted (`sat`, default 1.65; 2.0 for the irregular and M33 images), hue-preserving clip, only the brightest core burns toward white; dust reddens (blue and green attenuated more than red); more saturated palette (golden old stars/bulge, blue young stars, magenta-pink HII). All 8 `galaxy_*_2k.webp` regenerated, mobile `*_1k.webp` re-derived (`npm run textures -- --only galaxies --force`, then `--only tiers --force`).
- Measured (mean HSV saturation of lit pixels outside the central 15%, additive on black): spiral_face 0.17 -> 0.30, spiral_edge 0.27 -> 0.49, barred 0.19 -> 0.34, elliptical 0.16 -> 0.33, irregular 0.05 -> 0.19, M31 0.22 -> 0.47, M33 0.07 -> 0.19, MW top-down 0.19 -> 0.35. Clipped pixels 0% before and after. (The earlier target of 0.35 everywhere was NOT reached for the faint/blue galaxies: M33 and the irregular stay pale by design of their palette; the images were judged by eye on a contact sheet over (3,4,10).)
- `Galaxy.tsx`: picture tint is now neutral (1,1,1); particle colours: young stars [0.5,0.7,1], old stars [1,0.84,0.6] (irregular: [0.95,0.86,0.74]). `data.ts`: `tint` is now each galaxy's real overall colour (used only by the far dot). `mwmodel.ts`: YOUNG [0.5,0.7,1].
- Texture weight: desktop 35.3 -> 37.2 MB, mobile 22.8 -> 23.7 MB (docs/TEXTURE_REPORT.md regenerated).

NOT TESTED: the app was not built or run after these edits (no node_modules/three in the sandbox). The four edited TS files were only syntax-checked (TypeScript transpile). The new images were checked as flat composites, not in the 3-D scene: run `npm ci && npm run typecheck && npm run build`, then look at M31/M33 (Local Group), M81/M101/M104 (nearby), their focus views and the Milky Way zone. If the sum of picture + particles + dot still clips toward white in the scene, lower `uGain` in `Galaxy.tsx` (currently 1) or `uOpacity` (0.95).

# STATUS — after Prompt 5 (beyond the system, Milky Way, Local Group, nearby galaxies, dive into M87)

## Done (Prompt 5) — `src/zones/galactic/`
Journey is now 2300 svh: earth 250, moon 250, sun 200, solar-system 500, **beyond 300, milky-way 300, local-group 250, nearby-galaxies 250**.
- `units.ts` frames (RA/Dec -> world via the sky's matrices; Sun at SUN_POS; LY/KLY/MLY), `data.ts` all real data (// VERIFY), `shaders.ts`/`state.ts` shared sprite + picture-plane shaders, `stepGalactic()` (sky fade).
- **Beyond (`Beyond.tsx`, object `gx-near`)**: Oort cloud (SIMULATED, never observed), 21 real stars at real RA/Dec/distance with stems to the ecliptic and 5/10/20 ly rings, Sun sprite that fades in as the Sun sphere shrinks.
- **Milky Way (`mwmodel.ts`, `MilkyWay.tsx`, `gx-mw`)**: ~150k particles (bar 27 deg, 2 major + 2 minor arms, Orion Spur, warp, bulge, halo; same arm geometry as the sky panorama), "you are here", Sun-centre line (R0 = 8,275 pc, GRAVITY 2021 = 26,990 ly; the prompt's 26,000 is an older rounding), arm/bar/spur/warp labels, "artist's concept" underlay = `galaxy-milkyway-topdown` (procedural), labelled.
- **Local Group (`Galaxy.tsx`, `Fields.tsx`)**: M31, M33, LMC, SMC as focusable objects (picture plane in 3-D + particles + dot + hit sphere), 44 real dwarfs, labels. **Collision text (checked on the web):** Sawala et al. 2025, Nature Astronomy, DOI 10.1038/s41550-025-02563-1: ~50% merger within 10 Gyr (~2% within 5 Gyr); Wu et al. 2026, ApJL 1001 L19, DOI 10.3847/2041-8213/ae5799: ~90%. Shown as "not settled".
- **Nearby galaxies**: M81, M82, Cen A, M101, M51, M104, NGC 1365, M87 (all focusable), Virgo Cluster (SIMULATED ~1,300 members, 7 named real members).
- **M87 dive (`M87.tsx`)**: picture fades at <1.6 radii; stars ~ r^-1.5 cusp + nuclear cluster; jet SCHEMATIC (PA 288, 17 deg to LOS); nucleus glow sized in metres.
- **M87_END (for Prompt 6)**: target M87 global m `[-5.017458713104402e23, 1.290650920206276e23, 1.804021765496976e22]`, dist 1.92e16 m (1000 rs, rs = 1.92e13 m), azim 92.06, elev -14.42, fov 35, roll 0. Camera is on the Sun's side. The black hole itself is NOT drawn.

## Fix after delivery
- Windows (case-insensitive FS) could not resolve `./MilkyWay` because `milkyway.ts` and `MilkyWay.tsx` collided. The model file is now `mwmodel.ts`. Rule for later sessions: never create two files whose names differ only by case (checked: none left in src/ or tests/).

## Engine / test changes (small, logged)
- `world.ts`: `sky = {alpha, near}`; `Sky.tsx` uniforms `uSkyA`, `uNearA`, attribute `aNear` (six real stars also drawn as 3-D sprites leave the backdrop). Written every frame by `stepGalactic()`.
- `solar/overlay.ts`: optional `testid` arg, one shared stylesheet.
- `tests/path.test.ts`: samples at a fixed 0.03 svh step (was 1/40000 of the journey; thresholds unchanged). `tests/e2e.py`: wheel threshold is physical (half of the old 240 svh because software GL is slower with the heavier scene) and rail ticks = number of zones. New `tests/galactic.test.ts`.
- View directions turn <= 0.5 deg/svh across LG + nearby (first attempt swung 2.5 deg/svh and failed the angle test).

## Tested (headless Chromium, software GL, mostly quality=low)
PASS: typecheck, build, path test (continuity + joins), galactic test, ephemeris test; frames drawn in every new zone and at all four zone seams (no pops seen); label click -> `focus('gx-m31')` -> focused; focus panel on M31 and M101; dive end frames (33 ly and 1.8 ly across); preloader warm-up covers all new objects (it already shows every object at once). e2e (tests/e2e.py, after the two assertion fixes): ALL PASSED, 28 checks, no console errors, 8 rail ticks for 8 zones. The wheel-distance threshold was halved (see above).
NOT tested: real-GPU framerate / hitches (software GL gives ~1 fps), phones, high quality beyond a few frames, real-mouse click on the invisible hit spheres, reduced-motion in the new zones, keyboard focus order of the new labels, window resize while in the new zones.

## Missing assets (placeholders in use)
No Hubble/Webb images exist (nothing may be downloaded). All galaxy pictures are procedural: `galaxy-m31, -m33, -spiral-face, -spiral-edge, -spiral-barred, -elliptical, -irregular, -milkyway-topdown`. LMC and SMC share one picture. Wanted (not present): real images of M31, M33, LMC, SMC, M81, M82, Cen A, M101, M51, M104, NGC 1365, M87, e.g. under `public/textures/real/<id>.webp`; to use one add an ASSETS row and change `tex` in `GALAXIES` (data.ts). Every on-screen note says "procedural illustration, NOT a Hubble/Webb photograph".

## // VERIFY (typed from memory unless noted; all in `data.ts` / `mwmodel.ts`)
Star distances and coordinates (21 stars; Alpha Cen 4.37 ly, Proxima 4.2465, Sirius 8.60, Vega 25.0, ...), Oort edges (2,000-5,000 AU inner, ~100,000 AU outer), 44 dwarf positions/distances, galaxy distances/sizes/inclinations/PAs (M31 2.5 Mly, M33 2.73, LMC 162 kly, SMC 204 kly, M81 11.7, M82 11.4, Cen A 12.4, M101 21 (20-27), M51 28, M104 31, NGC 1365 56), "trillion stars" (M31), "~40 billion" (M33), LMC merger in ~2 Gyr, M82 starburst rate, Cen A black-hole mass, Virgo ~1,300 members, M87 distance 16.8 Mpc and mass 6.5e9 Msun (EHT 2019 values as remembered), jet PA/inclination/length, bar angle 27 deg and half-length 5 kpc, arm radii (sky model's 4.6/7.0/9.9/14.0 kpc, pitch 14.5), Orion Spur size, warp amplitude, Voyager-1 75,000-year claim. Checked on the web: R0 (GRAVITY 2021) and the collision studies.

## Known issues / next
- Sky backdrop is still the view from the Sun until it fades (1,500-12,000 ly); real stars drift against the sky ghosts only in the first ~1.5 ly (handled by `sky.near`).
- Beat text and labels can overlap on busy sky; Milky Way arms read a little ring-like at low tier; M87's jet is not visible at the dive end (it points almost at the camera).
- Next: Prompt 6 (black-hole zones) must start from M87_END above.

# (previous) STATUS — after Prompt 4 (Solar System zone)

## !! Read first: nothing in the browser was run this session
`npm ci` FAILED (no network: ENOTFOUND). `node_modules` in the zip I received was hollow (empty `three`, `vite`, `typescript`, `react`, r3f, tsx, lenis, zustand folders). So `npm run typecheck`, `npm run build`, the e2e suite and every visual check are **UNVERIFIED**. All Prompt 4 rendering code (shaders, components, overlay, event handling) has never been compiled by three/Vite or drawn. Next session with network: `npm ci && npm run typecheck && npm run build`, then `?` open the page and fix whatever breaks FIRST.
What I could run: pure-Node tests under `tsx` (global), with throw-away stub packages for three/react/zustand/lenis/r3f in my sandbox's node_modules (not shipped): `tests/ephemeris.test.ts` (new, passes) and `tests/path.test.ts` (passes, incl. all zone joins). A best-effort `tsc` over the new files with `any`-typed shims reported only shim-induced implicit-any errors, no undefined names/imports/properties. That is the extent of the verification.

## Done (Prompt 4) — files under `src/zones/solar/`, `src/lib/ephemeris.ts`
- **Zone `solar-system`** (500 svh, tick "Planets"), registered by `registerSolar()` called LAST in `src/zones/index.ts` (a bare `import './solar'` would have been hoisted and registered the zone in the wrong order). First camera key == Sun zone's last key (join test passes). Objects: mercury venus mars jupiter saturn uranus neptune pluto ceres (new), **`earth` and `sun` = the existing objects**, and `ss-fx`.
- **Layout (`layout.ts`)**: order true, body radii true, directions from Standish elements (`src/lib/ephemeris.ts`; Ceres from hand-typed elements, phase approximate), eccentricity/inclination kept. Distances compressed: a body at r AU sits `U*sqrt(r/r_earth)` from the Sun, U = the 8x-compressed Earth-Sun distance of the earlier zones (Neptune 5.5 U, Pluto 6.0 U, Mercury 0.56 U, heliopause 11 U). HUD note says so.
- **Date**: 2026-11-08. The scene's fixed SUN_DIR corresponds to Sun longitude 225.57 deg; on that date the Sun is at 225.22 deg; the 0.35 deg residual is removed by rotating the system about the Sun (YAW), so Earth sits exactly at the origin at the start (tested to <1 mm).
- **Time** is tied to scroll (30 simulated days across the zone), not the wall clock, so camera keys aimed at Saturn/Neptune stay exact. Earth moves along its orbit too (0.52 U over the zone, sub-pixel on screen); it is exactly at the origin whenever the zone is not entered. Belts drift at their mean motion. Idle = no orbital motion (planets still spin, x1000 speed-up, said on screen).
- **Planets** (`Planet.tsx`, `shaders.ts`): own shader with true-direction sunlight per planet (not the scene light), wrap terminator for atmospheres, normal maps (Mercury, Mars), oblateness (Jupiter, Saturn, ...), IAU pole tilt/spin incl. retrograde, limb haze. **Saturn rings** = the generated strip, with analytic **ring-on-planet and planet-on-ring shadows** (Uranus and Jupiter rings use the same code, faint). **Venus**: cloud-top map + exaggerated (x4.5) atmosphere shell with forward scatter. Exposure is normalised (real sunlight falls with r^2); ring brightness is floored for legibility (said in the shader comment).
- **Sphere LOD**: three separate meshes (20x10 / 48x24 / tier segments) switched by `visible` at 28 px and 165 px with hysteresis; all three are drawn during the preloader's warm-up so every geometry is on the GPU before the journey.
- **Belts**: asteroid belt 16,000 + Kuiper belt 14,000 points, one draw call each (GPU point sprites with a log-depth-correct shader, not instanced quads: honest deviation from the word "instanced"; same one-draw-call effect). SIMULATED populations (random elements drawn from the published shape: Kirkwood gaps, classical / plutino / scattered), not catalogues. Faint orbit lines for all 10 bodies (Earth's in the accent colour), schematic heliopause shell + circle at ~120 AU (Voyager 1 crossed at ~121 AU, Voyager 2 ~119: // VERIFY).
- **Labels / markers / hover** (`overlay.ts`, `Fx.tsx`): a vanilla-DOM layer (no engine/App edit). Each body: a marker dot where its true disc is < ~4 px (bodies never enlarged), a restrained name label placed radially outward from the Sun, shown for all planets in the overview hold and for a planet when the camera is near it. Labels are real `<button>`s (keyboard + click -> `focus(id)`). Belt / Kuiper / heliopause / Sun captions.
- **Click targets**: every body has an invisible sphere hit area >= 24 px radius (never smaller than the body); hover = pointer cursor + ring + brighter label; click -> `focus(id)` (already implemented by the engine since Prompt 1; Prompt 5 refines focus mode). Hit meshes get a no-op `raycast` whenever the zone is not active (invisible groups still receive R3F events otherwise).
- **Camera** (keys in `solar/index.ts`): Sun (continuous) -> pull back (inner planets) -> overview HOLD at t=0.33-0.43 with every planet in view and labelled -> Saturn flyby (hold, rings and shadows) -> Neptune (hold) -> out past the heliopause to 40 U, looking back. Azimuth decreases monotonically (path test: max angle step 0.050 deg per 1/40000 journey, at the test's limit, camera step 0.0154 x distance).
- **Beats**: five short ones. Numbers: ~120 AU heliopause, four hours of sunlight to Neptune (really 4.2 h), "rings thinner than a house" (// VERIFY: ring thickness is ~10 m typical, claim is loose), Saturn/Neptune texts.
- Engine changes: **none**. `tests/e2e.py`: rail tick count 3 -> 4 (registry grew, not a weakened check). New: `tests/ephemeris.test.ts`.

## Test results (Node only)
- `tsx tests/ephemeris.test.ts`: Earth helio longitude at J2000 100.38 (expected ~100.4); radii inside perihelion/aphelion for all bodies; geocentric longitudes Jupiter 144.8 / Saturn 8.6 / Neptune 1.6 deg (**my first recalled Jupiter range was wrong; I corrected the test range after seeing the output, so this is a plausibility check, not independent proof**); order true; Earth at 1.0000 U; Sun elevation above Saturn's ring plane -8.2 deg (south side lit, matches what I remember for late 2026).
- `tsx tests/path.test.ts`: all PASS (4 zones, 1200 svh total).

## NOT tested (all of the visual work)
Compile of every new shader; the preloader's compile/warm-up with the new objects; R3F pointer events on the hit meshes and `raycast` override; overlay placement/lag; LOD thresholds; Saturn ring shadow correctness and brightness; Venus shell look; belt density/size; orbit-line visibility; any real GPU frame time (30k points + 10 lines + 10 spheres should be light, unmeasured); mobile; portrait framing (the overview key is framed for landscape: on a phone the outer planets fall outside the view in the overview hold, a key set per aspect is still to do); reduced-motion still; `npm test`.

## Known issues / for the next session
- (FIXED in final series step 1) Earth's axial tilt direction.
- Planet maps are procedural, exposure/gains (`gain` in `bodies.ts`) are guesses until seen.
- Hover/click on bodies hidden behind the Sun disc is not occluded.
- Moons of the giants (textures exist) are not placed; focus-mode content is Prompt 5.
- `// VERIFY` additions: all numbers in `ephemeris.ts` (typed from memory), Ceres elements and perihelion date, IAU poles / radii / flattening / spin periods in `bodies.ts`, Kirkwood gaps and Kuiper ranges in `Fx.tsx`, heliopause distance, beat/info-panel facts.

## Next: Prompt 5 (focus mode). First: `npm ci && npm run typecheck && npm run build`, load the page, scroll the Solar System zone and fix what Prompt 4 could not check.

# (previous) # STATUS — after Prompt 3 (Earth, Moon, Sun, sky backdrop)

## Done (Prompt 3)
- **Backdrop** (`src/engine/Sky.tsx`, `src/lib/frames.ts`): Milky Way panorama as a camera-following skybox, galactic -> equatorial J2000 -> ecliptic -> y-up world. `npx tsx tests/frames.test.ts` passes (Galactic Centre at ecliptic lon 266.84 / lat -5.54, NGP at 180.02 / +29.81). // VERIFY: reference values were recalled, not looked up; obliquity 23.439291. Seam-free mip derivatives (textureGrad). Gain 0.55.
- **Stars**: sharp point sprites (136 real bright stars from `stars_bright.json`, 12,000 SIMULATED naked-eye stars `stars_field.bin` via new `tools/texgen/gen/starfield.ts`, 220k simulated faint). The old star textures are no longer preloaded (`preload:false`): GPU estimate 888 -> 728 MB.
- **Earth** (`src/zones/Earth.tsx`): derived normal map (`gen/earthnormal.ts`, NOT real topography), day/night + city lights under cloud, cloud drift (shader uv offset) + cloud shadows, ocean glint, sunlight reddening by air mass, single-scattering Rayleigh+Mie atmosphere (shell, analytic ray-march 14x5 steps). Atmosphere heights exaggerated x1.3 for legibility; optical depth straight down is real. Atmosphere is OFF on the `low` tier (as before).
- **Moon**: unchanged (real albedo + generated relief, tidally locked, near side toward Earth). Same Earth/Moon objects are reused; nothing re-created.
- **Sun** (`src/zones/Sun.tsx`): procedural map + animated 3-D cellular granulation, limb darkening (linear law, // VERIFY coefficients), additive corona/glow quad = the "selective bloom" (no post-processing pass, no new dependency). Granules exaggerated ~5x; corona schematic.
- **Zones**: earth 250 / moon 250 / sun 200 svh (total 700). Camera Earth -> Moon -> Sun is one PCHIP path; joins verified by `tests/path.test.ts` (max step 0.0036 x distance). The Sun is registered once and listed in all three zones, so it never pops in.
- **Layout / honesty**: SUN_DIR is one constant (`zones/common.ts`), now in the ecliptic plane (Sun declination ~ +16 deg with the scene's axial tilt). Earth-Moon distance is TRUE (60.3 Earth radii); the Earth-Sun distance is compressed 8x (Sun placed at 18.7 million km; size true). Brief asked for compressed distances; I kept the Moon true on purpose. HUD notes (new optional `Zone.notes`, `Notes` component) say this and label the procedural/simulated imagery.
- **Beats**: numbers used: 384,400 km, 1.28 s, Moon radius 1,737 km, 8 min 20 s, 109 Earths, 1.3 million Earths by volume, ~5,770 K, 99.86 % of system mass. All recalled, not re-checked: // VERIFY.

## Engine changes (small, logged)
- `journey.ts`: optional `Zone.notes`. `Hud.tsx` + `App.tsx`: `Notes`. `Sky.tsx` rewritten (it is the shared backdrop). `assets.ts`: rows for `earth-normal`, `stars-field`; star textures `preload:false`. `tests/e2e.py`: rail tick count 2 -> 3 (the registry grew; not a weakened check).

## Tested vs not
- TESTED: `npm ci`, `typecheck`, `build`, `tests/path.test.ts`, `tests/frames.test.ts`; headless Chromium (SwiftShader) preloader + screenshots at the `medium` tier; zone-progress sweeps (see below).
- NOT TESTED: any real GPU (frame time, atmosphere cost, Sun shader cost, mobile); `high` tier visuals (screenshot timed out on software GL); full `npm test` e2e after these changes unless listed below; reduced-motion stills for the new zone.
- e2e (`npm test`, low tier, 1280x720): all checks up to and including 'no console errors' PASS (see the end of this note for the scale test).
- Sweeps (`tests/shots.py`, zone-local steps of 5 %, 61 frames): mobile 390x844 (mobile UA, medium tier, 2k textures) 61/61 captured; desktop 1440x900 at the LOW tier (no atmosphere; medium was too slow on software GL, high timed out) only 36/61 captured (the run was killed, frames up to t=0.625). Checked by frame-difference plus a contact sheet of the largest jumps: they all fall in the Moon zone's last stretch (zone-local 0.4-1.0) where the camera swings azimuth 90 -> 250 deg past the Milky Way; consecutive frames are 5 % of the zone apart, so large differences are the pan, not a cut. No seam or pop seen in the frames I looked at; I did NOT view every frame. The Sun-zone frames on desktop were not captured in the sweep (coarse 0.1-step shots looked right).
- Observation: during that Moon-zone swing the Milky Way fills the whole view and is very bright/blotchy (weak procedural panorama). Consider lowering gain further or slowing the swing in Prompt 4+.

## Known weak / next
- Milky Way panorama is the weak procedural image already flagged in ASSETS.md (blotchy dust lane); the stars are fine.
- Earth limb is slightly grey-teal rather than a crisp blue line; Sahara can look bleached in the hero.
- The low tier has no atmosphere.
- Credit for Earth/Moon source imagery still unverified.
- Solar System (Prompt 4) must continue from the Sun zone's last key (target Sun, dist 5 R_sun, azim 135.6, elev 8). The Sun sits at a COMPRESSED distance; planets will need the same compression convention (see `SUN_COMPRESSION` in `zones/common.ts`).

# (previous) # STATUS — after Prompt 2 (image set)

## Done (Prompt 2)
- **Giants** `gen/giants.ts` (+ `lib/bands.ts`): Jupiter 4k+2k (bands at real latitudes, shear-weighted turbulent edges, festoons, GRS ~22S, Oval BA, white ovals, polar cyclone rings), Saturn 4k+2k (north-polar hexagon via `saturnCfg(true)`), Uranus 2k, Neptune 2k (GDS-style vortex, cirrus).
- **Rings** `gen/rings.ts`: Saturn strip (D, C, B, Cassini, A, Encke, Keeler, F; same u range 66,900-140,300 km as before), Uranus strip (37,000-52,500 km), Jupiter faint ring (90,000-230,000 km). Radii all // VERIFY.
- **Moons / dwarf planets** `gen/moons.ts`: Pluto, Charon, Ceres, Io, Europa, Ganymede, Callisto, Titan (haze globe), Enceladus, Triton (1k-2k).
- **Sky** `gen/sky.ts`: Milky Way panorama in GALACTIC coords from a ray-integrated 3D model (8k / 2k mobile / optional 4k mid), star layer (~136 real bright stars + simulated field; 8k / 2k / optional 4k), `stars_faint.bin` (220k simulated points, 6 B each), `stars_bright.json` (+ equatorial->galactic matrix), dark fallback gradient. Convention `u=(180-l)/360, v=(90-b)/180`.
- **Galaxies** `gen/galaxies.ts`: face-on spiral, edge-on, barred, elliptical (M87-style), irregular (LMC-style), M31-like (inc 77, PA 35), M33-like (inc 54, PA 23), Milky Way top-down ILLUSTRATION; 2k RGBA webp (straight alpha), 1k mobile files.
- **Cosmos** `gen/cosmos.ts`: CMB (exact spherical Gaussian field, l>=2 so dipole removed, rms ~107 uK; colour +-300 uK plus a grey temperature map), cosmic-web slice, tileable dust noise, black-hole accretion-disc noise strip.
- **Budget/tiers**: `gen/tiers.ts` derives mobile files (sky 2k, galaxies 1k, cosmic web 1k); `npm run textures:report` (= `check:budget`) writes `docs/TEXTURE_REPORT.md`. Desktop transfer 30.2 MB of 60; mobile 17.7 MB; est. GPU (RGBA8+mips) desktop ~888 MB (soft limit 900), mobile ~328 MB (soft 300: slightly over).
- **Engine registry** (`src/engine/assets.ts`, `preload.ts`): every file has a `tier` ('core' | 'hi' | 'mid'); new `kind: 'data'` assets (fetched by the preloader into `getData(id)`); 4k sky files registered with `preload: false`. No zone code touched.
- `docs/ASSETS.md` has the realism rating table (source: `tools/texgen/data/realism.md`). Tools: `tools/texgen/globes.ts` (orthographic globe previews), `ringview.ts`.

## What I actually tested vs not
- TESTED: every generator runs end to end at full size; outputs viewed (flat maps, globe previews of giants/moons, ring strips, galaxy sheets, cosmos sheet, sky panorama); `tsc` strict typecheck of `tools/texgen/**` passes; esbuild syntax check of the edited `assets.ts` / `preload.ts`; report/budget script passes (no FAIL).
- NOT TESTED (unverified): `npm ci`, `npm run typecheck`, `npm run build` and the e2e tests could NOT run: no network, and the offline toolbox lacks react / r3f / lenis / zustand / vite client types. The `assets.ts` / `preload.ts` edits are therefore UNVERIFIED in the app (decoding the new webp/png, the data-kind branch, GPU upload of ~55 textures, GPU memory on real devices). Next session with network: run `npm ci && npm run typecheck && npm run build` FIRST.
- Visual quality was judged from previews only (no in-app lighting).

## Needs attention
- **Weak images**: Milky Way panorama (smooth lens-shaped halo, thin rift), M31 look-alike, cosmic web. See ASSETS.md.
- GPU memory: desktop est. ~888 MB is at the soft limit; consider lowering sky to 4k on integrated GPUs (the 4k files exist, `milkyway-4k` / `stars-4k`) or not preloading unused zone textures.
- CMB colour range is +-300 uK (Planck's own); the brief said ~+-100: use `cmb-temp` for any other scale.
- `data/sky.ts` was NOT in the zip, so the bright-star table was typed from memory (no port). Verify before labelling stars.
- The old `saturn_rings_4k.png` was regenerated (same radii window, new structure); the older Saturn ring shader should still work.
- Single-CPU generation times: sky ~5.5 min, others < 1 min each.

## // VERIFY list (all generator constants with real-world coordinates/values)
Ring radii (all rings, `gen/rings.ts`); band latitudes and feature positions of Jupiter/Saturn/Uranus/Neptune (`gen/giants.ts`); Pluto Sputnik/Tombaugh/Cthulhu extents, Charon Mordor/Vulcan/Serenity, Ceres crater table (Kerwan, Yalode, Urvara, Occator, Haulani, Oxo, Dantu, Ahuna Mons), Io volcano table (Pele, Loki, Pillan, Prometheus, Tvashtar, Amirani, Culann, Marduk, Masubi, Zamama, Surt, Ra, Maui), Europa chaos sites + Pwyll, Ganymede dark regions + rayed craters, Callisto Valhalla/Asgard, Triton cantaloupe region, Enceladus stripe geometry (`gen/moons.ts`); dark-cloud table, arm radii/pitch, bar angle, R0 (`gen/sky.ts`); the whole bright-star table (`data/brightStars.ts`); CMB band powers (`gen/cosmos.ts`); M31/M33 inclination and PA (`gen/galaxies.ts`).

## Next: Prompt 3
Zones using these assets (Sun, Solar System with planets/moons/rings, sky/Milky Way layers via the galactic matrix, galaxies, cosmos). First: `npm ci && npm run typecheck && npm run build`, then check the preloader with the enlarged manifest.

# (previous) STATUS — after Prompt 1 (foundation)

## Built

- **Stack:** Vite 6, React 19, TypeScript, three 0.170, @react-three/fiber 9, Tailwind 4, lenis, zustand. `npm run build` and `npm run typecheck` pass.
- **Engine (`src/engine`)**
  - One R3F Canvas, mounted once (`Engine.tsx`); a single per-frame `Driver` runs scroll → critically-damped smoother → keyframed path → join/focus blend → floating-origin camera → object placement.
  - Zone registry in `journey.ts` (zones, objects, branches, ranges computed from svh budgets). Camera path = one global PCHIP spline (C1, no overshoot, log-distance), `path.ts`.
  - Scale: double-precision camera-relative placement, `k = 10 / distance` every frame, logarithmic depth buffer, near 0.01 / far 1e11 render units.
  - Preloader: manifest-driven (`assets.ts`), byte-accurate fetch progress, decode, Moon relief build, `renderer.initTexture` for every texture, `compileAsync` of all shaders, one warm-up frame per zone. 100 % before the journey starts.
  - Quality tiers high/medium/low (auto + manual, persisted), DPR cap, 2k mobile texture tier, reduced-motion mode (no tall page, cross-fade between zone stills, Prev/Next).
  - HUD: zone title, live scale readout in real units, progress rail with labelled keyboard-accessible ticks (adjacent = fly, far = cross-fade), text beats, focus panel, choice-gate overlay, loading screen.
  - Hooks: `focus/release`, `choiceGate` + branch sub-timelines (`api.ts`).
- **Zones registered:** `earth` (hero "WE ARE HERE.", 250 svh) and `moon` (Earth→Moon placeholder, 250 svh). Total 500 svh.
- **Texture toolkit (`tools/texgen`, `npm run textures`):** seeded simplex/fBm/ridged/billow/domain-warp/Worley on the unit sphere (no seam, no pinching), crater stamping (power-law sizes, rims, ejecta, central peaks, rays, degradation), radial/path feature stamping, ramps, height→normal/hillshade, PNG/JPG/WebP writers, alpha ring-strip generator, manifest → `ASSETS.md` + `public/textures/manifest.json`, contact sheet, idempotent cache.
- **Generated:** Sun 4k (+2k mobile), Mercury 2k + normal, Venus clouds 2k, Venus radar 2k (credits/reference only), Mars 2k + normal, Saturn ring strip. Desktop payload 11.6 MB, mobile 6.4 MB (budget 60).
- **Ported from the old zip:** tokens/CSS, `solarSystem.ts`, `cosmology.ts`, `cosmicField.ts` (now with z), `scale.ts` (from cosmicScale constants, no timeline), Moon relief (`lunarDetail.ts` + `moonRelief.ts`, run by the preloader with progress), black-hole constants (`blackHole.ts`, plus M87*). Dropped chapters were not ported.

## Verified (headless Chromium, software GL, `tests/`)

- Preloader reaches 100 % monotonic, no console errors.
- Wheel scrolling: t never reverses; no jumps (rate-normalised).
- Path continuity (Node, 40,000 samples): max camera step 0.0029 × distance; zone join seamless.
- `focus('earth')` pauses scroll; `release()` restores the exact t and scrollY.
- `choiceGate` → branch → return restores the exact main scroll position.
- Rail ticks keyboard accessible; reduced motion removes the tall page and cross-fades; quality toggle applies live.
- **Scale test flight** (`?test=scale`): 11 decades from 1 to 1e10 Earth radii × 3 sub-steps, camera target ~3000 distances from the origin. Max centroid error **0.053 px** (limit 0.6), sphere area within 1 %, far sphere (3e6 × D beyond) renders at the right size (within 7 %), two quads 2e-5 apart in depth: **0 z-fighting pixels**, near sphere never clipped.

## Honest limits

- **Not verified on a real GPU.** Everything above ran on SwiftShader (~5 fps). Frame time, mobile, and `KHR_parallel_shader_compile` behaviour are untested. A warning that this extension is absent appears in the headless run.
- The scale test has no negative control (a build with float32 world coordinates or no log depth was not run to show the test failing).
- Texture tier change (low ↔ high) requires a reload because every texture is loaded up front.
- `ASSETS.md`: Earth/Moon credit still needs checking (source product not recorded in the old project). Network attempt for real NASA textures failed (no DNS) and must not be retried.
- Moon end framing and Earth hero framing are tuned by eye only on 1280×720 and 1600×500.

## Texture honesty: what still looks synthetic

- **Sun:** reads as a photosphere with spots, but granules are speckle-like (thin bright cores) rather than cells with clear dark lanes, penumbrae lack radial filaments, and granule size is exaggerated ~4×. No prominences/corona (not a texture).
- **Mercury:** the best of the set. Crater density and shading are believable; rays are thin and slightly "starburst", the Caloris interior spokes look stripy, craters are a little too uniformly crisp, and polar rows are stretched (normal for equirect).
- **Venus clouds:** the V/chevron structure is right but very soft; it has no fine cloud detail at close range.
- **Venus radar:** reference only; continents look like soft blobs, not Magellan tessera/lava-flow detail.
- **Mars:** major features sit at their real positions (Tharsis, Olympus, Valles Marineris, Hellas, Argyre, Syrtis...), colour is believable; but terrain between features is generic fBm, small craters are too crisp and evenly distributed, no dune fields, gullies or layered deposits, canyon floors are plain. The polar caps are smooth discs with a ragged edge.
- Albedo maps bake a mild hill-shade; the normal maps add real lighting on top.
- Several coordinates are marked `// VERIFY` in the generators (Caloris centre used 30.5°N 170.2°W vs the brief's ~160°W; Debussy, Mozart, Bach, Eminescu, Tyagaraja, Han Kan, Hecates/Albor Tholus radii, several Mars albedo-marking centres).

## Next: Prompt 2

Suggested: the Sun zone (use `sun` texture + limb-darkening shader + glow), then the Solar System zone (planet objects from `solarSystem.ts`, textures already preloaded for Mercury/Venus/Mars, rings strip for Saturn, `focus()` on click). Budgets in BRIEF.md.

## Nebula pass (Orion smoothness, Crab colours)
- Orion/Crab no longer run their heavy slice shader every frame. `NebulaBake` (src/zones/content/nebulaShaders.ts) renders each nebula ONCE into a half-float texture (2048/1536/1024 px by quality tier), one strip per frame (20-24 frames), starting shortly before the nebula fades in. On screen it is a single textured quad. A nebula with ~zero opacity is not drawn at all.
- Orion's look is unchanged (same shader, baked at full detail). Crab was re-coloured after the Hubble image: fibrous cyan-blue synchrotron core, orange/amber/red filaments, yellow-green and teal threads, filaments in front hiding the blue behind them.
- Trade-off: the baked sheet has only gentle parallax as the camera drifts (it is no longer a live volume).

## Sagittarius A* pass (EHT-style black hole + zoom)
- New `src/zones/content/ringShader.ts`: an analytic, EHT-2022-style ring (dark shadow that really hides the stars behind it, lopsided Doppler-bright ring, thin photon ring, slowly turning clumps). One camera-facing quad, a few noise reads per pixel (no ray tracing). It takes over from the plain glow once it is big enough on screen. Drawn ~1,200x larger than true scale next to the schematic S-stars (stated in the panel tag).
- Zoom while focused on Sgr A* only: wheel, pinch, `+` / `-` keys and on-screen buttons (`focus.zoom` in journey.ts; `zoomState`/`focusZoomBy` in engine/api.ts; input in hud/Hud.tsx). In 2.2x, out 7.5x, smoothed; resets on every new focus. Other objects still lock the wheel.
- Default focus distance 3.0 -> 1.6 radii so the ring is the first thing seen.


# Smoothness + loading pass (NOT compiled or run in the authoring sandbox: no node_modules / network; run `npm ci && npm run typecheck && npm run build` first)

Loading (same guarantee: the journey starts only when everything is loaded, uploaded and warmed):
- `src/engine/preload.ts`: stage 1 can start before React (`startPrefetch()` in main.tsx); biggest files requested first; every file decoded as soon as its bytes arrive (max 3 decodes at once); the Moon relief starts as soon as the Moon texture is decoded (parallel with the downloads); repeat visits read from the Cache API (key = url + manifest byte size, so a regenerated texture is refetched). Progress is still one monotonic bar (weights unchanged).
- GPU upload yields by time (~10 ms) through a MessageChannel instead of `setTimeout(0)` every 3 textures. Warm-up renders once per distinct (timeline, object set) (the 6 infall stages were warmed 6 times), 1 frame each instead of 2.
Smoothness:
- `journey.ts ranges()` memoised per registry version (it rebuilt every zone object several times per frame); Driver and BHBody no longer allocate a Set / Vector3s every frame.
- `AdaptiveRes.tsx`: if the frame time is sustained > 23 ms the canvas pixel ratio steps down by 0.25 (floor 1), probes back up after ~12 s of keeping up; off while loading, in the black hole (own guard) and when the cap is 1.
- Focus flights (`Driver.tsx blend(..., zoomPan)`): the look-at point now moves in proportion to the DISTANCE travelled, not to the eased time, so the object stays in frame during big zooms (max off-axis offset 8x -> 1x in the 100x zoom case) and fly-out is the exact mirror. Longer zooms take up to 45 % more time (`focusState.stretch`). The slow orbit drift eases in after arriving and out when leaving (`driftRate`). Rail jumps use ease-in-out (start at rest).
