import { useMemo } from 'react'
import * as THREE from 'three'
import { getTexture } from '@/engine/assets'
import { useStore } from '@/engine/store'

/** The Moon at unit radius: real albedo + the generated crater relief (built by the preloader). Near side faces Earth (-X). */
export function MoonBody() {
  const seg = useStore((s) => s.settings.segments)
  const geo = useMemo(() => new THREE.SphereGeometry(1, seg, seg / 2), [seg])
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: getTexture('moon-albedo'), normalMap: getTexture('moon-relief'), normalScale: new THREE.Vector2(1.1, 1.1),
        color: new THREE.Color(1.0, 0.985, 0.95), roughness: 1, metalness: 0,
      }),
    [],
  )
  return <mesh geometry={geo} material={mat} rotation={[0, Math.PI, 0]} />
}
