import { Simplex, worley3, makeWorley } from '../lib/noise'
import { makeGrid, forEachPixel, vecFromLonLat } from '../lib/sphere'
import { makeRamp } from '../lib/ramps'
import { rng, smoothstep, clamp, DEG } from '../lib/rng'
import type { Ctx } from '../lib/ctx'
import { saveRecord } from '../lib/manifest'

/**
 * Sun photosphere, 4k equirect. Granulation = Worley cells (bright cell cores, dark inter-granular lanes) on three
 * scales (granule, mesogranule, supergranule network), plus faculae and sunspots (umbra + filamentary penumbra) in the
 * activity belts (|lat| 5-30 deg, Sporer-style). Limb darkening is NOT baked in: the shader applies it.
 * Granule size is exaggerated ~4x so it survives at the disc sizes the journey shows (real ~1000 km ~ 1 px at 4k).
 */
export async function genSun(ctx: Ctx) {
  const W = ctx.W(4096), H = W / 2
  const g = makeGrid(W, H)
  const sx = new Simplex(2001), sy = new Simplex(2002)
  const wr = makeWorley()
  const ramp = makeRamp([
    [0.0, '#6a2408'], [0.3, '#d2581a'], [0.52, '#ff9f3a'], [0.68, '#ffd078'], [0.82, '#ffe9ae'], [0.95, '#fff6d8'], [1.0, '#ffffff'],
  ])
  const pitch = (2 * Math.PI) / W // radians per px at the equator
  const fG = 1 / (4.2 * pitch) // granule cells per unit length
  const fM = fG / 4.5
  const fS = fG / 18

  // ---- sunspot groups (deterministic) ----
  const r = rng(77)
  type Spot = { x: number; y: number; z: number; rad: number; seed: number }
  const spots: Spot[] = []
  const mkGroup = (lat: number, lon: number, n: number, scale: number) => {
    for (let i = 0; i < n; i++) {
      const lead = i === 0
      const la = lat + r.range(-2.2, 2.2) * scale
      const lo = lon + (lead ? 0 : r.range(-9, 9) * scale) + (i > 0 ? (lat > 0 ? 3 : -3) * i * 0.4 : 0)
      const v = vecFromLonLat(lo, la)
      spots.push({ x: v[0], y: v[1], z: v[2], rad: (lead ? r.range(3.2, 4.6) : r.range(0.8, 2.2)) * scale * DEG, seed: r.next() * 1000 })
    }
  }
  const groups = [[14, -150, 7, 1.0], [-18, -60, 5, 0.9], [22, 30, 9, 1.15], [-9, 110, 4, 0.8], [11, 175, 6, 1.0], [-24, -110, 4, 0.7], [17, -20, 3, 0.6], [-14, 70, 6, 1.05], [7, -95, 3, 0.55]]
  for (const [la, lo, n, s] of groups) mkGroup(la, lo, n, s)

  const field = new Float32Array(W * H * 3)
  const n3 = new Simplex(2003)
  forEachPixel(g, (x, y, px, py, pz, i) => {
    // irregular granules: warp the lookup a little
    const wx = px + 0.0035 * sy.noise(px * 60, py * 60, pz * 60), wy = py + 0.0035 * sy.noise(py * 60 + 9, pz * 60, px * 60), wz = pz + 0.0035 * sy.noise(pz * 60 - 4, px * 60, py * 60)
    worley3(wx * fG, wy * fG, wz * fG, 11, wr, 0.95)
    const core = 1 - smoothstep(0.08, 0.62, wr.f1)
    const lane = smoothstep(0.02, 0.2, wr.f2 - wr.f1)
    let b = 0.7 + 0.3 * core * lane + 0.1 * (wr.id - 0.5) + 0.04 * sx.noise(px * fG * 2, py * fG * 2, pz * fG * 2)
    worley3(px * fM, py * fM, pz * fM, 23, wr, 1)
    b += 0.07 * ((1 - smoothstep(0.1, 0.7, wr.f1)) - 0.45) * (0.6 + 0.4 * wr.id)
    worley3(px * fS, py * fS, pz * fS, 41, wr, 1)
    const net = smoothstep(0.0, 0.25, wr.f2 - wr.f1) // supergranule network
    b += 0.05 * (net - 0.6)
    b += 0.03 * n3.fbm(px * 3, py * 3, pz * 3, 3)

    // activity belts: faculae (bright network near spots)
    const lat = Math.asin(py)
    const belt = Math.exp(-Math.pow((Math.abs(lat) - 17 * DEG) / (13 * DEG), 2))
    const fac = Math.max(0, n3.fbm(px * 9 + 3, py * 9, pz * 9, 4)) * belt * (1 - net * 0.5)
    b += 0.16 * fac

    let umbra = 0
    let pen = 0
    for (let k = 0; k < spots.length; k++) {
      const s = spots[k]
      const d = Math.acos(clamp(px * s.x + py * s.y + pz * s.z, -1, 1))
      if (d > s.rad * 3.2) continue
      const wob = 1 + 0.18 * n3.noise(px * 30 + s.seed, py * 30, pz * 30)
      const rr = d / (s.rad * wob)
      umbra = Math.max(umbra, 1 - smoothstep(0.28, 0.42, rr))
      // penumbra: radial filaments from angular noise around the spot
      const az = Math.atan2(py - s.y, px * 0.7 + pz * 0.7 - s.x)
      const fil = 0.75 + 0.25 * n3.noise(Math.cos(az) * 14 + s.seed, Math.sin(az) * 14, rr * 5)
      pen = Math.max(pen, (1 - smoothstep(0.85, 1.12, rr)) * fil)
      // bright ring (facular halo)
      b += 0.12 * Math.exp(-Math.pow((rr - 1.7) / 0.5, 2)) * 0.6
    }
    b = b * (1 - 0.42 * pen) // penumbra ~ 0.75 of photosphere intensity -> visibly darker
    b = b * (1 - 0.8 * umbra) // umbra ~ 0.2-0.3
    const c = ramp(clamp(b), [0, 0, 0])
    field[i * 3] = c[0]; field[i * 3 + 1] = c[1]; field[i * 3 + 2] = c[2]
  })

  const rec = { kind: 'procedural' as const, generator: 'tools/texgen/gen/sun.ts (Worley granulation + spots)', zone: 'sun', usage: 'Sun photosphere (limb darkening in shader)', credit: 'ASTRA procedural, no external source', colorSpace: 'srgb' as const }
  await ctx.save({ ...rec, file: 'sun_4k.jpg', tier: 'hi', fallback: 'sun_2k.jpg' }, field, W, H, 3, { format: 'jpg', quality: 92, subsample444: true })
  await ctx.resize('sun_4k.jpg', 'sun_2k.jpg', W / 2, H / 2)
  if (!ctx.preview) {
    const fs = await import('node:fs')
    const st = fs.statSync('public/textures/sun_2k.jpg')
    saveRecord({ ...rec, file: 'sun_2k.jpg', w: W / 2, h: H / 2, channels: 3, bytes: st.size, tier: 'core', usage: 'Sun photosphere, mobile tier (downscaled from sun_4k.jpg)' })
  }
}
