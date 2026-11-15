import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getTexture } from '@/engine/assets'
import { useStore, st } from '@/engine/store'
import { cam } from '@/engine/world'
import { SPIN_SPEEDUP, type BodySpec } from './bodies'
import { poleOf } from './layout'
import { solar, pxRadius } from './state'
import { bodyVert, ringVert, ringFrag, atmoFrag } from './shaders'
import { makeBodyMaterial } from './bodyMaterial'

/**
 * One planet / dwarf planet at UNIT radius (the engine scales it to its true equatorial radius).
 *  - three sphere meshes (LOD): 20x10, 48x24 and the tier's segment count. They are separate meshes switched by `visible`, never
 *    by swapping a geometry, so every geometry is uploaded by the preloader's warm-up frame (all three are drawn while phase != ready).
 *    The switch happens at 28 px / 160 px disc radius where the silhouette error is < 0.35 px, so it cannot be seen.
 *  - tilt = the IAU pole (world axes), spin about it (sped up by SPIN_SPEEDUP; negative = retrograde).
 *  - rings (Saturn, Uranus, Jupiter): a flat annulus with the generated strip, planet shadow on the ring and ring shadow on the planet
 *    computed analytically in the two shaders.
 *  - Venus: the cloud-top map under an exaggerated atmosphere shell.
 */
const LOW = 20, MID = 48
const UP = new THREE.Vector3(0, 1, 0)
const H_ATMO = 0.012

function ringGeometry(spec: BodySpec, n = 256) {
  const r = spec.ring!
  const pos = new Float32Array((n + 1) * 2 * 3), uv = new Float32Array((n + 1) * 2 * 2), idx: number[] = []
  const rin = r.inner / spec.radius, rout = r.outer / spec.radius
  const u0 = (r.inner - r.r0) / (r.r1 - r.r0), u1 = (r.outer - r.r0) / (r.r1 - r.r0)
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a)
    pos.set([c * rin, 0, s * rin, c * rout, 0, s * rout], i * 6)
    uv.set([u0, 0, u1, 1], i * 4)
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2) }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

export function makePlanet(spec: BodySpec) {
  const omega = ((2 * Math.PI) / ((Math.abs(spec.spinH) * 3600) / SPIN_SPEEDUP)) * Math.sign(spec.spinH)
  return function Planet() {
    const seg = useStore((s) => s.settings.segments)
    const geos = useMemo(() => ({ lo: new THREE.SphereGeometry(1, LOW, LOW / 2), mid: new THREE.SphereGeometry(1, MID, MID / 2), hi: new THREE.SphereGeometry(1, Math.max(seg, 64), Math.max(seg, 64) / 2) }), [seg])
    const pole = useMemo(() => { const p = poleOf(spec.pole[0], spec.pole[1]); return new THREE.Vector3(p[0], p[1], p[2]) }, [])
    const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, pole), [pole])
    const sun = solar.sunDir.get(spec.id)!
    const mats = useMemo(() => {
      const map = getTexture(spec.map)
      const ringTex = spec.ring ? getTexture(spec.ring.tex) : map
      const body = makeBodyMaterial({
        id: spec.id, map, normal: spec.normal ? getTexture(spec.normal) : null, ringTex, wrap: spec.wrap, gain: spec.gain, flat: 1 - spec.flat, sun, pole, rim: spec.rim,
        ring: spec.ring ? { rin: spec.ring.inner / spec.radius, rout: spec.ring.outer / spec.radius, strength: spec.ring.strength } : undefined,
      })
      const ring = spec.ring
        ? new THREE.ShaderMaterial({ vertexShader: ringVert, fragmentShader: ringFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTex: { value: ringTex }, uSun: { value: sun }, uPole: { value: pole }, uStr: { value: spec.ring.strength }, uRingDetail: { value: spec.id === 'saturn' ? 0.35 : 0.12 }, uRingTexW: { value: (ringTex.image as { width?: number } | undefined)?.width ?? 1024 } } })
        : null
      const atmo = spec.id === 'venus'
        ? new THREE.ShaderMaterial({ vertexShader: bodyVert, fragmentShader: atmoFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uFlat: { value: 1 }, uSun: { value: sun }, uColor: { value: new THREE.Color(1.0, 0.82, 0.5) }, uH: { value: H_ATMO }, uK: { value: 2.6 } } })
        : null
      return { body, ring, atmo }
    }, [pole, sun])
    const ringGeo = useMemo(() => (spec.ring ? ringGeometry(spec) : null), [])
    const spin = useRef<THREE.Group>(null)
    const lo = useRef<THREE.Mesh>(null), mid = useRef<THREE.Mesh>(null), hi = useRef<THREE.Mesh>(null)
    const lvl = useRef(0)

    useFrame((_, dt) => {
      if (spin.current) spin.current.rotation.y += Math.min(dt, 0.1) * omega
      const px = pxRadius(spec.id, cam.pose.fov)
      // hysteresis so a body hovering around a threshold cannot flicker between levels
      let l = lvl.current
      if (l === 0 && px > 32) l = 1
      else if (l === 1 && px < 26) l = 0
      if (l === 1 && px > 165) l = 2
      else if (l === 2 && px < 145) l = 1
      lvl.current = l
      const warm = st().phase !== 'ready' // draw every level once so all geometries are on the GPU before the journey starts
      if (lo.current) lo.current.visible = warm || l === 0
      if (mid.current) mid.current.visible = warm || l === 1
      if (hi.current) hi.current.visible = warm || l === 2
    })

    return (
      <group quaternion={quat}>
        <group ref={spin}>
          <mesh ref={lo} geometry={geos.lo} material={mats.body} frustumCulled={false} />
          <mesh ref={mid} geometry={geos.mid} material={mats.body} frustumCulled={false} />
          <mesh ref={hi} geometry={geos.hi} material={mats.body} frustumCulled={false} />
        </group>
        {mats.ring && ringGeo && <mesh geometry={ringGeo} material={mats.ring} frustumCulled={false} renderOrder={1} />}
        {mats.atmo && <mesh geometry={geos.mid} material={mats.atmo} scale={1 + 6 * H_ATMO} frustumCulled={false} renderOrder={2} />}
      </group>
    )
  }
}
