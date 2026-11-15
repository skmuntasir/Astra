import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { cam } from '@/engine/world'
import { getTexture } from '@/engine/assets'
import { st } from '@/engine/store'
import { rngSeed } from '@/lib/rng'
import { Overlay } from '../solar/overlay'
import { buildMilkyWay, mwAnchors, KPC_LY } from './mwmodel'
import { R0_KPC, R0_LY } from './data'
import { LY, SUN_G, galToWorldLy, smooth } from './units'
import { quadVert, quadFrag, spriteVert, spriteFrag } from './shaders'
import { gx, makeProject, putSprite, spriteGeometry, spriteMaterial, syncSprite } from './state'

/**
 * THE MILKY WAY as an outside view: ONE object 'gx-mw' (origin = the Sun, local unit = 1 ly, axes = the app's world frame).
 *  - ~155k particles from milkyway.ts (SIMULATED: bar, two major + two minor arms, Orion Spur, warp, bulge, halo). Sprites are sized in
 *    light-years (so they merge into a glow from far away) with a pixel floor; total flux is conserved as the galaxy shrinks on screen.
 *  - "Artist's concept" underlay: the procedural top-down illustration (tools/texgen), laid in the galactic plane, aligned by its bar.
 *    It is an illustration, NOT data; the particles are the model. Both are labelled on screen.
 *  - Sun -> Galactic Centre line (R0 = 8,275 pc, GRAVITY 2021), "you are here", arm / bar / spur / warp labels.
 */
export const GC_G: [number, number, number] = (() => { const v = galToWorldLy(R0_LY, 0, 0); return [SUN_G[0] + v[0] * LY, SUN_G[1] + v[1] * LY, SUN_G[2] + v[2] * LY] })()
export const MW_RADIUS_LY = 50000
const LEVELS = [1, 0.7, 0.5, 0.35] // share of the particles drawn at each guard level

