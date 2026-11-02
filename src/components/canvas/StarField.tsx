import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useRenderProfile } from '@/hooks/useRenderProfile'
import { starTints } from '@/lib/tokens'
import { sky } from '@/lib/sky'

/**
 * Star backdrop — three depth layers (far / mid / near), one draw call each.
 *
 * Design intent: quiet. Most stars are tiny and dim; a handful are brighter. Depth comes from
 * parallax *difference* between layers, not from motion amount. Twinkle is a slow, shallow
 * brightness breathing on a minority of stars — never a flash.
 *
 * Total star count still comes solely from `useRenderProfile`.
 */

interface LayerSpec {
  /** Share of the profile's star count. */
  share: number
  /** Point size range in CSS px (soft-edged, so perceived size is a little smaller). */
  size: [number, number]
  /** Peak brightness multiplier for the layer. */
  gain: number
  /** Parallax multiplier: far layers barely move, near layers move most. */
  depth: number
  /** Fraction of stars in the layer that breathe, and how deep the breath is (0–1). */
  twinkle: { share: number; amount: number }
  /** Fraction of the layer pulled into a faint galactic-plane density band. */
  band: number
}

const LAYERS: LayerSpec[] = [
  { share: 0.68, size: [1.8, 2.8], gain: 1.1, depth: 0.35, twinkle: { share: 0.2, amount: 0.18 }, band: 0.4 },
  { share: 0.29, size: [2.2, 3.4], gain: 1.3, depth: 0.7, twinkle: { share: 0.3, amount: 0.22 }, band: 0.1 },
  { share: 0.03, size: [3.4, 5.0], gain: 1.6, depth: 1.25, twinkle: { share: 0.5, amount: 0.2 }, band: 0 },
]

// Motion constants (radians). Deliberately tiny; raise slowly if at all.
const DRIFT = 0.0025 // slow rotation, rad/s, scaled by depth
const SCROLL = 0.0001 // rad per scrolled px, scaled by depth
const CURSOR = 0.014 // max rad from cursor at centre→edge, scaled by depth
const FADE_IN_S = 2.4 // opening fade so the lazy chunk doesn't pop in

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute float aTw;
  uniform float uTime;
  uniform float uPx;
  uniform float uFade;
  varying vec3 vColor;
  void main() {
    // Slow, shallow breathing. Each star gets its own rate and phase.
    float rate = 0.3 + 0.35 * fract(aPhase * 1.7);
    float breath = 1.0 - aTw * (0.5 + 0.5 * sin(uTime * rate + aPhase));
    vColor = color * breath * uFade;
    gl_PointSize = aSize * uPx;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    // Tight core with a soft falloff: reads as a point of light, not a disc.
    float a = exp(-d * d * 3.0);
    gl_FragColor = vec4(vColor, a);
    #include <colorspace_fragment>
  }
