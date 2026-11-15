import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type * as THREE from 'three'
import { groups } from './world'

/**
 * Wraps a registered object: a group that is mounted ONCE and kept forever. The Driver toggles `visible` and writes
 * position/scale every frame (floating origin). Children draw a UNIT-radius body at the local origin.
 */
export function WorldObject({ id, children }: { id: string; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    const g = ref.current!
    groups.set(id, g)
    return () => { groups.delete(id) }
  }, [id])
  return <group ref={ref} visible={false}>{children}</group>
}
