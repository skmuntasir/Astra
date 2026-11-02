import { Suspense, useEffect, useMemo, useRef, type RefObject } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useRenderProfile } from '@/hooks/useRenderProfile'
import { earthTints, moonTints, solarTints } from '@/lib/tokens'
import { clockSeconds } from '@/lib/clock'
import { sky } from '@/lib/sky'
import { makeReliefTexture, requestMoonRelief } from '@/lib/moonRelief'
import { PLANETS, SUN_RADIUS, eclipticFrame, orbitRadius, planetPosition } from '@/lib/solarSystem'
import {
  ATMOS_FRAG,
  ATMOS_VERT,
  ATMOSPHERE,
  FOV,
  PLANET_FRAG,
  PLANET_VERT,
  SPIN,
  TAN_HALF,
  TILT,
  YAW_START,
  YAW_SWEEP,
} from '@/components/canvas/EarthScene'
import {
  CURSOR,
  MOON_FRAG,
  MOON_POS,
  MOON_VERT,
  MOON_YAW,
  PHASE_1_END,
  RM,
  SUN_MOON,
  TRAVEL_B,
  WIDE,
  moonRig,
  surfaceDir,
  type MoonRig,
} from '@/components/canvas/MoonScene'
import moonUrl from '@/assets/moon/moon-albedo.jpg'
import dayUrl from '@/assets/earth/earth-day.jpg'
import nightUrl from '@/assets/earth/earth-night.jpg'
import oceanUrl from '@/assets/earth/earth-ocean.png'
import cloudsUrl from '@/assets/earth/earth-clouds.jpg'

/**
 * Chapter 03 — Solar System: the opening.
 *
 * One scene, one continuous camera move, in three acts (scroll progress `s` of the chapter):
 *   1. The Moon pulls away. The camera replays Chapter 02's arrival path in reverse (`moonRig`), so the first frame IS
 *      Chapter 02's last frame, and the Moon leaves by the route it came, back to the wide Earth + Moon shot.
 *   2. The pull-back. The camera retreats along the line away from the Sun, turning to face it: Earth and Moon shrink
 *      into the foreground, the Sun swings in from the left (huge, then shrinking), and the camera climbs above the
 *      ecliptic.
 *   3. The system. Orbits draw in from Mercury outward, the planets are labelled in order, and the camera settles on a
 *      tilted overview with the Sun at its heart.
 *
 * Scale is honest, not literal (see lib/solarSystem.ts): sizes true, order true, distances compressed (√ scale).
 * Draw calls: Earth 2 + Moon 1 (only while animating) + Sun 2 + planets 1 + Saturn's ring 1 + orbits 1.
 */

// ── Timeline (chapter progress). Chapter 02's last frame is s = 0. ChapterSolarSystem schedules its text beats and
// labels against these same numbers (kept in step by hand: importing them would pull this scene out of its lazy chunk).
const T = { p1a: 0.05, p1b: 0.27, p2a: 0.33, p2b: 0.84 }

const smooth01 = (x: number) => x * x * (3 - 2 * x)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const remap = (x: number, a: number, b: number) => clamp01((x - a) / (b - a))

// ── World
const FRAME = eclipticFrame(SUN_MOON)
const SUN_POS = FRAME.sunPos
const NEPTUNE_R = orbitRadius(PLANETS[PLANETS.length - 1].au)
const E_REF = new THREE.Vector3(6, 2, -3.5) // what the camera keeps looking at while it first pulls back
const R1 = WIDE.distanceTo(E_REF) // 23.5: WIDE sits exactly R1 behind E_REF along +z
const Z = new THREE.Vector3(0, 0, 1)
const Y = new THREE.Vector3(0, 1, 0)