`

/** Small deterministic PRNG so the sky is identical across reloads / hot-reloads. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rand: () => number) {
  // Box–Muller; one sample is enough here.
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(Math.PI * 2 * rand())
}

const BAND_TILT = new THREE.Euler(0.9, 0, -0.45)

function buildLayer(spec: LayerSpec, count: number, seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed)
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const size = new Float32Array(count)
  const phase = new Float32Array(count)
  const tw = new Float32Array(count)

  const v = new THREE.Vector3()
  const c = new THREE.Color()
  const neutral = new THREE.Color(starTints.neutral)
  const cool = new THREE.Color(starTints.cool)
  const warm = new THREE.Color(starTints.warm)

  for (let i = 0; i < count; i++) {
    const inBand = rand() < spec.band
    if (inBand) {
      // Faint density streak, like a distant galactic plane: uniform along the band, gaussian across.
      const theta = rand() * Math.PI * 2
      const lat = gaussian(rand) * 0.17
      v.set(Math.cos(theta) * Math.cos(lat), Math.sin(lat), Math.sin(theta) * Math.cos(lat)).applyEuler(BAND_TILT)
    } else {
      const u = rand() * 2 - 1
      const t = rand() * Math.PI * 2
      const s = Math.sqrt(1 - u * u)
      v.set(s * Math.cos(t), u, s * Math.sin(t))
    }
    v.multiplyScalar(60 + rand() * 40)
    pos.set([v.x, v.y, v.z], i * 3)

    // Magnitude: steep power law — plenty of faint stars, very few bright ones.
    const mag = Math.pow(rand(), 4)
    const b = (0.3 + mag * 0.7) * spec.gain * (inBand ? 0.75 : 1)
    // Faint stars are also smaller; bright stars earn their size.
    size[i] = spec.size[0] + (spec.size[1] - spec.size[0]) * (0.25 + 0.75 * mag) * (0.7 + 0.3 * rand())

    // Temperature: mostly near-white with a gentle lean cool or warm, never saturated.
    const k = rand()
    c.copy(neutral)
    if (k < 0.2) c.lerp(cool, 0.2 + 0.35 * rand())
    else if (k > 0.9) c.lerp(warm, 0.3 + 0.4 * rand())
    c.multiplyScalar(b)
    col.set([c.r, c.g, c.b], i * 3)

    phase[i] = rand() * Math.PI * 2 * 8
    tw[i] = rand() < spec.twinkle.share ? spec.twinkle.amount * (0.5 + 0.5 * rand()) : 0
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1))
  g.setAttribute('aTw', new THREE.BufferAttribute(tw, 1))
  // Stars surround the camera; never frustum-cull a layer.
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200)
  return g
}

function Stars({ count, animate, cursorParallax }: { count: number; animate: boolean; cursorParallax: boolean }) {
  const groups = useRef<(THREE.Object3D | null)[]>([])
  // The whole sky turns with the foreground camera when a chapter publishes a rotation (lib/sky); identity otherwise.
  const turn = useRef<THREE.Group>(null)
  // Normalised pointer (-1…1) as a raw target, plus smoothed values. Plain refs: no React state per frame.
  const pointer = useRef({ tx: 0, ty: 0, x: 0, y: 0, scroll: 0 })

  // Uniforms are shared by all three materials, so they are updated once per frame.
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPx: { value: 1 },
      // Reduced motion renders a single still frame, so it must start fully visible.
      uFade: { value: animate ? 0 : 1 },
    }),
    [animate],
  )

  const layers = useMemo(
    () =>
      LAYERS.map((spec, i) => {
        const geometry = buildLayer(spec, Math.max(1, Math.round(count * spec.share)), 1337 + i * 101)
        const material = new THREE.ShaderMaterial({
          uniforms,
          vertexShader: VERT,
          fragmentShader: FRAG,
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          depthTest: false,
          blending: THREE.AdditiveBlending,
        })
        return { spec, geometry, material }
      }),
    [count, uniforms],
  )

  useEffect(
    () => () => {
      layers.forEach((l) => {
        l.geometry.dispose()
        l.material.dispose()
      })
    },
    [layers],
  )

  useEffect(() => {
    if (!cursorParallax) return
    const p = pointer.current
    const onMove = (e: PointerEvent) => {
      p.tx = (e.clientX / window.innerWidth) * 2 - 1
      p.ty = (e.clientY / window.innerHeight) * 2 - 1
    }
    // Ease back to centre when the pointer leaves the window.
    const onLeave = () => {
      p.tx = 0
      p.ty = 0
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [cursorParallax])

  useFrame((state, dt) => {
    if (!animate) return
    // A long frame (tab was hidden) must not cause a visible jump.
    const step = Math.min(dt, 0.05)
    const t = state.clock.elapsedTime
    const p = pointer.current

    uniforms.uTime.value = t
    uniforms.uPx.value = state.viewport.dpr
    const f = Math.min(t / FADE_IN_S, 1)
    uniforms.uFade.value = f * f * (3 - 2 * f)

    // Heavy damping = the sky feels massive, not twitchy.
    p.x = THREE.MathUtils.damp(p.x, p.tx, 2.2, step)
    p.y = THREE.MathUtils.damp(p.y, p.ty, 2.2, step)
    p.scroll = THREE.MathUtils.damp(p.scroll, window.scrollY, 3, step)

    turn.current?.quaternion.copy(sky.q)

    for (let i = 0; i < layers.length; i++) {
      const g = groups.current[i]
      if (!g) continue
      const d = layers[i].spec.depth
      g.rotation.y = t * DRIFT * d - p.x * CURSOR * d
      g.rotation.x = p.scroll * SCROLL * d - p.y * CURSOR * d * 0.7
    }
  })

  return (
    <group ref={turn}>
      {layers.map((l, i) => (
        <points
          key={i}
          ref={(el) => {
            groups.current[i] = el
          }}
          geometry={l.geometry}
          material={l.material}
          frustumCulled={false}
        />
      ))}
    </group>
  )
}

/** Fixed, full-viewport star backdrop. Lazy-loaded from App; safe to reuse per-scene later. */
export default function StarField() {
  const { starCount, maxDpr, animate, cursorParallax } = useRenderProfile()
  return (
    <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
      <Canvas
        dpr={[1, maxDpr]}
        camera={{ fov: 60, position: [0, 0, 0.1] }}
        frameloop={animate ? 'always' : 'demand'}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
      >
        <Stars count={starCount} animate={animate} cursorParallax={cursorParallax} />
      </Canvas>
    </div>
  )
}
