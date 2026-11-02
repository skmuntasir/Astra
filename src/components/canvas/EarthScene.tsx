import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { useRenderProfile } from '@/hooks/useRenderProfile'
import { earthTints } from '@/lib/tokens'
import { clockSeconds } from '@/lib/clock'
import dayUrl from '@/assets/earth/earth-day.jpg'
import nightUrl from '@/assets/earth/earth-night.jpg'
import oceanUrl from '@/assets/earth/earth-ocean.png'
import cloudsUrl from '@/assets/earth/earth-clouds.jpg'

/**
 * Chapter 01 — Earth, seen from orbit.
 *
 * Two draw calls: the planet (one shader: day map, night lights, ocean glint, clouds + cloud shadows,
 * limb haze) and an atmosphere shell (analytic ray-vs-sphere glow, drawn only outside the limb).
 * No post-processing, no lights, no per-frame allocation.
 *
 * Story, driven by scroll `progress` (0 → 1): we begin on the night-side limb — the same faint horizon the
 * hero ends on — then the camera pulls back while the sun swings round, sweeping the terminator across the
 * planet until the whole globe sits in frame, lit from the left.
 *
 * Framing uses a lens shift (`setViewOffset`), so the planet stays a perfect circle wherever it sits.
 * Textures: NASA Blue Marble / Black Marble derivatives, see PROJECT_STATUS.md §14.
 */

export const FOV = 32
export const TAN_HALF = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
export const TILT = THREE.MathUtils.degToRad(23.44) // axial tilt
export const ATMOSPHERE = 1.09 // shell radius (Earth = 1); exaggerated for the screen, real is ~1.016

// Sun direction (towards the sun) at the start and end of the sequence.
const SUN_START = new THREE.Vector3(-0.6, 0.25, -0.76).normalize() // behind the limb: dawn rim only
export const SUN_END = new THREE.Vector3(-0.78, 0.3, 0.55).normalize() // from the left, slightly front-on

// Globe radius in half-viewport-heights. Start: a huge limb arc. End: whole globe.
const R_START = 2.3
export const SPIN = 0.012 // rad/s, far faster than reality on purpose; barely perceptible
export const YAW_START = 2.5 // chosen so Africa / the Indian Ocean face the camera at the end (tune by eye)
export const YAW_SWEEP = 0.9 // extra rotation driven by scroll
const CURSOR = 0.02 // lens-shift from the pointer, in half-heights

const smooth = (x: number) => x * x * (3 - 2 * x)

/** Camera distance (Earth radius = 1) at which the globe has radius `r` half-viewport-heights on screen. */
export function distanceFor(r: number) {
  const tanA = r * TAN_HALF
  return Math.sqrt(1 + tanA * tanA) / tanA // = 1 / sin(atan(tanA))
}

/**
 * The finished composition (globe radius and lens shift, in half-viewport-heights). Shared with Chapter 02,
 * whose opening frame must match this exactly so the camera move is continuous across the two chapters.
 */
export function earthFinalFraming(aspect: number) {
  const portrait = aspect < 0.9
  return {
    r: Math.min(0.7, aspect * 0.86),
    cx: portrait ? 0 : 0.4 * aspect,
    cy: portrait ? 0.3 : 0,
  }
}

export const PLANET_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vP;
  void main() {
    vUv = uv;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vP = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

export const PLANET_FRAG = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uOcean;
  uniform sampler2D uClouds;
  uniform vec3 uSun;
  uniform vec3 uAtm;
  uniform vec3 uTwi;
  uniform vec3 uCity;
  uniform float uShift;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vP;
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vP);
    vec3 L = normalize(uSun);
    float ndl = dot(N, L);
    float day = smoothstep(-0.10, 0.22, ndl);        // soft terminator
    float diff = pow(max(ndl, 0.0), 0.85);

    vec3 alb = texture2D(uDay, vUv).rgb;
    float ocean = texture2D(uOcean, vUv).r;
    vec2 cuv = vUv + vec2(uShift, 0.0);              // clouds drift against the surface
    float cl = texture2D(uClouds, cuv).r;
    float sh = texture2D(uClouds, cuv + vec2(-0.0016, -0.0010)).r; // cheap cloud shadow
    alb *= 1.0 - 0.16 * sh * (1.0 - cl);

    // Sunlit surface, warmed slightly right at the terminator.
    float twi = smoothstep(-0.02, 0.08, ndl) * (1.0 - smoothstep(0.08, 0.32, ndl));
    vec3 lit = alb * (1.25 * diff);
    lit *= mix(vec3(1.0), uTwi, twi * 0.5);

    // Ocean sun-glint.
    vec3 H = normalize(L + V);
    float glint = pow(max(dot(N, H), 0.0), 320.0) * ocean * (1.0 - cl) * 0.2;
    lit += vec3(1.0, 0.96, 0.9) * glint * day;

    // Clouds: bright when lit, near-invisible at night.
    vec3 cloudLit = vec3(1.02) * (0.05 + 1.15 * diff);
    lit = mix(lit, cloudLit, cl * 0.8);

    // Night: faint earthshine on the land, city lights (dimmed by cloud).
    float night = 1.0 - day;
    vec3 dark = alb * vec3(0.012, 0.018, 0.030);
    vec3 lights = texture2D(uNight, vUv).rgb * uCity * 2.4 * (1.0 - cl * 0.7);

    vec3 col = lit * day + dark * night + lights * night * night;

    // Limb haze: thin blue veil across the edge, strongest on the sunlit side.
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    float sunLit = smoothstep(-0.25, 0.5, ndl);
    col += uAtm * fres * sunLit * 0.9;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

