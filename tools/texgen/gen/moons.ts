import { Simplex, worley3, makeWorley } from '../lib/noise'
import { makeGrid, forEachPixel, type Grid } from '../lib/sphere'
import { makeRamp, hex, type RGB } from '../lib/ramps'
import { rng, smoothstep, clamp, DEG, type Rng } from '../lib/rng'
import { newCraterField, sampleDiameters, stampCrater, addRadial, addPath, type Crater, type CraterField } from '../lib/craters'
import { shadedRelief } from '../lib/relief'
import type { Ctx } from '../lib/ctx'

/**
 * Dwarf planets and moons. All procedural (no spacecraft data used): named features are PLACED at published
 * coordinates (east-positive longitudes; west longitudes in the sources are converted) and then filled with generic terrain,
 * so every position below is approximate and carries // VERIFY. Nothing here is a photograph.
 */
const mkRay = (seed: number) => {
  const rn = new Simplex(700 + seed)
  return (a: number) => clamp(rn.noise(Math.cos(a) * 6, Math.sin(a) * 6, 1.7 + seed) * 1.5 + 0.15)
}
const lonE = (west: number) => { let l = -west; while (l > 180) l -= 360; while (l < -180) l += 360; return l } // west-longitude -> east-positive
const eL = (east: number) => (east > 180 ? east - 360 : east)

interface Env { g: Grid; W: number; H: number; R: number; N: Simplex; N2: Simplex; N3: Simplex; r: Rng; kmPx: number }
function env(ctx: Ctx, nominal: number, R: number, seed: number): Env {
  const W = ctx.W(nominal), H = W / 2
  return { g: makeGrid(W, H), W, H, R, N: new Simplex(seed), N2: new Simplex(seed + 1), N3: new Simplex(seed + 2), r: rng(seed + 3), kmPx: (2 * Math.PI * R) / W }
}
const uni = (r: Rng) => ({ lat: Math.asin(r.range(-1, 1)) / DEG, lon: r.range(-180, 180) })

/** A crater population (power law, oldest first), optionally skipping places where `skip(i)` is true. */
function population(e: Env, f: CraterField, n: number, dmin: number, dmax: number, b: number, o: { skip?: (idx: number, d: number) => boolean; deg?: [number, number]; fresh?: number; peak?: number; fill?: number } = {}) {
  const { g, W, H, R, r } = e
  const sizes = sampleDiameters(r, Math.round(n * (W / 2048) ** 2), dmin, dmax, b)
  let k = 0
  for (const d of sizes) {
    const { lat, lon } = uni(r)
    const idx = ((0.5 - lat / 180) * H | 0) * W + (((lon + 180) / 360) * W | 0)
    if (o.skip?.(Math.max(0, Math.min(W * H - 1, idx)), d)) continue
    const age = Math.pow(r.next(), 0.7)
    const deg = (o.deg?.[0] ?? 0.1) + ((o.deg?.[1] ?? 1) - (o.deg?.[0] ?? 0.1)) * age
    const c: Crater = { lat, lon, d, deg, peak: d > 30 && d < 250 && r.next() < (o.peak ?? 0.5), rays: age < (o.fresh ?? 0.05) && d > 8 ? r.range(0.3, 0.9) : 0, floorFill: o.fill }
    stampCrater(f, g, R, c, mkRay(k++))
  }
}

/** Random-walk linear features (fractures, lineae, grooves). Returns polylines in (lat, lon). */
function walk(r: Rng, lat: number, lon: number, steps: number, stepDeg: number, bend: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [[lat, lon]]
  let th = r.range(0, Math.PI * 2)
  for (let s = 0; s < steps; s++) {
    th += r.gauss() * bend
    lat += Math.cos(th) * stepDeg
    lon += (Math.sin(th) * stepDeg) / Math.max(0.2, Math.cos(lat * DEG))
    if (Math.abs(lat) > 82 || Math.abs(lon) > 176) break
    pts.push([lat, lon])
  }
  return pts
}
function paint(field: Float32Array, e: Env, pts: Array<[number, number]>, maxKm: number, fn: (dKm: number, along: number) => number) {
  if (pts.length < 2) return
  let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180
  for (const [a, b] of pts) { la0 = Math.min(la0, a); la1 = Math.max(la1, a); lo0 = Math.min(lo0, b); lo1 = Math.max(lo1, b) }
  const m = (maxKm / e.R) / DEG
  const cl = Math.max(0.15, Math.cos(Math.max(Math.abs(la0), Math.abs(la1)) * DEG))
  addPath(field, e.g, e.R, pts, maxKm, fn, { lat: [Math.max(-90, la0 - m), Math.min(90, la1 + m)], lon: [Math.max(-180, lo0 - m / cl - 1), Math.min(180, lo1 + m / cl + 1)] })
}
const ellipse = (rx: number, ry: number) => (d: number, az: number) => d * Math.hypot(Math.cos(az) / rx, Math.sin(az) / ry)
const mixTo = (c: RGB, t: RGB, k: number) => { c[0] += (t[0] - c[0]) * k; c[1] += (t[1] - c[1]) * k; c[2] += (t[2] - c[2]) * k }

const REC = (file: string, gen: string, zone: string, usage: string, credit: string) => ({
  file, kind: 'procedural' as const, generator: `tools/texgen/gen/moons.ts (${gen})`, zone, usage, credit, tier: 'core' as const, colorSpace: 'srgb' as const,
})
const CREDIT = 'ASTRA procedural (not a photograph; named features placed at published coordinates, // VERIFY)'

