import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { cam, groups } from '@/engine/world'
import { getObject } from '@/engine/journey'
import { focus } from '@/engine/api'
import { st } from '@/engine/store'
import { rngSeed } from '@/lib/rng'
import { Overlay } from '../solar/overlay'
import { HitSphere, skyBasis } from '../galactic/Galaxy'
import { GC_G } from '../galactic/MilkyWay'
import { LY, eqDir, smooth, mul3 } from '../galactic/units'
import { spriteVert, spriteFrag } from '../galactic/shaders'
import { gx, makeProject, putSprite, spriteGeometry, spriteMaterial, syncSprite } from '../galactic/state'
import { CRAB, ORION, PULSAR_SHOWN_S, SGRA, nebulaPos } from './data'
import { bakeStep, nebulaMaterial } from './nebulaShaders'
import { ringMaterial } from './ringShader'
import type { V3 } from '@/engine/journey'

const tier = () => st().settings.tier
const sc = () => (tier() === 'low' ? 0.4 : tier() === 'medium' ? 0.7 : 1)
/** The nebulae are rendered ONCE into a texture (see NebulaBake): `size` = texture side in px, `strips` = frames the bake is spread over, `slices` = depth layers of the bake. */
const bakeOpts = (crab: boolean) => ({ size: tier() === 'low' ? 1024 : tier() === 'medium' ? 1536 : 2048, strips: tier() === 'high' ? 64 : 48, slices: crab ? 16 : 14 })

/** cheap smooth pseudo-noise (sum of sines): domain warping for gas filaments. No texture, no allocation. */
const wob = (x: number, y: number, z: number) => Math.sin(x * 3.1 + Math.sin(y * 2.3 + z)) * Math.cos(y * 2.7 + Math.sin(z * 1.9 + x)) * Math.sin(z * 3.3 + x * 0.7 + y)

/** Basis that turns local coordinates into "as seen from the Sun": x = sky right (west), y = celestial north, z = toward the viewer (the Sun). */
function seenFromSun(raDeg: number, decDeg: number) {
  const d = eqDir(raDeg, decDeg)
  const b = skyBasis(d)
  const M = new THREE.Matrix4().makeBasis(new THREE.Vector3(...b.r), new THREE.Vector3(...b.u), new THREE.Vector3(-d[0], -d[1], -d[2]))
  return { M, toSun: [-d[0], -d[1], -d[2]] as V }
}
type V = [number, number, number]

function useBasis(raDeg: number, decDeg: number) {
  const ref = useRef<THREE.Group>(null)
  const b = useMemo(() => seenFromSun(raDeg, decDeg), [raDeg, decDeg])
  useLayoutEffect(() => { const g = ref.current; if (g) { g.matrixAutoUpdate = false; g.matrix.copy(b.M); g.matrixWorldNeedsUpdate = true } }, [b])
  return { ref, M: b.M }
}

/** Points the nebula quad's slab along the view (in the nebula's own frame) and sets its fade + detail from the on-screen size. */
const _v = new THREE.Vector3(), _mt = new THREE.Matrix4()
function aim(mat: THREE.ShaderMaterial, grp: THREE.Group, M: THREE.Matrix4, opacity: number) {
  mat.visible = opacity > 0.004 // invisible = not drawn at all (the quad used to run its full shader even at zero opacity)
  if (!mat.visible) return
  _v.copy(grp.position).normalize() // camera sits at the render origin: this is the view direction in render axes
  _mt.extractRotation(M).transpose()
  mat.uniforms.uFwd.value.copy(_v.applyMatrix4(_mt))
  mat.uniforms.uOpacity.value = opacity
}

/** gain 0..1 and the pixel radius of an object's local unit sphere (shared by the three bodies) */
function measure(id: string, size: { height: number }) {
  const grp = groups.get(id)
  if (!grp || !grp.visible) return null
  const dist = grp.position.length() || 1e-9
  const tanH = Math.tan((cam.pose.fov * Math.PI) / 360)
  const pxR = ((grp.scale.x / dist) * (size.height / 2)) / tanH
  return { grp, dist, pxR, dC: dist / (grp.scale.x || 1e-9) }
}

