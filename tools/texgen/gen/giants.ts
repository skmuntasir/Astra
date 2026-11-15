import { Simplex } from '../lib/noise'
import { makeGrid, forEachPixel } from '../lib/sphere'
import { rng, smoothstep, clamp, DEG } from '../lib/rng'
import { hex, type RGB } from '../lib/ramps'
import { bandProfile, applyVortex, type Vortex, type VortexHit, type BandSeg } from '../lib/bands'
import { saveTiered } from '../lib/save'
import type { Ctx } from '../lib/ctx'

/**
 * Gas and ice giants. One engine (`renderGiant`), four configurations.
 * Technique: swirl the (lon,lat) sampling frame around each vortex -> displace latitude along belt/zone edges by a
 * shear-weighted anisotropic noise (turbulent belt edges) -> look up the band colour -> multiply fine streaks
 * (noise stretched along the parallels, sampled in 3D so there is no seam or polar pinch) -> colour overrides in vortex cores.
 * Latitudes are planetographic degrees, from published band tables: all positions are approximate, // VERIFY
 */
interface PolarCyclones { pole: 1 | -1; ring: number; radiusDeg: number; spin: number; n: number; centre: boolean; ringR: number; colour: RGB }
interface GiantCfg {
  seed: number
  segs: BandSeg[]
  edges: Array<[number, number]> // [lat deg, width deg] of shear lines (belt/zone boundaries)
  edgeW: number // colour edge softness, deg
  turb: number // latitude displacement amplitude at shear lines (deg)
  wave: number // planetary-scale latitude waviness of all band edges (deg)
  eddy: number // vector-noise warp amplitude on the shear lines (unit sphere)
  blot: number // large-scale blotchiness inside belts
  streak: number // fine streak luminance amplitude
  cells: number // belt interior cell amplitude
  vortices: Vortex[]
  polar?: PolarCyclones[]
  polarChaos: number // 0..1: amount of isotropic turbulence poleward of ~62 deg
  limbless?: boolean
  hexagon?: { lat: number; apothemDeg: number; colour: RGB }
  festoons?: boolean
  post?: (c: RGB, ctx: { lon: number; lat: number; lat0: number; px: number; py: number; pz: number; n: Simplex; streaks: number }) => void
}

function polarSwirl(c: PolarCyclones, lon: number, lat: number, out: { lon: number; lat: number }, hit: { w: number; col: RGB | null; collar: number }) {
  // azimuthal-equidistant polar plane (units: degrees of colatitude)
  const col = (90 - c.pole * lat / DEG)
  out.lon = lon; out.lat = lat
  if (col > 30) return
  const a = lon
  const x = col * Math.cos(a), y = col * Math.sin(a)
  let sx = x, sy = y
  const cents: Array<[number, number]> = []
  if (c.centre) cents.push([0, 0])
  for (let k = 0; k < c.n; k++) { const t = (k / c.n) * Math.PI * 2 + 0.3; cents.push([c.ringR * Math.cos(t), c.ringR * Math.sin(t)]) }
  for (const [cx, cy] of cents) {
    const dx = (sx - cx) / c.radiusDeg, dy = (sy - cy) / c.radiusDeg
    const rho = Math.hypot(dx, dy)
    if (rho > 2) continue
    const f = Math.pow(1 - smoothstep(0, 2, rho), 1.5)
    const ang = c.spin * f
    const co = Math.cos(ang), si = Math.sin(ang)
    sx = cx + (dx * co - dy * si) * c.radiusDeg
    sy = cy + (dx * si + dy * co) * c.radiusDeg
    const w = 1 - smoothstep(0.6, 1.0, rho)
    if (w > hit.w) { hit.w = w; hit.col = c.colour }
    hit.collar = Math.max(hit.collar, Math.exp(-Math.pow((rho - 1.08) / 0.12, 2)))
  }
  const nc = Math.hypot(sx, sy)
  out.lat = c.pole * (90 - nc) * DEG
  out.lon = Math.atan2(sy, sx)
}