// ================================================================== PLUTO
export async function genPluto(ctx: Ctx) {
  const e = env(ctx, 2048, 1188.3, 5101), { g, W, H, R, N, N2, N3, r } = e
  const sput = new Float32Array(W * H), lobe2 = new Float32Array(W * H), cth = new Float32Array(W * H)
  // Tombaugh Regio "heart": Sputnik Planitia = the left lobe (~1000 km), the right lobe is bright highland.  // VERIFY all centres
  addRadial(sput, g, R, 18, 178, 900, (d, az) => 1 - smoothstep(0.82, 1.0, ellipse(430, 560)(d, az)))
  addRadial(sput, g, R, -6, 186, 700, (d, az) => 0.9 * (1 - smoothstep(0.7, 1.0, ellipse(250, 330)(d, az)))) // southern tip of the heart
  addRadial(lobe2, g, R, 27, eL(213), 900, (d, az) => 1 - smoothstep(0.7, 1.0, ellipse(430, 380)(d, az)))
  // Cthulhu Macula: dark reddish equatorial belt west of the heart, ~3000 km long, ~750 km wide  // VERIFY extents
  forEachPixel(g, (x, y, px, py, pz, i) => {
    const lon = g.lon[x] / DEG, lat = g.lat[y] / DEG
    const wob = 6 * N.fbm(px * 3, py * 3, pz * 3, 3)
    const inLon = smoothstep(18, 36, lon + wob * 2) * (1 - smoothstep(150, 168, lon + wob * 2))
    const inLat = Math.exp(-Math.pow((lat + 4 + wob) / 15, 4))
    cth[i] = clamp((inLon * inLat) * (0.75 + 0.5 * N.fbm(px * 7 + 4, py * 7, pz * 7, 4)) - 0.05)
  })
  const f = newCraterField(g)
  population(e, f, 4500, Math.max(7, e.kmPx * 2.4), 300, 1.9, { skip: (i, d) => (sput[i] > 0.15 && d < 400) || (lobe2[i] > 0.6 && d < 15), deg: [0.15, 1], fresh: 0.03 })
  const h = new Float32Array(W * H)
  const wr = makeWorley()
  const ramp = makeRamp([[0, '#2a1710'], [0.25, '#5b3523'], [0.45, '#8a5a3c'], [0.62, '#b88a64'], [0.8, '#dcc2a4'], [1, '#f6efe6']])
  const rgb = new Float32Array(W * H * 3)
  const col: RGB = [0, 0, 0]
  forEachPixel(g, (x, y, px, py, pz, i) => {
    const lat = g.lat[y], al = Math.abs(lat)
    h[i] = 0.5 * N.ridged(px * 4, py * 4, pz * 4, 4) + f.height[i] * 1.2 + 0.1 * N2.fbm(px * 40, py * 40, pz * 40, 3)
    let v = 0.5 + 0.16 * N.fbm(px * 2.2, py * 2.2, pz * 2.2, 4) + 0.07 * N2.fbm(px * 12, py * 12, pz * 12, 4) + 0.03 * N3.noise(px * 90, py * 90, pz * 90)
    v -= 0.3 * smoothstep(0.15, 0.7, cth[i])
    v += 0.5 * f.bright[i]
    // bright methane frost on equatorial ridges / bladed terrain: elongated ridged noise inside lobe 2 and east of it
    const blade = N2.ridged(px * 14, py * 5, pz * 14, 3)
    const frost = smoothstep(0.35, 0.7, lobe2[i] + 0.25 * N.fbm(px * 8 + 9, py * 8, pz * 8, 4) + 0.28 * smoothstep(-150, -105, g.lon[x] / DEG) * (1 - smoothstep(-105, -80, g.lon[x] / DEG)) * (1 - smoothstep(0, 50, Math.abs(g.lat[y] / DEG - 22)))) * (0.75 + 0.35 * blade)
    v += 0.28 * frost
    // dark reddish polar cap (Lowell Regio) in the north
    v -= 0.22 * smoothstep(52 * DEG, 78 * DEG, lat) * (0.7 + 0.3 * N.fbm(px * 5, py * 5, pz * 5, 3))
    let tint = clamp(smoothstep(0.15, 0.7, cth[i]) * 1.2 + smoothstep(55 * DEG, 80 * DEG, lat) * 0.5)
    ramp(clamp(v), col)
    mixTo(col, [0.45, 0.17, 0.09], tint * 0.28)
    // Sputnik Planitia: convection cells (nitrogen ice), brighter cream-pink interior, darker cell edges, no craters
    const s = smoothstep(0.4, 0.62, sput[i] + 0.22 * N.fbm(px * 8 + 2, py * 8, pz * 8, 4) + 0.06 * N2.fbm(px * 30, py * 30, pz * 30, 3))
    if (s > 0.02) {
      const fq = R / 26
      worley3(px * fq, py * fq, pz * fq, 11, wr, 1)
      const edge = smoothstep(0.0, 0.12, wr.f2 - wr.f1)
      const inside = 0.9 + 0.05 * wr.id + 0.04 * N.fbm(px * 25, py * 25, pz * 25, 2)
      const sc: RGB = [0.96 * inside, 0.89 * inside, 0.82 * inside]
      const dark = 0.88 + 0.12 * edge
      mixTo(col, [sc[0] * dark, sc[1] * dark, sc[2] * dark * 0.98], clamp(s * 1.15))
      // the western rim of the basin is darker (a thin band of water-ice mountains and dark material)
      h[i] -= 2.5 * s
    }
    rgb[i * 3] = col[0]; rgb[i * 3 + 1] = col[1]; rgb[i * 3 + 2] = col[2]
  })
  const hs = shadedRelief(h, g, R, 5, 310, 40)
  for (let i = 0; i < W * H; i++) { const k = 1 + 0.35 * (hs[i] - 0.55) * (1 - 0.8 * Math.min(1, sput[i])); rgb[i * 3] *= k; rgb[i * 3 + 1] *= k; rgb[i * 3 + 2] *= k }
  await ctx.save(REC('pluto_2k.jpg', 'Pluto: Sputnik cells, Cthulhu, craters', 'solar-system', 'Pluto albedo/colour (Tombaugh Regio heart ~20N 180E, dark Cthulhu, tholin red-brown)', CREDIT), rgb, W, H, 3, { format: 'jpg', quality: 91 })
  void r
}

// ================================================================== CHARON
export async function genCharon(ctx: Ctx) {
  const e = env(ctx, 1024, 606, 5201), { g, W, H, R, N, N2, N3, r } = e
  const f = newCraterField(g), h = new Float32Array(W * H), plain = new Float32Array(W * H)
  // Vulcan Planum: smoother plains in the southern hemisphere, crossed by Serenity Chasma  // VERIFY extents
  addRadial(plain, g, R, -15, 20, 700, (d, az) => 1 - smoothstep(0.7, 1.0, ellipse(520, 420)(d, az)))
  population(e, f, 2600, Math.max(5, e.kmPx * 2.4), 120, 1.8, { skip: (i, d) => plain[i] > 0.5 && d < 40 && r.next() < 0.9, deg: [0.1, 0.9], fresh: 0.05 })
  const chasma: Array<[number, number]> = [[22, -95], [14, -50], [10, -10], [4, 30], [-6, 70], [-14, 110]] // VERIFY: Serenity Chasma, approximate course
  const trough = new Float32Array(W * H)
  paint(trough, e, chasma, 60, (d) => Math.exp(-Math.pow(d / 14, 2)) - 0.25 * Math.exp(-Math.pow((d - 30) / 10, 2)))
  const ramp = makeRamp([[0, '#3d3b3a'], [0.35, '#6e6b68'], [0.6, '#9a9693'], [0.85, '#c3bfba'], [1, '#e8e4de']])
  const rgb = new Float32Array(W * H * 3)
  const col: RGB = [0, 0, 0]
  forEachPixel(g, (x, y, px, py, pz, i) => {
    const lat = g.lat[y]
    h[i] = 0.35 * N.ridged(px * 4, py * 4, pz * 4, 4) * (1 - 0.7 * plain[i]) + f.height[i] - 4 * trough[i] + 0.05 * N2.fbm(px * 60, py * 60, pz * 60, 3)
    let v = 0.55 + 0.07 * N.fbm(px * 3, py * 3, pz * 3, 4) + 0.04 * N2.fbm(px * 14, py * 14, pz * 14, 3) + 0.02 * N3.noise(px * 80, py * 80, pz * 80) + 0.5 * f.bright[i]
    v += 0.05 * plain[i]
    ramp(clamp(v), col)
    // Mordor Macula: reddish-brown northern polar cap with a ragged edge  // VERIFY extent
    const m = smoothstep(55 * DEG, 72 * DEG, lat + 0.08 * N.fbm(px * 4, py * 4, pz * 4, 3)) 
    mixTo(col, [0.47, 0.27, 0.2], 0.78 * m)
    rgb[i * 3] = col[0]; rgb[i * 3 + 1] = col[1]; rgb[i * 3 + 2] = col[2]
  })
  const hs = shadedRelief(h, g, R, 6, 310, 40)
  for (let i = 0; i < W * H; i++) { const k = 1 + 0.4 * (hs[i] - 0.55); rgb[i * 3] *= k; rgb[i * 3 + 1] *= k; rgb[i * 3 + 2] *= k }
  await ctx.save(REC('charon_1k.jpg', 'Charon: grey ice, Mordor cap, Vulcan Planum', 'solar-system', 'Charon albedo/colour (grey ice, reddish north-polar Mordor Macula)', CREDIT), rgb, W, H, 3, { format: 'jpg', quality: 91 })
}

