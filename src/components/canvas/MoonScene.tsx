import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useRenderProfile } from '@/hooks/useRenderProfile'
import { earthTints, moonTints } from '@/lib/tokens'
import { makeReliefTexture, requestMoonRelief } from '@/lib/moonRelief'
import { clockSeconds } from '@/lib/clock'
import {
  ATMOS_FRAG,
  ATMOS_VERT,
  ATMOSPHERE,
  FOV,
  PLANET_FRAG,
  PLANET_VERT,
  SPIN,
  SUN_END,
  TILT,
  YAW_START,
  YAW_SWEEP,
  distanceFor,
  earthFinalFraming,
} from '@/components/canvas/EarthScene'
import moonUrl from '@/assets/moon/moon-albedo.jpg'
// Same files (same URLs, same cache entries) as Chapter 01: nothing extra is downloaded for the Earth.
import dayUrl from '@/assets/earth/earth-day.jpg'
import nightUrl from '@/assets/earth/earth-night.jpg'
import oceanUrl from '@/assets/earth/earth-ocean.png'
import cloudsUrl from '@/assets/earth/earth-clouds.jpg'

/**
 * Chapter 02 — Moon.
 *
 * One scene holds both bodies. Earth sits at the origin exactly as Chapter 01 left it; the camera starts on
 * Chapter 01's final frame (same framing, tilt, yaw, sun), pulls back into a wide Earth + Moon shot, then
 * dollies in and settles on the near side. Camera and lens shift are the only things that move.
 *
 * Honest about scale: body sizes are true (Moon = 0.2727 Earth radii); the gap is compressed from 60.3 to
 * `GAP` Earth radii, otherwise the crossing would be minutes of empty black. The page says so.
 *
 * Physics we keep: the Moon is tidally locked (its near side faces Earth); the Sun is fixed in the world, so
 * Earth, Moon and Sun are in a consistent full-Moon geometry and the lit hemisphere is the real near side.
 * Only the Sun's direction eases a little (SUN_END → SUN_MOON) while Earth is a small dot, so the terminator
 * crosses the disc and the craters get long shadows.
 *
 * Surface: the albedo map plus a runtime-generated crater relief (lib/lunarDetail.ts), lit with a
 * Lommel–Seeliger/Lambert blend (the Moon has no limb darkening and no atmosphere → hard terminator).
 * Draw calls: Moon 1, Earth 2.
 */

export const RM = 0.2727 // Moon radius in Earth radii
const GAP = 14 // Earth–Moon distance in Earth radii (real: 60.3)
export const KM = 384_400 // real distance, shown in the readout
const BEARING = THREE.MathUtils.degToRad(30) // Moon's direction in the x–z plane; sets which longitude faces us
export const MOON_POS = new THREE.Vector3(GAP * Math.cos(BEARING), GAP * 0.03, -GAP * Math.sin(BEARING))
export const WIDE = new THREE.Vector3(6, 2, 20) // wide-shot camera position: both bodies in frame, seen a little from above
export const SUN_MOON = new THREE.Vector3(-0.96, 0.22, 0.17).normalize()
export const MOON_YAW = Math.PI + BEARING // puts selenographic lon 0 (the middle of the map) towards Earth
const ARRIVAL_PX = 0.66 // Moon's final radius in half-viewport-heights (before the narrow-screen clamp)

// Scroll windows (of chapter progress). Phase 1: Earth recedes to the wide shot. Phase 2: dolly in on the Moon.
// Their lengths are in proportion to the log of the distance each one covers (≈ ln 4 : ln 18), so the perceived
// zoom speed is the same on both sides of the wide shot: no stall, no lurch.
const TRAVEL_A = 0.02
export const PHASE_1_END = 0.28
export const TRAVEL_B = 0.88
export const CURSOR = 0.02

const smooth01 = (x: number) => x * x * (3 - 2 * x)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
/** Eases in from rest, leaves at unit speed (so it can hand over to `easeOut` without a speed jump). */
const easeIn = (x: number) => x * x * (2 - x)
/** Arrives at rest, enters at unit speed. */
const easeOut = (x: number) => x + x * x - x * x * x