// ── Final composition (tune here)
const FIT = 0.74 // nominal fraction of the half-width Neptune's orbit spans (perspective makes the near side larger)
const ELEV = THREE.MathUtils.degToRad(23) // camera elevation above the ecliptic (landscape)
const ELEV_PORTRAIT = THREE.MathUtils.degToRad(44)
const AZIMUTH = THREE.MathUtils.degToRad(-24) // swing round the Sun's axis so Earth is not dead centre below it
const SWING = [0.26, 0.8] as const // part of the pull-back (0…1) during which the camera arcs round
const TURN = [0.2, 0.7] as const // …and during which it turns from the Earth–Moon pair to the Sun
const MIN_PX = 1.6 // smallest planet marker radius, CSS px

interface Pose {
  pos: THREE.Vector3
  target: THREE.Vector3
  up: THREE.Vector3
  cx: number
  cy: number
  near: number
  far: number
}

const sc = {
  rig: { pos: new THREE.Vector3(), cx: 0, cy: 0, u: 0 } as MoonRig,
  cEnd: new THREE.Vector3(),
  v: new THREE.Vector3(),
  dir: new THREE.Vector3(),
  q: new THREE.Quaternion(),
  qa: new THREE.Quaternion(),
  m: new THREE.Matrix4(),
  idq: new THREE.Quaternion(),
}

/** The whole camera as a pure function of (damped) chapter progress. */
function solarPose(s: number, aspect: number, px: number, py: number, out: Pose) {
  const { rig, cEnd, v, dir, q, qa, idq } = sc
  const portrait = aspect < 0.9

  if (s <= T.p1b) {
    // Act 1: Chapter 02's route, backwards, eased so the move starts and ends at rest.
    const x = remap(s, T.p1a, T.p1b)
    moonRig(THREE.MathUtils.lerp(TRAVEL_B, PHASE_1_END, smooth01(x)), aspect, px, py, rig)
    out.pos.copy(rig.pos)
    out.target.set(rig.pos.x, rig.pos.y, rig.pos.z - 1) // translation only, like Chapter 02
    out.up.copy(Y)
    out.cx = rig.cx
    out.cy = rig.cy
  } else {
    // Final camera: above the ecliptic, behind Earth, looking in at the Sun. Far enough that Neptune's orbit fits.
    const dEnd = NEPTUNE_R / (FIT * aspect * TAN_HALF)
    const el = portrait ? ELEV_PORTRAIT : ELEV
    v.copy(FRAME.a1).multiplyScalar(Math.cos(el)).addScaledVector(FRAME.n, Math.sin(el)).applyAxisAngle(FRAME.n, AZIMUTH)
    cEnd.copy(SUN_POS).addScaledVector(v, dEnd)
    const rEnd = cEnd.distanceTo(E_REF)

    // Act 2–3: geometric pull-back (constant zoom rate, eased at both ends) from the wide shot to the overview.
    const g = smooth01(remap(s, T.p2a, T.p2b))
    const r = R1 * Math.pow(rEnd / R1, g)
    const sigma = smooth01(remap(g, SWING[0], SWING[1]))
    const w = smooth01(remap(g, TURN[0], TURN[1]))

    dir.copy(cEnd).sub(E_REF).normalize()
    q.setFromUnitVectors(Z, dir)
    qa.copy(idq.identity()).slerp(q, sigma)
    dir.copy(Z).applyQuaternion(qa)
    out.pos.copy(E_REF).addScaledVector(dir, r)
    out.target.lerpVectors(E_REF, SUN_POS, w)
    out.up.lerpVectors(Y, FRAME.n, sigma).normalize()

    // Lens shift settles early (so the Sun swings in at mid-height), the sideways composition later.
    const cy = smooth01(remap(g, 0, 0.4))
    const cx = smooth01(remap(g, 0.3, 1))
    out.cx = THREE.MathUtils.lerp(0, portrait ? 0 : 0.07 * aspect, cx) + px * CURSOR
    out.cy = THREE.MathUtils.lerp(0.25, portrait ? 0.2 : 0, cy) - py * CURSOR
  }

  // Depth range follows the scale: the near plane hugs the nearest of Earth/Moon, the far plane clears the Sun.
  const nearBody = Math.min(out.pos.length() - 1, out.pos.distanceTo(MOON_POS) - RM)
  out.near = Math.max(0.02, 0.03 * nearBody)
  out.far = 3.5 * out.pos.distanceTo(SUN_POS) + 4000
}

