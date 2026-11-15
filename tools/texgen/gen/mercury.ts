import { Simplex, worley3, makeWorley } from '../lib/noise'
import { makeGrid, forEachPixel, vecFromLonLat } from '../lib/sphere'
import { makeRamp } from '../lib/ramps'
import { rng, smoothstep, clamp, DEG } from '../lib/rng'
import { newCraterField, sampleDiameters, stampCrater, addRadial, type Crater } from '../lib/craters'
import { heightToNormal, shadedRelief, blur } from '../lib/relief'
import type { Ctx } from '../lib/ctx'

/**
 * Mercury, 2k. Heavily cratered grey-brown regolith, smooth plains in the north and inside Caloris, lobate scarps,
 * bright rayed craters, dark low-reflectance patches. Real positions (east-positive longitudes):
 */
const R = 2439.7
const NAMED: Array<Crater & { name: string }> = [
  // Caloris: ~1550 km, 30.5N 189.8E (=170.2W). Brief said ~160W; // VERIFY exact centre
  { name: 'Caloris', lat: 30.5, lon: -170.2, d: 1550, deg: 0.55, floorFill: 1, peak: false },
  { name: 'Rembrandt', lat: -33.3, lon: 88.1, d: 715, deg: 0.5, floorFill: 0.5 }, // VERIFY
  { name: 'Beethoven', lat: -20.8, lon: -123.9, d: 643, deg: 0.6, floorFill: 0.4 }, // VERIFY
  { name: 'Tolstoj', lat: -16.3, lon: -164.8, d: 510, deg: 0.6, floorFill: 0.6 },
  { name: 'Mozart', lat: 7.8, lon: -190.5 + 360, d: 240, deg: 0.4 }, // VERIFY
  { name: 'Bach', lat: -69.3, lon: -103.0, d: 214, deg: 0.55 }, // VERIFY
  { name: 'Hokusai', lat: 57.8, lon: -16.7, d: 114, deg: 0.02, rays: 1, peak: true },
  { name: 'Kuiper', lat: -11.3, lon: -31.4, d: 62, deg: 0.0, rays: 1 },
  { name: 'Debussy', lat: -33.9, lon: -12.9, d: 80, deg: 0.03, rays: 0.9 }, // VERIFY hemisphere/lat
  { name: 'Degas', lat: 37.1, lon: -127.0, d: 60, deg: 0.05, rays: 0.8 },
  { name: 'Eminescu', lat: 10.8, lon: -114.3, d: 125, deg: 0.1, rays: 0.5, peak: true }, // VERIFY
  { name: 'Tyagaraja', lat: 3.8, lon: -148.9, d: 97, deg: 0.1, rays: 0.4 }, // VERIFY
  { name: 'Han Kan', lat: -71.6, lon: 49.9, d: 100, deg: 0.1, rays: 0.5 }, // VERIFY
]

