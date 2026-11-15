import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { cam, groups } from '@/engine/world'
import { getData } from '@/engine/assets'
import { rngSeed } from '@/lib/rng'
import { Overlay } from '../solar/overlay'
import { LY, MLY, SUN_G, eqDir, galDir, add3, sub3, mul3, norm3, cross3, smooth } from '../galactic/units'
import { M87_G } from '../galactic/M87'
import { spriteVert, spriteFrag } from '../galactic/shaders'
import { gx, makeProject, putSprite, spriteGeometry, spriteMaterial, syncSprite } from '../galactic/state'
import { LANIAKEA, WEB_R_GLY, GLY } from './model'
import { uni } from './state'
import type { V3 } from '@/engine/journey'

/**
 * 'uni-web' (origin = the Sun, local unit = 1 Gly): the cosmic web as a ball of 2 Gly across (a SIMULATED periodic box from
 * tools/texgen/gen/web3d.ts, loaded from the manifest as data 'cosmicweb3d'; brightness / colour from the stored density).
 * 'uni-lan' (origin = the Sun, local unit = 1 Mly): Laniakea, SCHEMATIC: galaxies = children of the web points inside the boundary sphere,
 * boundary = three dashed rings (supergalactic plane + two perpendicular), flows = streams ending at the Great Attractor. Labels are DOM.
 */
interface WebData { n: number; x: Float32Array; y: Float32Array; z: Float32Array; d: Float32Array }
let webCache: WebData | null = null
export function webData(): WebData {
  if (webCache) return webCache
  const dv = new DataView(getData('cosmicweb3d'))
  const n = dv.getUint32(4, true)
  const x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n), d = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const o = 8 + i * 8
    x[i] = (dv.getUint16(o, true) / 65535 - 0.5) * 2; y[i] = (dv.getUint16(o + 2, true) / 65535 - 0.5) * 2; z[i] = (dv.getUint16(o + 4, true) / 65535 - 0.5) * 2
    d[i] = dv.getUint8(o + 6) / 255
  }
  return (webCache = { n, x, y, z, d })
}
const ramp = (d: number): [number, number, number] => {
  const a: V3 = [0.32, 0.46, 0.95], b: V3 = [0.62, 0.78, 1.0], c: V3 = [1.0, 0.86, 0.62]
  const t = Math.min(1, Math.max(0, d))
  const u = t < 0.55 ? t / 0.55 : (t - 0.55) / 0.45
  const p = t < 0.55 ? a : b, q = t < 0.55 ? b : c
  return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u]
}

export function WebLayer() {
  const { size } = useThree()
  const res = useMemo(() => {
    const w = webData()
    const keep: number[] = []
    for (let i = 0; i < w.n; i++) if (Math.hypot(w.x[i], w.y[i], w.z[i]) < 1) keep.push(i)
    const sg = spriteGeometry(keep.length)
    keep.forEach((i, k) => {
      const r = Math.hypot(w.x[i], w.y[i], w.z[i]), edge = 1 - smooth(0.78, 1, r), d = w.d[i]
      putSprite(sg.a, k, [w.x[i], w.y[i], w.z[i]], ramp(d), 1.2 + 1.5 * d, 0, (0.16 + 0.62 * d) * edge)
    })
    return { g: sg.g, m: spriteMaterial(spriteVert, spriteFrag, { min: 1.1, max: 5 }) }
  }, [])
  useFrame(() => {
    const grp = groups.get('uni-web')
    if (!grp || !grp.visible) return
    const dG = grp.position.length() / (grp.scale.x || 1e-9) // camera distance from the Sun, Gly
    uni.webD = dG
    const tanH = Math.tan((cam.pose.fov * Math.PI) / 360)
    const pxR = ((1 / Math.max(dG, 1e-6)) * (size.height / 2)) / tanH
    const dim = Math.min(1, Math.max(0.02, Math.pow(pxR / 380, 1.5)))
    syncSprite(res.m, smooth(1.3, 2.3, dG) * (1 - smooth(6, 30, dG)), dim)
  })
  return <points geometry={res.g} material={res.m} frustumCulled={false} renderOrder={0} />
}

const SGP = galDir(LANIAKEA.sgpL, LANIAKEA.sgpB)
const circleBasis = (): [V3, V3, V3] => {
  const a = norm3(cross3(SGP, [0, 1, 0])), b = cross3(SGP, a)
  return [SGP, a, b]
}