export function MilkyWayLayer() {
  const { camera, size } = useThree()
  const ov = useRef<Overlay | null>(null)
  const quad = useRef<THREE.Mesh>(null)
  const anchors = useMemo(() => {
    const a = mwAnchors()
    const w = (v: [number, number, number]) => { const q = galToWorldLy(v[0], v[1], v[2]); return [SUN_G[0] + q[0] * LY, SUN_G[1] + q[1] * LY, SUN_G[2] + q[2] * LY] as [number, number, number] }
    return { centre: w(a.centre), bar: w(a.bar), sct: w(a.sct), sgr: w(a.sgr), per: w(a.per), outer: w(a.outer), spur: w(a.spur), warp: w(a.warp), sun: w(a.sun) }
  }, [])
  const res = useMemo(() => {
    const t = st().settings.tier
    const m = buildMilkyWay(t === 'low' ? 0.4 : t === 'medium' ? 0.7 : 1)
    const sg = spriteGeometry(m.n)
    // random order: drawing only the first part of the list is then a fair thinning of the whole galaxy (used by the frame-time guard below)
    const order = Array.from({ length: m.n }, (_, i) => i)
    const rr = rngSeed(777)
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t }
    for (let k = 0; k < m.n; k++) {
      const i = order[k]
      const w = galToWorldLy(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2])
      putSprite(sg.a, k, w, [m.col[i * 3], m.col[i * 3 + 1], m.col[i * 3 + 2]], m.px[i], m.size[i], m.alpha[i])
    }
    const mat = spriteMaterial(spriteVert, spriteFrag, { min: 1.4, max: 64 })
    // MW as a dot when it is tiny (Local Group zone)
    const dot = spriteGeometry(1); putSprite(dot.a, 0, galToWorldLy(R0_LY, 0, 0), [1.0, 0.92, 0.78], 9, 0, 1)
    const dotM = spriteMaterial(spriteVert, spriteFrag, { min: 3, max: 14 })
    // Sun -> centre line
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, ...galToWorldLy(R0_LY, 0, 0)]), 3))
    const lm = new THREE.LineBasicMaterial({ color: '#8fb4ff', transparent: true, opacity: 0, depthWrite: false })
    // artist's concept underlay, aligned by the bar (see mwmodel.ts / gen/galaxies.ts): image x -> +y(l=90), image y -> toward the Sun
    const ex = galToWorldLy(0, 1, 0), ey = galToWorldLy(-1, 0, 0), ez = galToWorldLy(0, 0, 1), c = galToWorldLy(R0_LY, 0, 0)
    const hw = 17 * KPC_LY
    const M = new THREE.Matrix4().makeBasis(new THREE.Vector3(...ex).multiplyScalar(hw), new THREE.Vector3(...ey).multiplyScalar(hw), new THREE.Vector3(...ez).multiplyScalar(hw)).setPosition(c[0], c[1], c[2])
    const qm = new THREE.ShaderMaterial({ vertexShader: quadVert, fragmentShader: quadFrag, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uTex: { value: getTexture('galaxy-milkyway-topdown') }, uOpacity: { value: 0 }, uGain: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) } } })
    return { sg, mat, dot, dotM, lg, lm, M, qm, n: m.n }
  }, [])
  // frame-time guard: if the galaxy makes frames slow for a sustained stretch it draws fewer particles (brightness compensated), and climbs back when frames are fast again
  const guard = useRef({ sum: 0, n: 0, li: 0, stable: 0, blockedUntil: 0, penalty: 0 })
  useLayoutEffect(() => { const q = quad.current; if (q) { q.matrixAutoUpdate = false; q.matrix.copy(res.M); q.matrixWorldNeedsUpdate = true } }, [res])
  useEffect(() => { res.lg.computeBoundingSphere() }, [res])

  useEffect(() => {
    const items = [
      { id: 'here', text: '◉ You are here', color: '#8fb4ff', button: false },
      { id: 'gc', text: 'Galactic Centre · Sgr A*', color: '#ffe6bd', button: false },
      { id: 'bar', text: 'Bar', color: '#ffe6bd', button: false },
      { id: 'sct', text: 'Scutum–Centaurus Arm', color: '#d6e2ff', button: false },
      { id: 'sgr', text: 'Sagittarius Arm', color: '#d6e2ff', button: false },
      { id: 'per', text: 'Perseus Arm', color: '#d6e2ff', button: false },
      { id: 'outer', text: 'Outer Arm', color: '#d6e2ff', button: false },
      { id: 'spur', text: 'Orion Spur', color: '#d6e2ff', button: false },
      { id: 'warp', text: 'Warp', color: '#d6e2ff', button: false },
    ]
    const o = new Overlay(items, 'mw-overlay')
    ov.current = o
    return () => { o.dispose(); ov.current = null }
  }, [])

  const P = useMemo(() => ({ x: 0, y: 0 }), [])
  useFrame((_, dt) => {
    const dSun = gx.sunLy
    const dGC = Math.hypot(cam.pos[0] - GC_G[0], cam.pos[1] - GC_G[1], cam.pos[2] - GC_G[2]) / LY
    const tanH = Math.tan((cam.pose.fov * Math.PI) / 360)
    const pxR = (MW_RADIUS_LY / Math.max(dGC, 1)) * (size.height / 2) / tanH
    const inA = smooth(400, 4000, dSun)
    const dim = Math.min(1, Math.max(0.0015, Math.pow(pxR / 160, 2)))
    const g = guard.current
    if (inA > 0.15 && pxR > 40 && st().phase === 'ready' && !document.hidden) {
      if (dt > 0 && dt < 0.25) {
        g.sum += dt * 1000; g.n++
        if (g.n >= 45) {
          const mean = g.sum / g.n, now = performance.now()
          g.sum = 0; g.n = 0
          if (mean > 23 && g.li < LEVELS.length - 1) { g.li++; g.stable = 0; g.penalty = Math.min(240000, g.penalty ? g.penalty * 2 : 20000); g.blockedUntil = now + g.penalty }
          else if (mean <= 18.5 && g.li > 0) { if (++g.stable >= 6 && now > g.blockedUntil) { g.li--; g.stable = 0 } }
          else g.stable = 0
          res.sg.g.setDrawRange(0, Math.round(res.n * LEVELS[g.li]))
        }
      }
    } else { g.sum = 0; g.n = 0 }
    res.mat.uniforms.uMax.value = Math.min(64, 72 / Math.sqrt(Math.max(1, gx.dpr))) // the biggest sprites cost the most fill-rate on dense screens
    syncSprite(res.mat, inA, dim / LEVELS[g.li])
    syncSprite(res.dotM, inA * (1 - smooth(25, 110, pxR)), 1)
    res.lm.opacity = smooth(8000, 30000, dSun) * (1 - smooth(300000, 900000, dSun)) * 0.5
    res.qm.uniforms.uOpacity.value = 0.42 * smooth(15000, 60000, dSun) * (1 - smooth(500000, 1500000, dSun)) * Math.min(1, dim * 1.2)
    const o = ov.current
    if (!o) return
    camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
    const proj = makeProject(camera, size)
    const whole = smooth(70, 200, pxR) * (1 - smooth(1200, 2600, pxR)) * inA
    const near = smooth(1500, 6000, dSun) * (1 - smooth(70000, 160000, dSun))
    const place = (id: string, v: [number, number, number], a: number, dx = 10, dy = -8) => { const on = proj(v[0], v[1], v[2], P); o.place(id, P.x, P.y, on ? a : 0, 0, dx, dy, false) }
    place('here', anchors.sun, near * 0.95, 14, -12)
    place('gc', anchors.centre, whole * 0.9, 12, 12)
    place('bar', anchors.bar, whole * 0.75, 12, 0)
    place('sct', anchors.sct, whole * 0.75, -10, 0)
    place('sgr', anchors.sgr, whole * 0.7)
    place('per', anchors.per, whole * 0.75)
    place('outer', anchors.outer, whole * 0.7)
    place('spur', anchors.spur, near * 0.85, 12, 10)
    place('warp', anchors.warp, whole * 0.7)
    const mid: [number, number, number] = [(anchors.sun[0] + anchors.centre[0]) / 2, (anchors.sun[1] + anchors.centre[1]) / 2, (anchors.sun[2] + anchors.centre[2]) / 2]
    place('dist', mid, res.lm.opacity * 1.7, 0, 14)
    const aa = res.qm.uniforms.uOpacity.value > 0.03 ? res.qm.uniforms.uOpacity.value * 2 : 0
    place('art', [anchors.centre[0], anchors.centre[1], anchors.centre[2]], size.width < 640 ? 0 : aa, 0, 70) // phones: no disclaimer caption over the picture
  })

  return (
    <group>
      <mesh ref={quad} material={res.qm} frustumCulled={false} renderOrder={-3}><planeGeometry args={[2, 2]} /></mesh>
      <points geometry={res.sg.g} material={res.mat} frustumCulled={false} renderOrder={0} />
      <points geometry={res.dot.g} material={res.dotM} frustumCulled={false} renderOrder={2} />
      <lineSegments geometry={res.lg} material={res.lm} frustumCulled={false} renderOrder={1} />
    </group>
  )
}
