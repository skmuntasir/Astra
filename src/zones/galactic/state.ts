import * as THREE from 'three'
import { cam, sky } from '@/engine/world'
import { SUN_G, LY, smooth } from './units'

/** Per-frame shared state of the Prompt 5 zones (plain object; read in useFrame, never in React state). */
export const gx = {
  /** camera distance from the Sun, light-years */
  sunLy: 0,
  /** viewport height in CSS px, dpr */
  viewH: 720,
  dpr: 1,
  hover: null as string | null,
}

/**
 * Runs every frame at priority -5 (before the Driver) from the beyond-the-system layer. The backdrop is the view FROM THE SUN, so:
 *  - sky.alpha: full until the camera is ~1,500 ly out, gone by ~12,000 ly (the Milky Way particle model takes over; see MilkyWay.tsx);
 *  - sky.near: the six real bright stars that also exist as 3-D sprites leave the backdrop as soon as the camera leaves the Sun's
 *    neighbourhood (0.15 -> 1.5 ly), so a star is never drawn twice.
 */
export function stepGalactic() {
  const d = Math.hypot(cam.pos[0] - SUN_G[0], cam.pos[1] - SUN_G[1], cam.pos[2] - SUN_G[2]) / LY
  gx.sunLy = d
  sky.alpha = 1 - smooth(1500, 12000, d)
  sky.near = 1 - smooth(0.15, 1.5, d)
}

/** Sprite material shared by every point layer. */
export function spriteMaterial(vert: string, frag: string, opts: { min?: number; max?: number } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uViewH: { value: 720 }, uDpr: { value: 1 }, uMin: { value: opts.min ?? 1.4 }, uMax: { value: opts.max ?? 48 }, uOpacity: { value: 0 }, uDim: { value: 1 } },
  })
}
export function syncSprite(m: THREE.ShaderMaterial, opacity: number, dim = 1) {
  m.uniforms.uViewH.value = gx.viewH; m.uniforms.uDpr.value = gx.dpr; m.uniforms.uOpacity.value = opacity; m.uniforms.uDim.value = dim
}

/** Builds a BufferGeometry for sprites. */
export function spriteGeometry(n: number) {
  const g = new THREE.BufferGeometry()
  const a = { position: new Float32Array(n * 3), aCol: new Float32Array(n * 3), aSize: new Float32Array(n), aPx: new Float32Array(n), aA: new Float32Array(n) }
  g.setAttribute('position', new THREE.BufferAttribute(a.position, 3))
  g.setAttribute('aCol', new THREE.BufferAttribute(a.aCol, 3))
  g.setAttribute('aSize', new THREE.BufferAttribute(a.aSize, 1))
  g.setAttribute('aPx', new THREE.BufferAttribute(a.aPx, 1))
  g.setAttribute('aA', new THREE.BufferAttribute(a.aA, 1))
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e30)
  return { g, a }
}
export type SpriteArrays = ReturnType<typeof spriteGeometry>['a']
export function putSprite(a: SpriteArrays, i: number, p: [number, number, number], col: [number, number, number], px: number, size: number, alpha: number) {
  a.position[i * 3] = p[0]; a.position[i * 3 + 1] = p[1]; a.position[i * 3 + 2] = p[2]
  a.aCol[i * 3] = col[0]; a.aCol[i * 3 + 1] = col[1]; a.aCol[i * 3 + 2] = col[2]
  a.aPx[i] = px; a.aSize[i] = size; a.aA[i] = alpha
}

/** Projection helper shared by the label layers (camera matrices must be current: call after the Driver, i.e. in a normal useFrame). */
export function makeProject(camera: THREE.Camera, size: { width: number; height: number }) {
  const t1 = new THREE.Vector3(), t2 = new THREE.Vector3()
  return (px: number, py: number, pz: number, out: { x: number; y: number }): boolean => {
    t1.set((px - cam.pos[0]) * cam.k, (py - cam.pos[1]) * cam.k, (pz - cam.pos[2]) * cam.k).applyMatrix4(camera.matrixWorldInverse)
    if (t1.z >= -1e-6) return false
    t2.copy(t1).applyMatrix4((camera as THREE.PerspectiveCamera).projectionMatrix)
    out.x = (t2.x * 0.5 + 0.5) * size.width
    out.y = (-t2.y * 0.5 + 0.5) * size.height
    return true
  }
}