/** Orion Nebula: PROCEDURAL gas (particles with domain-warped filaments), the Trapezium as bright points, dark dust lanes as dark sprites. Not a Hubble/Webb photograph. */
export function OrionBody() {
  const { size, gl } = useThree()
  const { ref: basis, M: basisM } = useBasis(ORION.raDeg, ORION.decDeg)
  const res = useMemo(() => {
    const r = rngSeed(4242), k = sc()
    const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += r(); return (s - 2) * 1.7320508 }
    const nStar = Math.round(260 * k)
    // stars: the Trapezium (four bright blue-white points) + the rest of the young cluster + a sparse foreground
    const stars = spriteGeometry(nStar + 4)
    const T: V[] = [[0.0, 0.0, 0.0], [0.045, -0.02, 0.01], [-0.035, -0.045, -0.01], [-0.05, 0.03, 0.02]]
    T.forEach((p, i) => putSprite(stars.a, i, p, [0.78, 0.88, 1], i === 0 ? 18 : 13, 0, 1))
    for (let i = 0; i < nStar; i++) {
      const R = Math.pow(r(), 1.6) * 0.5 + 0.02, c = 2 * r() - 1, ph = r() * 6.2831853, q = Math.sqrt(1 - c * c)
      const warm = r() < 0.25
      putSprite(stars.a, i + 4, [R * q * Math.cos(ph), R * q * Math.sin(ph), R * c], warm ? [1, 0.82, 0.62] : [0.7, 0.82, 1], 2.0 + 2.5 * r() * r(), 0, 0.35 + 0.5 * r())
    }
    const sm = spriteMaterial(spriteVert, spriteFrag, { min: 1.4, max: 18 })
    const neb = nebulaMaterial('orion', bakeOpts(false))
    const dot = spriteGeometry(1); putSprite(dot.a, 0, [0, 0, 0], [1, 0.62, 0.78], 9, 0, 1)
    return { stars: stars.g, sm, neb, dot: dot.g, dm: spriteMaterial(spriteVert, spriteFrag, { min: 4, max: 12 }), born: -1 }
  }, [])
  useEffect(() => { res.neb.bake.prepare(gl) }, [res, gl])
  useFrame(() => {
    const m = measure(ORION.id, size)
    if (!m) return
    if (!res.neb.bake.done && gx.sunLy > 150) bakeStep(res.neb.bake, gl) // one strip per frame: no hitch (a few frames before it fades in)
    const gate = smooth(300, 1200, gx.sunLy)
    // the glow starts as soon as it is a speck (it used to wait for ~3 px, so it seemed to switch on mid-flight) and always fades in:
    // a slow machine can finish the bake while the camera is already close, and the picture must never pop
    const body = smooth(0.8, 6, m.pxR) * smooth(0.25, 1.2, m.dC)
    const now = performance.now()
    if (res.neb.bake.done && res.born < 0) res.born = now
    const ready = res.neb.bake.done ? smooth(0, 900, now - res.born) : 0
    aim(res.neb.m, m.grp, basisM, body * gate * ready)
    syncSprite(res.sm, body * gate, Math.min(1, Math.max(0.12, m.pxR / 60)))
    syncSprite(res.dm, (1 - smooth(5, 24, m.pxR)) * gate, 1)
  })
  return (
    <group>
      <group ref={basis}>
        <mesh geometry={res.neb.geometry} material={res.neb.m} frustumCulled={false} renderOrder={0} />
        <points geometry={res.stars} material={res.sm} frustumCulled={false} renderOrder={2} />
      </group>
      <points geometry={res.dot} material={res.dm} frustumCulled={false} renderOrder={3} />
      <HitSphere id={ORION.id} radiusM={ORION.radiusLy * LY} />
    </group>
  )
}

