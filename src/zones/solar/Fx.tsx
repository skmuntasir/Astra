import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { focus } from '@/engine/api'
import { cam } from '@/engine/world'
import { st } from '@/engine/store'
import { getObject } from '@/engine/journey'
import { focusState } from '@/engine/api'
import { kepler, orbitPoint, DEG, type Orbit } from '@/lib/ephemeris'
import { colors, solarTints } from '@/lib/tokens'
import { BODIES } from './bodies'
import { HELIOPAUSE_U, R_EARTH_AU0, SIM_DAYS, SUN_POS, U, compress, meanMotion, orbitLine, placeVec } from './layout'
import { Overlay } from './overlay'
import { solar, smooth as sm, stepSolar, pxRadius, distTo } from './state'
import { pointsVert, pointsFrag, haloVert, haloFrag, shellVert, shellFrag } from './shaders'
import { R_SUN } from '../common'
import { hintPos, HINT_PLANET } from '@/hud/hint'

/**
 * Everything in the zone that is not a planet, in ONE registered object ("ss-fx") whose origin is the Sun and whose unit is U (the
 * compressed Earth-Sun distance): faint orbit lines, the asteroid belt and Kuiper belt (GPU point sprites, one draw each), a
 * schematic heliopause, the Sun's overview halo, the invisible click targets, the labels, and the per-frame simulation step.
 *
 * HONESTY: the belts are SIMULATED populations (random orbital elements drawn from the published shape of each belt, see below), a
 * few thousand points standing for millions of bodies; they are not a catalogue. Distances are compressed (layout.ts).
 */
const HIT_PX = 24
const N_AST = 16000, N_KUI = 14000

function rng(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const ray = (u: number) => Math.sqrt(-2 * Math.log(1 - Math.min(u, 0.999999)))

/** Main belt: a from a bell centred on 2.7 AU (2.05-3.35) minus the Kirkwood gaps; e ~ Rayleigh (mean ~0.1); i ~ Rayleigh (sigma 6 deg). */
function asteroid(r: () => number): Orbit {
  let a = 0
  for (;;) {
    a = 2.05 + 1.3 * ((r() + r() + r()) / 3)
    if (![2.06, 2.5, 2.82, 2.95, 3.27].some((g) => Math.abs(a - g) < 0.02) || r() > 0.85) break // Kirkwood gaps: 4:1, 3:1, 5:2, 7:3, 2:1 // VERIFY
  }
  return { a, e: Math.min(0.32, 0.085 * ray(r())), I: Math.min(30, 6 * ray(r())) * DEG, node: r() * 6.2832, varpi: r() * 6.2832, M: r() * 6.2832 }
}
/** Kuiper belt: classical (a 38.5-48, low e), plutinos (3:2 resonance, a ~ 39.4, e up to ~0.25), scattered disc (a 48-75, e 0.25-0.5). // VERIFY ranges */
function kuiper(r: () => number): Orbit {
  const k = r()
  let a: number, e: number, s: number
  if (k < 0.6) { a = 38.5 + 9.5 * ((r() + r()) / 2); e = Math.min(0.2, 0.05 * ray(r())); s = 7 }
  else if (k < 0.85) { a = 39.4 + 0.3 * (r() - 0.5) * 2; e = 0.12 + 0.13 * r(); s = 9 }
  else { a = 48 + 27 * r(); e = 0.25 + 0.25 * r(); s = 14 }
  return { a, e, I: Math.min(35, s * ray(r())) * DEG, node: r() * 6.2832, varpi: r() * 6.2832, M: r() * 6.2832 }
}
function belt(n: number, seed: number, gen: (r: () => number) => Orbit) {
  const r = rng(seed)
  const pos = new Float32Array(n * 3), seedA = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const o = gen(r)
    const p = placeVec(orbitPoint(o, kepler(o.M, o.e)))
    pos[i * 3] = p[0] / U; pos[i * 3 + 1] = p[1] / U; pos[i * 3 + 2] = p[2] / U
    seedA[i] = r()
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aSeed', new THREE.BufferAttribute(seedA, 1))
  return g
}
const pointsMat = (color: string, size: number) =>
  new THREE.ShaderMaterial({ vertexShader: pointsVert, fragmentShader: pointsFrag, transparent: true, depthWrite: false, uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0 }, uSize: { value: size }, uPx: { value: 1 } } })

