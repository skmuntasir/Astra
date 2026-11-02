import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useRenderProfile } from '@/hooks/useRenderProfile'
import { colors, earthTints, solarTints } from '@/lib/tokens'
import {
  AU,
  EARTH,
  GALAXY,
  GALAXY_R,
  HUMAN,
  HUMAN_H,
  M31,
  M33,
  MOON,
  NOTES,
  ORBIT_AU,
  PLANET_DOTS,
  R_EARTH,
  SUN,
  SUN_DIR,
  S_STILL,
  UNIVERSE_R,
  YOU,
  centerAt,
  fadeAt,
  formatLength,
  niceBar,
  orbitPoint,
  scaleAt,
  smooth,
  type V2,
} from '@/lib/cosmicScale'
import {
  galaxyField,
  grainField,
  localGroupField,
  neighbourField,
  oortField,
  rgb,
  webField,
  type Field,
} from '@/lib/cosmicField'
import dayUrl from '@/assets/earth/earth-day.jpg'
import nightUrl from '@/assets/earth/earth-night.jpg'

/**
 * Chapter 04 — the scale journey. ONE orthographic-style canvas whose unit is the CSS pixel; the camera is a centre and a
 * scale `s` = log10(metres per pixel), both driven by scroll (lib/cosmicScale.ts). Nothing is a 3D object being moved
 * toward or away from a camera: every layer is placed in pixels each frame from float64 metres, which is what makes a
 * 27-decade range possible in float32 shaders.
 *
 * Layers (≈ 10 draw calls):
 *  1. one full-screen shader: Earth (sphere, atmosphere, night lights; at human scale its limb IS the horizon), the human,
 *     orbit/boundary rings, soft glows (Sun, galaxies). Circles are evaluated with a cancellation-free distance
 *     function, so a 6,371 km radius is exact at 0.005 m/px (1.3 billion px) just as at 2,500 m/px.
 *  2. point clouds in metres (Oort cloud, neighbour stars, Milky Way, Local Group, web, grain): positions × (1/mpp) + origin.
 *  3. a handful of dots in pixels for bodies far smaller than a pixel (Sun, Moon, Earth, planets).
 * Colours are written straight to the canvas (display values), so nothing here is colour-managed.
 */

const NR = 13
const NG = 4
const TILT = (23.4 * Math.PI) / 180
const LON0 = (58 * Math.PI) / 180