/**
 * Crab Nebula + Crab Pulsar (ONE object, one pulsar): PROCEDURAL. Red-orange filaments (strands on a prolate shell, wavy, radially warped), a soft blue
 * synchrotron glow inside, a torus-and-jet hint near the centre, and the pulsar: a small bright core with two sweeping lighthouse beams. The real spin
 * is ~33.8 ms (30 turns a second): it would be a blur, so it is drawn PULSAR_SLOWDOWN times slower. Beam geometry and brightness are schematic.
 */
export function CrabBody() {
  const { size, gl } = useThree()
  const { ref: basis, M: basisM } = useBasis(CRAB.raDeg, CRAB.decDeg)
  const spin = useRef<THREE.Group>(null)
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), m: new THREE.Matrix4() }), [])
  const res = useMemo(() => {
    const r = rngSeed(1054), k = sc()
    const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += r(); return (s - 2) * 1.7320508 }
    const tilt = 0.55, ct = Math.cos(tilt), st2 = Math.sin(tilt)
    const neb = nebulaMaterial('crab', { ...bakeOpts(true), tilt })
    // the wind: a bright torus (ring) around the pulsar and a jet along the spin axis
    const wind = spriteGeometry(260)
    for (let i = 0; i < 160; i++) { const t = (i / 160) * 6.2831853; putSprite(wind.a, i, [Math.cos(t) * 0.17, Math.sin(t) * 0.05 + gauss() * 0.008, Math.sin(t) * 0.17], [0.7, 0.82, 1], 0, 0.02, 0.45) }
    for (let i = 0; i < 100; i++) { const t = (i % 50) / 50, sgn = i < 50 ? 1 : -1; putSprite(wind.a, 160 + i, [gauss() * 0.01 * t, sgn * (0.06 + t * 0.42), gauss() * 0.01 * t], [0.62, 0.78, 1], 0, 0.015 + 0.02 * t, 0.5 * (1 - 0.6 * t)) }
    // the beams (two opposite lighthouse beams, perpendicular to the spin axis), built along +x and -x
    const bn = 34
    const beams = spriteGeometry(bn * 2)
    for (let b = 0; b < 2; b++) for (let i = 0; i < bn; i++) { const t = i / (bn - 1); putSprite(beams.a, b * bn + i, [(b ? -1 : 1) * (0.02 + t * 0.4), 0, 0], [0.8, 0.9, 1], 0, 0.012 + 0.05 * t, 0.9 * (1 - 0.85 * t)) }
    const core = spriteGeometry(2)
    putSprite(core.a, 0, [0, 0, 0], [0.85, 0.93, 1], 14, 0, 1)
    putSprite(core.a, 1, [0, 0, 0], [0.55, 0.7, 1], 0, 0.1, 0.22)
    const dot = spriteGeometry(1); putSprite(dot.a, 0, [0, 0, 0], [1, 0.6, 0.4], 9, 0, 1)
    return {
      neb, wind: wind.g, beams: beams.g, core: core.g, dot: dot.g,
      wm: spriteMaterial(spriteVert, spriteFrag, { min: 1.3, max: 30 }), beamM: spriteMaterial(spriteVert, spriteFrag, { min: 1.5, max: 40 }),
      coreM: spriteMaterial(spriteVert, spriteFrag, { min: 6, max: 26 }), dm: spriteMaterial(spriteVert, spriteFrag, { min: 4, max: 12 }), tilt,
    }
  }, [])
  useEffect(() => { res.neb.bake.prepare(gl) }, [res, gl])
  useFrame(() => {
    const m = measure(CRAB.id, size)
    if (!m) return
    if (!res.neb.bake.done && gx.sunLy > 600) bakeStep(res.neb.bake, gl)
    const gate = smooth(1200, 6000, gx.sunLy)
    const body = smooth(2.5, 10, m.pxR) * smooth(0.25, 1.2, m.dC)
    aim(res.neb.m, m.grp, basisM, res.neb.bake.done ? body * gate : 0)
    syncSprite(res.wm, body * gate * smooth(18, 80, m.pxR), 1)
    // the lighthouse: angle from the page clock, slowed; frozen under reduced motion
    const still = st().motion === 'reduced'
    const g = spin.current
    let flash = 0
    if (g) {
      const ang = still ? 0.9 : (performance.now() / 1000) * (6.2831853 / PULSAR_SHOWN_S)
      g.rotation.y = ang
      // pulse = a beam sweeping across our line of sight (local x axis rotated about the tilted axis)
      const ct = Math.cos(res.tilt), st2 = Math.sin(res.tilt)
      const bx = Math.cos(ang), bz = -Math.sin(ang) // beam direction in the spin frame (before tilt)
      const wx = bx * ct, wy = bx * st2, wz = bz // tilt about z
      // the nebula's local axes = the sky basis: express the direction to the camera in them (a rotation, so its inverse is its transpose)
      const toCam = tmp.v.copy(m.grp.position).normalize().multiplyScalar(-1)
      toCam.applyMatrix4(tmp.m.extractRotation(g.parent!.matrix).transpose())
      const d = Math.abs(wx * toCam.x + wy * toCam.y + wz * toCam.z)
      flash = Math.pow(d, 24)
    }
    syncSprite(res.beamM, body * gate * 0.9, Math.min(1, Math.max(0.1, m.pxR / 50)))
    syncSprite(res.coreM, body * gate * (0.75 + 0.25 * flash), 1)
    syncSprite(res.dm, (1 - smooth(5, 24, m.pxR)) * gate, 1)
  })
  return (
    <group>
      <group ref={basis}>
        <mesh geometry={res.neb.geometry} material={res.neb.m} frustumCulled={false} renderOrder={0} />
        <points geometry={res.wind} material={res.wm} frustumCulled={false} renderOrder={2} />
        <group rotation={[0, 0, res.tilt]}>
          <group ref={spin}><points geometry={res.beams} material={res.beamM} frustumCulled={false} renderOrder={3} /></group>
        </group>
        <points geometry={res.core} material={res.coreM} frustumCulled={false} renderOrder={4} />
      </group>
      <points geometry={res.dot} material={res.dm} frustumCulled={false} renderOrder={3} />
      <HitSphere id={CRAB.id} radiusM={CRAB.radiusLy * LY} />
    </group>
  )
}

