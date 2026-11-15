import { Simplex } from '../lib/noise'
import { makeGrid, forEachPixel } from '../lib/sphere'
import { makeRamp } from '../lib/ramps'
import { rng, smoothstep, clamp, DEG } from '../lib/rng'
import { newCraterField, sampleDiameters, stampCrater, addRadial, addPath } from '../lib/craters'
import { heightToNormal, shadedRelief, blur } from '../lib/relief'
import type { Ctx } from '../lib/ctx'

/**
 * Mars, 2k. Real-position features (lat N+, lon E+; Mars east longitudes converted to -180..180):
 * hemispheric dichotomy, Tharsis bulge + volcanoes, Olympus Mons, Valles Marineris, Hellas, Argyre, Isidis, polar caps,
 * classical dark albedo markings (Syrtis Major, Sinus Meridiani, Mare Acidalium, Solis Lacus, Mare Sirenum...).
 */
const R = 3389.5
const E = (lonE: number) => (lonE > 180 ? lonE - 360 : lonE)

export async function genMars(ctx: Ctx) {
  const W = ctx.W(2048), H = W / 2
  const g = makeGrid(W, H)
  const N = new Simplex(5101), N2 = new Simplex(5102), N3 = new Simplex(5103)
  const r = rng(5104)
  const kmPx = (2 * Math.PI * R) / W
  const h = new Float32Array(W * H) // km
  // ---- global structure ----
  forEachPixel(g, (x, y, px, py, pz, i) => {
    // dichotomy: tilted great circle, north-west lowlands. Lowland pole near 55N, 330E (Vastitas Borealis)
    const Lx = Math.cos(55 * DEG) * Math.cos(E(330) * DEG), Ly = Math.sin(55 * DEG), Lz = -Math.cos(55 * DEG) * Math.sin(E(330) * DEG)
    const d = px * Lx + py * Ly + pz * Lz + 0.18 * N.fbm(px * 1.8, py * 1.8, pz * 1.8, 3)
    h[i] = -2.6 * smoothstep(-0.1, 0.35, d) + 1.7 * (1 - smoothstep(-0.55, -0.05, d)) + 0.9 * N2.fbm(px * 2.2, py * 2.2, pz * 2.2, 5) + 0.35 * N2.ridged(px * 5, py * 5, pz * 5, 4)
  })
  // Tharsis rise (centre ~ 1N 247E)
  addRadial(h, g, R, 1, E(247), 4200, (d) => 7.2 * Math.exp(-Math.pow(d / 1900, 2)))
  // volcanoes: [lat, lonE, radius km, height km]  (summit positions from the IAU gazetteer; // VERIFY radii)
  const volc: Array<[number, number, number, number]> = [
    [18.65, 226.2, 310, 16], // Olympus Mons (24 km above datum)
    [-8.35, 239.9, 230, 9], // Arsia Mons
    [0.8, 247.0, 215, 8], // Pavonis Mons
    [11.8, 255.5, 230, 9], // Ascraeus Mons
    [40.5, 250.4, 500, 4.5], // Alba Mons, wide and low
    [25.0, 147.2, 130, 8.5], // Elysium Mons
    [17.0, 150.0, 90, 4], // Hecates Tholus // VERIFY
    [22.0, 135.0, 80, 3.5], // Albor Tholus // VERIFY
  ]
  for (const [la, lo, rad, ht] of volc) {
    addRadial(h, g, R, la, E(lo), rad * 1.15, (d) => {
      const t = d / rad
      const prof = t < 1 ? ht * (1 - Math.pow(t, 2.2)) * (0.9 + 0.1 * Math.cos(t * 6)) : ht * 0.04 * Math.exp(-(t - 1) * 8)
      const caldera = t < 0.17 ? -0.12 * ht * (1 - t / 0.17) : 0
      return prof + caldera
    })
  }
  // Olympus escarpment ring
  addRadial(h, g, R, 18.65, E(226.2), 450, (d) => 1.6 * Math.exp(-Math.pow((d - 330) / 18, 2)))
  // basins: [lat, lonE, diameter, depth, rim]
  const basins: Array<[number, number, number, number, number]> = [
    [-42.7, 70.0, 2300, 7.5, 2.2], // Hellas
    [-49.7, 316.5 + 0, 1800, 4.2, 1.6], // Argyre (49.7S 43.0W = 317E)
    [12.9, 87.0, 1500, 3.4, 1.0], // Isidis
    [46.7, 118.0, 3300, 2.2, 0.0], // Utopia
  ]
  for (const [la, lo, dd, dep, rim] of basins) {
    const rad = dd / 2
    addRadial(h, g, R, la, E(lo), rad * 2.6, (d) => {
      const t = d / rad
      const floor = -dep * (1 - smoothstep(0.55, 1.0, t))
      const rimH = rim * Math.exp(-Math.pow((t - 1.08) / 0.32, 2)) + rim * 0.3 * Math.exp(-(t - 1) * 1.6) * (t > 1.08 ? 1 : 0)
      return floor + rimH
    })
  }
  const carve = new Float32Array(W * H)
  // Valles Marineris + Noctis Labyrinthus (path along ~ -12 lat from 100W to 35W)
  const VM: Array<[number, number]> = [[-6.5, -101], [-7.8, -93], [-9.5, -84], [-10.8, -76], [-12.2, -67], [-13.2, -58], [-13.4, -50], [-11.5, -42], [-8, -36]]
  addPath(carve, g, R, VM, 420, (d, a) => {
    const widthKm = 110 + 190 * Math.sin(Math.PI * Math.min(1, a * 1.1)) + 25 * N3.noise(a * 14, 0.3, 0.7)
    const depth = (a > 0.08 ? 7.5 : 2.5) * (0.6 + 0.4 * Math.sin(Math.PI * a))
    const t = d / widthKm
    return -depth * (1 - smoothstep(0.5, 1.05, t)) + 0.5 * Math.exp(-Math.pow((t - 1.1) / 0.25, 2))
  }, { lat: [-25, 5], lon: [-112, -28] })
  // side canyons / chaos
  const side: Array<[Array<[number, number]>, number]> = [
    [[[-8, -76], [-4.5, -78]], 38], [[[-12, -68], [-16, -66]], 34], [[[-13.5, -55], [-17, -54]], 30], [[[-5, -91], [-1.5, -88]], 34],
    [[[-8.5, -36], [-6, -30], [-3, -26]], 60], [[[-7, -100], [-10, -108]], 40],
  ]
  for (const [p, w] of side) addPath(carve, g, R, p, 160, (d) => -2.4 * (1 - smoothstep(0.4, 1.1, d / w * 0.7)), { lat: [-25, 12], lon: [-115, -20] })
  // outflow channels (Kasei Valles, Ares Vallis) as shallow trenches
  addPath(carve, g, R, [[21, -72], [25, -66], [29, -60], [33, -56]], 100, (d) => -0.5 * (1 - smoothstep(0.2, 1.1, d / 90)), { lat: [15, 40], lon: [-80, -50] })
  addPath(carve, g, R, [[-6, -28], [3, -26], [11, -30], [18, -36]], 100, (d) => -0.4 * (1 - smoothstep(0.2, 1.1, d / 80)), { lat: [-12, 25], lon: [-45, -15] })

  for (let i = 0; i < h.length; i++) h[i] += carve[i]
  // ---- craters: denser in the southern highlands ----
  const cf = newCraterField(g)
  const dmin = Math.max(18, kmPx * 2.3)
  const sizes = sampleDiameters(r, Math.round(16000 * (W / 2048) ** 2), dmin, 420, 2.1)
  const hAt = (lat: number, lon: number) => h[Math.min(H - 1, (((0.5 - lat / 180) * H) | 0)) * W + (((lon + 180) / 360) * W | 0) % W]
  const list = []
  for (const d of sizes) {
    const lat = Math.asin(r.range(-1, 1)) / DEG
    const lon = r.range(-180, 180)
    const hh = hAt(lat, lon)
    const dens = clamp(0.35 + 0.5 * hh) * (hh > 6 ? 0.1 : 1) * (lon > -140 && lon < -90 && lat > -35 && lat < 45 ? 0.5 : 1) // young volcanic provinces, few craters
    if (r.next() > dens + (d > 120 ? 0.35 : 0)) continue
    list.push({ lat, lon, d, deg: clamp(0.2 + 0.8 * Math.pow(r.next(), 0.6)), peak: d > 40 && r.next() < 0.5, floorFill: hh < 0 ? 0.6 : 0.2, rays: 0 })
  }
  for (const c of list) stampCrater(cf, g, R, c, () => 0)
  // micro texture
  const height = new Float32Array(W * H)
  forEachPixel(g, (x, y, px, py, pz, i) => {
    height[i] = h[i] + cf.height[i] * 0.9 + 0.1 * N.fbm(px * 60, py * 60, pz * 60, 3)
  })

  // ---- albedo markings: [lat, lonE, rx(deg lon), ry(deg lat), strength, tilt] ----
  const dark: Array<[number, number, number, number, number]> = [
    [8, 69, 8, 20, 1.0], // Syrtis Major (8N 69E)
    [-4, 8, 10, 7, 0.8], // Sinus Meridiani (~0, 0)
    [-8, 345, 12, 7, 0.75], // Sinus Sabaeus // VERIFY
    [-12, 322, 7, 12, 0.7], // Margaritifer Sinus // VERIFY
    [-12, 305, 8, 8, 0.7], // Aurorae Sinus // VERIFY
    [50, 335, 16, 10, 0.7], // Mare Acidalium // VERIFY
    [-25, 328, 13, 8, 0.6], // Mare Erythraeum // VERIFY
    [-26, 270, 9, 8, 0.7], // Solis Lacus (26S 90W) // VERIFY
    [-34, 200, 20, 9, 0.7], // Mare Sirenum // VERIFY
    [-22, 145, 17, 9, 0.8], // Mare Cimmerium // VERIFY
    [-14, 105, 15, 9, 0.75], // Mare Tyrrhenum // VERIFY
    [-25, 80, 9, 7, 0.5], // Iapygia // VERIFY
    [62, 0, 40, 7, 0.3], // Vastitas Borealis band
    [60, 180, 60, 8, 0.25],
    [30, 25, 10, 8, 0.4],
    [-48, 340, 8, 4, 0.3],
  ]
  const bright: Array<[number, number, number, number, number]> = [
    [15, 30, 30, 14, 0.9], // Arabia Terra
    [-42, 70, 18, 14, 0.9], // Hellas floor
    [-49, 317, 11, 9, 0.8], // Argyre floor
    [20, 120, 20, 13, 0.8], // Elysium/Utopia
    [10, 260, 22, 14, 0.7], // Tharsis dust
    [-20, 285, 14, 10, 0.5], // Solis Planum
    [18, 330, 16, 10, 0.5], // Chryse
  ]
  const alb = new Float32Array(W * H)
  forEachPixel(g, (x, y, px, py, pz, i) => {
    const lat = g.lat[y] / DEG, lon = g.lon[x] / DEG
    let a = 0.55
    for (const [la, lo, rx, ry, s] of dark) {
      const dl = Math.abs(((lon - E(lo) + 540) % 360) - 180) / (rx / Math.max(0.25, Math.cos(la * DEG)) ** 0.0) // lon spread in degrees (tames cos stretch)
      const dd = Math.hypot(dl / Math.max(1, 1 / Math.max(0.35, Math.cos(la * DEG))) * 1 , (lat - la)) 
      void dd
      const ex = Math.abs(((lon - E(lo) + 540) % 360) - 180) * Math.max(0.35, Math.cos(la * DEG)) / rx
      const ey = (lat - la) / ry
      const m = Math.exp(-(ex * ex + ey * ey) * 1.1)
      a -= s * 0.42 * m * (0.75 + 0.5 * N3.fbm(px * 5, py * 5, pz * 5, 3))
    }
    for (const [la, lo, rx, ry, s] of bright) {
      const ex = Math.abs(((lon - E(lo) + 540) % 360) - 180) * Math.max(0.35, Math.cos(la * DEG)) / rx
      const ey = (lat - la) / ry
      a += s * 0.34 * Math.exp(-(ex * ex + ey * ey) * 1.1)
    }
    a += 0.1 * N.fbm(px * 3, py * 3, pz * 3, 5) + 0.05 * N2.fbm(px * 14, py * 14, pz * 14, 4) + 0.02 * N3.noise(px * 90, py * 90, pz * 90)
    // wind streaks of dust (subtle)
    a += 0.04 * N3.ridged(px * 10, py * 25, pz * 10, 3) - 0.02
    a -= 0.11 * clamp(-carve[i] / 5) // canyon floors darker
    a += 0.012 * Math.max(0, h[i] - 4) // volcano summits and Tharsis: slightly brighter dust-covered
    alb[i] = a
  })
  const hs = shadedRelief(height, g, R, 14, 305, 40)
  const cb = blur(cf.bright, W, H, 1)
  const ramp = makeRamp([[0, '#2a211e'], [0.22, '#4a3830'], [0.4, '#7a5440'], [0.56, '#a8683f'], [0.72, '#c8804c'], [0.88, '#dd9e69'], [1, '#ecc08f']])
  const out = new Float32Array(W * H * 3)
  const col: [number, number, number] = [0, 0, 0]
  const capN = new Float32Array(W * H)
  forEachPixel(g, (x, y, px, py, pz, i) => {
    const lat = g.lat[y] / DEG, lon = g.lon[x] / DEG
    let a = alb[i] + 0.03 * clamp(height[i] / 10) + (hs[i] - 0.62) * 0.55 * smoothstep(0.08, 0.3, g.cosLat[y]) + cb[i] * 0.4
    // Valles Marineris and chasmata: darker, redder floors (the terrain itself is carved above)
    ramp(clamp(a), col)
    // polar caps: north ~ lat > 82 (ragged, spiral troughs), south ~ lat < -84, offset toward 0E, with an irregular edge
    const n = N.fbm(px * 6, py * 6, pz * 6, 4)
    const trough = Math.sin(lon * DEG * 2 + (lat - 80) * 0.6) // spiral troughs
    const edgeN = 83.5 + 4.5 * n - 1.6 * trough
    const edgeS = -84.5 - 4.5 * n + 5 * Math.cos((lon - 10) * DEG)
    const cap = Math.max(smoothstep(edgeN - 0.5, edgeN + 1.2, lat), smoothstep(-edgeS - 0.5, -edgeS + 1.2, -lat))
    const dark2 = Math.exp(-Math.pow((lat - 78) / 3, 2)) * 0.12 // dark dune sea (Olympia Undae) ringing the north cap
    const capv = 0.9 + 0.1 * N2.fbm(px * 20, py * 20, pz * 20, 3)
    capN[i] = cap
    out[i * 3] = col[0] * (1 - dark2) * (1 - cap) + 0.96 * capv * cap
    out[i * 3 + 1] = col[1] * (1 - dark2) * (1 - cap) + 0.94 * capv * cap
    out[i * 3 + 2] = col[2] * (1 - dark2) * (1 - cap) + 0.9 * capv * cap
  })
  // caps are flat in the normal map
  for (let i = 0; i < height.length; i++) height[i] = height[i] * (1 - 0.7 * capN[i])

  const rec = { kind: 'procedural' as const, generator: 'tools/texgen/gen/mars.ts (feature-placed terrain + crater stamping)', zone: 'solar-system', credit: 'ASTRA procedural; feature coordinates from the IAU gazetteer (// VERIFY items in source)', colorSpace: 'srgb' as const, tier: 'core' as const }
  await ctx.save({ ...rec, file: 'mars_albedo_2k.jpg', usage: 'Mars albedo' }, out, W, H, 3, { format: 'jpg', quality: 92 })
  const nrm = heightToNormal(height, g, R, 7)
  await ctx.save({ ...rec, file: 'mars_normal_2k.jpg', usage: 'Mars tangent-space normal map', colorSpace: 'linear' }, nrm, W, H, 3, { format: 'jpg', quality: 94, subsample444: true })
}