const FULL_VERT = /* glsl */ `
  uniform vec2 uHalf;
  varying vec2 vQ;
  void main() {
    vQ = position.xy * uHalf;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const FULL_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vQ;
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform vec4 uEarthA;   // n.x, n.y, D0, R   (pixels; n = unit vector planet centre -> screen centre)
  uniform vec4 uEarthB;   // A, atmosphere height px, texture mix, alpha
  uniform vec3 uLight;
  uniform vec3 uAtm;
  uniform vec3 uHuman;    // feet.x, feet.y, height px
  uniform float uHumanA;
  uniform vec4 uRingA[${NR}];
  uniform vec4 uRingB[${NR}];  // A, width px, alpha, mode (0 solid, 1 dashed, 3 horizon edge)
  uniform vec3 uRingC[${NR}];
  uniform vec4 uGlowA[${NG}];  // cx, cy, radius px, axis ratio
  uniform vec4 uGlowB[${NG}];  // angle, intensity, core mix, 0
  uniform vec3 uGlowC[${NG}];

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  // Signed distance (px) to a circle of radius R whose centre is D0 px from the screen centre, in direction -n.
  // |c0 + q|^2 - R^2 is expanded around the precomputed A = D0^2 - R^2, so nothing large cancels in float32.
  float circSd(vec4 a, float A, vec2 q) {
    vec2 p = a.xy * a.z + q;
    return (A + 2.0 * a.z * dot(a.xy, q) + dot(q, q)) / (length(p) + a.w);
  }

  float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }
  // A plain standing figure, 1.0 tall, feet at the origin.
  float humanSd(vec2 h) {
    float x = abs(h.x);
    float head = length(h - vec2(0.0, 0.915)) - 0.05;
    float neck = sdBox(h - vec2(0.0, 0.855), vec2(0.016, 0.02));
    float torso = sdBox(h - vec2(0.0, 0.72), vec2(0.07, 0.125)) - 0.012;
    float arms = sdBox(vec2(x, h.y) - vec2(0.105, 0.70), vec2(0.016, 0.135)) - 0.006;
    float legs = sdBox(vec2(x, h.y) - vec2(0.036, 0.28), vec2(0.028, 0.275)) - 0.006;
    return min(min(head, neck), min(min(torso, arms), legs));
  }

  void main() {
    vec2 q = vQ;
    vec3 col = vec3(0.0);
    float alpha = 0.0;

    // ---- Earth: sphere + atmosphere + ground, one formula from a horizon to a pale blue dot.
    if (uEarthB.w > 0.002) {
      float R = uEarthA.w;
      float sd = circSd(uEarthA, uEarthB.x, q);
      vec2 p = uEarthA.xy * uEarthA.z + q;
      vec2 w = p / max(length(p), 1e-6);
      float lit = smoothstep(-0.25, 0.45, dot(w, uLight.xy));
      float inside = 1.0 - smoothstep(-0.7, 0.7, sd);

      // Atmosphere: a thin rim on the globe; a broad band of sky above the horizon when you stand on it.
      float H = max(uEarthB.y, 1.2);
      float band = exp(-max(sd, 0.0) / min(H, 220.0));
      vec3 atm = uAtm * band * (0.12 + 0.88 * lit) * 0.6;

      vec2 u = p / R;
      float z = sqrt(max(0.0, 1.0 - dot(u, u)));
      vec3 N = vec3(u, z);
      float diff = dot(N, uLight);
      float day = smoothstep(-0.06, 0.3, diff);
      vec3 P = vec3(cos(${TILT.toFixed(5)}) * N.x + sin(${TILT.toFixed(5)}) * N.y, -sin(${TILT.toFixed(5)}) * N.x + cos(${TILT.toFixed(5)}) * N.y, N.z);
      vec2 uv = vec2((atan(P.x, P.z) + ${LON0.toFixed(5)}) / 6.2831853 + 0.5, asin(clamp(P.y, -1.0, 1.0)) / 3.14159265 + 0.5);
      vec3 dayC = texture2D(uDay, uv).rgb;
      vec3 nightC = texture2D(uNight, uv).rgb;
      vec3 globe = dayC * (0.03 + 1.08 * day) + nightC * (1.0 - day) * 2.2;
      globe += uAtm * pow(1.0 - z, 3.0) * (0.15 + 0.85 * day) * 0.9;
      vec3 ground = vec3(0.016, 0.022, 0.034) * (0.6 + 0.8 * lit);
      vec3 surf = mix(ground, globe, uEarthB.z);

      col = (surf * inside + atm * (1.0 - inside)) * uEarthB.w;
      alpha = inside * uEarthB.w;
    }

    // ---- The human, a pale figure: it has to read against a black sky.
    if (uHumanA > 0.002) {
      vec2 h = (q - uHuman.xy) / uHuman.z;
      float d = humanSd(h) * uHuman.z;
      float m = (1.0 - smoothstep(-0.8, 0.8, d)) * uHumanA;
      col = vec3(0.80, 0.84, 0.92) * m + col * (1.0 - m);
      alpha = m + alpha * (1.0 - m);
    }

    // ---- Rings: orbits, boundaries, and the edge of the observable universe.
    for (int i = 0; i < ${NR}; i++) {
      float al = uRingB[i].z;
      if (al < 0.003) continue;
      float sd = circSd(uRingA[i], uRingB[i].x, q);
      float mode = uRingB[i].w;
      float hair = 1.0 - smoothstep(0.0, uRingB[i].y, abs(sd) - 0.4);
      float v = hair;
      if (mode > 0.5 && mode < 1.5) {
        vec2 p = uRingA[i].xy * uRingA[i].z + q;
        v *= smoothstep(0.3, 0.55, abs(fract(atan(p.y, p.x) * 14.3239) - 0.5) * 2.0);
      }
      if (mode > 2.5) {
        // The horizon of what can be seen: a hairline, a soft haze just inside, a mottled glow just outside (the oldest light).
        float Rr = uRingA[i].w;
        vec2 p = uRingA[i].xy * uRingA[i].z + q;
        float n = 0.55 + 0.9 * vnoise(p / (0.02 * Rr + 1.0));
        float haze = exp(-max(-sd, 0.0) / (0.05 * Rr + 3.0)) * 0.22 * step(sd, 0.0);
        float halo = exp(-max(sd, 0.0) / (0.035 * Rr + 3.0)) * 0.55 * n * step(0.0, sd);
        v = hair * 0.9 + haze + halo;
      }
      col += uRingC[i] * v * al;
    }

    // ---- Glows: the Sun, and galaxies as soft ellipses.
    for (int i = 0; i < ${NG}; i++) {
      float I = uGlowB[i].y;
      if (I < 0.003) continue;
      vec2 rel = q - uGlowA[i].xy;
      float ca = cos(uGlowB[i].x);
      float sa = sin(uGlowB[i].x);
      rel = vec2(ca * rel.x + sa * rel.y, -sa * rel.x + ca * rel.y);
      rel.y /= uGlowA[i].w;
      float rho = length(rel) / uGlowA[i].z;
      float core = uGlowB[i].z;
      float v = (1.0 - core) * exp(-rho * 2.6) + core * exp(-rho * 11.0);
      col += uGlowC[i] * I * v;
    }

    // Break up banding in the long dark gradients.
    col += (hash(q + 0.5) - 0.5) / 255.0 * step(0.004, col.r + col.g + col.b);
    gl_FragColor = vec4(max(col, 0.0), clamp(alpha, 0.0, 1.0));
  }
`

