import { AU, GALAXY, GALAXY_R, LMC, M31, M33, LY, NEAR_STARS, SMC, SUN, UNIVERSE_R, starOffset, type V2 } from '@/lib/cosmicScale'
import { starTints } from '@/lib/tokens'

/**
 * Procedural point clouds for Chapter 04. Deterministic (seeded), a few milliseconds each, no assets.
 *
 * Each field is in METRES relative to its own origin (`origin` says where in the frame), so float32 is plenty: the
 * scene adds the origin's pixel offset in float64-computed uniforms. Colours are linear 0…1 "display" values
 * (the scene writes them straight to the canvas) and already carry each layer's brightness.
 */
export interface Field {
  n: number
  origin: V2
  pos: Float32Array // x, y, 0 per point
  col: Float32Array // r, g, b per point
  size: Float32Array // CSS px
}

const KPC = 3.0856775814914e19

function rng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const gauss = () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next())
  return { next, gauss }
}

const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
]
export const rgb = hex
const COOL = hex(starTints.cool)
const NEUTRAL = hex(starTints.neutral)
const WARM = hex(starTints.warm)

function alloc(n: number, origin: V2): Field {
  return { n, origin, pos: new Float32Array(n * 3), col: new Float32Array(n * 3), size: new Float32Array(n) }
}
function put(f: Field, i: number, x: number, y: number, c: ArrayLike<number>, k: number, size: number) {
  f.pos[i * 3] = x
  f.pos[i * 3 + 1] = y
  f.col[i * 3] = c[0] * k
  f.col[i * 3 + 1] = c[1] * k
  f.col[i * 3 + 2] = c[2] * k
  f.size[i] = size
}

/** The Oort cloud: a faint shell of points between 2,000 and 100,000 AU, seen projected. */
export function oortField(n: number): Field {
  const f = alloc(n, SUN)
  const { next } = rng(1950)
  const lo = Math.log10(2000)
  const hi = Math.log10(1e5)
  for (let i = 0; i < n; i++) {
    const r = AU * Math.pow(10, lo + (hi - lo) * Math.pow(next(), 0.8))
    const z = next() * 2 - 1
    const th = next() * Math.PI * 2
    const k = Math.sqrt(1 - z * z)
    put(f, i, r * k * Math.cos(th), r * k * Math.sin(th), [0.72, 0.82, 1], 0.32 + 0.2 * next(), 1.2 + 0.7 * next())
  }
  return f
}

/** The Sun, the named stars within ~12 ly, and a scatter of faint neighbours (mostly red dwarfs). */
export function neighbourField(n: number): Field {
  const f = alloc(n, SUN)
  const { next } = rng(1609)
  put(f, 0, 0, 0, WARM, 1, 3.4)
  let i = 1
  for (const s of NEAR_STARS) {
    const o = starOffset(s)
    put(f, i++, o[0], o[1], s.color, 0.95, s.size)
  }
  while (i < n) {
    // Uniform in a ball of radius 20 ly, projected.
    let x = 0
    let y = 0
    let z = 0
    do {
      x = next() * 2 - 1
      y = next() * 2 - 1
      z = next() * 2 - 1
    } while (x * x + y * y + z * z > 1)
    const bright = next() < 0.12
    put(f, i++, x * 20 * LY, y * 20 * LY, bright ? NEUTRAL : [1, 0.72, 0.55], bright ? 0.7 : 0.4 + 0.2 * next(), bright ? 2.0 : 1.3 + 0.5 * next())
  }
  return f
}

/**
 * The Milky Way from above: a bar and bulge, four logarithmic spiral arms (pitch ≈ 12°) and an exponential disc,
 * about 100,000 ly across. Arm phase is chosen so the Sun (26,000 ly out, in the frame) sits between two arms, as it does.
 */
export function galaxyField(n: number): Field {
  const f = alloc(n, GALAXY)
  const { next, gauss } = rng(1929)
  const barA = (27 * Math.PI) / 180
  const cb = Math.cos(barA)
  const sb = Math.sin(barA)
  const b = Math.tan((12 * Math.PI) / 180)
  const rmax = GALAXY_R / KPC
  const hd = 3.0
  const norm = 1 - Math.exp(-rmax / hd)
  for (let i = 0; i < n; i++) {
    const u = next()
    if (u < 0.2) {
      // Bar: long and thin, warm.
      const bx = gauss() * 1.6 * KPC
      const by = gauss() * 0.55 * KPC
      put(f, i, bx * cb - by * sb, bx * sb + by * cb, WARM, 0.5, 1.3 + 0.8 * next())
    } else if (u < 0.28) {
      put(f, i, gauss() * 0.9 * KPC, gauss() * 0.9 * KPC, WARM, 0.45, 1.3 + 0.7 * next())
    } else {
      const r = Math.max(2.2, -hd * Math.log(1 - next() * norm))
      const arm = Math.floor(next() * 4)
      const inArm = next() < 0.68
      const th = inArm
        ? ((51 + 90 * arm) * Math.PI) / 180 + Math.log(r / 3.5) / b + gauss() * (0.17 + 0.012 * r)
        : next() * Math.PI * 2
      const x = r * KPC * Math.cos(th)
      const y = r * KPC * Math.sin(th)
      if (inArm) {
        const hot = next() < 0.04
        put(f, i, x, y, hot ? NEUTRAL : COOL, hot ? 0.95 : 0.38 + 0.2 * next(), hot ? 2.5 : 1.2 + 0.9 * next())
      } else {
        put(f, i, x, y, [0.95, 0.9, 0.84], 0.2 + 0.1 * next(), 1.2 + 0.5 * next())
      }
    }
  }
  return f
}