// ================================================================== CERES
export async function genCeres(ctx: Ctx) {
  const e = env(ctx, 1024, 469.7, 5301), { g, W, H, R, N, N2, N3 } = e
  const f = newCraterField(g)
  const named: Array<Crater & { name: string }> = [ // lat, east-lon, diameter km // VERIFY (IAU gazetteer values from memory)
    { name: 'Kerwan', lat: -10.8, lon: eL(123.9), d: 284, deg: 0.75, floorFill: 0.3 },
    { name: 'Yalode', lat: -42.6, lon: eL(292.5), d: 260, deg: 0.6, floorFill: 0.2 },
    { name: 'Urvara', lat: -45.7, lon: eL(248.9), d: 170, deg: 0.45, peak: true },
    { name: 'Occator', lat: 19.8, lon: eL(239.3), d: 92, deg: 0.08, peak: false },
    { name: 'Haulani', lat: 5.8, lon: eL(10.8), d: 34, deg: 0.02, rays: 0.9 },
    { name: 'Oxo', lat: 42.2, lon: eL(359.3), d: 10, deg: 0.0, rays: 0.5 },
    { name: 'Dantu', lat: 24.3, lon: eL(138.2), d: 126, deg: 0.3 },
  ]
  const big = named.filter((c) => c.d > 120)
  for (const c of big) stampCrater(f, g, R, c, mkRay(1))
  population(e, f, 7000, Math.max(4, e.kmPx * 2.2), 110, 2.1, { deg: [0.1, 1], fresh: 0.03, peak: 0.3 })
  for (const c of named.filter((c) => c.d <= 120)) stampCrater(f, g, R, c, mkRay(9))
  const faculae = new Float32Array(W * H)
  const occ = named[3]
  // Cerealia Facula: ~15 km bright dome in the centre of Occator, Vinalia Faculae: smaller scattered bright patches to the east
  addRadial(faculae, g, R, occ.lat, occ.lon, 30, (d) => 1.0 * (1 - smoothstep(4.2, 6.8, d)))
  const sat = [[0.8, 9, 3.1], [-1.2, 11, 2.4], [2.0, 16, 2.0], [-2.4, 14, 1.7], [0.5, 19, 1.3], [3.1, 6, 1.2], [-3.6, 17, 1.0]] // VERIFY: schematic cluster of Vinalia spots (km offsets)
  for (const [dn, de, rad] of sat) {
    addRadial(faculae, g, R, occ.lat + dn / (R * DEG) * 1.0, occ.lon + de / (R * DEG * Math.cos(occ.lat * DEG)), 14, (d) => 0.7 * (1 - smoothstep(rad * 0.5, rad * 1.1, d)))
  }
  addRadial(faculae, g, R, named[4].lat, named[4].lon, 30, (d) => 0.55 * (1 - smoothstep(4, 14, d))) // Haulani bright ejecta
  addRadial(faculae, g, R, named[5].lat, named[5].lon, 10, (d) => 0.8 * (1 - smoothstep(1.5, 4, d)))
  const h = new Float32Array(W * H)
  const ramp = makeRamp([[0, '#1f1d1b'], [0.3, '#454240'], [0.55, '#6a665f'], [0.8, '#9b968c'], [1, '#f2f0ec']])
  const rgb = new Float32Array(W * H * 3)
  const col: RGB = [0, 0, 0]
  forEachPixel(g, (x, y, px, py, pz, i) => {
    h[i] = f.height[i] + 0.25 * N.fbm(px * 6, py * 6, pz * 6, 4) + 0.05 * N2.noise(px * 60, py * 60, pz * 60)
    let v = 0.3 + 0.06 * N.fbm(px * 3, py * 3, pz * 3, 4) + 0.03 * N2.fbm(px * 14, py * 14, pz * 14, 3) + 0.015 * N3.noise(px * 90, py * 90, pz * 90) + 0.38 * f.bright[i]
    v += 0.62 * faculae[i]
    ramp(clamp(v), col)
    mixTo(col, [0.3, 0.27, 0.24], 0.1 * (1 - faculae[i]))
    rgb[i * 3] = col[0]; rgb[i * 3 + 1] = col[1]; rgb[i * 3 + 2] = col[2]
  })
  // Ahuna Mons: lone conical mountain, drawn as a bright-flanked bump in the shaded relief only  // VERIFY (10.5S, 316.2E)
  addRadial(h, g, R, -10.5, eL(316.2), 40, (d) => 4.5 * Math.exp(-Math.pow(d / 9, 2)))
  const hs = shadedRelief(h, g, R, 7, 310, 40)
  for (let i = 0; i < W * H; i++) { const k = 1 + 0.5 * (hs[i] - 0.55); rgb[i * 3] *= k; rgb[i * 3 + 1] *= k; rgb[i * 3 + 2] *= k }
  await ctx.save(REC('ceres_1k.jpg', 'Ceres: dark crater field, Occator faculae', 'solar-system', 'Ceres albedo (dark, cratered; Occator bright faculae at 19.8N 120.7W)', CREDIT), rgb, W, H, 3, { format: 'jpg', quality: 92 })
}