const CLOUD_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  uniform vec2 uHalf;
  uniform float uInvMpp;
  uniform vec2 uOrig;
  uniform float uDpr;
  varying vec3 vC;
  void main() {
    vec2 px = position.xy * uInvMpp + uOrig;
    vC = aColor;
    gl_PointSize = aSize * uDpr;
    gl_Position = vec4(px / uHalf, 0.0, 1.0);
  }
`
const CLOUD_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vC;
  uniform float uAlpha;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float f = exp(-dot(d, d) * 12.8);
    if (f < 0.012) discard;
    float k = f * uAlpha;
    gl_FragColor = vec4(vC * k, k);
  }
`

const DOT_VERT = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aA;
  uniform vec2 uHalf;
  uniform float uDpr;
  varying vec3 vC;
  void main() {
    vC = aColor * aA;
    gl_PointSize = aSize * uDpr;
    gl_Position = vec4(position.xy / uHalf, 0.0, 1.0);
  }
`
const DOT_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vC;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float f = 1.0 - smoothstep(0.55, 1.0, d);
    if (f < 0.01) discard;
    gl_FragColor = vec4(vC * f, f * max(vC.r, max(vC.g, vC.b)));
  }
`

// ---- Rings ------------------------------------------------------------------------------------------------------------
interface RingDef {
  c: V2
  r: number
  fade: readonly number[]
  alpha: number
  width: number
  mode: number
  color: [number, number, number]
}
const INK = rgb(colors.ink)
const SIGNAL = rgb(colors.signal)
const RINGS: RingDef[] = [
  { c: EARTH, r: 4.2164e7, fade: [4.2, 4.7, 6.0, 6.6], alpha: 0.3, width: 1.4, mode: 1, color: INK },
  { c: EARTH, r: 3.844e8, fade: [5.6, 6.0, 7.6, 8.2], alpha: 0.42, width: 1.4, mode: 0, color: INK },
  ...ORBIT_AU.map<RingDef>((au) => ({
    c: SUN,
    r: au * AU,
    fade: [7.9, 8.6, 11.6, 12.6],
    alpha: au === 1 ? 0.65 : 0.3,
    width: 1.4,
    mode: 0,
    color: au === 1 ? SIGNAL : INK,
  })),
  { c: SUN, r: 120 * AU, fade: [9.9, 10.5, 12.2, 13.0], alpha: 0.38, width: 1.4, mode: 1, color: INK },
  { c: SUN, r: 1e5 * AU, fade: [12.8, 13.4, 14.2, 14.8], alpha: 0.34, width: 1.4, mode: 1, color: INK },
  { c: GALAXY, r: UNIVERSE_R, fade: [22.8, 23.7], alpha: 0.85, width: 1.6, mode: 3, color: [1, 0.74, 0.62] },
]
if (RINGS.length !== NR) throw new Error('RINGS must match NR')