/** S-stars around Sagittarius A*: 20 stars on Kepler ellipses (S2: a ~ 1,000 AU, e = 0.88, 16.05 yr), schematic positions; time runs fast and the panel says how fast. */
export const SGRA_RADIUS_LY = 0.02
/** The black hole's ring is drawn ~1,200x larger than true scale next to the S-star orbits (the real 52 microarcsecond ring is ~0.2 AU across radius vs the 1,265 AU object radius). */
const RING_R = 0.2, RING_SPAN = 2.6
export const SGRA_YEAR_S = 1.5 // one real year is shown as 1.5 s
export function SgrABody() {
  const { size } = useThree()
  const res = useMemo(() => {
    const r = rngSeed(2022), k = sc()
    const n = 20
    const stars = Array.from({ length: n }, (_, i) => {
      const s2 = i === 0
      const a = s2 ? 0.79 : 0.35 + 1.0 * r() // in units of the object radius (0.02 ly = 1,260 AU); S2 a = 1,000 AU ~ 0.79
      const e = s2 ? 0.88 : 0.2 + 0.7 * r()
      const P = s2 ? 16.05 : 16.05 * Math.pow(a / 0.79, 1.5) // Kepler: P ~ a^1.5 (same central mass)
      // random orientation
      const inc = Math.acos(2 * r() - 1), node = r() * 6.2831853, om = r() * 6.2831853, M0 = r() * 6.2831853
      return { a, e, P, inc, node, om, M0 }
    })
    const sg = spriteGeometry(n)
    const bg = spriteGeometry(Math.round(500 * k))
    for (let i = 0; i < Math.round(500 * k); i++) { const R = Math.pow(r(), 0.6) * 2.4, c = 2 * r() - 1, ph = r() * 6.2831853, q = Math.sqrt(1 - c * c); putSprite(bg.a, i, [R * q * Math.cos(ph), R * q * Math.sin(ph), R * c], [1.0, 0.86, 0.66], 1.6, 0, 0.3 + 0.3 * r()) }
    const core = spriteGeometry(2)
    putSprite(core.a, 0, [0, 0, 0], [1, 0.86, 0.6], 8, 0, 1)
    putSprite(core.a, 1, [0, 0, 0], [1, 0.7, 0.4], 0, 0.22, 0.25)
    const dot = spriteGeometry(1); putSprite(dot.a, 0, [0, 0, 0], [1, 0.88, 0.62], 11, 0, 1)
    const ring = ringMaterial(RING_R, RING_SPAN)
    // S2 orbit path
    const o = stars[0], pts = new Float32Array(129 * 3)
    for (let i = 0; i <= 128; i++) { const p = kepler(o, (i / 128) * 6.2831853, true); pts.set(p, i * 3) }
    const og = new THREE.BufferGeometry(); og.setAttribute('position', new THREE.BufferAttribute(pts, 3))
    const om = new THREE.LineBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0, depthWrite: false, depthTest: false })
    const orbit = new THREE.LineLoop(og, om); orbit.frustumCulled = false; orbit.renderOrder = 2
    return { ring, stars, sg, bg: bg.g, core: core.g, dot: dot.g, om, orbit, sm: spriteMaterial(spriteVert, spriteFrag, { min: 3, max: 9 }), bm: spriteMaterial(spriteVert, spriteFrag, { min: 1.2, max: 3 }), cm: spriteMaterial(spriteVert, spriteFrag, { min: 6, max: 60 }), dm: spriteMaterial(spriteVert, spriteFrag, { min: 5, max: 14 }) }
  }, [])
  useFrame(() => {
    const m = measure(SGRA.id, size)
    if (!m) return
    const gate = smooth(8000, 26000, gx.sunLy) // the marker only matters once the galactic centre is a destination
    const body = smooth(2.5, 14, m.pxR) * smooth(0.25, 1.2, m.dC)
    const still = st().motion === 'reduced'
    const yrs = still ? 0.3 : (performance.now() / 1000) / SGRA_YEAR_S
    const pos = res.sg.a.position
    res.stars.forEach((s, i) => { const M = s.M0 + (6.2831853 * yrs) / s.P; const p = kepler(s, M, false); pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; res.sg.a.aA[i] = 0.9; res.sg.a.aCol[i * 3] = i === 0 ? 1 : 0.62; res.sg.a.aCol[i * 3 + 1] = i === 0 ? 0.95 : 0.8; res.sg.a.aCol[i * 3 + 2] = i === 0 ? 0.7 : 1; res.sg.a.aPx[i] = i === 0 ? 5 : 3 })
    ;(res.sg.g.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(res.sg.g.attributes.aCol as THREE.BufferAttribute).needsUpdate = true
    ;(res.sg.g.attributes.aPx as THREE.BufferAttribute).needsUpdate = true
    syncSprite(res.sm, body * gate, 1)
    syncSprite(res.bm, body * gate, Math.min(1, Math.max(0.05, m.pxR / 50)))
    // the EHT-style ring takes over from the plain glow once it is big enough to read
    const ringA = smooth(1.5, 7, RING_R * m.pxR) * gate
    const rm = res.ring.m
    rm.visible = ringA > 0.004
    if (rm.visible) { rm.uniforms.uA.value = ringA; rm.uniforms.uTime.value = still ? 1.7 : performance.now() / 1000 }
    syncSprite(res.cm, body * gate * (1 - ringA), 1)
    res.om.opacity = body * gate * 0.35 * smooth(30, 120, m.pxR)
    syncSprite(res.dm, (1 - smooth(5, 24, m.pxR)) * gate, 1)
  })
  return (
    <group>
      <points geometry={res.bg} material={res.bm} frustumCulled={false} renderOrder={0} />
      <mesh geometry={res.ring.geometry} material={res.ring.m} frustumCulled={false} renderOrder={1} />
      <primitive object={res.orbit} />
      <points geometry={res.sg.g} material={res.sm} frustumCulled={false} renderOrder={3} />
      <points geometry={res.core} material={res.cm} frustumCulled={false} renderOrder={4} />
      <points geometry={res.dot} material={res.dm} frustumCulled={false} renderOrder={3} />
      <HitSphere id={SGRA.id} radiusM={SGRA_RADIUS_LY * LY} />
    </group>
  )
}
/** Position on a Kepler ellipse (a, e), orientation (inc, node, om), mean anomaly M. `eccAnomaly` = true: the argument is the eccentric anomaly directly (for drawing the path). */
function kepler(o: { a: number; e: number; inc: number; node: number; om: number }, M: number, eccAnomaly: boolean): V {
  let E = M
  if (!eccAnomaly) { for (let i = 0; i < 8; i++) E = E - (E - o.e * Math.sin(E) - M) / (1 - o.e * Math.cos(E)) }
  const x = o.a * (Math.cos(E) - o.e), y = o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E)
  const co = Math.cos(o.om), so = Math.sin(o.om)
  const x1 = x * co - y * so, y1 = x * so + y * co
  const ci = Math.cos(o.inc), si = Math.sin(o.inc), cn = Math.cos(o.node), sn = Math.sin(o.node)
  const y2 = y1 * ci, z2 = y1 * si
  return [x1 * cn - y2 * sn, x1 * sn + y2 * cn, z2]
}