// ================================================================== TRITON
export async function genTriton(ctx: Ctx) {
  const e = env(ctx, 2048, 1353.4, 5401), { g, W, H, R, N, N2, N3, r } = e
  const cant = new Float32Array(W * H), plains = new Float32Array(W * H)
  // Cantaloupe (dimpled) terrain in the western/anti-Neptune hemisphere (Bubembe Regio): ~ lon -60..+60, lat -50..+25  // VERIFY region
  forEachPixel(g, (x, y, px, py, pz, i) => {
    const lon = g.lon[x] / DEG, lat = g.lat[y] / DEG
    const w = 14 * N.fbm(px * 2.5, py * 2.5, pz * 2.5, 3)
    cant[i] = smoothstep(-95, -60, lon + w) * (1 - smoothstep(60, 100, lon + w)) * smoothstep(-65, -35, lat + w * 0.6) * (1 - smoothstep(10, 40, lat + w * 0.6))
    plains[i] = smoothstep(0.1, 0.5, N2.fbm(px * 2 + 3, py * 2, pz * 2, 3)) * (1 - cant[i]) * 0.9
  })
  const f = newCraterField(g)
  population(e, f, 900, Math.max(12, e.kmPx * 2.4), 80, 1.5, { skip: (i) => cant[i] > 0.4 || plains[i] > 0.5, deg: [0.2, 1], fresh: 0.02 })
  // dark wind streaks: elongated, pointing ~ ENE, on the bright southern cap boundary (from sublimation geysers)
  const streak = new Float32Array(W * H)
  for (let k = 0; k < 90; k++) {
    const lat = r.range(-62, -15), lon = r.range(-170, 170), len = r.range(50, 160)
    const th = r.range(0.0, 0.5) // radians from east toward north
    const pts: Array<[number, number]> = []
    for (let s = 0; s <= 6; s++) { const d = (len * s) / 6 / (R * DEG); pts.push([lat + Math.sin(th) * d, lon + Math.cos(th) * d / Math.cos(lat * DEG)]) }
    paint(streak, e, pts, 25, (d, along) => (0.55 + 0.45 * (1 - along)) * Math.exp(-Math.pow(d / (4 + 6 * (1 - along)), 2)))
  }
  const wr = makeWorley()
  const h = new Float32Array(W * H)
  const ramp = makeRamp([[0, '#6a4e45'], [0.3, '#a8877a'], [0.55, '#d3b5a6'], [0.8, '#ebd5c9'], [1, '#faf0ea']])
  const rgb = new Float32Array(W * H * 3)
  const col: RGB = [0, 0, 0]
  forEachPixel(g, (x, y, px, py, pz, i) => {
    const lat = g.lat[y]
    let v = 0.62 + 0.09 * N.fbm(px * 2.2, py * 2.2, pz * 2.2, 4) + 0.04 * N2.fbm(px * 10, py * 10, pz * 10, 3) + 0.4 * f.bright[i]
    h[i] = f.height[i] + 0.08 * N3.fbm(px * 60, py * 60, pz * 60, 3)
    if (cant[i] > 0.02) {
      // cantaloupe: ~30-40 km dimples. Cell centres are pits; the ridges between them are the network of narrow bright-dark crests
      const fq = R / 55
      worley3(px * fq, py * fq, pz * fq, 5, wr, 0.9)
      const ridge = 1 - smoothstep(0.0, 0.22, wr.f2 - wr.f1)
      const pit = 1 - smoothstep(0, 0.55, wr.f1)
      h[i] += cant[i] * (0.6 * ridge - 0.5 * pit)
      v += cant[i] * (-0.12 * pit + 0.05 * ridge - 0.08)
    }
    v += 0.05 * plains[i]
    // south polar cap: bright pinkish-white nitrogen frost (the sub-solar region in 1989), brighter toward the pole
    const cap = smoothstep(-18 * DEG, -52 * DEG, lat + 0.07 * N.fbm(px * 3, py * 3, pz * 3, 3))
    v += 0.17 * cap
    v -= 0.4 * streak[i] * (0.4 + 0.6 * cap)
    // darker, browner equatorial belt; northern hemisphere was not imaged by Voyager 2 and is filled with generic terrain
    v -= 0.07 * Math.exp(-Math.pow(lat / (14 * DEG), 2))
    ramp(clamp(v), col)
    mixTo(col, [0.98, 0.9, 0.86], 0.35 * cap)
    rgb[i * 3] = col[0]; rgb[i * 3 + 1] = col[1]; rgb[i * 3 + 2] = col[2]
  })
  const hs = shadedRelief(h, g, R, 7, 315, 40)
  for (let i = 0; i < W * H; i++) { const k = 1 + 0.32 * (hs[i] - 0.55); rgb[i * 3] *= k; rgb[i * 3 + 1] *= k; rgb[i * 3 + 2] *= k }
  await ctx.save(REC('triton_2k.jpg', 'Triton: cantaloupe cells, bright south cap, dark streaks', 'solar-system', 'Triton colour (pinkish nitrogen ice; northern hemisphere is invented filler)', CREDIT), rgb, W, H, 3, { format: 'jpg', quality: 91 })
}

// ================================================================== ENCELADUS
export async function genEnceladus(ctx: Ctx) {
  const e = env(ctx, 1024, 252.1, 5501), { g, W, H, R, N, N2, N3, r } = e
  const f = newCraterField(g), tiger = new Float32Array(W * H), ridge = new Float32Array(W * H)
  population(e, f, 1500, Math.max(2.5, e.kmPx * 2.2), 35, 1.7, { deg: [0.2, 1], fresh: 0.02, skip: (i) => false })
  // four near-parallel "tiger stripe" fractures (Alexandria, Cairo, Baghdad, Damascus Sulci) ~130 km long, ~35 km apart, crossing the south pole region.
  // Constructed in the polar plane (colatitude in degrees), then mapped back. // VERIFY orientation, count and exact spacing
  const stripes: Array<Array<[number, number]>> = []
  for (let s = 0; s < 4; s++) {
    const y0 = (s - 1.5) * 8.0, pts: Array<[number, number]> = []
    for (let k = -8; k <= 8; k++) {
      const x = k * 1.9
      const y = y0 + 0.012 * x * x * (s % 2 ? 1 : 0.6) + 0.5 * Math.sin(x * 0.4 + s)
      const colat = Math.hypot(x, y)
      pts.push([-(90 - colat), (Math.atan2(y, x) / DEG + 90)])
    }
    stripes.push(pts.map(([la, lo]) => [la, ((lo + 540) % 360) - 180] as [number, number]))
  }
  // lon wrap near the pole could split a line across the seam: split at big lon jumps
  for (const pts of stripes) {
    let cur: Array<[number, number]> = [pts[0]]
    const flush = () => { if (cur.length > 1) { paint(tiger, e, cur, 30, (d) => 0.9 * Math.exp(-Math.pow(d / 5.0, 2)) + 0.3 * Math.exp(-Math.pow(d / 11, 2))); paint(ridge, e, cur, 40, (d) => Math.exp(-Math.pow(d / 14, 2))) } }
    for (let k = 1; k < pts.length; k++) { if (Math.abs(pts[k][1] - pts[k - 1][1]) > 60) { flush(); cur = [] } cur.push(pts[k]) }
    flush()
  }
  // a few shorter fractures and older ridged terrain (the trailing hemisphere is crossed by sulci)
  const sul = new Float32Array(W * H)
  for (let k = 0; k < 14; k++) paint(sul, e, walk(r, r.range(-60, 60), r.range(-170, 170), 10, 3.0, 0.22), 10, (d) => Math.exp(-Math.pow(d / 2.5, 2)))
  const ramp = makeRamp([[0, '#7f8892'], [0.5, '#cdd5dc'], [0.8, '#eef2f6'], [1, '#ffffff']])
  const rgb = new Float32Array(W * H * 3)
  const h = new Float32Array(W * H)
  const col: RGB = [0, 0, 0]
  forEachPixel(g, (x, y, px, py, pz, i) => {
    const lat = g.lat[y]
    h[i] = f.height[i] + 0.9 * ridge[i] - 0.5 * tiger[i] - 0.25 * sul[i] + 0.05 * N.fbm(px * 40, py * 40, pz * 40, 3)
    let v = 0.9 + 0.035 * N.fbm(px * 3, py * 3, pz * 3, 3) + 0.02 * N2.fbm(px * 14, py * 14, pz * 14, 3) + 0.01 * N3.noise(px * 80, py * 80, pz * 80) + 0.18 * f.bright[i]
    // slightly greyer, older, cratered north; the leading hemisphere is the brightest
    v -= 0.07 * smoothstep(20 * DEG, 70 * DEG, lat) * (0.5 + 0.5 * N.fbm(px * 4, py * 4, pz * 4, 2))
    v -= 0.05 * sul[i]
    ramp(clamp(v), col)
    mixTo(col, [0.62, 0.84, 0.86], 0.55 * tiger[i]) // blue-green tint of the coarse-grained crystalline ice along the stripes
    col[0] *= 1 - 0.1 * ridge[i]; col[1] *= 1 - 0.05 * ridge[i]
    rgb[i * 3] = col[0]; rgb[i * 3 + 1] = col[1]; rgb[i * 3 + 2] = col[2]
  })
  const hs = shadedRelief(h, g, R, 9, 315, 40)
  for (let i = 0; i < W * H; i++) { const k = 1 + 0.28 * (hs[i] - 0.55); rgb[i * 3] *= k; rgb[i * 3 + 1] *= k; rgb[i * 3 + 2] *= k }
  await ctx.save(REC('enceladus_1k.jpg', 'Enceladus: bright ice, south-polar tiger stripes', 'solar-system', 'Enceladus albedo/colour (very bright; tiger stripes near the south pole)', CREDIT), rgb, W, H, 3, { format: 'jpg', quality: 92 })
}