const SUN_GLOW = rgb(solarTints.sunGlow)
const SUN_CORE = rgb(solarTints.sunCore)
const GALAXY_GLOW: [number, number, number] = [0.62, 0.7, 1]
const GALAXY_WARM = rgb('#FFD9B0')

/** Dots for bodies that are smaller than a pixel in every frame they appear in. Order: Sun, Moon, Earth, planets. */
const DOTS: Array<{ at: V2; color: [number, number, number]; size: number; fade: readonly number[] }> = [
  { at: SUN, color: SUN_CORE, size: 3.6, fade: [7.6, 8.3, 13.4, 14.4] },
  { at: MOON, color: [0.86, 0.86, 0.84], size: 2.4, fade: [5.5, 6.0, 7.4, 8.0] },
  { at: EARTH, color: rgb(solarTints.earth), size: 3.0, fade: [5.0, 5.5, 11.6, 12.6] },
  ...PLANET_DOTS.map((p) => ({ at: orbitPoint(p.au, p.theta), color: rgb(p.color), size: p.size, fade: [8.0, 8.8, 11.6, 12.6] })),
]

// ---- Veil: the page behind the stage thickens and shifts colour as the scale grows --------------------------------------
const VEIL_STOPS: Array<{ s: number; a: number; c: [number, number, number] }> = [
  { s: 8.5, a: 0, c: [8, 12, 24] },
  { s: 13, a: 0.9, c: [9, 14, 30] },
  { s: 18.5, a: 0.96, c: [10, 16, 40] },
  { s: 22, a: 0.97, c: [18, 12, 34] },
  { s: 24.3, a: 0.98, c: [30, 14, 18] },
]
function veilAt(s: number): { a: number; c: [number, number, number] } {
  if (s <= VEIL_STOPS[0].s) return { a: VEIL_STOPS[0].a, c: VEIL_STOPS[0].c }
  for (let i = 1; i < VEIL_STOPS.length; i++) {
    const A = VEIL_STOPS[i - 1]
    const B = VEIL_STOPS[i]
    if (s <= B.s) {
      const t = smooth(A.s, B.s, s)
      return { a: A.a + (B.a - A.a) * t, c: [A.c[0] + (B.c[0] - A.c[0]) * t, A.c[1] + (B.c[1] - A.c[1]) * t, A.c[2] + (B.c[2] - A.c[2]) * t] }
    }
  }
  const L = VEIL_STOPS[VEIL_STOPS.length - 1]
  return { a: L.a, c: L.c }
}

// ---- Scene --------------------------------------------------------------------------------------------------------------
interface SceneProps {
  progress: RefObject<number>
  active: boolean
  /** The stage element: the scene finds its annotations, readouts and veil inside it (`data-note`, `data-hud`, `data-veil`). */
  stage: RefObject<HTMLElement | null>
  onReady: () => void
}

interface Cloud {
  field: Field
  points: THREE.Points
  uAlpha: { value: number }
  uOrig: { value: THREE.Vector2 }
}