/** The Local Group beyond the Milky Way: the Magellanic Clouds, M33 as a point, and a scatter of dwarf galaxies. */
export function localGroupField(n: number): Field {
  const f = alloc(n, GALAXY)
  const { next } = rng(1925)
  const named: V2[] = [LMC, SMC, M33]
  const sizes = [3.2, 2.6, 3.4]
  named.forEach((p, i) => put(f, i, p[0] - GALAXY[0], p[1] - GALAXY[1], NEUTRAL, 0.8, sizes[i]))
  // Dwarfs: around the midpoint between the Milky Way and Andromeda (the Local Group is ~3 Mpc across).
  const mx = (M31[0] - GALAXY[0]) / 2
  const my = (M31[1] - GALAXY[1]) / 2
  for (let i = named.length; i < n; i++) {
    const r = 4e22 * Math.sqrt(next())
    const a = next() * Math.PI * 2
    put(f, i, mx + r * Math.cos(a), my + r * Math.sin(a), [0.85, 0.9, 1], 0.35 + 0.25 * next(), 1.3 + 0.7 * next())
  }
  return f
}

/**
 * The cosmic web, near field (~2 billion ly across): nodes joined to their three nearest neighbours by filaments,
 * with halos at the nodes and a thin uniform fog, so the voids between them read as empty.
 */
export function webField(n: number): Field {
  const f = alloc(n, GALAXY)
  const { next, gauss } = rng(1986)
  const R = 2.2e25
  const NODES = 72
  const nx: number[] = []
  const ny: number[] = []
  for (let i = 0; i < NODES; i++) {
    const r = R * Math.sqrt(next())
    const a = next() * Math.PI * 2
    nx.push(r * Math.cos(a))
    ny.push(r * Math.sin(a))
  }
  const edges: Array<[number, number]> = []
  const seen = new Set<number>()
  for (let i = 0; i < NODES; i++) {
    const near = nx
      .map((_, j) => j)
      .filter((j) => j !== i)
      .sort((p, q) => Math.hypot(nx[p] - nx[i], ny[p] - ny[i]) - Math.hypot(nx[q] - nx[i], ny[q] - ny[i]))
      .slice(0, 3)
    for (const j of near) {
      const key = Math.min(i, j) * NODES + Math.max(i, j)
      if (!seen.has(key)) {
        seen.add(key)
        edges.push([i, j])
      }
    }
  }
  const sigma = 0.012 * R
  for (let i = 0; i < n; i++) {
    const u = next()
    if (u < 0.55) {
      const [a, b] = edges[Math.floor(next() * edges.length)]
      const t = next()
      const dx = nx[b] - nx[a]
      const dy = ny[b] - ny[a]
      const len = Math.hypot(dx, dy) || 1
      const off = gauss() * sigma
      put(f, i, nx[a] + dx * t - (dy / len) * off, ny[a] + dy * t + (dx / len) * off, COOL, 0.3 + 0.2 * next(), 1.2 + 0.7 * next())
    } else if (u < 0.85) {
      const k = Math.floor(next() * NODES)
      put(f, i, nx[k] + gauss() * 0.02 * R, ny[k] + gauss() * 0.02 * R, WARM, 0.45 + 0.25 * next(), 1.3 + 0.9 * next())
    } else {
      const r = R * 1.05 * Math.sqrt(next())
      const a = next() * Math.PI * 2
      put(f, i, r * Math.cos(a), r * Math.sin(a), NEUTRAL, 0.12 + 0.08 * next(), 1.1 + 0.5 * next())
    }
  }
  return f
}

/** Beyond the web the universe is smooth: fine grain out to the horizon, reddening (higher redshift) toward the edge. */
export function grainField(n: number): Field {
  const f = alloc(n, GALAXY)
  const { next } = rng(1965)
  for (let i = 0; i < n; i++) {
    const t = Math.sqrt(next())
    const r = UNIVERSE_R * 0.99 * t
    const a = next() * Math.PI * 2
    const red = Math.pow(t, 3)
    put(f, i, r * Math.cos(a), r * Math.sin(a), [0.78 + 0.22 * red, 0.84 - 0.24 * red, 1 - 0.5 * red], 0.3 * (1 - 0.45 * red), 1.2 + 0.6 * next())
  }
  return f
}