// ================================================================== IO
export async function genIo(ctx: Ctx) {
  const e = env(ctx, 2048, 1821.6, 5601), { g, W, H, R, N, N2, N3, r } = e
  const patera = new Float32Array(W * H), ring = new Float32Array(W * H), flows = new Float32Array(W * H), halo = new Float32Array(W * H), h = new Float32Array(W * H)
  // Named volcanoes: lat, east-lon (west -> east converted), patera radius km, ring (red deposit) radius km or 0.  // VERIFY every row
  const V: Array<[string, number, number, number, number]> = [
    ['Pele', -18.7, lonE(255.3), 14, 600], ['Loki', 13.4, lonE(308.9), 100, 0], ['Pillan', -12.0, lonE(243.0), 20, 270], ['Prometheus', -1.5, lonE(153.9), 14, 130],
    ['Tvashtar', 62.0, lonE(122.0), 25, 230], ['Amirani', 24.5, lonE(114.7), 18, 0], ['Culann', 19.9, lonE(160.3), 14, 90], ['Marduk', -29.4, lonE(209.0), 12, 250],
    ['Masubi', -49.7, lonE(56.0), 20, 0], ['Zamama', 21.0, lonE(173.0), 18, 0], ['Surt', 45.2, lonE(336.9), 60, 0], ['Ra', -8.3, lonE(325.0), 28, 0], ['Maui', 16.4, lonE(122.0), 20, 0],
  ]
  for (const [, lat, lon, rp, rr] of V) {
    addRadial(patera, g, R, lat, lon, rp * 2.5, (d) => 1 - smoothstep(rp * 0.7, rp * 1.05, d))
    if (rr > 0) addRadial(ring, g, R, lat, lon, rr * 1.9, (d) => 0.62 * Math.exp(-Math.pow((d - rr) / (rr * 0.24), 2)) + 0.22 * (1 - smoothstep(rp, rr * 0.9, d)) + 0.1 * Math.exp(-Math.pow((d - rr * 1.35) / (rr * 0.2), 2)))
    addRadial(halo, g, R, lat, lon, rp * 8, (d) => Math.exp(-Math.pow(d / (rp * 3.2), 2)))
  }
  // lava flow fields and many small dark paterae near active regions
  for (let k = 0; k < 60; k++) {
    const v = V[k % V.length], lat = v[1] + r.range(-9, 9), lon = v[2] + r.range(-12, 12) / Math.max(0.3, Math.cos(lat * DEG))
    const rp = r.range(4, 14)
    addRadial(patera, g, R, lat, lon, rp * 2.5, (d) => 0.8 * (1 - smoothstep(rp * 0.7, rp * 1.05, d)))
    paint(flows, e, walk(r, lat, lon, 3, r.range(0.3, 0.9), 0.5), 14, (d, a) => 0.35 * (1 - a * 0.6) * Math.exp(-Math.pow(d / 7, 2)))
  }
  // mountains: tall, blocky massifs, away from paterae
  for (let k = 0; k < 70; k++) {
    const { lat, lon } = uni(r), rad = r.range(25, 90)
    addRadial(h, g, R, lat, lon, rad * 2.2, (d, az) => r.range(4, 9) * Math.exp(-Math.pow(d / rad, 2)) * (0.8 + 0.2 * Math.sin(az * 5 + k)))
  }
  const ramp = makeRamp([[0, '#9a5a1c'], [0.28, '#cf8a24'], [0.5, '#e6bf3c'], [0.72, '#f1e28a'], [0.9, '#f5eed0'], [1, '#fbf9ee']])
  const rgb = new Float32Array(W * H * 3)
  const col: RGB = [0, 0, 0]
  forEachPixel(g, (x, y, px, py, pz, i) => {
    const lat = g.lat[y]
    h[i] += 2.2 * N.ridged(px * 5, py * 5, pz * 5, 4) * smoothstep(0.35, 0.8, N2.fbm(px * 2, py * 2, pz * 2, 3) + 0.6) + 0.12 * N3.fbm(px * 60, py * 60, pz * 60, 3)
    // sulfur / SO2 mottling: broad yellow-white-orange patchwork, polar zones redder-darker
    let v = 0.62 + 0.3 * N.fbm(px * 2.6, py * 2.6, pz * 2.6, 4) + 0.12 * N2.fbm(px * 9, py * 9, pz * 9, 4) + 0.03 * N3.noise(px * 100, py * 100, pz * 100)
    v -= 0.2 * smoothstep(55 * DEG, 85 * DEG, Math.abs(lat))
    v += 0.1 * smoothstep(0.3, 0.7, N3.fbm(px * 5 + 3, py * 5, pz * 5, 3)) // SO2 frost patches (whitish)
    ramp(clamp(v), col)
    // reddish short-chain sulfur toward the poles and around fresh deposits, and a reddish-brown cast on the trailing hemisphere
    mixTo(col, [0.62, 0.22, 0.12], clamp(0.35 * smoothstep(50 * DEG, 85 * DEG, Math.abs(lat)) + 0.7 * Math.min(1, ring[i]) + 0.12 * halo[i]))
    // pale (white/yellow) fresh-deposit halo further out from big plumes
    mixTo(col, [0.92, 0.9, 0.78], 0.1 * halo[i] * (1 - Math.min(1, ring[i])))
    // dark: paterae (nearly black with a brownish tint), lava flows
    const dark = clamp(patera[i] * 1.2 + flows[i])
    mixTo(col, [0.07 + 0.05 * N.noise(px * 50, py * 50, pz * 50), 0.05, 0.045], dark * 0.93)
    rgb[i * 3] = col[0]; rgb[i * 3 + 1] = col[1]; rgb[i * 3 + 2] = col[2]
  })
  const hs = shadedRelief(h, g, R, 9, 315, 40)
  for (let i = 0; i < W * H; i++) { const k = 1 + 0.3 * (hs[i] - 0.55); rgb[i * 3] *= k; rgb[i * 3 + 1] *= k; rgb[i * 3 + 2] *= k }
  await ctx.save(REC('io_2k.jpg', 'Io: sulfur patchwork, paterae, red plume rings', 'solar-system', 'Io colour (sulfur yellow-orange, dark paterae, Pele red ring)', CREDIT), rgb, W, H, 3, { format: 'jpg', quality: 91 })
}

