import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { BlackHoleRenderer, DEFAULT_PARAMS, makeView, type BHParams, type BHTier } from './BlackHoleRenderer'
import { presentVert, presentFrag } from './shader'
import { WORLD_TO_GAL } from '../frames'

/**
 * <BlackHole /> - mounts the Kerr renderer INSIDE an existing R3F canvas (the journey's persistent canvas; no second WebGL context).
 * It never unmounts its renderer when hidden: set `visible={false}` (or alpha 0) and it stops tracing and draws nothing, but keeps its
 * render targets, shaders and textures (objects of inactive zones are hidden, never disposed).
 *
 * The caller (a zone, step 3; or the lab) provides where the camera is relative to the hole through `getPose()`, called every frame:
 *   posRg      camera position in HOLE-LOCAL cartesian coordinates, units of r_g (z = spin axis). Double precision: do the floating-origin
 *              subtraction yourself (camera world position minus hole world position, divided by metres-per-world-unit-per-r_g).
 *   camToHole  quaternion rotating camera space into hole-local space
 *   holeToWorld rotation of the hole frame in the world frame (to look up the Milky Way in the right direction)
 *   time       simulation time in r_g / c (rotates the disc pattern); beta optional observer velocity relative to its ZAMO (infall, step 3)
 * Presentation draws a full-screen quad at `renderOrder` (default just after the sky), no depth test, so it replaces the sky inside
 * its zone. Cross-fade with `alpha`.
 */
export interface BHPose { posRg: [number, number, number]; camToHole: THREE.Quaternion; holeToWorld: THREE.Quaternion; time: number; beta?: [number, number, number] }
export interface BlackHoleProps {
  sky: THREE.Texture
  noise: THREE.Texture
  params?: Partial<BHParams>
  tier?: BHTier
  /** 0 = use the tier's resolution scale */
  scale?: number
  alpha?: number
  visible?: boolean
  renderOrder?: number
  getPose: () => BHPose
  /** optional: receives the renderer (disc inner radius, timing, debug) */
  onReady?: (r: BlackHoleRenderer) => void
}

export function BlackHole({ sky, noise, params, tier = 'medium', scale = 0, alpha = 1, visible = true, renderOrder = -900, getPose, onReady }: BlackHoleProps) {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const poseRef = useRef(getPose); poseRef.current = getPose
  const prm = useRef<BHParams>({ ...DEFAULT_PARAMS }); prm.current = { ...DEFAULT_PARAMS, ...params }
  const renderer = useMemo(() => new BlackHoleRenderer(sky, noise), [sky, noise])
  const w2g = useMemo(() => new THREE.Matrix3().set(...(WORLD_TO_GAL as [number, number, number, number, number, number, number, number, number])), [])
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: presentVert, fragmentShader: presentFrag, depthTest: false, depthWrite: false, transparent: true,
    uniforms: { uTex: { value: null }, uAlpha: { value: 1 } },
  }), [])
  const geo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)); return g }, [])
  useEffect(() => { onReady?.(renderer) }, [renderer, onReady])
  useEffect(() => { renderer.tier = tier; renderer.scaleOverride = scale; renderer.refreshScale() }, [renderer, tier, scale])
  useEffect(() => { renderer.setSize(size.width * dpr, size.height * dpr) }, [renderer, size.width, size.height, dpr])
  useEffect(() => () => { renderer.dispose(); mat.dispose(); geo.dispose() }, [renderer, mat, geo])
  const tmp = useMemo(() => ({ m4: new THREE.Matrix4(), m3: new THREE.Matrix3(), q: new THREE.Quaternion() }), [])
  useFrame((state) => {
    if (!visible || alpha <= 0.001) return
    const p = poseRef.current()
    // hole -> galactic = world -> galactic * hole -> world
    tmp.m4.makeRotationFromQuaternion(p.holeToWorld)
    tmp.m3.setFromMatrix4(tmp.m4)
    const h2g = w2g.clone().multiply(tmp.m3)
    const pm = state.camera.projectionMatrix.elements // perspective: elements[0] = 1/tan(fovx/2), elements[5] = 1/tan(fovy/2)
    const view = makeView(p.posRg, p.camToHole, [1 / pm[0], 1 / pm[5]], h2g, p.time, p.beta)
    renderer.render(gl, prm.current, view)
    mat.uniforms.uTex.value = renderer.texture
  })
  mat.uniforms.uAlpha.value = alpha
  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={renderOrder} visible={visible && alpha > 0.001} />
}