const NOOP = () => {}
const meshRaycast = THREE.Mesh.prototype.raycast
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3()
const setHover = (id: string | null) => { if (solar.hover !== id) { solar.hover = id; document.body.style.cursor = id ? 'pointer' : '' } }
const interactive = () => solar.fade > 0.45 && st().focusPhase === 'idle' && !st().gate

// label anchors for the non-planet items: a point on each feature, in the ecliptic plane, at a chosen world azimuth
const feature = (rU: number, azDeg: number): THREE.Vector3 => new THREE.Vector3(Math.cos(azDeg * DEG) * rU, 0, Math.sin(azDeg * DEG) * rU)
const ASTEROID_U = Math.sqrt(2.7 / R_EARTH_AU0), KUIPER_U = Math.sqrt(43 / R_EARTH_AU0)
const FEATURES = [
  { id: 'f-ast', text: 'Asteroid belt', at: feature(ASTEROID_U, 160), dx: 10 },
  { id: 'f-kui', text: 'Kuiper belt', at: feature(KUIPER_U, 150), dx: 10 },
  { id: 'f-hel', text: 'Heliopause', at: feature(HELIOPAUSE_U, 140), dx: 10 },
]

export function SolarFx() {
  const { camera, size, gl } = useThree()
  const overlay = useRef<Overlay | null>(null)
  const hits = useRef(new Map<string, THREE.Mesh>())
  const beltA = useRef<THREE.Group>(null), beltK = useRef<THREE.Group>(null)

  const res = useMemo(() => {
    const orbits = BODIES.map((b) => {
      const pts = orbitLine(b.id, 256)
      const arr = new Float32Array(pts.length * 3)
      pts.forEach((p, i) => { arr[i * 3] = p[0] / U; arr[i * 3 + 1] = p[1] / U; arr[i * 3 + 2] = p[2] / U })
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
      const m = new THREE.LineBasicMaterial({ color: b.id === 'earth' ? solarTints.orbitEarth : solarTints.orbit, transparent: true, opacity: 0, depthWrite: false })
      return { id: b.id, g, m }
    })
    const hel = new Float32Array(257 * 3)
    for (let i = 0; i <= 256; i++) { const a = (i / 256) * 2 * Math.PI; hel[i * 3] = Math.cos(a) * HELIOPAUSE_U; hel[i * 3 + 2] = Math.sin(a) * HELIOPAUSE_U }
    const helG = new THREE.BufferGeometry(); helG.setAttribute('position', new THREE.BufferAttribute(hel, 3))
    return {
      orbits,
      helLine: { g: helG, m: new THREE.LineBasicMaterial({ color: '#6f95e0', transparent: true, opacity: 0, depthWrite: false }) },
      ast: { g: belt(N_AST, 7001, asteroid), m: pointsMat('#b9ad9c', 1.7) },
      kui: { g: belt(N_KUI, 7002, kuiper), m: pointsMat('#9db3d6', 1.5) },
      shell: { g: new THREE.SphereGeometry(HELIOPAUSE_U, 96, 48), m: new THREE.ShaderMaterial({ vertexShader: shellVert, fragmentShader: shellFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color(0.42, 0.58, 1.0) }, uAlpha: { value: 0 } } }) },
      halo: { g: new THREE.PlaneGeometry(2, 2), m: new THREE.ShaderMaterial({ vertexShader: haloVert, fragmentShader: haloFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uSizePx: { value: 60 }, uView: { value: new THREE.Vector2(1280, 720) }, uAlpha: { value: 0 } } }) },
      hitG: new THREE.SphereGeometry(1, 12, 8),
      hitM: new THREE.MeshBasicMaterial({ visible: false }),
    }
  }, [])

  useEffect(() => {
    const ov = new Overlay([
      { id: 'sun', text: 'Sun', color: '#ffe3a8', button: false },
      ...BODIES.map((b) => ({ id: b.id, text: b.name, color: b.tint, button: true, onClick: () => { void focus(b.id) } })),
      ...FEATURES.map((f) => ({ id: f.id, text: f.text, color: '#9aa6bf', button: false })),
    ])
    ov.onHover = (id) => setHover(interactive() ? id : null)
    overlay.current = ov
    return () => { ov.dispose(); overlay.current = null; setHover(null) }
  }, [])

  // 1) the simulation step runs BEFORE the Driver (priority -5) so positions are current when the Driver places objects
  useFrame(() => stepSolar(), -5)

  // 2) everything that needs this frame's camera (the Driver has already run: same priority 0, mounted earlier)
  useFrame(() => {
    const f = solar.fade
    solar.viewH = size.height
    solar.dpr = gl.getPixelRatio()
    const fov = cam.pose.fov
    const tanH = Math.tan((fov * Math.PI) / 360)
    const live = f > 0.003
    camera.updateMatrixWorld()
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert()

    // -- belt drift (mean motion at the belt's centre; CCW seen from ecliptic north = +rotation about world Y)
    if (beltA.current) beltA.current.rotation.y = meanMotion(2.7) * solar.days
    if (beltK.current) beltK.current.rotation.y = meanMotion(43) * solar.days

    // -- materials
    const ov = solar.overview
    const fo = 1 - Math.min(1, focusState.f * 2) // orbit lines fade out while an object is focused (they only cross the close-up)
    for (const o of res.orbits) o.m.opacity = fo * f * (0.1 + 0.12 * ov) * (o.id === 'earth' ? 1.6 : 1) * (o.id === 'pluto' || o.id === 'ceres' ? 0.7 : 1)
    res.helLine.m.opacity = fo * f * 0.16 * (0.4 + 0.6 * ov)
    res.shell.m.uniforms.uAlpha.value = f * 0.2
    res.ast.m.uniforms.uOpacity.value = f * 0.85; res.ast.m.uniforms.uPx.value = solar.dpr
    res.kui.m.uniforms.uOpacity.value = f * 0.75; res.kui.m.uniforms.uPx.value = solar.dpr
    const sunD = distTo(SUN_POS)
    const sunPx = ((R_SUN / sunD) * (size.height / 2)) / tanH
    res.halo.m.uniforms.uAlpha.value = f * (1 - sm(14, 60, sunPx)) * 0.9
    res.halo.m.uniforms.uSizePx.value = 46 + 0.8 * Math.min(sunPx, 40)
    ;(res.halo.m.uniforms.uView.value as THREE.Vector2).set(size.width, size.height)

    // -- hit areas: always at least HIT_PX px in radius, never smaller than the body itself
    const can = live && interactive()
    for (const b of BODIES) {
      const m = hits.current.get(b.id)
      const o = getObject(b.id)
      if (!m || !o) continue
      m.raycast = can ? meshRaycast : NOOP
      const d = distTo(o.position)
      const rM = Math.max(b.radius, (HIT_PX * d * tanH) / (size.height / 2))
      m.position.set((o.position[0] - SUN_POS[0]) / U, (o.position[1] - SUN_POS[1]) / U, (o.position[2] - SUN_POS[2]) / U)
      m.scale.setScalar(rM / U)
    }
    if (!can && solar.hover) setHover(null)

    // -- labels / markers
    const ovl = overlay.current
    if (!ovl) return
    if (!live) { hintPos.on = false; ovl.hideAll(); return }
    const k = cam.k
    const project = (px: number, py: number, pz: number, out: { x: number; y: number }): boolean => {
      tmp.set((px - cam.pos[0]) * k, (py - cam.pos[1]) * k, (pz - cam.pos[2]) * k).applyMatrix4(camera.matrixWorldInverse)
      if (tmp.z >= -1e-6) return false
      tmp2.copy(tmp).applyMatrix4(camera.projectionMatrix)
      out.x = (tmp2.x * 0.5 + 0.5) * size.width
      out.y = (-tmp2.y * 0.5 + 0.5) * size.height
      return true
    }
    const sunS = { x: 0, y: 0 }
    const sunOn = project(SUN_POS[0], SUN_POS[1], SUN_POS[2], sunS)
    const dotW = sm(0.6, 2.2, solar.camSunU)
    const margin = 24
    const inView = (p: { x: number; y: number }) => p.x > -margin && p.x < size.width + margin && p.y > -margin && p.y < size.height + margin
    const sunLabelA = f * ov * (1 - sm(8, 20, sunPx))
    ovl.place('sun', sunS.x, sunS.y, sunOn && inView(sunS) ? sunLabelA : 0, 0, 0, Math.max(sunPx, 6) + 14, false)
    const s = { x: 0, y: 0 }
    for (const b of BODIES) {
      const o = getObject(b.id)!
      const on = project(o.position[0], o.position[1], o.position[2], s) && inView(s)
      if (b.id === HINT_PLANET) hintPos.on = false
      if (!on) { ovl.place(b.id, 0, 0, 0, 0, 0, 0, false); continue }
      const px = pxRadius(b.id, fov)
      const dm = distTo(o.position) / b.radius
      const near = (1 - sm(40, 300, dm)) * sm(5, 12, dm)
      let a = f * Math.max(ov, near)
      let dotA = f * dotW * (1 - sm(2, 5, px))
      // behind the Sun's disc: hide the marker (the Sun is closer to the camera than the body)
      if (sunOn && Math.hypot(s.x - sunS.x, s.y - sunS.y) < sunPx + 2 && distTo(o.position) > sunD) { a = 0; dotA = 0 }
      const hov = solar.hover === b.id
      if (hov) { a = Math.max(a, f); dotA = Math.max(dotA, f * (1 - sm(5, 12, px))) }
      // label sits radially outward from the Sun on screen, so neighbours in the inner system fan out instead of stacking
      let vx = s.x - sunS.x, vy = s.y - sunS.y
      const vl = Math.hypot(vx, vy)
      if (!sunOn || vl < 4) { vx = 0.7; vy = -0.7 } else { vx /= vl; vy /= vl }
      const off = Math.max(px, 4) + 13
      if (b.id === HINT_PLANET) { hintPos.x = s.x; hintPos.y = s.y; hintPos.on = a > 0.4 } // the one-time "Click a planet" hint (src/hud/Experience.tsx) pulses here
      ovl.place(b.id, s.x, s.y, a, dotA, vx * off, vy * off, hov)
    }
    for (const ft of FEATURES) {
      const on = project(SUN_POS[0] + ft.at.x * U, SUN_POS[1], SUN_POS[2] + ft.at.z * U, s) && inView(s)
      ovl.place(ft.id, s.x, s.y, on ? f * ov * 0.9 : 0, 0, ft.dx, 0, false)
    }
  })

  return (
    <group>
      {res.orbits.map((o) => <lineLoop key={o.id} geometry={o.g} material={o.m} frustumCulled={false} renderOrder={-1} />)}
      <lineLoop geometry={res.helLine.g} material={res.helLine.m} frustumCulled={false} renderOrder={-1} />
      <group ref={beltA}><points geometry={res.ast.g} material={res.ast.m} frustumCulled={false} renderOrder={-1} /></group>
      <group ref={beltK}><points geometry={res.kui.g} material={res.kui.m} frustumCulled={false} renderOrder={-1} /></group>
      <mesh geometry={res.shell.g} material={res.shell.m} frustumCulled={false} renderOrder={-2} />
      <mesh geometry={res.halo.g} material={res.halo.m} frustumCulled={false} renderOrder={4} />
      {BODIES.map((b) => (
        <mesh
          key={b.id} geometry={res.hitG} material={res.hitM} frustumCulled={false}
          ref={(el) => { if (el) hits.current.set(b.id, el); else hits.current.delete(b.id) }}
          onPointerOver={(e) => { if (!interactive()) return; e.stopPropagation(); setHover(b.id) }}
          onPointerOut={() => { if (solar.hover === b.id) setHover(null) }}
          onClick={(e) => { if (!interactive()) return; e.stopPropagation(); void focus(b.id) }}
        />
      ))}
    </group>
  )
}
void colors; void compress; void SIM_DAYS
