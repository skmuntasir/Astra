import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getTexture } from '@/engine/assets'
import { useStore } from '@/engine/store'
import { solar } from './state'
import { BODY } from './bodies'
import { poleOf } from './layout'
import { makeBodyMaterial } from './bodyMaterial'
import { moonAngle, type MoonSpec } from './satellites'

/** A moon at UNIT radius (the engine scales it): the shared body surface shader, sunlit from the planet's Sun direction, tidally locked to its planet. */
const UP = new THREE.Vector3(0, 1, 0)
export function makeSatellite(m: MoonSpec) {
  return function Satellite() {
    const seg = useStore((s) => s.settings.segments)
    const geo = useMemo(() => new THREE.SphereGeometry(1, Math.max(seg, 64), Math.max(seg, 64) / 2), [seg])
    const pole = useMemo(() => { const p = poleOf(BODY.get(m.parent)!.pole[0], BODY.get(m.parent)!.pole[1]); return new THREE.Vector3(p[0], p[1], p[2]) }, [])
    const quat = useMemo(() => new THREE.Quaternion().setFromUnitVectors(UP, pole), [pole])
    const sun = solar.sunDir.get(m.parent)!
    const mat = useMemo(() => makeBodyMaterial({ id: m.id, map: getTexture(m.map), wrap: m.id === 'titan' ? 0.2 : 0.03, gain: 1.0, flat: 1, sun, pole, rim: m.id === 'titan' ? [0.9, 0.62, 0.25, 0.35] : [0, 0, 0, 0] }), [pole, sun])
    const spin = useRef<THREE.Group>(null)
    useFrame(() => { if (spin.current) spin.current.rotation.y = moonAngle(m) + Math.PI })
    return (
      <group quaternion={quat}>
        <group ref={spin}><mesh geometry={geo} material={mat} frustumCulled={false} /></group>
      </group>
    )
  }
}