export function LaniakeaLayer() {
  const { camera, size } = useThree()
  const ov = useRef<Overlay | null>(null)
  const geo = useMemo(() => {
    const L = LANIAKEA, R = (L.diameterMly / 2)
    const ga = mul3(eqDir(L.gaRa, L.gaDec), L.gaMly) // relative to the Sun, Mly
    const C = mul3(norm3(ga), 200) // Laniakea centre: near the Great Attractor, the Sun on the outskirts
    const r = rngSeed(2014)
    const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += r(); return (s - 2) * 1.7320508 }
    const w = webData()
    const pts: Array<{ p: V3; col: V3; px: number; a: number }> = []
    for (let i = 0; i < w.n; i++) {
      const p: V3 = [w.x[i] * 1000, w.y[i] * 1000, w.z[i] * 1000]
      const q = sub3(p, C)
      if (Math.hypot(q[0], q[1], q[2]) > R * 0.96) continue
      const kids = 4 + Math.round(w.d[i] * 6)
      for (let k = 0; k < kids; k++) {
        const s = 9 * (1.3 - w.d[i])
        pts.push({ p: [p[0] + gauss() * s, p[1] + gauss() * s, p[2] + gauss() * s], col: r() < 0.25 ? [0.78, 0.86, 1] : [1, 0.88, 0.66], px: 1.4 + 1.2 * r(), a: 0.55 + 0.4 * r() })
      }
    }
    // dashed boundary rings
    const [n0, e1, e2] = circleBasis()
    const rings: V3[][] = [[e1, e2], [n0, e1], [n0, e2]]
    for (const [u, v] of rings) for (let k = 0; k < 220; k++) {
      if (k % 3 === 2) continue
      const th = (k / 220) * 6.2831853
      const p = add3(C, add3(mul3(u, Math.cos(th) * R), mul3(v, Math.sin(th) * R)))
      pts.push({ p, col: [1, 0.62, 0.34], px: 2, a: 0.7 })
    }
    // flow streams toward the Great Attractor
    for (let s = 0; s < 40; s++) {
      const th = r() * 6.2831853, ph = Math.acos(2 * r() - 1), rr = R * (0.8 + 0.2 * r())
      const st0 = add3(C, [rr * Math.sin(ph) * Math.cos(th), rr * Math.sin(ph) * Math.sin(th), rr * Math.cos(ph)])
      for (let k = 0; k < 20; k++) {
        const f = (k + 1) / 22
        const bend = Math.sin(f * Math.PI) * 14
        const p = add3(add3(st0, mul3(sub3(ga, st0), f)), [bend * Math.sin(s), bend * Math.cos(s * 1.7), bend * Math.sin(s * 2.3)])
        pts.push({ p, col: [0.52, 0.76, 1], px: 1.6, a: 0.12 + 0.55 * f })
      }
    }
    const sg = spriteGeometry(pts.length)
    pts.forEach((q, i) => putSprite(sg.a, i, q.p, q.col, q.px, 0, q.a))
    return { g: sg.g, m: spriteMaterial(spriteVert, spriteFrag, { min: 1.2, max: 5 }), C, ga, R }
  }, [])
  useEffect(() => {
    const items = [
      { id: 'lan', text: 'Laniakea', color: '#ffb070', button: false },
      { id: 'ga', text: 'Great Attractor', color: '#9fc4ff', button: false },
      { id: 'virgo', text: 'Virgo Cluster', color: '#ffd9a0', button: false },
      { id: 'us', text: 'You are here · Milky Way', color: '#ffe3a8', button: false },
      { id: 'shapley', text: 'Shapley Concentration', color: '#9aa6bf', button: false },
      { id: 'pp', text: 'Perseus–Pisces', color: '#9aa6bf', button: false },
      { id: 'coma', text: 'Coma Cluster', color: '#9aa6bf', button: false },
    ]
    const o = new Overlay(items, 'universe-overlay'); ov.current = o
    return () => { o.dispose(); ov.current = null }
  }, [])
  const P = useMemo(() => ({ x: 0, y: 0 }), [])
  const hidden = useRef(false)
  useFrame(() => {
    const grp = groups.get('uni-lan')
    const o = ov.current
    if (!grp || !grp.visible) {
      if (o && !hidden.current) { for (const id of ['lan', 'ga', 'virgo', 'us', 'shapley', 'pp', 'coma']) o.place(id, 0, 0, 0, 0, 0, 0, false); hidden.current = true }
      return
    }
    hidden.current = false
    const dMly = grp.position.length() / (grp.scale.x || 1e-9)
    // lane: the galaxies of Laniakea are strongest while the whole supercluster is in view, then the web takes over
    syncSprite(geo.m, smooth(25, 120, dMly) * (1 - smooth(1800, 5000, dMly)), 1)
    if (!o) return
    camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
    const proj = makeProject(camera, size)
    const at = (v: V3): V3 => [SUN_G[0] + v[0] * MLY, SUN_G[1] + v[1] * MLY, SUN_G[2] + v[2] * MLY]
    const la = smooth(150, 400, dMly) * (1 - smooth(2200, 7000, dMly))
    const put = (id: string, p: V3, a: number, dx = 10, dy = -8) => { const on = proj(p[0], p[1], p[2], P); o.place(id, P.x, P.y, on ? a : 0, 0, dx, dy, false) }
    put('lan', at(add3(geo.C, mul3(SGP, geo.R))), la)
    put('ga', at(geo.ga), la * 0.9)
    put('us', SUN_G, smooth(60, 160, dMly) * (1 - smooth(2200, 6000, dMly)) * 0.95)
    const vA = smooth(150, 300, dMly) * (1 - smooth(500, 1200, dMly)) // complements the Virgo label of the galaxy layer (which fades out at 120-300 Mly)
    put('virgo', M87_G, vA * 0.9)
    const lab = (id: string, ra: number, dec: number, mly: number) => put(id, at(mul3(eqDir(ra, dec), mly)), la * 0.7)
    lab('shapley', LANIAKEA.shRa, LANIAKEA.shDec, LANIAKEA.shMly)
    lab('pp', LANIAKEA.ppRa, LANIAKEA.ppDec, LANIAKEA.ppMly)
    lab('coma', LANIAKEA.comaRa, LANIAKEA.comaDec, LANIAKEA.comaMly)
  })
  return <points geometry={geo.g} material={geo.m} frustumCulled={false} renderOrder={1} />
}
void LY; void GLY; void WEB_R_GLY; void gx