/** Rotation that carries the Chapter 03 camera view back to the page's default; what the star field turns by. */
function writeSky(pose: Pose) {
  sc.m.lookAt(pose.pos, pose.target, pose.up)
  sc.q.setFromRotationMatrix(sc.m)
  sky.q.copy(sc.q).invert()
}

const poseScratch: Pose = {
  pos: new THREE.Vector3(),
  target: new THREE.Vector3(),
  up: new THREE.Vector3(),
  cx: 0,
  cy: 0,
  near: 0.05,
  far: 5000,
}

const moonYawAt = (t: number, animate: boolean) => MOON_YAW + (animate ? Math.sin(t * 0.07) * 0.012 : 0)

// ── Shaders
const SUN_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vP;
  varying vec3 vL;
  void main() {
    vL = normal;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vP = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

const SUN_FRAG = /* glsl */ `
  uniform vec3 uCore;
  uniform vec3 uLimb;
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vP;
  varying vec3 vL;
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vP);
    float mu = clamp(dot(N, V), 0.0, 1.0);
    float limb = 1.0 - 0.62 * (1.0 - mu) - 0.18 * (1.0 - mu) * (1.0 - mu);   // limb darkening
    float g = vnoise(vL * 13.0 + vec3(0.0, uTime * 0.03, 0.0)) * 0.6 + vnoise(vL * 33.0 - vec3(uTime * 0.02)) * 0.4;
    vec3 col = mix(uLimb, uCore, pow(mu, 0.9)) * limb * (0.9 + 0.2 * g);
    col *= 1.55;                                                              // overexposed: it is the light source
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

const GLOW_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const GLOW_FRAG = /* glsl */ `
  uniform vec3 uTint;
  uniform float uK;
  varying vec2 vUv;
  void main() {
    float r = length((vUv - 0.5) * 2.0 * uK);              // in Sun radii
    float o = max(r - 1.0, 0.0);
    float h = 0.5 * exp(-o * 1.9) + 0.11 * exp(-o * 0.55) + 0.02 / (r * r + 0.2);
    h *= smoothstep(uK, uK * 0.5, r);                       // reach zero before the quad's edge
    h *= 1.0 - 0.92 * step(r, 1.0);                         // the disc itself is the sphere's job
    gl_FragColor = vec4(uTint * h, h);
    #include <colorspace_fragment>
  }
`

const PLANET_I_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute vec2 aStyle;
  varying vec3 vColor;
  varying vec2 vStyle;
  varying vec3 vN;
  varying vec3 vP;
  varying vec3 vC;
  varying float vY;
  void main() {
    mat4 m = modelMatrix * instanceMatrix;
    vec4 w = m * vec4(position, 1.0);
    vN = normalize(mat3(m) * normal);
    vP = w.xyz;
    vC = m[3].xyz;
    vY = normal.y;                                          // object up = the planet's spin axis (set per instance)
    vColor = aColor;
    vStyle = aStyle;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

const PLANET_I_FRAG = /* glsl */ `
  uniform vec3 uSunPos;
  varying vec3 vColor;
  varying vec2 vStyle;
  varying vec3 vN;
  varying vec3 vP;
  varying vec3 vC;
  varying float vY;
  void main() {
    vec3 N = normalize(vN);
    vec3 L = normalize(uSunPos - vC);
    vec3 V = normalize(cameraPosition - vP);
    float ndl = dot(N, L);
    float band = sin(vY * 15.0 + sin(vY * 5.0 + vStyle.y) * 1.3 + vStyle.y);
    vec3 c = vColor * (1.0 + vStyle.x * 0.18 * band);
    float mu = max(dot(N, V), 0.0);
    c *= 0.6 + 0.4 * pow(mu, 0.5);                         // gentle limb darkening
    float lit = smoothstep(-0.04, 0.3, ndl);
    vec3 col = c * (1.2 * pow(max(ndl, 0.0), 0.8) * lit + 0.012);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

const RING_VERT = /* glsl */ `
  uniform vec2 uRadii;
  varying float vR;
  varying vec3 vC;
  varying vec3 vNrm;
  void main() {
    vR = (length(position.xy) - uRadii.x) / (uRadii.y - uRadii.x);
    vC = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vNrm = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const RING_FRAG = /* glsl */ `
  uniform vec3 uSunPos;
  uniform vec3 uColor;
  varying float vR;
  varying vec3 vC;
  varying vec3 vNrm;
  void main() {
    float r = vR;
    float a = smoothstep(0.0, 0.04, r) * (1.0 - smoothstep(0.96, 1.0, r));
    a *= 0.55 + 0.45 * sin(r * 70.0) * sin(r * 23.0 + 1.0);
    a *= 1.0 - 0.9 * smoothstep(0.58, 0.6, r) * (1.0 - smoothstep(0.64, 0.66, r));   // the Cassini gap
    a *= 0.35 + 0.65 * smoothstep(0.0, 0.5, r);
    float lit = 0.3 + 0.7 * abs(dot(normalize(uSunPos - vC), vNrm));
    gl_FragColor = vec4(uColor * lit * mix(1.0, 0.8, r), a * 0.9);
    #include <colorspace_fragment>
  }
`

const ORBIT_VERT = /* glsl */ `
  attribute float aIdx;
  varying float vIdx;
  void main() {
    vIdx = aIdx;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const ORBIT_FRAG = /* glsl */ `
  uniform float uReveal;
  uniform vec3 uInk;
  uniform vec3 uSignal;
  varying float vIdx;
  void main() {
    float k = clamp(uReveal * 9.0 - vIdx, 0.0, 1.0);        // inner orbits first
    float earth = step(1.5, vIdx) * step(vIdx, 2.5);
    vec3 c = mix(uInk, uSignal, earth);
    gl_FragColor = vec4(c, k * mix(0.17, 0.4, earth));
    #include <colorspace_fragment>
  }
`

// ── Labels (DOM, owned by ChapterSolarSystem; this scene only moves and fades them)
interface LabelRef {
  el: HTMLElement
  body: string
  fade: number[]
  dir: THREE.Vector3 | null // surface point (Moon-fixed, unit·RM) for lunar markers
  limb: number // radius (world units) of the limb anchor, or 0 for the body centre
  last: string
}

const fadeAt = (s: number, a: number[]) => {
  const up = smooth01(clamp01((s - a[0]) / (a[1] - a[0])))
  return a.length > 3 ? up * (1 - smooth01(clamp01((s - a[2]) / (a[3] - a[2])))) : up
}

interface SceneProps {
  progress: RefObject<number>
  active: boolean
  labelLayer: RefObject<HTMLElement | null>
  onReady: () => void
}

/** Earth + Moon, exactly as Chapter 02 leaves them. Only mounted while animating (the still overview does not need them). */
function EarthMoon({ onReady, tier }: { onReady: () => void; tier: 'low' | 'high' }) {
  const high = tier === 'high'
  const invalidate = useThree((s) => s.invalidate)
  const [moonMap, day, night, ocean, clouds] = useLoader(THREE.TextureLoader, [moonUrl, dayUrl, nightUrl, oceanUrl, cloudsUrl])
  const earth = useRef<THREE.Mesh>(null)
  const earthGroup = useRef<THREE.Group>(null)
  const moon = useRef<THREE.Mesh>(null)
  const st = useRef({ detail: 0, ready: false })

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

  const u = useMemo(
    () => ({
      earth: {
        uDay: { value: day },
        uNight: { value: night },
        uOcean: { value: ocean },
        uClouds: { value: clouds },
        uSun: { value: SUN_MOON.clone() },
        uAtm: { value: new THREE.Color(earthTints.atmosphere) },
        uTwi: { value: new THREE.Color(earthTints.twilight) },
        uCity: { value: new THREE.Color(earthTints.cityLight) },
        uShift: { value: 0 },
      },
      atmos: {
        uSun: { value: SUN_MOON.clone() },
        uAtm: { value: new THREE.Color(earthTints.atmosphere) },
        uTwi: { value: new THREE.Color(earthTints.twilight) },
        uTop: { value: ATMOSPHERE },
      },
      moon: {
        uAlb: { value: moonMap },
        uNrm: { value: flat as THREE.Texture },
        uSun: { value: SUN_MOON.clone() },
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

  // Same relief as Chapter 02 (shared pixels; already generated by the time the user gets here).
  useEffect(() => {
    let tex: THREE.DataTexture | null = null
    const cancel = requestMoonRelief(moonMap, high, (rgba) => {
      tex = makeReliefTexture(rgba, high)
      u.moon.uNrm.value = tex
      st.current.ready = true
      invalidate()
    })
    return () => {
      cancel()
      tex?.dispose()
    }
  }, [moonMap, high, u, invalidate])

  useFrame((frame, dt) => {
    const t = clockSeconds()
    const step = Math.min(dt, 0.05)
    st.current.detail = THREE.MathUtils.damp(st.current.detail, st.current.ready ? 1 : 0, 1.6, step)
    u.moon.uDetail.value = st.current.detail
    u.earth.uShift.value = t * 0.0006
    if (earth.current) earth.current.rotation.y = YAW_START + YAW_SWEEP + t * SPIN
    if (moon.current) moon.current.rotation.y = moonYawAt(t, true)
    // Far away they are sub-pixel: skip their (large) draws.
    const p = frame.camera.position
    if (earthGroup.current) earthGroup.current.visible = p.length() < 2500
    if (moon.current) moon.current.visible = p.distanceTo(MOON_POS) < 2500
  })

  const seg = high ? 128 : 80
  return (
    <>
      <group ref={earthGroup} rotation={[0, 0, -TILT]}>
        <mesh ref={earth}>
          <sphereGeometry args={[1, high ? 96 : 64, high ? 96 : 64]} />
          <shaderMaterial uniforms={u.earth} vertexShader={PLANET_VERT} fragmentShader={PLANET_FRAG} />
        </mesh>
        <mesh>
          <sphereGeometry args={[ATMOSPHERE, 64, 64]} />
          <shaderMaterial
            uniforms={u.atmos}
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
        <shaderMaterial uniforms={u.moon} vertexShader={MOON_VERT} fragmentShader={MOON_FRAG} />
      </mesh>
    </>
  )
}

function Cosmos({
  progress,
  active,
  labelLayer,
  onReady,
  animate,
  cursorParallax,
  tier,
}: SceneProps & { animate: boolean; cursorParallax: boolean; tier: 'low' | 'high' }) {
  const high = tier === 'high'
  const invalidate = useThree((s) => s.invalidate)
  const st = useRef({ s: animate ? 0 : 1, px: 0, py: 0, tx: 0, ty: 0, labels: [] as LabelRef[] })
  const planets = useRef<THREE.InstancedMesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const sunGlow = useRef<THREE.Mesh>(null)

  const scratch = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      sc: new THREE.Vector3(),
      v: new THREE.Vector3(),
      n: new THREE.Vector3(),
      q: new THREE.Vector3(),
      right: new THREE.Vector3(),
      upv: new THREE.Vector3(),
    }),
    [],
  )

  // Static layout: planet positions, spin axes, and per-instance style.
  const world = useMemo(() => {
    const pos = PLANETS.map((p) => planetPosition(p, FRAME, new THREE.Vector3()))
    const spin = PLANETS.map((p) => {
      const axis = FRAME.n.clone().applyAxisAngle(FRAME.a1, THREE.MathUtils.degToRad(Math.min(p.tilt, 90)))
      return new THREE.Quaternion().setFromUnitVectors(Y, axis)
    })
    const saturn = PLANETS.findIndex((p) => p.id === 'saturn')
    const ringNormal = FRAME.n.clone().applyAxisAngle(FRAME.a1, THREE.MathUtils.degToRad(PLANETS[saturn].tilt))
    const ringQ = new THREE.Quaternion().setFromUnitVectors(Z, ringNormal)
    return { pos, spin, saturn, ringQ, earth: PLANETS.findIndex((p) => p.id === 'earth') }
  }, [])

  const res = useMemo(() => {
    const seg = high ? 32 : 20
    const planetGeo = new THREE.SphereGeometry(1, seg, seg)
    const colors = new Float32Array(PLANETS.length * 3)
    const style = new Float32Array(PLANETS.length * 2)
    const c = new THREE.Color()
    PLANETS.forEach((p, i) => {
      c.set(p.color)
      colors.set([c.r, c.g, c.b], i * 3)
      style.set([p.bands, i * 2.17], i * 2)
    })
    planetGeo.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3))
    planetGeo.setAttribute('aStyle', new THREE.InstancedBufferAttribute(style, 2))
    const planetMat = new THREE.ShaderMaterial({
      uniforms: { uSunPos: { value: SUN_POS.clone() } },
      vertexShader: PLANET_I_VERT,
      fragmentShader: PLANET_I_FRAG,
    })

    const ringGeo = new THREE.RingGeometry(1.24, 2.27, 96, 1)
    const ringMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunPos: { value: SUN_POS.clone() },
        uRadii: { value: new THREE.Vector2(1.24, 2.27) },
        uColor: { value: new THREE.Color(PLANETS[world.saturn].color) },
      },
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })

    const sunGeo = new THREE.SphereGeometry(SUN_RADIUS, 64, 64)
    const sunMat = new THREE.ShaderMaterial({
      uniforms: {
        uCore: { value: new THREE.Color(solarTints.sunCore) },
        uLimb: { value: new THREE.Color(solarTints.sunLimb) },
        uTime: { value: 0 },
      },
      vertexShader: SUN_VERT,
      fragmentShader: SUN_FRAG,
    })
    const GLOW_K = 10
    const glowGeo = new THREE.PlaneGeometry(SUN_RADIUS * 2 * GLOW_K, SUN_RADIUS * 2 * GLOW_K)
    const glowMat = new THREE.ShaderMaterial({
      uniforms: { uTint: { value: new THREE.Color(solarTints.sunGlow) }, uK: { value: GLOW_K } },
      vertexShader: GLOW_VERT,
      fragmentShader: GLOW_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false, // the billboard shares the Sun's depth, so a depth test would z-fight along the limb
      blending: THREE.AdditiveBlending,
    })

    // All orbits in one LineSegments: 8 rings × 192 segments.
    const SEG = 192
    const verts = new Float32Array(PLANETS.length * SEG * 2 * 3)
    const idx = new Float32Array(PLANETS.length * SEG * 2)
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const at = (k: number, r: number, out: THREE.Vector3) => {
      const th = (k / SEG) * Math.PI * 2
      return out.copy(SUN_POS).addScaledVector(FRAME.a1, r * Math.cos(th)).addScaledVector(FRAME.a2, r * Math.sin(th))
    }
    PLANETS.forEach((p, i) => {
      const r = orbitRadius(p.au)
      for (let k = 0; k < SEG; k++) {
        at(k, r, a)
        at(k + 1, r, b)
        const o = (i * SEG + k) * 6
        verts.set([a.x, a.y, a.z, b.x, b.y, b.z], o)
        idx[(i * SEG + k) * 2] = i
        idx[(i * SEG + k) * 2 + 1] = i
      }
    })
    const orbitGeo = new THREE.BufferGeometry()
    orbitGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    orbitGeo.setAttribute('aIdx', new THREE.BufferAttribute(idx, 1))
    orbitGeo.boundingSphere = new THREE.Sphere(SUN_POS.clone(), NEPTUNE_R * 1.1)
    const orbitMat = new THREE.ShaderMaterial({
      uniforms: {
        uReveal: { value: animate ? 0 : 1 },
        uInk: { value: new THREE.Color(solarTints.orbit) },
        uSignal: { value: new THREE.Color(solarTints.orbitEarth) },
      },
      vertexShader: ORBIT_VERT,
      fragmentShader: ORBIT_FRAG,
      transparent: true,
      depthWrite: false,
    })
    return { planetGeo, planetMat, ringGeo, ringMat, sunGeo, sunMat, glowGeo, glowMat, orbitGeo, orbitMat }
  }, [high, animate, world.saturn])

  useEffect(
    () => () => {
      Object.values(res).forEach((r) => r.dispose())
    },
    [res],
  )

  useEffect(() => {
    onReady()
  }, [onReady])

  // Collect the DOM labels once.
  useEffect(() => {
    const layer = labelLayer.current
    if (!layer) return
    st.current.labels = Array.from(layer.querySelectorAll<HTMLElement>('[data-body]')).map((el) => ({
      el,
      body: el.dataset.body as string,
      fade: (el.dataset.fade ?? '0,0.01').split(',').map(Number),
      dir: el.dataset.lat ? surfaceDir(Number(el.dataset.lat), Number(el.dataset.lon)).multiplyScalar(RM) : null,
      limb: Number(el.dataset.limb ?? 0),
      last: '',
    }))
    invalidate()
  }, [labelLayer, invalidate])

  useEffect(() => {
    if (!cursorParallax) return
    const p = st.current
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

  // Off-screen: the loop idles, so leave the star field pointing where the chapter's progress says it should.
  useEffect(() => {
    if (active || !animate) return
    const aspect = window.innerWidth / Math.max(1, window.innerHeight)
    solarPose(progress.current ?? 0, aspect, 0, 0, poseScratch)
    writeSky(poseScratch)
  }, [active, animate, progress])

  useFrame((frame, dt) => {
    const s = st.current
    const { m, sc: scl, v, n, q, right, upv } = scratch
    const step = Math.min(dt, 0.05)
    const t = clockSeconds()
    const { camera, size } = frame
    const cam = camera as THREE.PerspectiveCamera
    const aspect = size.width / size.height

    s.s = animate ? THREE.MathUtils.damp(s.s, progress.current ?? 0, 3.5, step) : 1
    s.px = THREE.MathUtils.damp(s.px, s.tx, 2.2, step)
    s.py = THREE.MathUtils.damp(s.py, s.ty, 2.2, step)

    // Camera.
    solarPose(s.s, aspect, s.px, s.py, poseScratch)
    const pose = poseScratch
    cam.position.copy(pose.pos)
    cam.up.copy(pose.up)
    cam.lookAt(pose.target)
    cam.near = pose.near
    cam.far = pose.far
    cam.setViewOffset(size.width, size.height, (-pose.cx * size.height) / 2, (pose.cy * size.height) / 2, size.width, size.height)
    cam.updateMatrixWorld()
    if (animate) sky.q.copy(cam.quaternion).invert()

    // Sun.
    res.sunMat.uniforms.uTime.value = t
    sunGlow.current?.quaternion.copy(cam.quaternion)

    // Orbits draw in from Mercury outward as the system comes into view.
    res.orbitMat.uniforms.uReveal.value = animate ? smooth01(remap(s.s, 0.6, 0.86)) : 1

    // Planets: true size, with a floor of MIN_PX so they stay visible; Earth hands over to its textured globe up close.
    const halfH = size.height / 2
    // The visibility floor only applies once the system is being revealed: no stray dots during the Earth–Moon shot.
    const minFrac = (MIN_PX / halfH) * (animate ? smooth01(remap(s.s, 0.5, 0.62)) : 1)
    const mesh = planets.current
    if (mesh) {
      for (let i = 0; i < PLANETS.length; i++) {
        const dist = cam.position.distanceTo(world.pos[i])
        const minR = minFrac * dist * TAN_HALF
        let r = Math.max(PLANETS[i].radius, minR)
        if (i === world.earth && animate && PLANETS[i].radius >= minR) r = 1e-5
        scl.setScalar(r)
        m.compose(world.pos[i], world.spin[i], scl)
        mesh.setMatrixAt(i, m)
        if (i === world.saturn && ring.current) {
          ring.current.position.copy(world.pos[i])
          ring.current.scale.setScalar(r)
        }
      }
      mesh.instanceMatrix.needsUpdate = true
    }

    // Labels.
    const moonYaw = moonYawAt(t, animate)
    cam.matrixWorld.extractBasis(right, upv, n)
    for (const L of s.labels) {
      let o = fadeAt(s.s, L.fade)
      if (L.dir) {
        // Lunar surface marker: fades with facing and light, like Chapter 02.
        v.copy(L.dir).applyAxisAngle(Y, moonYaw).add(MOON_POS)
        n.copy(v).sub(MOON_POS).normalize()
        const facing = n.dot(q.copy(cam.position).sub(v).normalize())
        const lit = n.dot(SUN_MOON)
        o *= smooth01(clamp01((facing - 0.18) / 0.3)) * smooth01(clamp01((lit - 0.04) / 0.2))
      } else {
        if (L.body === 'sun') v.copy(SUN_POS)
        else if (L.body === 'moon') v.copy(MOON_POS)
        else if (L.body === 'earth') v.set(0, 0, 0)
        else {
          const i = PLANETS.findIndex((pl) => pl.id === L.body)
          if (i >= 0) v.copy(world.pos[i])
        }
        // Labels with a limb radius hang off the lower-right edge of the disc, wherever the camera is.
        if (L.limb > 0) v.addScaledVector(right, L.limb * 0.72).addScaledVector(upv, -L.limb * 0.72)
      }
      v.project(cam)
      if (v.z > 1) o = 0
      const key = o < 0.003 ? '0' : `${o.toFixed(3)}|${v.x.toFixed(4)}|${v.y.toFixed(4)}`
      if (key === L.last) continue
      L.last = key
      L.el.style.opacity = o < 0.003 ? '0' : o.toFixed(3)
      if (o >= 0.003) {
        L.el.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * size.width).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * size.height).toFixed(1)}px, 0)`
      }
    }
  })

  return (
    <>
      {animate && (
        <Suspense fallback={null}>
          <EarthMoon onReady={onReady} tier={tier} />
        </Suspense>
      )}
      <mesh geometry={res.sunGeo} material={res.sunMat} position={SUN_POS} />
      <mesh ref={sunGlow} geometry={res.glowGeo} material={res.glowMat} position={SUN_POS} renderOrder={2} />
      <lineSegments geometry={res.orbitGeo} material={res.orbitMat} frustumCulled={false} renderOrder={1} />
      <instancedMesh ref={planets} args={[res.planetGeo, res.planetMat, PLANETS.length]} frustumCulled={false} />
      <mesh ref={ring} geometry={res.ringGeo} material={res.ringMat} quaternion={world.ringQ} frustumCulled={false} renderOrder={1} />
    </>
  )
}

/** Chapter 03 canvas. Lazy-loaded from `ChapterSolarSystem`; transparent, so the global StarField shows behind. */
export default function SolarScene({ progress, active, labelLayer, onReady }: SceneProps) {
  const { tier, maxDpr, animate, cursorParallax } = useRenderProfile()
  return (
    <Canvas
      dpr={[1, maxDpr]}
      camera={{ fov: FOV, near: 0.05, far: 5000, position: [0, 0, 6] }}
      frameloop={active && animate ? 'always' : 'demand'}
      gl={{ antialias: tier === 'high', powerPreference: 'high-performance', alpha: true }}
    >
      <Cosmos
        progress={progress}
        active={active}
        labelLayer={labelLayer}
        onReady={onReady}
        animate={animate}
        cursorParallax={cursorParallax}
        tier={tier}
      />
    </Canvas>
  )
}
