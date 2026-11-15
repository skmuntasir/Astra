import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { cam } from '@/engine/world'
import { rngSeed } from '@/lib/rng'
import { getObject } from '@/engine/journey'
import { st } from '@/engine/store'
import { Overlay } from '../solar/overlay'
import { shellVert, shellFrag } from '../solar/shaders'
import { NEAR_STARS, OORT } from './data'
import { AU, LY, SUN_G, eqDir, smooth } from './units'
import { spriteVert, spriteFrag } from './shaders'
import { gx, makeProject, putSprite, spriteGeometry, spriteMaterial, stepGalactic, syncSprite } from './state'

/**
 * "Leaving the system" layer: ONE registered object ('gx-near'), origin = the Sun, local unit = 1 light-year.
 *  - Oort cloud: SIMULATED (a few thousand points). Nobody has seen it; it is inferred from long-period comets. Inner edge ~ 2,000 AU,
 *    outer ~ 100,000 AU. Inner part flattened toward the ecliptic, outer part a sphere. Drawn as a hint and labelled schematic.
 *  - 21 real stars at their real directions (RA/Dec -> world frame) and distances (Hipparcos / Gaia values, rounded; data.ts). Thin stems
 *    drop each star to the ecliptic plane so depth reads; 5 / 10 / 20 ly rings lie in that plane.
 *  - The Sun as a sprite (fades in as the Sun's sphere shrinks to nothing, so there is no pop).
 * Also runs stepGalactic() every frame (sky fade), whichever zone is active.
 */
const AU_LY = AU / LY
const tier = () => st().settings.tier

