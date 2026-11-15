import { Simplex } from '../lib/noise'
import { makeGrid, forEachPixel } from '../lib/sphere'
import { makeRamp } from '../lib/ramps'
import { rng, smoothstep, clamp, DEG, hash2 } from '../lib/rng'
import { newCraterField, sampleDiameters, stampCrater, addRadial } from '../lib/craters'
import { heightToNormal, shadedRelief } from '../lib/relief'
import type { Ctx } from '../lib/ctx'

/**
 * Venus cloud deck, 2k. Streaks are made by averaging noise along parallels of latitude (a rotation about the polar
 * axis, so no seam and no pinching) with a rotation angle that grows with |latitude|: that bends the streaks into the
 * V / chevron ("Y", psi) pattern seen in ultraviolet images, with the vertex on the equator. Visible-light palette:
 * pale cream, with the UV contrast kept low. Polar hoods are brighter; a darker polar-vortex eye in each.
 */
export async function genVenusClouds(ctx: Ctx) {
  const W = ctx.W(2048), H = W / 2
  const g = makeGrid(W, H)
  const A = new Simplex(4101), B = new Simplex(4102), C = new Simplex(4103)
  const ramp = makeRamp([[0, '#8a7448'], [0.25, '#b79f66'], [0.5, '#dcc88c'], [0.75, '#efe2b4'], [1, '#fbf4dc']])
  const out = new Float32Array(W * H * 3)
  const col: [number, number, number] = [0, 0, 0]
  
  const TAPS = 13
  forEachPixel(g, (x, y, px, py, pz, i) => {
    const lat = g.lat[y]
    const lon = g.lon[x]
    const al = Math.abs(lat)
    const hemi = lat >= 0 ? 1 : -1
    // streak direction: east along the parallel, leaning poleward with latitude -> mirror-image chevrons, vertex at the equator
    const slope = 0.95 * smoothstep(2 * DEG, 38 * DEG, al)
    const len = 1.15 * (0.45 + 0.55 * Math.cos(lat))
    let s = 0, s2 = 0
    for (let t = 0; t < TAPS; t++) {
      const d = len * ((t + hash2(x, y, 5) - 0.5) / (TAPS - 1) - 0.5)
      const lo = lon + d
      const la = clamp(lat + hemi * slope * d * 0.85, -1.5, 1.5)
      const cl = Math.cos(la)
      const qx = cl * Math.cos(lo), qy = Math.sin(la), qz = -cl * Math.sin(lo)
      s += A.fbm(qx * 2.6, qy * 2.6, qz * 2.6, 4)
      s2 += B.fbm(qx * 6 + 3, qy * 6, qz * 6, 3)
    }
    s /= TAPS; s2 /= TAPS
    const band = Math.exp(-Math.pow((al - 33 * DEG) / (17 * DEG), 2))
    const sw = C.fbm(px * 1.4, py * 2.0, pz * 1.4, 3)
    let v = 0.64 + 0.95 * s + 0.35 * s2
    v -= 0.22 * band * Math.max(0, 0.3 + sw)
    v += 0.05 * Math.exp(-Math.pow(lat / (10 * DEG), 2))
    v += 0.2 * smoothstep(55 * DEG, 78 * DEG, al)
    v -= 0.16 * smoothstep(86 * DEG, 89.6 * DEG, al) * (0.7 + 0.3 * C.noise(px * 12, py * 12, pz * 12))
    v = clamp(v)
    ramp(v, col)
    out[i * 3] = col[0]; out[i * 3 + 1] = col[1]; out[i * 3 + 2] = col[2]
  })
  await ctx.save({
    file: 'venus_clouds_2k.jpg', kind: 'procedural', generator: 'tools/texgen/gen/venus.ts (parallel-averaged noise, V-shaped shear)',
    zone: 'solar-system', usage: 'Venus visible cloud deck (UV-style V swirls, low contrast)', credit: 'ASTRA procedural, no external source', tier: 'core', colorSpace: 'srgb',
  }, out, W, H, 3, { format: 'jpg', quality: 92 })
}

/**
 * Venus surface, radar style (Magellan-like false colour). Reference / credits page ONLY: nothing in the 3D scene uses it.
 * Highlands (Ishtar Terra / Lakshmi Planum / Maxwell Montes, Aphrodite Terra, Beta, Atla), rolling plains with wrinkle
 * ridges, coronae, a sparse uniform crater population, all in the Magellan orange palette.
 */