export const ATMOS_VERT = /* glsl */ `
  varying vec3 vP;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vP = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

// Back faces of a slightly larger sphere. For each pixel we find how high the view ray passes above the
// surface and glow accordingly: a bright hairline at the limb that fades smoothly to nothing.
export const ATMOS_FRAG = /* glsl */ `
  uniform vec3 uSun;
  uniform vec3 uAtm;
  uniform vec3 uTwi;
  uniform float uTop;
  varying vec3 vP;
  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vP - ro);
    float tc = -dot(ro, rd);
    vec3 pc = ro + rd * tc;                          // closest point of the ray to the planet centre
    float b = length(pc);
    if (b < 1.0) discard;
    float a = clamp((b - 1.0) / (uTop - 1.0), 0.0, 1.0);
    float I = pow(1.0 - a, 3.6);

    vec3 L = normalize(uSun);
    float ndl = dot(pc / b, L);
    float lit = smoothstep(-0.3, 0.45, ndl);
    float tw = smoothstep(-0.1, 0.1, ndl) * (1.0 - smoothstep(0.1, 0.4, ndl));
    vec3 c = mix(uAtm, uTwi, tw * 0.6);
    float mie = pow(max(dot(rd, L), 0.0), 10.0);     // forward scatter: sunrise flare behind the limb

    float k = I * lit * (0.9 + 2.2 * mie);
    gl_FragColor = vec4(c, k);
    #include <colorspace_fragment>
  }