export function NearLayer() {
  const { camera, size, gl } = useThree()
  const ov = useRef<Overlay | null>(null)
  const res = useMemo(() => {
    const r = rngSeed(4101)
    const nOort = tier() === 'low' ? 4500 : 9000
    const o = spriteGeometry(nOort)
    for (let i = 0; i < nOort; i++) {
      const inner = r() < 0.4
      const rad = (inner ? OORT.innerAU * Math.pow(10, r()) : 20000 * Math.pow(5, r())) * AU_LY // log-uniform shells
      let y = 2 * r() - 1
      if (inner) y *= 0.3
      const ph = r() * 6.2831853, s = Math.sqrt(Math.max(0, 1 - y * y))
      putSprite(o.a, i, [rad * s * Math.cos(ph), rad * y, rad * s * Math.sin(ph)], [0.62, 0.78, 1.0], 0, 0, 0.5 * (0.4 + 0.6 * r()))
    }
    const oortM = spriteMaterial(spriteVert, spriteFrag, { min: 1.3, max: 3 })

    const ns = NEAR_STARS.length
    const sg = spriteGeometry(ns)
    const stems: number[] = []
    const dots = new Float32Array(ns * 3)
    NEAR_STARS.forEach((s, i) => {
      const d = eqDir(s.ra, s.dec)
      const p: [number, number, number] = [d[0] * s.ly, d[1] * s.ly, d[2] * s.ly]
      putSprite(sg.a, i, p, s.col, s.size * 1.35 + 1.5, 0, 1)
      stems.push(p[0], p[1], p[2], p[0], 0, p[2])
      dots.set([p[0], 0, p[2]], i * 3)
    })
    const starM = spriteMaterial(spriteVert, spriteFrag, { min: 4, max: 22 })
    const sun = spriteGeometry(1)
    putSprite(sun.a, 0, [0, 0, 0], [1.0, 0.93, 0.74], 9, 0, 1)
    const sunM = spriteMaterial(spriteVert, spriteFrag, { min: 2.5, max: 16 })

    const stemG = new THREE.BufferGeometry(); stemG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(stems), 3))
    const stemM = new THREE.LineBasicMaterial({ color: '#7f93c2', transparent: true, opacity: 0, depthWrite: false })
    const rings = [5, 10, 20].map((R) => {
      const a = new Float32Array(129 * 3)
      for (let i = 0; i <= 128; i++) { const t = (i / 128) * 6.2831853; a[i * 3] = Math.cos(t) * R; a[i * 3 + 2] = Math.sin(t) * R }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3))
      return { R, g }
    })
    const ringM = new THREE.LineBasicMaterial({ color: '#6f84b8', transparent: true, opacity: 0, depthWrite: false })
    const shellM = new THREE.ShaderMaterial({ vertexShader: shellVert, fragmentShader: shellFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uColor: { value: new THREE.Color(0.4, 0.55, 0.95) }, uAlpha: { value: 0 } } })
    return { oort: { g: o.g, m: oortM }, stars: { g: sg.g, m: starM }, sun: { g: sun.g, m: sunM }, stemG, stemM, rings, ringM, shellG: new THREE.SphereGeometry(OORT.outerAU * AU_LY, 64, 32), shellM }
  }, [])

  useEffect(() => {
    const items = [
      { id: 'sun', text: 'Sun', color: '#ffe3a8', button: false },
      ...NEAR_STARS.map((s) => ({ id: s.id, text: s.name, color: '#d3dcf0', button: false })),
      { id: 'oort', text: 'Oort cloud', color: '#9db3d6', button: false },
    ]
    const o = new Overlay(items, 'near-overlay')
    ov.current = o
    return () => { o.dispose(); ov.current = null }
  }, [])

  useFrame(() => stepGalactic(), -5)
  const P = useMemo(() => ({ x: 0, y: 0 }), [])
  const tmp = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    gx.viewH = size.height; gx.dpr = gl.getPixelRatio()
    const d = gx.sunLy
    const tanH = Math.tan((cam.pose.fov * Math.PI) / 360)
    const far = 1 - smooth(150, 600, d)
    const oortA = smooth(0.0004, 0.006, d) * (1 - smooth(30, 90, d))
    const pxR = (OORT.outerAU * AU_LY / Math.max(d, 1e-9)) * (size.height / 2) / tanH
    const dim = Math.min(1, Math.pow(pxR / 160, 2) + 0.03)
    const starsA = smooth(0.2, 1.5, d) * far
    syncSprite(res.oort.m, oortA, dim)
    syncSprite(res.stars.m, starsA)
    syncSprite(res.sun.m, smooth(0.00008, 0.0008, d) * far)
    res.stemM.opacity = starsA * 0.34; res.ringM.opacity = starsA * 0.16
    res.shellM.uniforms.uAlpha.value = oortA * 0.035 * Math.min(1, dim + 0.2)

    const o = ov.current
    if (!o) return
    camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
    const proj = makeProject(camera, size)
    const labA = smooth(1.2, 3.5, d) * (1 - smooth(45, 120, d))
    const live = (getObject('gx-near') && starsA + oortA > 0.01)
    if (!live) { o.hideAll(); return }
    const off: Record<string, [number, number]> = { prox: [14, 16], acen: [14, -10], sir: [14, -10] }
    for (const s of NEAR_STARS) {
      const dir = eqDir(s.ra, s.dec)
      const on = proj(SUN_G[0] + dir[0] * s.ly * LY, SUN_G[1] + dir[1] * s.ly * LY, SUN_G[2] + dir[2] * s.ly * LY, P)
      const [dx, dy] = off[s.id] ?? [12, -8]
      o.place(s.id, P.x, P.y, on ? labA : 0, 0, dx, dy, false)
    }
    const onS = proj(SUN_G[0], SUN_G[1], SUN_G[2], P)
    o.place('sun', P.x, P.y, onS ? smooth(0.002, 0.02, d) * (1 - smooth(8, 40, d)) * 0.9 : 0, 0, 12, -10, false)
    // Oort label: on the shell, toward the upper left of the view
    tmp.set(-0.62, 0.55, 0.55).normalize().multiplyScalar(OORT.outerAU * AU_LY)
    const onO = proj(SUN_G[0] + tmp.x * LY, SUN_G[1] + tmp.y * LY, SUN_G[2] + tmp.z * LY, P)
    o.place('oort', P.x, P.y, onO ? oortA * smooth(0.02, 0.2, d) * (1 - smooth(10, 40, d)) * 0.9 : 0, 0, 10, 0, false)
    for (const R of [5, 10, 20]) {
      const on = proj(SUN_G[0] + R * LY * 0.7071, SUN_G[1], SUN_G[2] + R * LY * 0.7071, P)
      o.place('ring' + R, P.x, P.y, on ? labA * 0.7 : 0, 0, 6, 0, false)
    }
  })

  return (
    <group>
      <mesh geometry={res.shellG} material={res.shellM} frustumCulled={false} renderOrder={-2} />
      <points geometry={res.oort.g} material={res.oort.m} frustumCulled={false} renderOrder={1} />
      <lineSegments geometry={res.stemG} material={res.stemM} frustumCulled={false} renderOrder={-1} />
      {res.rings.map((r) => <lineLoop key={r.R} geometry={r.g} material={res.ringM} frustumCulled={false} renderOrder={-1} />)}
      <points geometry={res.stars.g} material={res.stars.m} frustumCulled={false} renderOrder={2} />
      <points geometry={res.sun.g} material={res.sun.m} frustumCulled={false} renderOrder={3} />
    </group>
  )
}