function makeCloud(f: Field, shared: { uHalf: { value: THREE.Vector2 }; uInvMpp: { value: number }; uDpr: { value: number } }): Cloud {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(f.pos, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(f.col, 3))
  geo.setAttribute('aSize', new THREE.BufferAttribute(f.size, 1))
  const uAlpha = { value: 0 }
  const uOrig = { value: new THREE.Vector2() }
  const mat = new THREE.ShaderMaterial({
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    uniforms: { ...shared, uAlpha, uOrig },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.renderOrder = 1
  return { field: f, points, uAlpha, uOrig }
}

interface NoteRef {
  el: HTMLElement
  note: (typeof NOTES)[number] | { id: 'you'; at: V2; fade: readonly number[] }
  last: string
}

function Cosmos({ progress, stage, onReady, animate, tier }: Omit<SceneProps, 'active'> & { animate: boolean; tier: 'low' | 'high' }) {
  const high = tier === 'high'
  const invalidate = useThree((s) => s.invalidate)
  const baseDay = useLoader(THREE.TextureLoader, dayUrl)
  const baseNight = useLoader(THREE.TextureLoader, nightUrl)

  // Own copies: the shared cache entries belong to Chapters 01–03 and carry their own colour-space settings.
  const textures = useMemo(() => {
    const prep = (t: THREE.Texture) => {
      const c = t.clone()
      c.colorSpace = THREE.NoColorSpace
      c.wrapS = THREE.RepeatWrapping
      c.minFilter = THREE.LinearFilter
      c.magFilter = THREE.LinearFilter
      c.generateMipmaps = false
      c.needsUpdate = true
      return c
    }
    return { day: prep(baseDay), night: prep(baseNight) }
  }, [baseDay, baseNight])

  const shared = useMemo(() => ({ uHalf: { value: new THREE.Vector2(1, 1) }, uInvMpp: { value: 1 }, uDpr: { value: 1 } }), [])

  const world = useMemo(() => {
    const counts = high
      ? { oort: 2600, near: 140, mw: 30000, lg: 46, web: 15000, grain: 7000 }
      : { oort: 1200, near: 100, mw: 13000, lg: 30, web: 7000, grain: 3000 }
    const clouds = {
      oort: makeCloud(oortField(counts.oort), shared),
      near: makeCloud(neighbourField(counts.near), shared),
      mw: makeCloud(galaxyField(counts.mw), shared),
      lg: makeCloud(localGroupField(counts.lg), shared),
      web: makeCloud(webField(counts.web), shared),
      grain: makeCloud(grainField(counts.grain), shared),
    }

    // Fullscreen shader.
    const V4 = (n: number) => Array.from({ length: n }, () => new THREE.Vector4())
    const V3 = (n: number) => Array.from({ length: n }, () => new THREE.Vector3())
    const uniforms = {
      uHalf: shared.uHalf,
      uDay: { value: textures.day },
      uNight: { value: textures.night },
      uEarthA: { value: new THREE.Vector4() },
      uEarthB: { value: new THREE.Vector4() },
      uLight: { value: new THREE.Vector3(SUN_DIR[0], SUN_DIR[1], 0.32).normalize() },
      uAtm: { value: new THREE.Vector3(...rgb(earthTints.atmosphere)) },
      uHuman: { value: new THREE.Vector3() },
      uHumanA: { value: 0 },
      uRingA: { value: V4(NR) },
      uRingB: { value: V4(NR) },
      uRingC: { value: V3(NR) },
      uGlowA: { value: V4(NG) },
      uGlowB: { value: V4(NG) },
      uGlowC: { value: V3(NG) },
    }
    const fullMat = new THREE.ShaderMaterial({
      vertexShader: FULL_VERT,
      fragmentShader: FULL_FRAG,
      uniforms,
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
    })
    const fullGeo = new THREE.PlaneGeometry(2, 2)

    // Dots.
    const nd = DOTS.length
    const dGeo = new THREE.BufferGeometry()
    const dPos = new Float32Array(nd * 3)
    const dCol = new Float32Array(nd * 3)
    const dSize = new Float32Array(nd)
    const dA = new Float32Array(nd)
    DOTS.forEach((d, i) => {
      dCol.set(d.color, i * 3)
      dSize[i] = d.size
    })
    dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3).setUsage(THREE.DynamicDrawUsage))
    dGeo.setAttribute('aColor', new THREE.BufferAttribute(dCol, 3))
    dGeo.setAttribute('aSize', new THREE.BufferAttribute(dSize, 1))
    dGeo.setAttribute('aA', new THREE.BufferAttribute(dA, 1).setUsage(THREE.DynamicDrawUsage))
    const dMat = new THREE.ShaderMaterial({
      vertexShader: DOT_VERT,
      fragmentShader: DOT_FRAG,
      uniforms: { uHalf: shared.uHalf, uDpr: shared.uDpr },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    })
    const dots = new THREE.Points(dGeo, dMat)
    dots.frustumCulled = false
    dots.renderOrder = 2

    return { clouds, uniforms, fullMat, fullGeo, dots, dGeo, dMat, dPos, dA }
  }, [high, shared, textures])

  useEffect(
    () => () => {
      textures.day.dispose()
      textures.night.dispose()
      Object.values(world.clouds).forEach((c) => {
        c.points.geometry.dispose()
        ;(c.points.material as THREE.Material).dispose()
      })
      world.fullMat.dispose()
      world.fullGeo.dispose()
      world.dGeo.dispose()
      world.dMat.dispose()
    },
    [world, textures],
  )

  const st = useRef({
    s: animate ? scaleAt(progress.current ?? 0) : S_STILL,
    notes: [] as NoteRef[],
    frame: null as HTMLElement | null,
    barLine: null as HTMLElement | null,
    barText: null as HTMLElement | null,
    veil: null as HTMLElement | null,
    lastFrame: '',
    lastBar: '',
    lastVeil: '',
  })

  useEffect(() => {
    onReady()
  }, [onReady])

  // Collect the DOM annotations once.
  useEffect(() => {
    const root = stage.current
    if (!root) return
    const s = st.current
    s.notes = Array.from(root.querySelectorAll<HTMLElement>('[data-note]')).flatMap<NoteRef>((el) => {
      const id = el.dataset.note
      if (id === 'you') return [{ el, note: { id: 'you' as const, at: HUMAN, fade: YOU.fade }, last: '' }]
      const note = NOTES.find((n) => n.id === id)
      return note ? [{ el, note, last: '' }] : []
    })
    s.frame = root.querySelector<HTMLElement>('[data-hud="frame"]')
    s.barLine = root.querySelector<HTMLElement>('[data-hud="bar-line"]')
    s.barText = root.querySelector<HTMLElement>('[data-hud="bar-text"]')
    s.veil = root.querySelector<HTMLElement>('[data-veil]')
    invalidate()
  }, [stage, invalidate])

  useFrame((frame, dt) => {
    const S = st.current
    const step = Math.min(dt, 0.05)
    const w = frame.size.width
    const h = frame.size.height
    const dpr = frame.viewport.dpr

    // ---- Scale and camera. s follows scroll with a short damp, so fast flicks still glide.
    const target = animate ? scaleAt(progress.current ?? 0) : S_STILL
    S.s = animate ? THREE.MathUtils.damp(S.s, target, 5, step) : target
    const s = S.s
    const mpp = Math.pow(10, s)
    const inv = 1 / mpp
    const cam = centerAt(s)
    // Composition: the subject sits right of centre on wide screens (text is on the left), above centre on phones.
    const wide = w >= 768
    const sx = wide ? 0.09 * w : 0
    const sy = wide ? 0 : 0.1 * h
    const diag = Math.hypot(w, h)
    const px = (v: V2, axis: 0 | 1) => (v[axis] - cam[axis]) * inv + (axis === 0 ? sx : sy)

    shared.uHalf.value.set(w / 2, h / 2)
    shared.uInvMpp.value = inv
    shared.uDpr.value = dpr

    const U = world.uniforms

    // ---- Earth.
    {
      const cx = px(EARTH, 0)
      const cy = px(EARTH, 1)
      const R = R_EARTH * inv
      const D0 = Math.hypot(cx, cy)
      const g = D0 - R
      const H = Math.max(1.2, 6e4 * inv)
      const reach = Math.min(H, 220) * 6 + diag
      const on = g < reach && R > 0.25
      const nx = D0 > 1e-9 ? -cx / D0 : 1
      const ny = D0 > 1e-9 ? -cy / D0 : 0
      U.uEarthA.value.set(nx, ny, D0, R)
      U.uEarthB.value.set(g * (D0 + R), H, 1 - smooth(1800, 5200, R), on ? smooth(0.25, 1.2, R) : 0)
    }

    // ---- The human.
    {
      const hh = HUMAN_H * inv
      U.uHuman.value.set(px(HUMAN, 0), px(HUMAN, 1), hh)
      U.uHumanA.value = 1 - smooth(-1.0, 0.3, s)
    }

    // ---- Rings.
    for (let i = 0; i < NR; i++) {
      const r = RINGS[i]
      const al = fadeAt(s, r.fade) * r.alpha
      const b = U.uRingB.value[i]
      if (al < 0.003) {
        b.z = 0
        continue
      }
      const cx = px(r.c, 0)
      const cy = px(r.c, 1)
      const R = r.r * inv
      const D0 = Math.hypot(cx, cy)
      const g = D0 - R
      // Off-screen entirely (and not close enough to be seen): skip.
      if (Math.abs(g) > diag * 1.1 + (r.mode === 3 ? 0.2 * R : 0)) {
        b.z = 0
        continue
      }
      U.uRingA.value[i].set(D0 > 1e-9 ? -cx / D0 : 1, D0 > 1e-9 ? -cy / D0 : 0, D0, R)
      b.set(g * (D0 + R), r.width, al, r.mode)
      U.uRingC.value[i].set(r.color[0], r.color[1], r.color[2])
    }

    // ---- Glows: Sun, Milky Way, Andromeda, Triangulum.
    {
      const G = U.uGlowA.value
      const B = U.uGlowB.value
      const C = U.uGlowC.value
      // Sun: a fixed-size bloom (a star is a point; its glow is the eye's, not the Sun's).
      G[0].set(px(SUN, 0), px(SUN, 1), 15, 1)
      B[0].set(0, fadeAt(s, [7.6, 8.4, 13.4, 14.6]) * 0.5, 0.35, 0)
      C[0].set(SUN_GLOW[0], SUN_GLOW[1], SUN_GLOW[2])
      // Milky Way: bulge + disc; never smaller than a soft 3 px blob.
      const mwR = Math.max(GALAXY_R * inv * 0.8, 3)
      G[1].set(px(GALAXY, 0), px(GALAXY, 1), mwR, 1)
      B[1].set(0, fadeAt(s, [16.6, 17.8, 23.0, 24.3]) * 0.3, 0.3, 0)
      C[1].set(GALAXY_GLOW[0], GALAXY_GLOW[1], GALAXY_GLOW[2])
      // Andromeda: inclined ~77°, so a thin ellipse at position angle ~38° (radius ~110,000 ly).
      G[2].set(px(M31, 0), px(M31, 1), Math.max(1.04e21 * inv * 0.8, 3), 0.25)
      B[2].set((38 * Math.PI) / 180, fadeAt(s, [18.6, 19.6, 22.4, 23.4]) * 0.38, 0.4, 0)
      C[2].set(GALAXY_WARM[0], GALAXY_WARM[1], GALAXY_WARM[2])
      G[3].set(px(M33, 0), px(M33, 1), Math.max(2.8e20 * inv * 0.8, 2.5), 0.85)
      B[3].set(0, fadeAt(s, [19.2, 20.0, 22.2, 23.2]) * 0.3, 0.3, 0)
      C[3].set(GALAXY_GLOW[0], GALAXY_GLOW[1], GALAXY_GLOW[2])
    }

    // ---- Point clouds.
    const { oort, near, mw, lg, web, grain } = world.clouds
    const place = (c: Cloud, a: number) => {
      c.uOrig.value.set(px(c.field.origin, 0), px(c.field.origin, 1))
      c.uAlpha.value = a
      c.points.visible = a > 0.004
    }
    place(oort, fadeAt(s, [11.4, 12.2, 14.6, 15.4]) * 0.9)
    place(near, fadeAt(s, [13.8, 14.3, 17.2, 18.0]))
    // Keep the galaxy from blowing out when it shrinks to a handful of pixels: brightness follows its apparent size.
    const mwGain = Math.pow(Math.min(1, Math.max(0.12, (GALAXY_R * inv) / 110)), 0.8)
    place(mw, fadeAt(s, [15.8, 17.2, 22.4, 23.6]) * mwGain)
    place(lg, fadeAt(s, [18.6, 19.4, 22.4, 23.2]))
    place(web, fadeAt(s, [21.2, 22.2, 24.2, 25.0]) * 0.9)
    place(grain, fadeAt(s, [22.6, 23.6]) * 0.8)

    // ---- Dots.
    {
      const rEarth = R_EARTH * inv
      for (let i = 0; i < DOTS.length; i++) {
        const d = DOTS[i]
        world.dPos[i * 3] = px(d.at, 0)
        world.dPos[i * 3 + 1] = px(d.at, 1)
        let a = fadeAt(s, d.fade)
        if (i === 2) a *= 1 - smooth(2, 9, rEarth)
        world.dA[i] = a
      }
      world.dGeo.attributes.position.needsUpdate = true
      world.dGeo.attributes.aA.needsUpdate = true
    }

    // ---- Annotations (DOM): move and fade each every frame it is visible; write only when the value changes.
    for (const n of S.notes) {
      const a = fadeAt(s, n.note.fade)
      let out = ''
      if (a > 0.01) {
        const x = w / 2 + px(n.note.at, 0)
        const y = h / 2 - px(n.note.at, 1)
        const inView = x > -40 && x < w + 40 && y > -40 && y < h + 40
        out = inView ? `${x.toFixed(1)},${y.toFixed(1)},${a.toFixed(2)}` : ''
      }
      if (out !== n.last) {
        n.last = out
        if (out) {
          const [x, y, o] = out.split(',')
          n.el.style.transform = `translate3d(${x}px, ${y}px, 0)`
          n.el.style.opacity = o
        } else {
          n.el.style.opacity = '0'
        }
      }
    }

    // ---- Readouts.
    if (S.frame) {
      const t = formatLength(h * mpp)
      if (t !== S.lastFrame) {
        S.lastFrame = t
        S.frame.textContent = t
      }
    }
    if (S.barLine && S.barText) {
      const bar = niceBar((wide ? 140 : 90) * mpp)
      const key = bar.label + Math.round(bar.metres * inv)
      if (key !== S.lastBar) {
        S.lastBar = key
        S.barLine.style.width = `${(bar.metres * inv).toFixed(1)}px`
        S.barText.textContent = bar.label
      }
    }

    // ---- Veil behind the stage.
    if (S.veil) {
      const v = veilAt(s)
      const key = `${v.a.toFixed(2)}${v.c.map((c) => Math.round(c)).join(',')}`
      if (key !== S.lastVeil) {
        S.lastVeil = key
        S.veil.style.opacity = v.a.toFixed(2)
        S.veil.style.setProperty('--tint', `rgb(${v.c.map((c) => Math.round(c)).join(' ')})`)
      }
    }
  })

  return (
    <>
      <mesh geometry={world.fullGeo} material={world.fullMat} frustumCulled={false} renderOrder={0} />
      {Object.entries(world.clouds).map(([k, c]) => (
        <primitive key={k} object={c.points} />
      ))}
      <primitive object={world.dots} />
    </>
  )
}

/** Chapter 04 canvas. Lazy-loaded from `ChapterCosmicScale`; transparent, so the page's star field shows behind until the veil thickens. */
export default function CosmicScene({ progress, active, stage, onReady }: SceneProps) {
  const { tier, maxDpr, animate } = useRenderProfile()
  return (
    <Canvas
      dpr={[1, maxDpr]}
      frameloop={active && animate ? 'always' : 'demand'}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: true }}
    >
      <Cosmos progress={progress} stage={stage} onReady={onReady} animate={animate} tier={tier} />
    </Canvas>
  )
}