export async function genMercury(ctx: Ctx) {
  const W = ctx.W(2048), H = W / 2
  const g = makeGrid(W, H)
  const N = new Simplex(3101), N2 = new Simplex(3102)
  const r = rng(3103)
  const f = newCraterField(g)
  const kmPx = (2 * Math.PI * R) / W

  // --- regional terrain heights (km): broad swells, ridged lobate scarps/wrinkle belts ---
  const base = new Float32Array(W * H)
  const plains = new Float32Array(W * H)
  forEachPixel(g, (x, y, px, py, pz, i) => {
    const lat = g.lat[y]
    base[i] = 1.6 * N.fbm(px * 1.6, py * 1.6, pz * 1.6, 4) + 0.7 * N.ridged(px * 3.5, py * 3.5, pz * 3.5, 5) - 0.35
    // smooth plains: northern plains (lat > 55) plus noisy patches; Caloris handled below
    const north = smoothstep(48 * DEG, 68 * DEG, lat + 0.25 * N.fbm(px * 2.4, py * 2.4, pz * 2.4, 3))
    const patch = smoothstep(0.25, 0.55, N2.fbm(px * 2.2 + 4, py * 2.2, pz * 2.2, 3))
    plains[i] = clamp(north * 0.95 + patch * 0.6)
  })
  const cal = NAMED[0]
  const calV = vecFromLonLat(cal.lon, cal.lat)
  addRadial(plains, g, R, cal.lat, cal.lon, 1100, (d) => 1.2 * (1 - smoothstep(600, 1050, d)))

  // --- crater population ---
  const dmin = Math.max(14, kmPx * 2.3)
  const sizes = sampleDiameters(r, Math.round(17000 * (W / 2048) ** 2), dmin, 700, 2.05)
  const list: Crater[] = []
  for (const d of sizes) {
    // uniform on the sphere
    const lat = Math.asin(r.range(-1, 1)) / DEG
    const lon = r.range(-180, 180)
    const v = vecFromLonLat(lon, lat)
    const pi = Math.max(0, Math.min(W * H - 1, ((0.5 - lat / 180) * H | 0) * W + (((lon + 180) / 360) * W | 0)))
    // smooth plains erase small craters (flooded); big ones survive as ghost rims
    if (plains[pi] > 0.35 && d < 90 && r.next() < 0.85 * plains[pi]) continue
    const age = Math.pow(r.next(), 0.7) // 0 young .. 1 old
    list.push({ lat, lon, d, deg: clamp(0.1 + 0.9 * age * (d > 120 ? 0.9 : 1)), peak: d > 38 && d < 300 && r.next() < 0.7, rays: age < 0.06 && d > 20 ? r.range(0.3, 0.9) : 0 })
    void v
  }
  // named features last-but-large-first: basins go in early (oldest), rayed craters last (youngest)
  const basins = NAMED.filter((c) => c.d > 400)
  const fresh = NAMED.filter((c) => c.d <= 400)
  const mkRay = (seed: number) => {
    const rn = new Simplex(500 + seed)
    return (a: number) => {
      const n = rn.noise(Math.cos(a) * 6, Math.sin(a) * 6, 1.7 + seed)
      return clamp(n * 1.5 + 0.1) // sparse, streaky
    }
  }
  for (const c of basins) stampCrater(f, g, R, c, mkRay(1))
  // multi-ring Caloris: two faint outer scarp rings
  addRadial(f.height, g, R, cal.lat, cal.lon, 1500, (d) => 0.9 * Math.exp(-Math.pow((d - 1000) / 55, 2)) + 0.6 * Math.exp(-Math.pow((d - 1300) / 70, 2)))
  // Caloris interior: radial troughs (Pantheon Fossae-like) and concentric wrinkle ridges
  addRadial(f.height, g, R, cal.lat, cal.lon, 760, (d, az) => {
    const spokes = Math.pow(Math.abs(Math.sin(az * 7.5 + 0.8)), 24)
    const inner = 1 - smoothstep(60, 380, d)
    const wrinkle = 0.25 * Math.sin(d / 14) * smoothstep(150, 420, d) * (1 - smoothstep(560, 760, d))
    return -0.5 * spokes * inner + wrinkle
  })
  let idx = 0
  for (const c of list.slice(0, Math.floor(list.length * 0.5))) stampCrater(f, g, R, c, mkRay(idx++))
  for (const c of list.slice(Math.floor(list.length * 0.5))) stampCrater(f, g, R, c, mkRay(idx++))
  for (const c of fresh) stampCrater(f, g, R, c, mkRay(100 + idx++))

  // --- composite height + albedo ---
  const height = new Float32Array(W * H)
  for (let i = 0; i < height.length; i++) height[i] = base[i] * (1 - 0.5 * plains[i]) + f.height[i]
  // regolith micro-relief (sub-crater roughness), added after so it survives everywhere
  forEachPixel(g, (x, y, px, py, pz, i) => {
    height[i] += (0.12 * N.fbm(px * 90, py * 90, pz * 90, 3) + 0.05 * N2.noise(px * 220, py * 220, pz * 220)) * (1 - 0.6 * plains[i])
  })
  // sub-resolution craters: three Worley scales of little bowls with rims (3, 6, 12 px across)
  const wr = makeWorley()
  const pitch = (2 * Math.PI) / W
  forEachPixel(g, (x, y, px, py, pz, i) => {
    let add = 0
    for (let s = 0; s < 3; s++) {
      const diamPx = 3.2 * 2 ** s
      const fq = 1 / (diamPx * pitch * 1.9)
      worley3(px * fq, py * fq, pz * fq, 91 + s, wr, 1)
      if (wr.id > 0.5) continue
      const t = wr.f1 / (0.3 + 0.12 * wr.id)
      const amp = (0.09 * 2 ** s) * (1 - 0.5 * plains[i])
      add += t < 1 ? -amp * (1 - t * t) : amp * 0.35 * Math.exp(-Math.pow((t - 1) / 0.25, 2))
    }
    height[i] += add
  })
  const hs = shadedRelief(height, g, R, 5, 300, 42)
  const ramp = makeRamp([[0, '#2c2a28'], [0.3, '#4f4b47'], [0.55, '#7a746c'], [0.8, '#a39b90'], [1, '#d8d0c4']])
  const rgb = new Float32Array(W * H * 3)
  const polar = (y: number) => smoothstep(0.08, 0.3, g.cosLat[y])
  const col: [number, number, number] = [0, 0, 0]
  const calBlur = blur(f.bright, W, H, 1)
  forEachPixel(g, (x, y, px, py, pz, i) => {
    let a = 0.4 + 0.1 * N.fbm(px * 2.2, py * 2.2, pz * 2.2, 4) + 0.06 * N2.fbm(px * 9, py * 9, pz * 9, 4) + 0.025 * N.noise(px * 70, py * 70, pz * 70)
    // low-reflectance material: darker, slightly blue-grey patches
    const lrm = smoothstep(0.3, 0.62, N2.fbm(px * 1.5 + 9, py * 1.5, pz * 1.5, 3))
    a -= 0.1 * lrm
    a += 0.1 * plains[i] // plains are brighter and smoother
    a += calBlur[i] * 0.9
    a += (hs[i] - 0.62) * 0.4 * polar(y) // mild baked occlusion so relief reads before the shader lights it
    ramp(clamp(a), col)
    // MESSENGER-ish warm cast on plains/Caloris, cooler on LRM
    const warm = plains[i] * 0.05
    rgb[i * 3] = col[0] * (1 + warm + 0.02) - lrm * 0.012
    rgb[i * 3 + 1] = col[1] * (1 + warm * 0.4)
    rgb[i * 3 + 2] = col[2] * (1 - warm * 0.5) + lrm * 0.012
  })

  const rec = { kind: 'procedural' as const, generator: 'tools/texgen/gen/mercury.ts (crater stamping + ridged terrain)', zone: 'solar-system', credit: 'ASTRA procedural; feature positions from published gazetteer values (// VERIFY items in source)', colorSpace: 'srgb' as const, tier: 'core' as const }
  await ctx.save({ ...rec, file: 'mercury_albedo_2k.jpg', usage: 'Mercury albedo' }, rgb, W, H, 3, { format: 'jpg', quality: 91 })
  const nrm = heightToNormal(height, g, R, 6)
  await ctx.save({ ...rec, file: 'mercury_normal_2k.jpg', usage: 'Mercury tangent-space normal map', colorSpace: 'linear' }, nrm, W, H, 3, { format: 'jpg', quality: 94, subsample444: true })
}