async function renderGiant(W: number, cfg: GiantCfg, tag: string): Promise<Float32Array> {
  const H = W / 2
  const g = makeGrid(W, H)
  const N = new Simplex(cfg.seed), N2 = new Simplex(cfg.seed + 1), N3 = new Simplex(cfg.seed + 2)
  const prof = bandProfile(cfg.segs, cfg.edgeW * DEG)
  const out = new Float32Array(W * H * 3)
  const base: RGB = [0, 0, 0]
  const tmp = { lon: 0, lat: 0 }
  const ptmp = { lon: 0, lat: 0 }
  const hits: VortexHit[] = []
  // 1D latitude LUT of shear weight (turbulence is concentrated on the belt/zone edges)
  const LUT = 4096
  const shearLut = new Float32Array(LUT)
  for (let i = 0; i < LUT; i++) {
    const lat = ((i + 0.5) / LUT - 0.5) * 180
    let s = 0
    for (const [e, w] of cfg.edges) s += Math.exp(-Math.pow((lat - e) / w, 2))
    shearLut[i] = Math.min(1.4, s)
  }
  const shearAt = (lat: number) => shearLut[Math.min(LUT - 1, Math.max(0, Math.floor((lat / Math.PI + 0.5) * LUT)))]
  const t0 = Date.now()
  forEachPixel(g, (x, y, px0, py0, pz0, i) => {
    let lon = g.lon[x], lat = g.lat[y]
    hits.length = 0
    for (const v of cfg.vortices) {
      const h = applyVortex(v, lon, lat, tmp)
      if (h) { lon = tmp.lon; lat = tmp.lat; hits.push(h) }
    }
    const ph = { w: 0, col: null as RGB | null, collar: 0 }
    if (cfg.polar) for (const pc of cfg.polar) if (pc.pole * lat > 55 * DEG) { polarSwirl(pc, lon, lat, ptmp, ph); lon = ptmp.lon; lat = ptmp.lat }
    const lat0 = lat
    let cl = Math.cos(lat)
    let px = cl * Math.cos(lon), py = Math.sin(lat), pz = -cl * Math.sin(lon)
    const al = Math.abs(lat)
    const pol = smoothstep(58 * DEG, 74 * DEG, al) * cfg.polarChaos
    // turbulent belt edges: shear-weighted anisotropic noise displaces latitude and longitude
    const shear = shearAt(lat)
    // planetary-scale waves + curl-like eddies: a vector-noise warp of the sample position, strongest on the shear lines
    const wv0 = N3.fbm(px * 1.6 + 5, py * 3.2, pz * 1.6, 3)
    const ea = cfg.eddy * shearAt(lat)
    if (ea > 0.003) {
      px += ea * N2.fbm(px * 7 + 1.3, py * 7, pz * 7, 3); pz += ea * N2.fbm(px * 7 - 4.1, py * 7 + 2, pz * 7, 3); py += 0.35 * ea * N3.fbm(px * 7, py * 7 + 9, pz * 7, 3)
    }
    const nA = N.fbm(px * 2.2, py * 26, pz * 2.2, 4)
    const nB = N2.fbm(px * 5 + 3, py * 11, pz * 5, 3)
    const nI = N3.fbm(px * 7, py * 7, pz * 7, 4)
    let dLat = cfg.turb * DEG * shear * (0.7 * nA + 0.5 * nB) + cfg.wave * DEG * wv0
    dLat += pol * 5 * DEG * nI
    if (cfg.festoons) {
      // festoon waves on the NEB south edge / EZ and the SEB north edge: sinusoidal latitude wave modulated by noise
      const wv = Math.sin(lon * 11 + 3 * N.noise(px * 3, py * 3, pz * 3)) * 0.75 * DEG
      dLat += wv * Math.exp(-Math.pow((lat0 - 7 * DEG) / (2.6 * DEG), 2))
      dLat += 0.5 * wv * Math.exp(-Math.pow((lat0 + 7.5 * DEG) / (2.8 * DEG), 2))
    }
    const latW = lat + dLat
    prof(latW, base)
    // fine streaks (several scales), strong in belts and where shear is high
    const s1 = N.fbm(px * 3.5 + 7, py * 60, pz * 3.5, 3)
    const s2 = N2.fbm(px * 9 + 2, py * 150, pz * 9, 3)
    const s3 = N3.noise(px * 22, py * 330, pz * 22)
    let L = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2]
    const beltness = clamp((0.78 - L) * 3.2)
    let streaks = 0.55 * s1 + 0.32 * s2 + 0.13 * s3
    // cells: puffy convective structure, visible mostly inside belts and at the edges
    const cell = N2.billow(px * 8 + 1, py * 24, pz * 8, 3)
    let lum = 1 + cfg.blot * beltness * N2.fbm(px * 4 + 9, py * 9, pz * 4, 3) + cfg.streak * streaks * (0.45 + 0.9 * shear + 0.5 * beltness) + cfg.cells * cell * (0.35 + 0.65 * beltness)
    // polar chaos: isotropic, lower contrast mottling
    if (pol > 0) lum += pol * (0.5 * N.fbm(px * 14, py * 14, pz * 14, 5) + 0.2 * N3.fbm(px * 36, py * 36, pz * 36, 3))
    let r = base[0] * lum, gg = base[1] * lum, b = base[2] * lum
    if (cfg.hexagon) {
      const hx = cfg.hexagon
      const colat = (Math.PI / 2 - lat0) / DEG
      if (lat0 > 0 && colat < 40) {
        const az = lon
        const a6 = ((az + 6 * Math.PI) % (Math.PI / 3)) - Math.PI / 6
        const rPoly = hx.apothemDeg / Math.cos(a6) // hexagon boundary colatitude for this azimuth
        const d = (colat - rPoly) // signed distance (deg) from the hexagon edge, roughly
        const jet = Math.exp(-Math.pow(d / 0.9, 2))
        const inside = 1 - smoothstep(-0.8, 0.8, d)
        const m = inside * (0.55 + 0.1 * N.fbm(px * 14, py * 14, pz * 14, 3))
        r += (hx.colour[0] * 0.8 - r) * m * 0.5; gg += (hx.colour[1] * 0.8 - gg) * m * 0.5; b += (hx.colour[2] * 0.8 - b) * m * 0.5
        const jc = 0.1 * jet
        r += jc; gg += jc * 0.95; b += jc * 0.8
        // dark eye at the pole
        const eye = 1 - smoothstep(0.8, 2.6, colat)
        r *= 1 - 0.35 * eye; gg *= 1 - 0.35 * eye; b *= 1 - 0.3 * eye
      }
    }
    // polar cyclone cores / collars
    if (ph.w > 0 && ph.col) { const k = ph.w * 0.42; r += (ph.col[0] - r) * k; gg += (ph.col[1] - gg) * k; b += (ph.col[2] - b) * k }
    if (ph.collar > 0) { const k = ph.collar * 0.28; r += (1 - r) * k * 0.7; gg += (1 - gg) * k * 0.7; b += (1 - b) * k * 0.65 }
    // vortex colour overrides (outermost first, i.e. listed order)
    for (const h of hits) {
      if (h.core && h.w > 0) {
        const inner = 0.82 + 0.18 * N.fbm(px * 40, py * 40, pz * 40, 3) + 0.14 * streaks
        const k = h.w * h.amt
        r += (h.core[0] * inner - r) * k; gg += (h.core[1] * inner - gg) * k; b += (h.core[2] * inner - b) * k
      }
      if (h.v.collar && h.collar > 0.02) {
        const k = h.collar * h.v.collar
        r += (1 - r) * k * 0.5; gg += (1 - gg) * k * 0.46; b += (1 - b) * k * 0.4
      }
    }
    const col: RGB = [r, gg, b]
    cfg.post?.(col, { lon, lat, lat0, px, py, pz, n: N, streaks })
    out[i * 3] = col[0]; out[i * 3 + 1] = col[1]; out[i * 3 + 2] = col[2]
  })
  console.log(`  [${tag}] rendered ${W}x${H} in ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  return out
}

// ---------------------------------------------------------------- Jupiter
function jupiterCfg(): GiantCfg {
  const zone = '#eadcc0', zoneW = '#f1e6cf'
  const segs: BandSeg[] = [
    { lat: -90, col: '#6f6c68' }, // S polar region: grey-brown, dusky
    { lat: -66, col: '#8e7e6c' },
    { lat: -58, col: '#b79d7e' },
    { lat: -53, col: '#d9c9ad' },
    { lat: -47, col: '#b28e69' }, // SSTB
    { lat: -43, col: '#dccdb2' }, // SSTZ
    { lat: -37, col: zone }, // STZ
    { lat: -29.5, col: '#a8744d' }, // STB
    { lat: -25.5, col: '#e6d6b8' }, // STrZ (GRS lives here)
    { lat: -20.5, col: '#935a3a' }, // SEB
    { lat: -8.5, col: '#dfc89f' }, // SEB-EZ transition
    { lat: -6.5, col: '#ecdcb6' }, // EZ
    { lat: 7, col: '#82502f' }, // NEB
    { lat: 17.5, col: zoneW }, // NTrZ
    { lat: 22.5, col: '#b0845f' }, // NTB (S component)
    { lat: 27, col: '#dfd0b4' }, // NTZ
    { lat: 33, col: '#a67d5b' }, // NNTB
    { lat: 38.5, col: '#d8c8ac' },
    { lat: 46, col: '#ad8b69' },
    { lat: 51, col: '#cdbea4' },
    { lat: 58, col: '#a8957e' },
    { lat: 66, col: '#8a8176' },
    { lat: 76, col: '#6e6b68' }, // N polar region
  ]
  const grsCore = hex('#c25a40'), baCore = hex('#cf8a68'), white = hex('#f6efe0'), brown = hex('#6e3f27')
  const r = rng(77)
  const V: Vortex[] = [
    // Great Red Spot: ~16,000 x 12,000 km at ~22S; anticyclone => counter-clockwise in the south
    { lat: -22.2, lon: 20, rx: 7.6, ry: 5.0, spin: -2.6, core: grsCore, coreAmt: 0.92, collar: 0.9, tag: 'GRS' },
    // Oval BA at ~33S, smaller and paler (it was white until 2005-06, a "Red Jr.")
    { lat: -33, lon: -70, rx: 3.6, ry: 2.5, spin: -2.2, core: baCore, coreAmt: 0.85, collar: 0.7, tag: 'BA' },
    // the other white ovals of the STZ chain (the three originals formed 1939-40 at ~33S; here two survivors as an interpretation)
    { lat: -33.3, lon: 95, rx: 2.4, ry: 1.8, spin: -2.0, core: white, coreAmt: 0.85, collar: 0.5 },
    { lat: -33.0, lon: 150, rx: 2.0, ry: 1.5, spin: -1.8, core: white, coreAmt: 0.8, collar: 0.5 },
    // a train of small white spots in the S temperate belt
    ...[0, 1, 2, 3].map((k) => ({ lat: -40.8 + 0.5 * k, lon: -150 + k * 26, rx: 1.6, ry: 1.2, spin: -1.6, core: white, coreAmt: 0.8, collar: 0.4 }) as Vortex),
    // NEB brown barges (cyclonic, elongated, dark) and a few white NTrZ ovals (anticyclones, clockwise)
    ...[0, 1, 2].map((k) => ({ lat: 15 + 0.6 * k, lon: -120 + k * 83 + r.range(-10, 10), rx: 5.5, ry: 1.7, spin: 1.8, core: brown, coreAmt: 0.55, collar: 0.2 }) as Vortex),
    ...[0, 1, 2, 3, 4].map((k) => ({ lat: 19.6 + r.range(-0.8, 0.8), lon: -170 + k * 71 + r.range(-8, 8), rx: 2.2, ry: 1.5, spin: 1.9, core: white, coreAmt: 0.85, collar: 0.5 }) as Vortex),
    // white ovals in the NTB/NTZ
    ...[0, 1, 2].map((k) => ({ lat: 29.5 + r.range(-1, 1), lon: -60 + k * 105, rx: 2.4, ry: 1.6, spin: 1.7, core: white, coreAmt: 0.8, collar: 0.4 }) as Vortex),
  ]
  const polar: PolarCyclones[] = [
    // Juno found 8 cyclones around 1 at the north pole (octagon) and 5 around 1 at the south (pentagon)
    { pole: 1, centre: true, n: 8, ringR: 11.5, radiusDeg: 2.9, spin: 3.4, ring: 0, colour: hex('#9aa2a6') },
    { pole: -1, centre: true, n: 5, ringR: 10.5, radiusDeg: 3.6, spin: -3.4, ring: 0, colour: hex('#9ba3a8') },
  ]
  return {
    seed: 9001, segs, edgeW: 1.1,
    edges: [[-20.5, 1.6], [-8, 1.4], [-6.5, 1.4], [7, 1.3], [17.5, 1.3], [22.5, 1.4], [27, 1.2], [33, 1.4], [-29.5, 1.5], [-25.5, 1.4], [-37, 1.6], [-43, 1.6], [-47, 1.4], [38.5, 1.4], [46, 1.4], [51, 1.2]],
    turb: 1.5, wave: 1.1, eddy: 0.07, blot: 0.35, streak: 0.5, cells: 0.28,
    vortices: V, polar, polarChaos: 1, festoons: true,
  }
}

// ---------------------------------------------------------------- Saturn
function saturnCfg(hexagon: boolean): GiantCfg {
  const segs: BandSeg[] = [
    { lat: -90, col: '#a79660' }, // south polar: darker gold-olive
    { lat: -72, col: '#b9a06a' },
    { lat: -62, col: '#cdb480' },
    { lat: -54, col: '#c9ad78' }, // slightly darker belt
    { lat: -46, col: '#dcc48f' },
    { lat: -38, col: '#cfb582' },
    { lat: -31, col: '#e0c995' },
    { lat: -24, col: '#d2b985' },
    { lat: -17, col: '#e6d09b' },
    { lat: -9, col: '#c9ad78' }, // SEB-equivalent
    { lat: -4, col: '#e9d6a4' },
    { lat: 4, col: '#eddaab' }, // equatorial zone, brightest
    { lat: 10, col: '#d4ba86' },
    { lat: 17, col: '#e3cd9b' },
    { lat: 25, col: '#d3b988' },
    { lat: 33, col: '#e1cc9c' },
    { lat: 41, col: '#cdb584' },
    { lat: 49, col: '#d2bb8b' },
    { lat: 58, col: '#bfae86' }, // north: bluish-grey cast (Cassini-era northern winter)
    { lat: 66, col: '#a39f84' },
    { lat: 74, col: '#8f978b' },
  ]
  const white = hex('#f3ead2')
  const V: Vortex[] = [
    // "Storm Alley" ~35S: a few small bright ovals; a modest white storm at ~ 40N (2010 Great White Spot territory, much weaker here)
    ...[0, 1, 2, 3, 4, 5].map((k) => ({ lat: -35 + (k % 2) * 0.9, lon: -140 + k * 52, rx: 2.8, ry: 1.7, spin: -1.6, core: white, coreAmt: 0.5, collar: 0.2 }) as Vortex),
    { lat: 37.5, lon: 60, rx: 5.5, ry: 3.2, spin: 1.6, core: hex('#f0e4c0'), coreAmt: 0.45, collar: 0.2 },
    { lat: 27.5, lon: -100, rx: 3.0, ry: 1.8, spin: 1.5, core: hex('#d8c18f'), coreAmt: 0.4, collar: 0.1 },
  ]
  return {
    seed: 9101, segs, edgeW: 2.4,
    edges: [[-9, 2.0], [-4, 1.8], [10, 2.2], [17, 2], [-17, 2], [25, 2], [33, 2], [-24, 2], [41, 2.5], [-31, 2], [-38, 2.2], [49, 2.5]],
    turb: 0.7, wave: 0.5, eddy: 0.02, blot: 0.1, streak: 0.16, cells: 0.07,
    vortices: V, polarChaos: 0.25,
    hexagon: hexagon ? { lat: 78, apothemDeg: 12.3, colour: hex('#8c9892') } : undefined,
  }
}

// ---------------------------------------------------------------- Uranus
function uranusCfg(): GiantCfg {
  const segs: BandSeg[] = [
    { lat: -90, col: '#b9e6e6' }, // sunlit (in 1986) south polar cap: brighter
    { lat: -68, col: '#aee0e2' },
    { lat: -46, col: '#a4dadd' }, // bright collar edge at ~45S
    { lat: -38, col: '#9bd3d8' },
    { lat: -20, col: '#97cfd5' },
    { lat: -6, col: '#92cbd3' },
    { lat: 6, col: '#96cfd6' },
    { lat: 22, col: '#9bd3d8' },
    { lat: 40, col: '#9ad2d8' },
    { lat: 60, col: '#97cfd6' },
  ]
  const cloud = hex('#e6f7f4')
  const V: Vortex[] = [
    // a handful of small bright methane cloud features (HST/Keck imaging shows them at ~ 30-40 deg in both hemispheres)
    { lat: -34, lon: 40, rx: 3.5, ry: 1.0, spin: 0.4, core: cloud, coreAmt: 0.55 },
    { lat: -31, lon: 130, rx: 2.4, ry: 0.8, spin: 0.4, core: cloud, coreAmt: 0.45 },
    { lat: 28, lon: -70, rx: 4, ry: 1.0, spin: -0.4, core: cloud, coreAmt: 0.5 },
    { lat: 32, lon: -150, rx: 2.4, ry: 0.8, spin: -0.4, core: cloud, coreAmt: 0.4 },
    { lat: 43, lon: 85, rx: 3.0, ry: 0.9, spin: -0.4, core: cloud, coreAmt: 0.4 },
    // the "dark spot" (Hammel et al. 2006, ~ 27 N) -- faint, small
    { lat: 27, lon: 10, rx: 3.0, ry: 1.6, spin: -1.2, core: hex('#7fb9c4'), coreAmt: 0.35 },
  ]
  return {
    seed: 9201, segs, edgeW: 5,
    edges: [[-45, 3], [-20, 3], [0, 3], [22, 3], [45, 3]],
    turb: 0.3, wave: 0.4, eddy: 0.0, blot: 0.03, streak: 0.045, cells: 0.015,
    vortices: V, polarChaos: 0.12,
  }
}

// ---------------------------------------------------------------- Neptune
function neptuneCfg(): GiantCfg {
  const segs: BandSeg[] = [
    { lat: -90, col: '#2f5cb4' },
    { lat: -66, col: '#3563bb' },
    { lat: -58, col: '#2a55ab' },
    { lat: -50, col: '#3262b8' },
    { lat: -40, col: '#2b58b0' },
    { lat: -30, col: '#3868c0' }, // brighter band just south of the GDS
    { lat: -16, col: '#2a53a8' },
    { lat: -6, col: '#2f5db3' },
    { lat: 6, col: '#3563bb' }, // equator slightly lighter
    { lat: 18, col: '#2c58ae' },
    { lat: 34, col: '#2f5db3' },
    { lat: 50, col: '#2b56ab' },
    { lat: 64, col: '#3360b6' },
  ]
  const dark = hex('#14275f')
  const V: Vortex[] = [
    // Great Dark Spot (Voyager 2, 1989): ~ 13,000 x 6,600 km at ~ 22S (it has since vanished; HST later saw others)
    { lat: -22, lon: -30, rx: 17, ry: 7.2, spin: -1.4, core: dark, coreAmt: 0.85, collar: 0.0, tag: 'GDS' },
    // Small Dark Spot (D2) at ~ 54S with a bright core
    { lat: -54, lon: 110, rx: 7.5, ry: 3.8, spin: -1.2, core: hex('#1c3a80'), coreAmt: 0.75 },
    // northern hemisphere dark spots seen by HST (1994+), smaller
    { lat: 32, lon: -140, rx: 9, ry: 3.6, spin: 1.2, core: hex('#1d3a82'), coreAmt: 0.6 },
  ]
  return {
    seed: 9301, segs, edgeW: 3,
    edges: [[-30, 2.5], [-16, 2.5], [-6, 2], [6, 2], [18, 2.5], [-50, 3]],
    turb: 0.6, wave: 0.6, eddy: 0.01, blot: 0.05, streak: 0.09, cells: 0.03, vortices: V, polarChaos: 0.12,
    post(c, p) {
      // bright high-altitude methane cirrus: thin streaks, strongest on the south side of the GDS (~ -29 .. -38), at ~ -42 (Scooter), ~ -53 (D2 companion) and ~ +30
      const centres: Array<[number, number, number, number]> = [[-31, 3.6, 0.85, 20], [-42, 3.0, 0.9, 12], [-55.5, 3.2, 0.8, 10], [-18, 1.8, 0.35, 22], [32, 2.4, 0.5, 14], [-5, 1.5, 0.3, 30]]
      let cirrus = 0
      const lat = p.lat * (180 / Math.PI)
      for (const [la, wd, amp, fr] of centres) {
        const m = Math.exp(-Math.pow((lat - la) / wd, 2))
        if (m < 0.01) continue
        // stretched noise: elongated along the parallel
        const s = p.n.noise(p.px * fr * 0.16 + 13, p.py * fr * 4, p.pz * fr * 0.16)
        const s2 = p.n.noise(p.px * fr * 0.8, p.py * fr * 12, p.pz * fr * 0.8 + 5)
        cirrus += amp * m * smoothstep(0.3, 0.75, 0.7 * s + 0.3 * s2 + 0.12)
      }
      // a compact bright companion cloud next to the GDS, and "Scooter" (fast white cloud)
      const k = Math.min(1, cirrus)
      c[0] += (0.93 - c[0]) * k * 0.85; c[1] += (0.96 - c[1]) * k * 0.85; c[2] += (1.0 - c[2]) * k * 0.85
    },
  }
}

export async function genGiants(ctx: Ctx, only?: string[]) {
  const want = (n: string) => !only || only.includes(n)
  const rec = (name: string, usage: string, zone = 'solar-system') => ({
    kind: 'procedural' as const, generator: `tools/texgen/gen/giants.ts (${name}: band profile + swirl-warped anisotropic noise)`, zone, usage,
    credit: 'ASTRA procedural (not a photograph; feature latitudes from published band tables, // VERIFY)', colorSpace: 'srgb' as const,
  })
  if (want('jupiter')) {
    const W = ctx.W(4096)
    const img = await renderGiant(W, jupiterCfg(), 'jupiter')
    await saveTiered(ctx, rec('Jupiter', 'Jupiter cloud tops'), 'jupiter', '4k', '2k', img, W, W / 2, 3, { format: 'jpg', quality: 90, loW: W / 2 })
  }
  if (want('saturn')) {
    const W = ctx.W(4096)
    const img = await renderGiant(W, saturnCfg(true), 'saturn')
    await saveTiered(ctx, rec('Saturn', 'Saturn cloud tops (north polar hexagon included)'), 'saturn', '4k', '2k', img, W, W / 2, 3, { format: 'jpg', quality: 90, loW: W / 2 })
  }
  if (want('uranus')) {
    const W = ctx.W(2048)
    const img = await renderGiant(W, uranusCfg(), 'uranus')
    await saveTiered(ctx, rec('Uranus', 'Uranus (nearly featureless, faint bands, bright south polar cap)'), 'uranus', '2k', null, img, W, W / 2, 3, { format: 'jpg', quality: 92 })
  }
  if (want('neptune')) {
    const W = ctx.W(2048)
    const img = await renderGiant(W, neptuneCfg(), 'neptune')
    await saveTiered(ctx, rec('Neptune', 'Neptune (Great-Dark-Spot style vortex, cirrus streaks)'), 'neptune', '2k', null, img, W, W / 2, 3, { format: 'jpg', quality: 92 })
  }
}
