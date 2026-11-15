import { useEffect } from 'react'
import * as THREE from 'three'
import { registerObject } from '@/engine/journey'
import { getTexture } from '@/engine/assets'
import { cam } from '@/engine/world'
import { useStore } from '@/engine/store'

/** ?test=planets: the four procedural bodies on spheres, lit by the engine's Sun, to check maps + normal-map orientation. */
const on = new URLSearchParams(location.search).get('test') === 'planets'
const sphere = (mat: () => THREE.Material) =>
  function P() {
    return <mesh geometry={new THREE.SphereGeometry(1, 96, 48)} material={mat()} />
  }
const std = (map: string, normal?: string) => () => {
  const m = new THREE.MeshStandardMaterial({ map: getTexture(map), roughness: 0.95, metalness: 0 })
  if (normal) { m.normalMap = getTexture(normal); m.normalScale = new THREE.Vector2(1, 1) }
  return m
}
const IDS = ['P-sun', 'P-mercury', 'P-venus', 'P-mars']
if (on) {
  const R = 1e6
  registerObject({ id: 'P-sun', name: 'Sun', position: [-3.9 * R, 0, 0], radius: R, Component: sphere(() => new THREE.MeshBasicMaterial({ map: getTexture('sun'), color: new THREE.Color(1.15, 1.1, 1.0) })) })
  registerObject({ id: 'P-mercury', name: 'Mercury', position: [-1.3 * R, 0, 0], radius: R, Component: sphere(std('mercury-albedo', 'mercury-normal')) })
  registerObject({ id: 'P-venus', name: 'Venus', position: [1.3 * R, 0, 0], radius: R, Component: sphere(std('venus-clouds')) })
  registerObject({ id: 'P-mars', name: 'Mars', position: [3.9 * R, 0, 0], radius: R, Component: sphere(std('mars-albedo', 'mars-normal')) })
}
export function PlanetsTest() {
  const phase = useStore((s) => s.phase)
  useEffect(() => {
    if (!on || phase !== 'ready') return
    cam.solo = new Set(IDS)
    cam.override = { target: [0, 0, 0], dist: 13e6, azim: 0, elev: 0, fov: 35, roll: 0 }
    return () => { cam.solo = null; cam.override = null }
  }, [phase])
  return null
}
