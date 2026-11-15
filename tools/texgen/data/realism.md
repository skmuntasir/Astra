<!-- REALISM-START -->
## Realism ratings (honest; set by the Prompt 2 session after viewing contact sheets and globe previews)

good = convincing at the intended screen size; acceptable = reads correctly, flaws visible on close inspection; weak = a placeholder to improve before it is the hero of a scene. Every image here is procedural (or derived from one); none is a photograph or survey data. (Source of truth: `tools/texgen/data/realism.md`, injected into this file by `npm run textures`.)

| image | rating | notes / what to improve |
|---|---|---|
| jupiter 4k/2k | **good** | Belt/zone latitudes, turbulent belt edges, festoons, GRS + Oval BA + white ovals, polar cyclone rings. Improve: more white plumes/filaments, GRS interior texture. |
| saturn 4k/2k | **good** | Pale gold bands, small storms, north-polar hexagon (`saturnCfg(hexagon)` switch in gen/giants.ts). Improve: a little more southern band contrast. |
| uranus 2k | **good** | Deliberately near-featureless; bright south cap, faint bands, a few methane clouds. |
| neptune 2k | **acceptable** | Great-Dark-Spot style vortex reads well; cirrus streaks are somewhat dotty. |
| saturn / uranus / jupiter rings | **acceptable** | Saturn D/C/B/Cassini/A/Encke/Keeler/F structure from published radii (all // VERIFY); ringlet noise is generic, no spokes or F-ring braiding. Uranus/Jupiter strips are intentionally faint. |
| pluto 2k | **acceptable** | Heart (Sputnik + right lobe), Cthulhu belt, tholin palette. Heart is too clean/blobby; convection cells only visible in close-ups; no bladed-terrain detail. |
| charon 1k | **acceptable** | Mordor cap and craters fine; the chasma is a single, rather straight trough. |
| ceres 1k | **acceptable** | Dark cratered surface, Occator faculae (tiny at 1k). |
| io 2k | **acceptable** | Sulfur mottling, paterae, Pele-type red rings; rings look slightly artificial. |
| europa 2k | **good** | White-tan ice with brown lineae/cycloids, chaos patches, lenticulae, Pwyll rays. |
| ganymede 2k | **acceptable** | Dark/bright terrain and grooves read; dark regions blobby, grooves faint. |
| callisto 2k | **acceptable** | Dark saturated craters, Valhalla rings visible; very low contrast. |
| titan 2k | **acceptable** | Smooth orange haze globe by design; the renderer should add the detached blue limb haze. |
| enceladus 1k | **acceptable** | Very bright ice, four tiger stripes; may look over-exposed under strong light. |
| triton 2k | **acceptable** | Pink ice, cantaloupe cells, south cap, wind streaks. Cells too regular; northern hemisphere invented. |
| milkyway 8k/4k/2k | **weak** | 3D-model panorama in galactic coords with bulge, plane, dust lane, Magellanic Clouds; but the disc halo is smooth and lens-shaped, the Great Rift is only a thin lane, arms are not distinguishable. Needs a narrower, patchier band. |
| stars 8k/4k/2k | **acceptable** | ~136 real bright stars (typed from memory, // VERIFY) with flux-correct PSFs and B-V colours, plus 6500 simulated field stars. |
| stars_faint.bin | **acceptable** | 220k SIMULATED faint stars (density from the model). Format in the manifest `usage` field. |
| sky_fallback_256 | **good** | Very dark gradient with faint plane glow, by design. |
| galaxy spiral face / barred / m33 / milkyway top-down | **acceptable** | Clear arms, HII knots, dust on inner edges; arms thin, disc fill too uniform. |
| galaxy edge-on | **good** | Thin disc, bulge, dust lane. |
| galaxy elliptical | **acceptable** | Smooth de Vaucouleurs light + globular swarm; slightly flat; the blue jet is a stylised hint. |
| galaxy irregular | **acceptable** | LMC-like bar and clumps; a little blurry. |
| galaxy m31 | **weak** | Right inclination/PA, ring and companions, but reads as a lens-shaped disc; M32/M110 placement is schematic. |
| cmb color / temp | **good** | Exact Gaussian field on the sphere (rms ~107 uK), dipole removed, Planck-like spectrum (hand-fitted band powers, // VERIFY). Colour range is +-300 uK (Planck's own scale); the brief's +-100 would clip ~1/3 of the sky, so use `cmb_temp` (grey, 0.5 = mean, +-300 uK full range) if the shader wants another scale. |
| cosmic web | **weak** | A few filaments/caustics over speckle; not a dense cobweb. Needs a proper 2LPT/N-body-like run or a Voronoi-based approach. |
| dust noise 1k | **acceptable** | Blend-tiled turbulence; fine as a mask/multiplier. |
| bh disc noise | **acceptable** | Sheared turbulence strip with hot spots. Real EHT images are NOT included (none were used). |

Notes for later sessions:
- Everything with coordinates (Pele, Loki, Occator, Valhalla, Tombaugh Regio, Great Dark Spot, ring radii, dark clouds, bright-star table) is marked `// VERIFY` in the generator and listed in STATUS.md.
- `data/sky.ts` of the old project was NOT in the zip handed to this session: `tools/texgen/data/brightStars.ts` was typed from memory and is NOT a port.
- Sky texture convention (galactic): `u = (180 - l) / 360`, `v = (90 - b) / 180`. `stars_bright.json` carries the equatorial -> galactic matrix.
<!-- REALISM-END -->