`

interface SceneProps {
  progress: RefObject<number>
  animate: boolean
  cursorParallax: boolean
  segments: number
  onReady: () => void
}

function Earth({ progress, animate, cursorParallax, segments, onReady }: SceneProps) {
  const [day, night, ocean, clouds] = useLoader(THREE.TextureLoader, [dayUrl, nightUrl, oceanUrl, cloudsUrl])
  const planet = useRef<THREE.Mesh>(null)
  const state = useRef({ s: animate ? 0 : 1, px: 0, py: 0, tx: 0, ty: 0 })

  // Colour textures are sRGB; masks stay linear. Set before the first upload.
  useMemo(() => {
    day.colorSpace = THREE.SRGBColorSpace
    night.colorSpace = THREE.SRGBColorSpace
    clouds.wrapS = THREE.RepeatWrapping
    ;[day, night, ocean, clouds].forEach((t) => {
      t.anisotropy = 4
    })
  }, [day, night, ocean, clouds])

  const uniforms = useMemo(
    () => ({
      planet: {
        uDay: { value: day },
        uNight: { value: night },
        uOcean: { value: ocean },
        uClouds: { value: clouds },
        uSun: { value: SUN_START.clone() },
        uAtm: { value: new THREE.Color(earthTints.atmosphere) },
        uTwi: { value: new THREE.Color(earthTints.twilight) },
        uCity: { value: new THREE.Color(earthTints.cityLight) },
        uShift: { value: 0 },
      },
      atmos: {
        uSun: { value: SUN_START.clone() },
        uAtm: { value: new THREE.Color(earthTints.atmosphere) },
        uTwi: { value: new THREE.Color(earthTints.twilight) },
        uTop: { value: ATMOSPHERE },
      },
    }),
    [day, night, ocean, clouds],
  )

  useEffect(() => {
    onReady()
  }, [onReady])

  useEffect(() => {
    if (!cursorParallax) return
    const p = state.current
    const move = (e: PointerEvent) => {
      p.tx = (e.clientX / window.innerWidth) * 2 - 1
      p.ty = (e.clientY / window.innerHeight) * 2 - 1
    }
    const leave = () => {
      p.tx = 0
      p.ty = 0
    }
    window.addEventListener('pointermove', move, { passive: true })
    document.documentElement.addEventListener('pointerleave', leave)
    return () => {
      window.removeEventListener('pointermove', move)
      document.documentElement.removeEventListener('pointerleave', leave)
    }
  }, [cursorParallax])

  useFrame((frame, dt) => {
    const st = state.current
    const step = Math.min(dt, 0.05)
    const t = clockSeconds() // page-wide clock: Chapter 02 shows the same Earth and must agree on its pose
    const { camera, size } = frame
    const cam = camera as THREE.PerspectiveCamera

    // Heavily damped so scrolling feels like a camera move, not a scrub.
    st.s = animate ? THREE.MathUtils.damp(st.s, progress.current ?? 0, 3.5, step) : 1
    st.px = THREE.MathUtils.damp(st.px, st.tx, 2.2, step)
    st.py = THREE.MathUtils.damp(st.py, st.ty, 2.2, step)
    const e = smooth(st.s)

    // Composition: desktop puts the globe right of centre (text on the left); portrait centres it high.
    const aspect = size.width / size.height
    const end = earthFinalFraming(aspect)
    const rEnd = end.r
    // Zoom at a constant rate (geometric in radius): linear distance would hold the huge limb far too long.
    const r = R_START * Math.pow(rEnd / R_START, e)
    const d = distanceFor(r)
    const cx0 = 0.48 * aspect // continues the hero's horizon, which sits at ~74% of the width
    const cx1 = end.cx
    const cy0 = -0.42 - R_START // limb apex ~ 21% up from the bottom edge
    const cy1 = end.cy
    const cx = THREE.MathUtils.lerp(cx0, cx1, e) + st.px * CURSOR
    const cy = THREE.MathUtils.lerp(cy0, cy1, e) - st.py * CURSOR

    cam.position.set(0, 0, d)
    cam.lookAt(0, 0, 0)
    cam.setViewOffset(size.width, size.height, (-cx * size.height) / 2, (cy * size.height) / 2, size.width, size.height)

    // Sun swings from behind the limb to the front-left; the terminator sweeps across the globe.
    const sun = uniforms.planet.uSun.value.lerpVectors(SUN_START, SUN_END, e).normalize()
    uniforms.atmos.uSun.value.copy(sun)

    uniforms.planet.uShift.value = animate ? t * 0.0006 : 0
    if (planet.current) {
      planet.current.rotation.y = YAW_START + e * YAW_SWEEP + (animate ? t * SPIN : 0)
    }
  })

  return (
    <group rotation={[0, 0, -TILT]}>
      <mesh ref={planet}>
        <sphereGeometry args={[1, segments, segments]} />
        <shaderMaterial uniforms={uniforms.planet} vertexShader={PLANET_VERT} fragmentShader={PLANET_FRAG} />
      </mesh>
      <mesh>
        <sphereGeometry args={[ATMOSPHERE, 64, 64]} />
        <shaderMaterial
          uniforms={uniforms.atmos}
          vertexShader={ATMOS_VERT}
          fragmentShader={ATMOS_FRAG}
          side={THREE.BackSide}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  )
}

interface Props {
  /** Scroll progress through the chapter (0 → 1). Owned by the section, read here every frame. */
  progress: RefObject<number>
  /** False when the chapter is off-screen: the render loop idles. */
  active: boolean
  onReady: () => void
}

/** Chapter 01 canvas. Lazy-loaded from `ChapterEarth`; transparent, so the global StarField shows behind. */
export default function EarthScene({ progress, active, onReady }: Props) {
  const { tier, maxDpr, animate, cursorParallax } = useRenderProfile()
  const high = tier === 'high'
  return (
    <Canvas
      dpr={[1, maxDpr]}
      camera={{ fov: FOV, near: 0.1, far: 50, position: [0, 0, 6] }}
      frameloop={active && animate ? 'always' : 'demand'}
      gl={{ antialias: high, powerPreference: 'high-performance', alpha: true }}
    >
      <Earth
        progress={progress}
        animate={animate}
        cursorParallax={cursorParallax}
        segments={high ? 96 : 64}
        onReady={onReady}
      />
    </Canvas>
  )
}