// ================================================================== EUROPA
export async function genEuropa(ctx: Ctx) {
  const e = env(ctx, 2048, 1560.8, 5701), { g, W, H, R, N, N2, N3, r } = e
  const lin = new Float32Array(W * H), halo = new Float32Array(W * H), chaos = new Float32Array(W * H), spots = new Float32Array(W * H), h = new Float32Array(W * H)
  // lineae: long, dark reddish-brown double ridges, generally a few hundred km to ~1500 km long, crossing each other; cycloidal arcs
  for (let k = 0; k < 110; k++) {
    const lat = Math.asin(r.range(-0.95, 0.95)) / DEG, lon = r.range(-170, 170)
    const pts = walk(r, lat, lon, Math.round(r.range(8, 40)), 2.2, r.next() < 0.3 ? 0.18 : 0.05)
    const w = r.range(2.5, 9), amp = r.range(0.4, 1)
    paint(lin, e, pts, 70, (d) => amp * Math.exp(-Math.pow(d / w, 2)))
    paint(halo, e, pts, 70, (d) => amp * 0.5 * Math.exp(-Math.pow(d / (w * 3.2), 2)))
  }
  // cycloids: chains of arcs
  for (let k = 0; k < 22; k++) {
    const lat = r.range(-60, 60), lon = r.range(-165, 165)
    let la = lat, lo = lon
    const dir = r.range(0, Math.PI * 2)
    for (let arc = 0; arc < 6; arc++) {
      const pts: Array<[number, number]> = []
      for (let s = 0; s <= 8; s++) { const t = (s / 8) * Math.PI * 0.9; const a = dir + (t - 0.45 * Math.PI) * 0.6; pts.push([la + Math.cos(a) * s * 0.45, lo + Math.sin(a) * s * 0.45 / Math.cos(la * DEG)]) }
      if (pts.some(([a, b]) => Math.abs(a) > 80 || Math.abs(b) > 175)) break
      paint(lin, e, pts, 40, (d) => 0.6 * Math.exp(-Math.pow(d / 3.2, 2)))
      la = pts[8][0]; lo = pts[8][1]
    }
  }
  // chaos terrain: irregular rafted patches. Conamara Chaos (9N, 86E)  // VERIFY ; plus mottled terrain
  const chaosSites: Array<[number, number, number]> = [[9.4, lonE(273.5), 70], [-12, lonE(210), 120], [22, lonE(110), 90], [-40, lonE(300), 100], [4, lonE(60), 150], [50, lonE(220), 80]]
  for (const [la, lo, rad] of chaosSites) addRadial(chaos, g, R, la, lo, rad * 2, (d) => 1 - smoothstep(rad * 0.3, rad * 1.1, d))
  for (let k = 0; k < 40; k++) { const { lat, lon } = uni(r); const rad = r.range(15, 60); addRadial(chaos, g, R, lat, lon, rad * 2, (d) => 0.8 * (1 - smoothstep(rad * 0.3, rad * 1.05, d))) }
  // lenticulae: small dark spots (domes/pits), 5-20 km
  for (let k = 0; k < 500; k++) { const { lat, lon } = uni(r); const rad = r.range(3, 9); addRadial(spots, g, R, lat, lon, rad * 3, (d) => 0.7 * (1 - smoothstep(rad * 0.3, rad, d))) }
  // sparse craters; Pwyll (25S, 89E) with long bright rays
  const f = newCraterField(g)
  population(e, f, 160, Math.max(6, e.kmPx * 2.4), 50, 1.4, { deg: [0, 0.6], fresh: 0.1, peak: 0.6 })
  stampCrater(f, g, R, { lat: -25, lon: lonE(271), d: 26, deg: 0, rays: 1, peak: true }, mkRay(77)) // Pwyll // VERIFY
  stampCrater(f, g, R, { lat: 34, lon: lonE(145), d: 45, deg: 0.15, rays: 0.5, peak: true }, mkRay(78)) // Tyre-like, schematic
  const ramp = makeRamp([[0, '#9d8f7c'], [0.4, '#d6ccbb'], [0.7, '#ece6da'], [1, '#faf8f2']])
  const rgb = new Float32Array(W * H * 3)
  const col: RGB = [0, 0, 0]
  forEachPixel(g, (x, y, px, py, pz, i) => {
    const lon = g.lon[x] / DEG
    // ridged-plains texture: very low relief, fine-grained
    h[i] = f.height[i] * 0.8 + 0.25 * N.fbm(px * 10, py * 10, pz * 10, 4) + 0.1 * lin[i] + 0.35 * chaos[i] * N2.ridged(px * 30, py * 30, pz * 30, 3) + 0.04 * N3.noise(px * 100, py * 100, pz * 100)
    let v = 0.86 + 0.04 * N.fbm(px * 3, py * 3, pz * 3, 3) + 0.03 * N2.fbm(px * 14, py * 14, pz * 14, 4) + 0.015 * N3.noise(px * 90, py * 90, pz * 90) + 0.3 * f.bright[i]
    ramp(clamp(v), col)
    // the trailing hemisphere (centred 270W = 90E) is reddened by sulfur radiolysis; the leading one is cleaner
    let dl = Math.abs(lon - 90); if (dl > 180) dl = 360 - dl
    const trail = (1 - smoothstep(30, 110, dl)) * (1 - 0.35 * Math.abs(g.lat[y]) / (Math.PI / 2))
    mixTo(col, [0.74, 0.52, 0.39], 0.3 * trail)
    // linea / halo / chaos / lenticulae
    mixTo(col, [0.62, 0.38, 0.26], clamp(0.85 * lin[i]))
    mixTo(col, [0.78, 0.6, 0.48], clamp(0.35 * halo[i]))
    const chaosNoise = 0.55 + 0.45 * N3.fbm(px * 22, py * 22, pz * 22, 3)
    const chm = smoothstep(0.25, 0.5, chaos[i] + 0.4 * N2.fbm(px * 16, py * 16, pz * 16, 4) - 0.18) * Math.min(1, chaos[i] * 2)
    mixTo(col, [0.5 + 0.1 * chaosNoise, 0.31 + 0.07 * chaosNoise, 0.22 + 0.05 * chaosNoise], clamp(chm * 0.85))
    mixTo(col, [0.55, 0.36, 0.26], clamp(smoothstep(0.3, 0.6, spots[i] + 0.3 * N3.fbm(px * 40, py * 40, pz * 40, 3)) * 0.7))
    rgb[i * 3] = col[0]; rgb[i * 3 + 1] = col[1]; rgb[i * 3 + 2] = col[2]
  })
  const hs = shadedRelief(h, g, R, 12, 315, 40)
  for (let i = 0; i < W * H; i++) { const k = 1 + 0.18 * (hs[i] - 0.55); rgb[i * 3] *= k; rgb[i * 3 + 1] *= k; rgb[i * 3 + 2] *= k }
  await ctx.save(REC('europa_2k.jpg', 'Europa: bright ice, brown lineae, chaos', 'solar-system', 'Europa colour (white-tan ice, brown lineae, chaos terrain, Pwyll rays)', CREDIT), rgb, W, H, 3, { format: 'jpg', quality: 91 })
}