export interface MoonRig {
  pos: THREE.Vector3
  /** Lens shift in half-viewport-heights (x right, y up). Cursor offset included. */
  cx: number
  cy: number
  /** 0 = Chapter 01's frame, 0.5 = the wide shot, 1 = arrival at the Moon. */
  u: number
}

const rigScratch = { p0: new THREE.Vector3(), p2: new THREE.Vector3(), c: new THREE.Vector3(), q: new THREE.Vector3() }

/**
 * The chapter's whole camera path as a pure function of (damped) chapter progress `s`.
 * Used by this chapter every frame, and by Chapter 03, which replays it backwards so the Moon pulls away along the
 * exact route it arrived by. The camera never rotates; only its position and lens shift change.
 * `px`/`py` are the damped pointer (-1…1); pass 0 when there is none.
 */
export function moonRig(s: number, aspect: number, px: number, py: number, out: MoonRig) {
  const { p0, p2, c, q } = rigScratch
  const eFrame = earthFinalFraming(aspect)
  const portrait = aspect < 0.9
  const rMoon = Math.min(ARRIVAL_PX, aspect * (portrait ? 0.7 : 0.82)) // portrait: fit the band between header and facts

  // Start = Chapter 01's last camera; end = arrival at the Moon's near side; the wide shot is the midpoint.
  p0.set(0, 0, distanceFor(eFrame.r))
  p2.copy(MOON_POS).add(q.set(0, 0, RM * distanceFor(rMoon)))
  const dEarth0 = p0.length()
  const dEarthW = WIDE.length()
  const dMoonW = q.copy(WIDE).sub(MOON_POS).length()
  const dMoonEnd = RM * distanceFor(rMoon)

  // Zoom at a constant rate on each side (geometric in distance): Earth shrinks, then the Moon swells.
  let u: number
  if (s < PHASE_1_END) {
    const g = easeIn(clamp01((s - TRAVEL_A) / (PHASE_1_END - TRAVEL_A)))
    const dist = dEarth0 * Math.pow(dEarthW / dEarth0, g)
    u = 0.5 * ((dist - dEarth0) / (dEarthW - dEarth0))
  } else {
    // A little front-loaded (the exponent) so the Moon is already a presence by the middle of the chapter.
    const g = 1 - Math.pow(1 - easeOut(clamp01((s - PHASE_1_END) / (TRAVEL_B - PHASE_1_END))), 1.3)
    const dist = dMoonW * Math.pow(dMoonEnd / dMoonW, g)
    u = 0.5 + 0.5 * ((dMoonW - dist) / (dMoonW - dMoonEnd))
  }
  u = clamp01(u)

  // Path: quadratic Bézier through the wide shot, so the two phases join without a corner.
  c.copy(WIDE).multiplyScalar(2).addScaledVector(p0, -0.5).addScaledVector(p2, -0.5)
  const a = (1 - u) * (1 - u)
  const b = 2 * (1 - u) * u
  const d = u * u
  out.pos.set(0, 0, 0).addScaledVector(p0, a).addScaledVector(c, b).addScaledVector(p2, d)

  // Lens shift: composition of Chapter 01's globe at the ends; centred through the wide shot so both bodies fit.
  const wide = Math.sin(Math.PI * u) ** 2
  const cyEnd = portrait ? 0.26 : 0 // the Moon's final height; Earth's at the start, for continuity
  out.cx = eFrame.cx * (1 - wide) + px * CURSOR
  out.cy = THREE.MathUtils.lerp(eFrame.cy, cyEnd, smooth01(u)) * (1 - wide) + 0.25 * wide - py * CURSOR
  out.u = u
}

