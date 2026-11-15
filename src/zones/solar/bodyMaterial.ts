import * as THREE from 'three'
import { bodyVert, bodyFrag } from './shaders'

/**
 * The one surface material used by every planet, dwarf planet and moon of the Solar System zone (final series, step 1 factored it out of
 * Planet.tsx so the moons share it). Close-up polish lives here: a detail-noise layer per body and Jupiter's band flow.
 */
export const bodyTime = { value: 0 }

/** Detail layer per body id: amplitude, frequency (cycles per radius), mode (0 isotropic, 1 banded), band anisotropy. Judged by eye; see STATUS. */
const DETAIL: Record<string, [number, number, number, number]> = {
  mercury: [0.2, 90, 0, 1], venus: [0.06, 40, 1, 1.6], mars: [0.2, 85, 0, 1],
  jupiter: [0.1, 55, 1, 5], saturn: [0.07, 50, 1, 6], uranus: [0.03, 30, 1, 3], neptune: [0.05, 40, 1, 3],
  pluto: [0.2, 80, 0, 1], ceres: [0.25, 75, 0, 1],
  io: [0.14, 85, 0, 1], europa: [0.1, 80, 0, 1], ganymede: [0.2, 85, 0, 1], callisto: [0.24, 90, 0, 1],
  titan: [0.04, 40, 1, 1.5], enceladus: [0.1, 75, 0, 1], triton: [0.15, 80, 0, 1], charon: [0.2, 80, 0, 1],
}
/** Jupiter's flow: max shift in u, loop seconds, the Great Red Spot's latitude (22.2 S, spared) and half-width (rad). */
const SHEAR: Record<string, [number, number, number, number]> = { jupiter: [0.012, 16, (-22.2 * Math.PI) / 180, 0.17] }

export interface BodyMatOpts {
  id: string
  map: THREE.Texture
  normal?: THREE.Texture | null
  ringTex?: THREE.Texture
  wrap: number
  gain: number
  /** 1 - flattening */
  flat: number
  sun: THREE.Vector3
  pole: THREE.Vector3
  rim: [number, number, number, number]
  /** ring extents in planet radii + opacity strength, if the planet has rings (they shade the globe) */
  ring?: { rin: number; rout: number; strength: number }
}

export function makeBodyMaterial(o: BodyMatOpts) {
  const img = o.map.image as { width?: number } | undefined
  const d = DETAIL[o.id] ?? [0, 1, 0, 1]
  const sh = SHEAR[o.id] ?? [0, 1, 0, 1]
  return new THREE.ShaderMaterial({
    vertexShader: bodyVert, fragmentShader: bodyFrag,
    uniforms: {
      uMap: { value: o.map }, uNormal: { value: o.normal ?? o.map }, uRingTex: { value: o.ringTex ?? o.map },
      uHasNormal: { value: o.normal ? 1 : 0 }, uWrap: { value: o.wrap }, uGain: { value: o.gain * 1.25 }, uAmb: { value: 0.012 },
      uFlat: { value: o.flat }, uSun: { value: o.sun }, uPole: { value: o.pole }, uRim: { value: new THREE.Vector4(...o.rim) },
      uRing: { value: o.ring ? 1 : 0 }, uRin: { value: o.ring?.rin ?? 0 }, uRout: { value: o.ring?.rout ?? 0 }, uRingStr: { value: o.ring?.strength ?? 0 },
      uTime: bodyTime,
      uDetail: { value: new THREE.Vector4(...d) },
      uTexSize: { value: new THREE.Vector2(img?.width ?? 1024, 1) },
      uShear: { value: new THREE.Vector4(...sh) },
    },
  })
}