export async function genVenusRadar(ctx: Ctx) {
  const W = ctx.W(2048), H = W / 2
  const g = makeGrid(W, H)
  const R = 6051.8
  const N = new Simplex(4201), N2 = new Simplex(4202)
  const r = rng(4203)
  const h = new Float32Array(W * H)
  forEachPixel(g, (x, y, px, py, pz, i) => {
    h[i] = 1.1 * N.fbm(px * 1.4, py * 1.4, pz * 1.4, 5) + 0.35 * N2.ridged(px * 6, py * 6, pz * 6, 5) * 0.6 + 0.12 * N.fbm(px * 40, py * 40, pz * 40, 3)
  })
  // continents (km): Ishtar (70N 20E) w/ Maxwell Montes (65.2N 3.3E), Aphrodite (-8N, 100..160E), Beta (25N -78), Atla (9N 200E=-160)
  const bump = (lat: number, lon: number, rad: number, ht: number) => addRadial(h, g, R, lat, lon, rad * 1.8, (d) => ht * Math.exp(-Math.pow(d / rad, 2)))
  bump(70, 20, 1100, 3.2) // VERIFY
  bump(65.2, 3.3, 350, 5.5) // Maxwell Montes
  for (let k = 0; k < 12; k++) bump(-8 + r.range(-4, 3), 85 + k * 7, 640, 1.7) // Aphrodite chain, VERIFY
  bump(25, -78, 800, 2.4) // Beta Regio
  bump(9, -160, 700, 2.2) // Atla Regio
  bump(-30, 330 - 360, 500, 1.4)
  // coronae: ring uplift with a depressed centre
  for (let k = 0; k < 50; k++) {
    const lat = Math.asin(r.range(-0.9, 0.9)) / DEG, lon = r.range(-180, 180), rad = r.range(80, 360)
    addRadial(h, g, R, lat, lon, rad * 2, (d) => 0.5 * Math.exp(-Math.pow((d - rad) / (rad * 0.18), 2)) - 0.22 * Math.exp(-Math.pow(d / (rad * 0.6), 2)))
  }
  // sparse, well-preserved craters (no small ones: the dense atmosphere screens them)
  const cf = newCraterField(g)
  const sizes = sampleDiameters(r, Math.round(900 * (W / 2048) ** 2 * 0.5), Math.max(22, (2 * Math.PI * R / W) * 2.2), 280, 1.6)
  for (const d of sizes) stampCrater(cf, g, R, { lat: Math.asin(r.range(-1, 1)) / DEG, lon: r.range(-180, 180), d, deg: 0.05 * r.next(), floorFill: 0.8 }, () => 0)
  for (let i = 0; i < h.length; i++) h[i] += cf.height[i] * 0.7
  const hs = shadedRelief(h, g, R, 9, 315, 38)
  const ramp = makeRamp([[0, '#14070a'], [0.2, '#3a1608'], [0.45, '#8a3c10'], [0.7, '#d4701c'], [0.9, '#f2a53a'], [1, '#ffe9a8']])
  const out = new Float32Array(W * H * 3)
  const col: [number, number, number] = [0, 0, 0]
  forEachPixel(g, (x, y, px, py, pz, i) => {
    // radar brightness: roughness (ridged noise) + elevation + slope facing
    const rough = N2.ridged(px * 25, py * 25, pz * 25, 4)
    let v = 0.3 + 0.07 * h[i] + 0.35 * (hs[i] - 0.5) + 0.22 * rough * smoothstep(0.5, 2.5, h[i] + 0.8) + 0.05 * N.noise(px * 160, py * 160, pz * 160) + cf.bright[i] * 0.5
    v = clamp(v)
    ramp(v, col)
    out[i * 3] = col[0]; out[i * 3 + 1] = col[1]; out[i * 3 + 2] = col[2]
  })
  void heightToNormal
  await ctx.save({
    file: 'venus_radar_2k.jpg', kind: 'procedural', generator: 'tools/texgen/gen/venus.ts (radar-style relief, Magellan palette)',
    zone: 'credits', usage: 'Venus radar-style surface map: credits page / reference ONLY, not used by any 3D object', credit: 'ASTRA procedural (styled after Magellan radar; not Magellan data)', tier: 'core', colorSpace: 'srgb',
  }, out, W, H, 3, { format: 'jpg', quality: 90 })
}