/** Labels (DOM buttons -> focus) for the three objects, and nothing else: 'cn-fx' (origin = the Sun). */
export function ContentLabels() {
  const { camera, size } = useThree()
  const ov = useRef<Overlay | null>(null)
  const pts = useMemo(() => {
    const o: Record<string, V3> = { [ORION.id]: nebulaPos(ORION), [CRAB.id]: nebulaPos(CRAB), [SGRA.id]: [...GC_G] as V3 }
    return o
  }, [])
  useEffect(() => {
    const items = [
      { id: ORION.id, text: 'Orion Nebula', color: '#ff9ec0', button: true, onClick: () => { void focus(ORION.id) } },
      { id: CRAB.id, text: 'Crab Nebula', color: '#ffa070', button: true, onClick: () => { void focus(CRAB.id) } },
      { id: SGRA.id, text: 'Sagittarius A*', color: '#ffe0a8', button: true, onClick: () => { void focus(SGRA.id) } },
    ]
    const o = new Overlay(items, 'content-overlay')
    ov.current = o
    return () => { o.dispose(); ov.current = null }
  }, [])
  const P = useMemo(() => ({ x: 0, y: 0 }), [])
  useFrame(() => {
    const o = ov.current
    if (!o) return
    const live = !!getObject('cn-fx') && !!groups.get('cn-fx')?.visible
    const d = gx.sunLy
    const aNeb = live ? smooth(300, 1200, d) * (1 - smooth(90000, 280000, d)) : 0
    const aGC = live ? smooth(6000, 22000, d) * (1 - smooth(240000, 700000, d)) : 0
    if (aNeb + aGC < 0.01) { o.hideAll(); return }
    camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
    const proj = makeProject(camera, size)
    const put = (id: string, a: number, dx: number, dy: number) => { const p = pts[id]; const on = proj(p[0], p[1], p[2], P); o.place(id, P.x, P.y, on ? a * 0.95 : 0, on ? Math.min(0.9, a) : 0, dx, dy, false) }
    put(ORION.id, aNeb, 12, 14)
    put(CRAB.id, aNeb, 12, -12)
    put(SGRA.id, aGC, 12, 36)
    o.place('cn-honest', size.width / 2, size.height - 112, (st().focusPhase === 'idle' ? 1 : 0) * aNeb * 0.6 * smooth(900, 3000, d) * (1 - smooth(15000, 40000, d)), 0, 0, 0, false)
  })
  void mul3
  return null
}
