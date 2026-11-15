import { allObjects } from './journey'
import { WorldObject } from './WorldObject'
import { Sky } from './Sky'
import { Driver } from './Driver'
import { Preloader } from './Preloader'
import { AdaptiveRes } from './AdaptiveRes'
import { useStore } from './store'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { SUN_DIR } from '@/zones/common'
import { solar } from '@/zones/solar/state'

/** The scene's one directional light lights the Moon only (Earth and the planets have their own uSun). Its direction is the REAL Moon -> Sun direction, every frame. */
function SunLight() {
  const ref = useRef<THREE.DirectionalLight>(null)
  useFrame(() => { if (ref.current) ref.current.position.copy(solar.moonSunDir).multiplyScalar(50) })
  return <directionalLight ref={ref} position={[SUN_DIR.x * 50, SUN_DIR.y * 50, SUN_DIR.z * 50]} intensity={3.4} />
}

/** Everything inside the ONE Canvas. Objects mount once (when assets are ready) and are never unmounted or disposed. */
export function Scene({ extra }: { extra?: React.ReactNode }) {
  const ready = useStore((s) => s.assetsReady)
  return (
    <>
      <color attach="background" args={['#02030a']} />
      <Sky />
      <ambientLight intensity={0.02} />
      <SunLight />
      <Driver />
      <Preloader />
      <AdaptiveRes />
      {ready && allObjects().map((o) => (
        <WorldObject key={o.id} id={o.id}>
          <o.Component />
        </WorldObject>
      ))}
      {extra}
    </>
  )
}