// ================================================================== GANYMEDE
export async function genGanymede(ctx: Ctx) {
  const e = env(ctx, 2048, 2634.1, 5801), { g, W, H, R, N, N2, N3, r } = e
  const f = newCraterField(g)
  const dark = new Float32Array(W * H), groove = new Float32Array(W * H), h = new Float32Array(W * H)
  const wr = makeWorley()
  const named = [ // dark regions (ancient terrain): lat, east-lon, radius km // VERIFY
    [10, lonE(155), 1300], [20, lonE(185), 900], [-15, lonE(325), 1100], [-35, lonE(20), 700], [30, lonE(40), 800],
  ]
  // dark terrain mask: domain-warped noise + the named regions
  forEachPixel(g, (x, y, px, py, pz, i) => {
    const wx = px + 0.35 * N.fbm(px * 1.6, py * 1.6, pz * 1.6, 3), wy = py + 0.35 * N.fbm(px * 1.6 + 5, py * 1.6, pz * 1.6, 3), wz = pz + 0.35 * N.fbm(px * 1.6, py * 1.6 + 8, pz * 1.6, 3)
    dark[i] = smoothstep(-0.05, 0.28, N2.fbm(wx * 1.3, wy * 1.3, wz * 1.3, 4))
  })
  for (const [la, lo, rad] of named) addRadial(dark, g, R, la, lo, rad * 1.8, (d) => 0.6 * (1 - smoothstep(rad * 0.5, rad, d)))
  const mkSteps = () => { for (let i = 0; i < W * H; i++) dark[i] = Math.min(1, dark[i]) }
  mkSteps()
  const kg = (2 * Math.PI * R) / 12 // groove frequency ~12 km spacing
  forEachPixel(g, (x, y, px, py, pz, i) => {
    // grooved terrain: per-region parallel groove sets (region = Worley cell, direction from the cell id)
    worley3(px * 4.2, py * 4.2, pz * 4.2, 21, wr, 1)
    const a = wr.id * 6.2832, b = (wr.id * 37.1) % 1 * 3.1416
    const dx = Math.sin(b) * Math.cos(a), dy = Math.cos(b), dz = Math.sin(b) * Math.sin(a)
    const ph = (px * dx + py * dy + pz * dz) * kg * (0.6 + 0.8 * ((wr.id * 91.7) % 1)) + 3 * N3.fbm(px * 8, py * 8, pz * 8, 2)
    const s = Math.sin(ph), s2 = Math.sin(ph * 0.31 + 2)
    const edge = smoothstep(0.0, 0.18, wr.f2 - wr.f1) // borders of the swaths are where the sets abut: a slightly darker seam
    groove[i] = (0.5 + 0.5 * (0.7 * s + 0.3 * s2)) * (0.5 + 0.5 * edge) * (1 - dark[i])
  })
  // craters: dark terrain is older / more cratered; bright rayed craters
  population(e, f, 11000, Math.max(5, e.kmPx * 2.3), 260, 1.9, { skip: (i, d) => dark[i] < 0.4 && d < 30 && r.next() < 0.55, deg: [0.05, 0.95], fresh: 0.05, peak: 0.55 })
  const named2: Crater[] = [
    { lat: 11, lon: lonE(-26 + 360), d: 95, deg: 0.02, rays: 1, peak: true }, // Tros (approx.)  // VERIFY
    { lat: -38, lon: lonE(166), d: 100, deg: 0.02, rays: 1, peak: true }, // Osiris  // VERIFY
    { lat: 12, lon: 40, d: 90, deg: 0.05, rays: 0.8, peak: true }, // generic fresh rayed craters
    { lat: -50, lon: -60, d: 70, deg: 0.03, rays: 0.9 },
  ]
  for (const c of named2) stampCrater(f, g, R, c, mkRay(200 + (c.d | 0)))
  const ramp = makeRamp([[0, '#2e2923'], [0.3, '#5d554b'], [0.55, '#8b8277'], [0.78, '#b8b0a4'], [1, '#f0ede6']])
  const rgb = new Float32Array(W * H * 3)
  const col: RGB = [0, 0, 0]
  forEachPixel(g, (x, y, px, py, pz, i) => {
    const lat = g.lat[y]
    h[i] = f.height[i] + 0.9 * groove[i] * (1 - dark[i]) + 0.4 * N.fbm(px * 14, py * 14, pz * 14, 3) + 0.06 * N3.noise(px * 90, py * 90, pz * 90)
    let v = 0.46 + 0.1 * N.fbm(px * 3, py * 3, pz * 3, 4) + 0.03 * N2.fbm(px * 14, py * 14, pz * 14, 3) + 0.015 * N3.noise(px * 110, py * 110, pz * 110)
    v -= 0.15 * dark[i]
    v += (0.24 - 0.0) * (1 - dark[i]) + 0.1 * (groove[i] - 0.5) * (1 - dark[i])
    v += 0.55 * f.bright[i]
    // polar frost caps: water frost bright at |lat| > ~40 deg with ragged boundary (the permanent cap boundary follows the magnetosphere)  // VERIFY
    const cap = smoothstep(42 * DEG, 62 * DEG, Math.abs(lat) + 0.08 * N.fbm(px * 3, py * 3, pz * 3, 3))
    v += 0.28 * cap * (0.75 + 0.25 * N3.fbm(px * 6, py * 6, pz * 6, 3))
    ramp(clamp(v), col)
    mixTo(col, [0.55, 0.47, 0.4], 0.14 * dark[i]) // warm brown tint of dark terrain
    rgb[i * 3] = col[0]; rgb[i * 3 + 1] = col[1]; rgb[i * 3 + 2] = col[2]
  })
  const hs = shadedRelief(h, g, R, 8, 315, 40)
  for (let i = 0; i < W * H; i++) { const k = 1 + 0.34 * (hs[i] - 0.55); rgb[i * 3] *= k; rgb[i * 3 + 1] *= k; rgb[i * 3 + 2] *= k }
  await ctx.save(REC('ganymede_2k.jpg', 'Ganymede: dark terrain, grooved bright terrain, rayed craters, polar frost', 'solar-system', 'Ganymede colour (dark and grooved terrain, bright polar frost)', CREDIT), rgb, W, H, 3, { format: 'jpg', quality: 91 })
}