export const MOON_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vT;
  varying vec3 vB;
  varying vec3 vP;
  void main() {
    vUv = uv;
    vec3 n = normal;                                   // object-space unit normal == direction from centre
    vec3 t = vec3(n.z, 0.0, -n.x);                     // east (increasing u) on three's SphereGeometry
    t /= max(length(t), 1e-4);
    mat3 m = mat3(modelMatrix);
    vN = normalize(m * n);
    vT = normalize(m * t);
    vB = cross(vN, vT);                                // north
    vec4 w = modelMatrix * vec4(position, 1.0);
    vP = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

export const MOON_FRAG = /* glsl */ `
  uniform sampler2D uAlb;
  uniform sampler2D uNrm;
  uniform vec3 uSun;
  uniform vec3 uMare;
  uniform vec3 uHigh;
  uniform vec3 uRim;
  uniform float uDetail;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vT;
  varying vec3 vB;
  varying vec3 vP;

  // Stored RG is a unit tangent-space normal's xy; turn it into a slope we can add.
  vec2 slope(vec2 rg) {
    vec2 t = rg * 2.0 - 1.0;
    return t / sqrt(max(1.0 - dot(t, t), 0.04));
  }

  void main() {
    vec3 Ng = normalize(vN);
    vec3 T = normalize(vT);
    vec3 B = normalize(vB);
    vec3 V = normalize(cameraPosition - vP);
    vec3 L = normalize(uSun);

    // Relief: the big generated map plus a finer tiling of it, both fading in once generated.
    vec2 s = slope(texture2D(uNrm, vUv).rg) * 1.5
           + slope(texture2D(uNrm, vUv * 6.0 + vec2(0.37, 0.11)).rg) * 0.55;
    vec3 N = normalize(Ng + (T * s.x + B * s.y) * uDetail);

    // Albedo: the map is mid-grey; real regolith is dark. Stretch contrast, tint maria cool / highlands warm.
    float a = texture2D(uAlb, vUv).r;
    vec3 alb = pow(a, 3.0) * 2.4 * mix(uMare, uHigh, smoothstep(0.36, 0.62, a));

    // Lommel–Seeliger (no limb darkening) blended with Lambert for shadow contrast.
    float mu0 = max(dot(N, L), 0.0);
    float mu = max(dot(N, V), 0.02);
    float refl = mix(mu0, 2.0 * mu0 / (mu0 + mu), 0.6);
    float terminator = smoothstep(-0.015, 0.04, dot(Ng, L)); // no air: the shadow edge is sharp
    vec3 col = alb * refl * terminator;

    col += alb * 0.004;                                  // a trace of scattered light so the night side is not a hole
    float fres = pow(1.0 - max(dot(Ng, V), 0.0), 3.0);
    col += uRim * fres * 0.018;                          // faint cool rim: the unlit limb still reads against space

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

interface Marker {
  el: HTMLElement
  /** Unit vector in the Moon's object space (three's SphereGeometry layout). */
  dir: THREE.Vector3
}

export function surfaceDir(latDeg: number, lonDeg: number) {
  const lat = THREE.MathUtils.degToRad(latDeg)
  const phi = (0.5 + lonDeg / 360) * Math.PI * 2 // u = 0.5 at lon 0
  return new THREE.Vector3(-Math.cos(phi) * Math.cos(lat), Math.sin(lat), Math.sin(phi) * Math.cos(lat))
}

interface SceneProps {
  progress: RefObject<number>
  animate: boolean
  cursorParallax: boolean
  tier: 'low' | 'high'
  readout: RefObject<HTMLElement | null>
  markerLayer: RefObject<HTMLElement | null>
  onReady: () => void
}

function EarthAndMoon({ progress, animate, cursorParallax, tier, readout, markerLayer, onReady }: SceneProps) {
  const high = tier === 'high'
  const invalidate = useThree((s) => s.invalidate)
  const [moonMap, day, night, ocean, clouds] = useLoader(THREE.TextureLoader, [moonUrl, dayUrl, nightUrl, oceanUrl, cloudsUrl])
  const earth = useRef<THREE.Mesh>(null)
  const moon = useRef<THREE.Mesh>(null)
  const state = useRef({
    s: animate ? 0 : 1,
    px: 0,
    py: 0,
    tx: 0,
    ty: 0,
    detail: 0,
    detailReady: false,
    lastKm: -1,
    markers: [] as Marker[],
  })
  const scratch = useMemo(
    () => ({
      rig: { pos: new THREE.Vector3(), cx: 0, cy: 0, u: 0 } as MoonRig,
      v: new THREE.Vector3(),
      n: new THREE.Vector3(),
      q: new THREE.Vector3(),
      sun: new THREE.Vector3(),
    }),
    [],
  )

  // Colour maps are sRGB; the Moon's albedo is treated as data (the shader applies its own curve).
  useMemo(() => {
    day.colorSpace = THREE.SRGBColorSpace
    night.colorSpace = THREE.SRGBColorSpace
    clouds.wrapS = THREE.RepeatWrapping
    ;[day, night, ocean, clouds, moonMap].forEach((t) => {
      t.anisotropy = 4
    })
  }, [day, night, ocean, clouds, moonMap])

  const flat = useMemo(() => {
    const t = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, THREE.RGBAFormat)
    t.needsUpdate = true
    return t
  }, [])

  const uniforms = useMemo(
    () => ({
      earth: {
        uDay: { value: day },
        uNight: { value: night },
        uOcean: { value: ocean },
        uClouds: { value: clouds },
        uSun: { value: SUN_END.clone() },
        uAtm: { value: new THREE.Color(earthTints.atmosphere) },
        uTwi: { value: new THREE.Color(earthTints.twilight) },
        uCity: { value: new THREE.Color(earthTints.cityLight) },
        uShift: { value: 0 },
      },
      atmos: {
        uSun: { value: SUN_END.clone() },
        uAtm: { value: new THREE.Color(earthTints.atmosphere) },
        uTwi: { value: new THREE.Color(earthTints.twilight) },
        uTop: { value: ATMOSPHERE },
      },
      moon: {
        uAlb: { value: moonMap },
        uNrm: { value: flat as THREE.Texture },
        uSun: { value: SUN_END.clone() },
        uMare: { value: new THREE.Color(moonTints.mare) },
        uHigh: { value: new THREE.Color(moonTints.highland) },
        uRim: { value: new THREE.Color(moonTints.rim) },
        uDetail: { value: 0 },
      },
    }),
    [day, night, ocean, clouds, moonMap, flat],
  )

  useEffect(() => {
    onReady()
  }, [onReady])

  // Crater relief: built once per page (lib/moonRelief) and shared with Chapter 03; swapped in when it lands.
  useEffect(() => {
    let tex: THREE.DataTexture | null = null
    const cancel = requestMoonRelief(moonMap, high, (rgba) => {
      tex = makeReliefTexture(rgba, high)
      uniforms.moon.uNrm.value = tex
      state.current.detailReady = true
      invalidate()
    })
    return () => {
      cancel()
      if (tex) tex.dispose()
    }
  }, [moonMap, high, uniforms, invalidate])

  // Surface markers live in the DOM (ChapterMoon); we only move and fade them.
  useEffect(() => {
    const layer = markerLayer.current
    if (!layer) return
    state.current.markers = Array.from(layer.querySelectorAll<HTMLElement>('[data-lat]')).map((el) => ({
      el,
      dir: surfaceDir(Number(el.dataset.lat), Number(el.dataset.lon)).multiplyScalar(RM),
    }))
    invalidate()
  }, [markerLayer, invalidate])

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
    const { rig, v, n, q, sun } = scratch
    const step = Math.min(dt, 0.05)
    const t = clockSeconds()
    const { camera, size } = frame
    const cam = camera as THREE.PerspectiveCamera

    st.s = animate ? THREE.MathUtils.damp(st.s, progress.current ?? 0, 3.5, step) : 1
    st.px = THREE.MathUtils.damp(st.px, st.tx, 2.2, step)
    st.py = THREE.MathUtils.damp(st.py, st.ty, 2.2, step)
    st.detail = THREE.MathUtils.damp(st.detail, st.detailReady ? 1 : 0, 1.6, step)

    const aspect = size.width / size.height
    moonRig(st.s, aspect, st.px, st.py, rig)
    const u = rig.u

    cam.position.copy(rig.pos)
    cam.lookAt(rig.pos.x, rig.pos.y, rig.pos.z - 1) // translation only: the camera never rotates
    cam.setViewOffset(size.width, size.height, (-rig.cx * size.height) / 2, (rig.cy * size.height) / 2, size.width, size.height)
    cam.updateMatrixWorld()

    // Sun eases while Earth is small.
    sun.lerpVectors(SUN_END, SUN_MOON, smooth01(clamp01(u / 0.45))).normalize()
    uniforms.earth.uSun.value.copy(sun)
    uniforms.atmos.uSun.value.copy(sun)
    uniforms.moon.uSun.value.copy(sun)
    uniforms.moon.uDetail.value = st.detail
    uniforms.earth.uShift.value = animate ? t * 0.0006 : 0

    if (earth.current) earth.current.rotation.y = YAW_START + YAW_SWEEP + (animate ? t * SPIN : 0)
    if (moon.current) {
      // Tidally locked; only a faint libration so the limb is never perfectly still.
      moon.current.rotation.y = MOON_YAW + (animate ? Math.sin(t * 0.07) * 0.012 : 0)
      moon.current.updateWorldMatrix(true, false)
    }

    // Distance readout: real km, linear in the camera's travel (0 at Chapter 01's frame, 384,400 on arrival). Written only when it changes.
    const el = readout.current
    if (el) {
      const km = u > 0.999 ? KM : Math.round((KM * u) / 1000) * 1000
      if (km !== st.lastKm) {
        st.lastKm = km
        el.textContent = km.toLocaleString('en-US')
      }
    }

    // Surface markers: project, then fade by facing, light and the end of the journey.
    if (st.markers.length && moon.current) {
      const appear = smooth01(clamp01((st.s - 0.86) / 0.08))
      for (const m of st.markers) {
        v.copy(m.dir)
        moon.current.localToWorld(v)
        n.copy(v).sub(MOON_POS).normalize()
        const facing = n.dot(q.copy(cam.position).sub(v).normalize())
        const lit = n.dot(sun)
        v.project(cam)
        const o = appear * smooth01(clamp01((facing - 0.18) / 0.3)) * smooth01(clamp01((lit - 0.04) / 0.2))
        m.el.style.opacity = o.toFixed(3)
        m.el.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * size.height).toFixed(1)}px, 0)`
      }
    }
  })

  const seg = high ? 128 : 80
  return (
    <>
      <group rotation={[0, 0, -TILT]}>
        <mesh ref={earth}>
          <sphereGeometry args={[1, high ? 96 : 64, high ? 96 : 64]} />
          <shaderMaterial uniforms={uniforms.earth} vertexShader={PLANET_VERT} fragmentShader={PLANET_FRAG} />
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
      <mesh ref={moon} position={MOON_POS}>
        <sphereGeometry args={[RM, seg, seg]} />
        <shaderMaterial uniforms={uniforms.moon} vertexShader={MOON_VERT} fragmentShader={MOON_FRAG} />
      </mesh>
    </>
  )
}

