import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { cam, groups } from '@/engine/world'
import { getObject } from '@/engine/journey'
import { st } from '@/engine/store'
import { focus } from '@/engine/api'
import { Overlay } from '../solar/overlay'
import { HitSphere } from '../galactic/Galaxy'
import { AU, LY, SUN_G, smooth } from '../galactic/units'
import { spriteVert, spriteFrag } from '../galactic/shaders'
import { gx, makeProject, putSprite, spriteGeometry, spriteMaterial, syncSprite } from '../galactic/state'
import { craftMaterial, craftParts, DISH_R_M } from './craft'
import { LIGHT_DAY_AU, VOYAGERS, rAUat, smoothPath, trajectoryLy, voyagerPos, type VoyagerSpec } from './data'

const Z = new THREE.Vector3(0, 0, 1)

/** The spacecraft itself: unit radius = the dish radius (1.83 m). Drawn only when it is big enough to see (the flight in focus); from afar the markers of <VoyagerFx/> stand for it. */
export function makeVoyager(spec: VoyagerSpec) {
  const pos = voyagerPos(spec)
  const toSun = new THREE.Vector3(SUN_G[0] - pos[0], SUN_G[1] - pos[1], SUN_G[2] - pos[2]).normalize() // the dish points back at Earth / the Sun
  return function Voyager() {
    const inner = useRef<THREE.Group>(null)
    const { size, camera } = useThree()
    const res = useMemo(() => {
      const parts = craftParts()
      const mats = parts.map((p) => craftMaterial(p.color, p.metal, toSun.clone()))
      return { parts, mats, q: new THREE.Quaternion().setFromUnitVectors(Z, toSun) }
    }, [])
    const m3 = useMemo(() => new THREE.Matrix3(), [])
    const m4 = useMemo(() => new THREE.Matrix4(), [])
    useFrame(() => {
      const grp = groups.get(spec.id)
      const g = inner.current
      if (!grp || !g) return
      const dist = grp.position.length() || 1e-9
      const tanH = Math.tan((cam.pose.fov * Math.PI) / 360)
      const pxR = ((grp.scale.x / dist) * (size.height / 2)) / tanH // pixels per dish radius
      g.visible = grp.visible && (pxR > 0.25 || !!cam.solo) // cam.solo = preloader warm-up: draw once so the craft shader is compiled
      if (!g.visible) return
      // camera-space -> world rotation for the specular term (the group has no rotation of its own; the camera has)
      m3.setFromMatrix4(m4.makeRotationFromQuaternion(camera.quaternion))
      for (const m of res.mats) (m.uniforms.uView.value as THREE.Matrix3).copy(m3)
    })
    return (
      <group>
        <group ref={inner} quaternion={res.q} visible={false}>
          {res.parts.map((p, i) => <mesh key={i} geometry={p.geo} material={res.mats[i]} frustumCulled={false} renderOrder={6} />)}
        </group>
        <HitSphere id={spec.id} radiusM={DISH_R_M} />
      </group>
    )
  }
}

/** Layer 'voy-fx' (origin = the Sun, unit 1 light-year): the two probes as markers, their real trajectories, the one-light-day ring, DOM labels (buttons -> focus). */
export function VoyagerFx() {
  const { camera, size, gl } = useThree()
  const ov = useRef<Overlay | null>(null)
  const res = useMemo(() => {
    const sg = spriteGeometry(VOYAGERS.length)
    VOYAGERS.forEach((v, i) => { const p = voyagerPos(v); putSprite(sg.a, i, [(p[0] - SUN_G[0]) / LY, (p[1] - SUN_G[1]) / LY, (p[2] - SUN_G[2]) / LY], v.color, 11, 0, 1) })
    const dots = spriteMaterial(spriteVert, spriteFrag, { min: 5, max: 16 })
    const lines = VOYAGERS.map((v) => {
      const pts = smoothPath(trajectoryLy(v), 20)
      const a = new Float32Array(pts.length * 3)
      pts.forEach((p, i) => a.set(p, i * 3))
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3))
      const m = new THREE.LineBasicMaterial({ color: new THREE.Color(...v.color), transparent: true, opacity: 0, depthWrite: false, depthTest: false })
      const obj = new THREE.Line(g, m); obj.frustumCulled = false; obj.renderOrder = 3
      return { g, m, obj }
    })
    const R = (LIGHT_DAY_AU * AU) / LY
    const ra = new Float32Array(193 * 3)
    for (let i = 0; i <= 192; i++) { const t = (i / 192) * 6.2831853; ra[i * 3] = Math.cos(t) * R; ra[i * 3 + 2] = Math.sin(t) * R }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(ra, 3))
    const rm = new THREE.LineBasicMaterial({ color: '#8fb4ff', transparent: true, opacity: 0, depthWrite: false, depthTest: false })
    const ring = new THREE.LineLoop(rg, rm); ring.frustumCulled = false; ring.renderOrder = 2
    return { sg, dots, lines, rg, rm, ring, R }
  }, [])
  useEffect(() => {
    const items = [
      ...VOYAGERS.map((v) => ({ id: v.id, text: v.name, color: `rgb(${v.color.map((c) => Math.round(c * 255)).join(',')})`, button: true, onClick: () => { void focus(v.id) } })),
    ]
    const o = new Overlay(items, 'voyager-overlay')
    ov.current = o
    return () => { o.dispose(); ov.current = null }
  }, [])
  useLayoutEffect(() => { for (const l of res.lines) l.g.computeBoundingSphere() }, [res])
  const P = useMemo(() => ({ x: 0, y: 0 }), [])
  const off: Record<string, [number, number]> = { 'voyager-1': [14, -12], 'voyager-2': [14, 14] }
  useFrame(() => {
    const live = !!getObject('voy-fx') && !!groups.get('voy-fx')?.visible
    const o = ov.current
    const dAU = (gx.sunLy * LY) / AU
    const a = live ? smooth(12, 100, dAU) * (1 - smooth(2.5e4, 2.5e5, dAU)) : 0
    syncSprite(res.dots, a, 1)
    res.lines.forEach((l) => { l.m.opacity = a * 0.5 })
    res.rm.opacity = a * 0.22
    if (!o) return
    if (a < 0.01) { o.hideAll(); return }
    camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
    const proj = makeProject(camera, size)
    void gl
    for (const v of VOYAGERS) {
      const p = voyagerPos(v)
      const on = proj(p[0], p[1], p[2], P)
      const [dx, dy] = off[v.id]
      o.place(v.id, P.x, P.y, on ? a * 0.95 * (1 - smooth(8000, 40000, dAU)) : 0, 0, dx, dy, false)
    }
    const R = LIGHT_DAY_AU * AU
    const onR = proj(SUN_G[0] + R * 0.7071, SUN_G[1], SUN_G[2] + R * 0.7071, P)
    o.place('ring', P.x, P.y, onR ? a * 0.8 * (1 - smooth(6000, 30000, dAU)) : 0, 0, 8, 0, false)
    o.place('honest', size.width / 2, size.height - 112, (st().focusPhase === 'idle' ? 1 : 0) * a * 0.7 * smooth(60, 250, dAU) * (1 - smooth(8000, 40000, dAU)), 0, 0, 0, false)
  })
  return (
    <group>
      <points geometry={res.sg.g} material={res.dots} frustumCulled={false} renderOrder={4} />
      {res.lines.map((l, i) => <primitive key={i} object={l.obj} />)}
      <primitive object={res.ring} />
    </group>
  )
}