// ================================================================== CALLISTO
export async function genCallisto(ctx: Ctx) {
  const e = env(ctx, 2048, 2410.3, 5901), { g, W, H, R, N, N2, N3, r } = e
  const f = newCraterField(g), rings = new Float32Array(W * H), pal = new Float32Array(W * H), h = new Float32Array(W * H)
  // Valhalla (15N, 56W, bright palimpsest ~360 km core, rings to ~1800 km radius) and Asgard (32N, 140W, rings to ~800 km)  // VERIFY
  const basins: Array<[number, number, number, number]> = [[15, -56, 360, 1800], [32, -140, 220, 800]]
  for (const [la, lo, core, outer] of basins) {
    addRadial(pal, g, R, la, lo, core * 2, (d) => 1 - smoothstep(core * 0.55, core, d))
    addRadial(rings, g, R, la, lo, outer * 1.1, (d) => {
      // concentric ridge-and-trough rings, brighter ridges, spacing growing outward
      let s = 0
      for (let k = 1; k <= 14; k++) { const rr = core * (1 + 0.28 * k + 0.012 * k * k); if (rr > outer) break; s += Math.exp(-Math.pow((d - rr) / (14 + 3 * k), 2)) * (1 - k / 18) }
      return s * smoothstep(core * 0.9, core * 1.3, d)
    })
  }
  population(e, f, 14000, Math.max(5, e.kmPx * 2.3), 260, 2.0, { skip: (i, d) => pal[i] > 0.6 && d < 40, deg: [0.05, 0.95], fresh: 0.05, peak: 0.45 })
  forEachPixel(g, (x, y, px, py, pz, i) => { h[i] = f.height[i] + 0.5 * N.ridged(px * 6, py * 6, pz * 6, 4) + 0.4 * rings[i] + 0.35 * N2.fbm(px * 30, py * 30, pz * 30, 3) + 0.06 * N3.noise(px * 100, py * 100, pz * 100) })
  const ramp = makeRamp([[0, '#1d1a17'], [0.3, '#3a352f'], [0.55, '#5b544b'], [0.78, '#8f8a82'], [1, '#e9eef2']])
  const rgb = new Float32Array(W * H * 3)
  const col: RGB = [0, 0, 0]
  forEachPixel(g, (x, y, px, py, pz, i) => {
    let v = 0.3 + 0.07 * N.fbm(px * 3, py * 3, pz * 3, 4) + 0.045 * N2.fbm(px * 12, py * 12, pz * 12, 4) + 0.025 * N3.noise(px * 100, py * 100, pz * 100)
    v += 0.5 * f.bright[i]
    v += 0.16 * pal[i] + 0.1 * rings[i]
    // Callisto's frost: ejecta of fresh craters is bluish-white; the overall tone is very dark brown-grey
    ramp(clamp(v), col)
    mixTo(col, [0.44, 0.38, 0.32], 0.08)
    // cool (bluish) bright ejecta
    const ej = clamp(f.bright[i] * 1.5)
    mixTo(col, [0.72, 0.76, 0.82], ej * 0.4)
    rgb[i * 3] = col[0]; rgb[i * 3 + 1] = col[1]; rgb[i * 3 + 2] = col[2]
  })
  const hs = shadedRelief(h, g, R, 8, 315, 40)
  for (let i = 0; i < W * H; i++) { const k = 1 + 0.4 * (hs[i] - 0.55); rgb[i * 3] *= k; rgb[i * 3 + 1] *= k; rgb[i * 3 + 2] *= k }
  await ctx.save(REC('callisto_2k.jpg', 'Callisto: saturated craters, Valhalla and Asgard ring basins', 'solar-system', 'Callisto colour (dark ancient cratered surface, Valhalla)', CREDIT), rgb, W, H, 3, { format: 'jpg', quality: 91 })
  void r
}

// ================================================================== TITAN
export async function genTitan(ctx: Ctx) {
  const e = env(ctx, 2048, 2574.7, 6001), { g, W, H, N, N2, N3 } = e
  const ramp = makeRamp([[0, '#8a5222'], [0.35, '#b97a35'], [0.6, '#d29a4a'], [0.85, '#e2b366'], [1, '#efca88']])
  const rgb = new Float32Array(W * H * 3)
  const col: RGB = [0, 0, 0]
  forEachPixel(g, (x, y, px, py, pz, i) => {
    const lat = g.lat[y]
    // the opaque photochemical haze hides the surface: a smooth orange-brown globe, with a faint N/S asymmetry, a
    // darker northern polar hood, subtle latitude banding in the haze, and very weak mottling.
    let v = 0.55 + 0.02 * N.fbm(px * 1.6, py * 6, pz * 1.6, 4) + 0.012 * N2.fbm(px * 5, py * 14, pz * 5, 3) + 0.006 * N3.noise(px * 40, py * 40, pz * 40)
    v += 0.05 * Math.sin(lat * 3.0 + 0.4) // slight hemispheric asymmetry
    v -= 0.1 * smoothstep(55 * DEG, 80 * DEG, lat) // north polar hood
    v += 0.05 * smoothstep(60 * DEG, 85 * DEG, -lat) // brighter south pole (cloud cap)
    ramp(clamp(v), col)
    rgb[i * 3] = col[0]; rgb[i * 3 + 1] = col[1]; rgb[i * 3 + 2] = col[2]
  })
  await ctx.save(REC('titan_2k.jpg', 'Titan: orange haze globe (surface hidden)', 'solar-system', 'Titan haze-top colour (smooth orange; the surface is NOT shown)', 'ASTRA procedural (visible-light haze appearance, generic; not Cassini data)'), rgb, W, H, 3, { format: 'jpg', quality: 93 })
}

export async function genMoons(ctx: Ctx, only?: string[]) {
  const all: Array<[string, (c: Ctx) => Promise<void>]> = [['pluto', genPluto], ['charon', genCharon], ['ceres', genCeres], ['triton', genTriton], ['enceladus', genEnceladus], ['io', genIo], ['europa', genEuropa], ['ganymede', genGanymede], ['callisto', genCallisto], ['titan', genTitan]]
  for (const [n, fn] of all) if (!only || only.includes(n)) { const t0 = Date.now(); await fn(ctx); ctx.log(`  [${n}] ${((Date.now() - t0) / 1000).toFixed(0)} s`) }
}
void hex