interface Props {
  /** Scroll progress through the chapter (0 → 1). Owned by the section, read here every frame. */
  progress: RefObject<number>
  /** False when the chapter is off-screen: the render loop idles. */
  active: boolean
  /** Element whose text is replaced with the live Earth→Moon distance (km). */
  readout: RefObject<HTMLElement | null>
  /** Element containing `[data-lat][data-lon]` surface markers, positioned over the canvas. */
  markerLayer: RefObject<HTMLElement | null>
  onReady: () => void
}

/** Chapter 02 canvas. Lazy-loaded from `ChapterMoon`; transparent, so the global StarField shows behind. */
export default function MoonScene({ progress, active, readout, markerLayer, onReady }: Props) {
  const { tier, maxDpr, animate, cursorParallax } = useRenderProfile()
  return (
    <Canvas
      dpr={[1, maxDpr]}
      camera={{ fov: FOV, near: 0.05, far: 300, position: [0, 0, 6] }}
      frameloop={active && animate ? 'always' : 'demand'}
      gl={{ antialias: tier === 'high', powerPreference: 'high-performance', alpha: true }}
    >
      <EarthAndMoon
        progress={progress}
        animate={animate}
        cursorParallax={cursorParallax}
        tier={tier}
        readout={readout}
        markerLayer={markerLayer}
        onReady={onReady}
      />
    </Canvas>
  )
}
