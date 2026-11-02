import { useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { STARS } from '@/data/sky'
import { useRenderProfile } from '@/hooks/useRenderProfile'
import { clockSeconds } from '@/lib/clock'
import { fadeAt, smooth } from '@/lib/cosmicScale'
import {
  DAYS_PER_SECOND, EXOPLANETS, GAL_X, GAL_Y, GAL_Z, HZ_AU, LY_PER_AU, NEBULAE, PLANE_E1, PLANE_E2, SCENE_LABELS, SYSTEM_AU,
  SYSTEM_PLANETS, TARGET_ABS_MAG, TARGET_POS, TARGET_TEFF, fmtDist, poseAt, posOf, projectToScreen, vadd, vlen, vscale, vsub
} from '@/lib/deepSpace'
import type { Vec3 } from '@/lib/astro'
import { bvToKelvin, kelvinToRgb, mulberry32 } from '@/lib/skyGeometry'

/** The still frame shown under reduced motion: the finished composition. */
const P_STILL = 0.98

// ======================================================================================================================
// Shaders. One shared camera model (a pinhole, expressed analytically) so that nothing depends on the depth buffer and
// the near plane can be as close as the camera likes: the flight ends 1.5 AU from a star 580 ly from the origin.
// ======================================================================================================================
const COMMON = /* glsl */ `
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform vec2 uTan;
uniform vec2 uShift;
uniform vec2 uRes;
uniform float uDpr;
vec3 camProject(vec3 rel) {
  float z = dot(rel, uFwd);
  float x = dot(rel, uRight);
  float y = dot(rel, uUp);
  return vec3(x / (z * uTan.x) + uShift.x, y / (z * uTan.y) + uShift.y, z);
}
`

const NOISE = /* glsl */ `
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
float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}
`

const SKY_VERT = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`
const SKY_FRAG = /* glsl */ `
${COMMON}
${NOISE}
uniform vec3 uGX;
uniform vec3 uGY;
uniform vec3 uGZ;
uniform float uNeb;
varying vec2 vNdc;
void main() {
  vec2 q = vNdc - uShift;
  vec3 dir = normalize(uFwd + q.x * uTan.x * uRight + q.y * uTan.y * uUp);
  float b = asin(clamp(dot(dir, uGZ), -1.0, 1.0));
  float l = atan(dot(dir, uGY), dot(dir, uGX));
  float band = exp(-b * b / (2.0 * 0.14 * 0.14));
  float wide = exp(-b * b / (2.0 * 0.45 * 0.45));
  float bulge = exp(-(l * l) / (2.0 * 0.9 * 0.9));
  float cloud = fbm(dir * 2.6);
  float fine = fbm(dir * 9.0 + 3.7);
  float lane = smoothstep(0.52, 0.72, fbm(dir * 5.2 + vec3(11.0, 2.0, 5.0)));
  float glow = band * (0.28 + 0.9 * cloud) * (1.0 + 0.9 * bulge) + 0.12 * wide * cloud;
  glow *= 1.0 - 0.8 * lane * band;
  vec3 col = vec3(0.11, 0.135, 0.21) * glow * (0.65 + 0.7 * fine);
  // Emission regions: hydrogen (red), oxygen (teal), reflection (blue). Strongest near the plane.
  float em = smoothstep(0.58, 0.86, fbm(dir * 4.4 + vec3(2.0, 7.0, 1.0))) * exp(-b * b / (2.0 * 0.22 * 0.22));
  float tone = fbm(dir * 3.1 + 9.0);
  vec3 ecol = mix(vec3(0.62, 0.10, 0.16), vec3(0.08, 0.36, 0.42), smoothstep(0.35, 0.7, tone));
  ecol = mix(ecol, vec3(0.12, 0.20, 0.55), smoothstep(0.6, 0.85, fbm(dir * 2.3 + 4.4)));
  col += ecol * em * 0.5;
  col *= uNeb;
  col += vec3(0.004, 0.005, 0.009);
  gl_FragColor = vec4(col, 1.0);
}
`

const STAR_VERT = /* glsl */ `
${COMMON}
attribute float aMag;
attribute vec3 aCol;
uniform vec3 uCam;
uniform float uGain;
uniform float uSizeScale;
varying vec3 vCol;
varying float vA;
void main() {
  vec3 rel = position - uCam;
  float d = length(rel);
  vec3 c = camProject(rel);
  if (c.z <= 0.0 || d < 0.03) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vA = 0.0;
    vCol = vec3(0.0);
    return;
  }
  float m = aMag + 5.0 * log2(d / 32.616) * 0.30103;
  float b = clamp((10.0 - m) / 10.5, 0.0, 1.0);
  vA = pow(b, 1.25) * uGain * 1.5;
  gl_PointSize = (1.5 + 6.5 * pow(b, 2.0)) * uDpr * uSizeScale;
  gl_Position = vec4(c.xy, 0.0, 1.0);
  vCol = aCol;
}
`
const STAR_FRAG = /* glsl */ `
varying vec3 vCol;
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = exp(-r * r * 3.4) * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol, a);
}
`

const GAL_VERT = /* glsl */ `
${COMMON}
attribute vec4 aShape;
attribute vec3 aCol;
uniform float uGal;
uniform float uSizeScale;
varying vec4 vShape;
varying vec3 vCol;
void main() {
  vec3 c = camProject(position);
  if (c.z <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vCol = vec3(0.0);
    vShape = aShape;
    return;
  }
  gl_Position = vec4(c.xy, 0.0, 1.0);
  gl_PointSize = aShape.x * uDpr * uSizeScale;
  vShape = aShape;
  vCol = aCol * uGal;
}
`
const GAL_FRAG = /* glsl */ `
varying vec4 vShape;
varying vec3 vCol;
void main() {
  vec2 p = (gl_PointCoord - 0.5) * 2.0;
  float c = cos(vShape.z);
  float s = sin(vShape.z);
  p = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
  p.y /= vShape.y;
  float r = length(p);
  float edge = smoothstep(1.0, 0.75, r);
  float inten;
  if (vShape.w < 0.5) {
    float th = atan(p.y, p.x);
    float arms = 0.5 + 0.5 * cos(2.0 * th - 6.5 * log(r + 0.06));
    inten = exp(-r * r * 20.0) * 1.3 + exp(-r * 4.0) * (0.3 + 0.7 * arms) * 0.7;
  } else {
    inten = exp(-r * r * 8.0);
  }
  float a = inten * edge;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol, a);
}
`

const NEB_VERT = /* glsl */ `
${COMMON}
uniform vec3 uRel;
uniform float uHalf;
uniform float uAspect;
uniform float uRot;
uniform float uMinPx;
varying vec2 vUv;
varying float vFade;
void main() {
  vec3 c = camProject(uRel);
  if (c.z <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vUv = vec2(0.0);
    vFade = 0.0;
    return;
  }
  vec2 local = vec2(position.x * uAspect, position.y);
  float cs = cos(uRot);
  float sn = sin(uRot);
  local = vec2(cs * local.x - sn * local.y, sn * local.x + cs * local.y);
  vec2 half_ndc = vec2(uHalf / (c.z * uTan.x), uHalf / (c.z * uTan.y));
  vec2 minHalf = vec2(uMinPx) / (uRes * 0.5);
  half_ndc = max(half_ndc, minHalf);
  gl_Position = vec4(c.xy + local * half_ndc, 0.0, 1.0);
  vUv = position.xy;
  vFade = smoothstep(0.2 * uHalf, 1.6 * uHalf, c.z);
}
`
const NEB_FRAG = /* glsl */ `
${NOISE}
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
uniform float uMode;
uniform float uGain;
uniform float uSeed;
varying vec2 vUv;
varying float vFade;
void main() {
  vec2 uv = vUv;
  float r = length(uv);
  if (r > 1.0) discard;
  float n = fbm(vec3(uv * 2.4, uSeed));
  float n2 = fbm(vec3(uv * 5.5 + 3.0, uSeed + 4.0));
  float dens;
  if (uMode < 0.5) {
    float body = smoothstep(1.0, 0.15, r);
    dens = body * smoothstep(0.28, 0.9, n + 0.4 * body);
    float dark = smoothstep(0.55, 0.78, fbm(vec3(uv * 3.6, uSeed + 9.0)));
    dens *= 1.0 - 0.75 * dark;
  } else if (uMode < 1.5) {
    float ring = exp(-pow((r - 0.7) / 0.14, 2.0));
    float arcs = smoothstep(0.35, 0.72, fbm(vec3(uv * 3.0, uSeed)));
    float filament = smoothstep(0.4, 0.8, n2);
    dens = ring * arcs * (0.5 + 0.8 * filament) + 0.1 * smoothstep(0.9, 0.2, r) * n;
  } else {
    float rim = smoothstep(1.0, 0.45, r) * (0.35 + 0.65 * smoothstep(0.15, 0.6, r));
    dens = rim * (0.6 + 0.6 * n2);
  }
  vec3 col = mix(uA, uB, smoothstep(0.3, 0.75, n2));
  col = mix(col, uC, smoothstep(0.6, 0.9, n) * 0.5);
  float a = dens * uGain * vFade;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}
`

const GLOW_VERT = /* glsl */ `
${COMMON}
uniform vec3 uSys;
uniform float uPx;
varying vec2 vUv;
void main() {
  vec3 c = camProject(uSys);
  if (c.z <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vUv = vec2(0.0);
    return;
  }
  vec2 half_ndc = vec2(uPx) / (uRes * 0.5);
  gl_Position = vec4(c.xy + position.xy * half_ndc, 0.0, 1.0);
  vUv = position.xy;
}
`
const GLOW_FRAG = /* glsl */ `
uniform vec3 uCol;
uniform float uBright;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float core = exp(-r * r * 90.0);
  float halo = exp(-r * 7.0) * 0.45;
  float a = (core * 1.4 + halo) * uBright * smoothstep(1.0, 0.8, r);
  vec3 col = mix(uCol, vec3(1.0), core * 0.7);
  gl_FragColor = vec4(col, a);
}
`

const ORBIT_VERT = /* glsl */ `
${COMMON}
attribute float aOrb;
uniform vec3 uSys;
uniform vec3 uE1;
uniform vec3 uE2;
uniform float uRad[5];
uniform float uOrb;
varying float vA;
varying float vHab;
void main() {
  int k = int(aOrb + 0.5);
  float r = uRad[k];
  vec3 local = (uE1 * position.x + uE2 * position.y) * r;
  vec3 c = camProject(uSys + local);
  float pxr = r / max(length(uSys), 1e-12) / uTan.y * uRes.y * 0.5;
  if (c.z <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vA = 0.0;
    vHab = 0.0;
    return;
  }
  gl_Position = vec4(c.xy, 0.0, 1.0);
  vHab = k == 4 ? 1.0 : 0.0;
  vA = uOrb * smoothstep(4.0, 18.0, pxr) * (k == 4 ? 0.7 : 0.38);
}
`
const ORBIT_FRAG = /* glsl */ `
varying float vA;
varying float vHab;
void main() {
  if (vA < 0.003) discard;
  vec3 col = mix(vec3(0.91, 0.93, 0.96), vec3(0.56, 0.71, 1.0), vHab);
  gl_FragColor = vec4(col, vA);
}
`

const HZ_VERT = /* glsl */ `
${COMMON}
attribute float aT;
uniform vec3 uSys;
uniform vec3 uE1;
uniform vec3 uE2;
uniform vec2 uHz;
uniform float uOrb;
varying float vT;
varying float vA;
void main() {
  float r = mix(uHz.x, uHz.y, aT);
  vec3 local = (uE1 * position.x + uE2 * position.y) * r;
  vec3 c = camProject(uSys + local);
  if (c.z <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vT = 0.0;
    vA = 0.0;
    return;
  }
  float pxr = uHz.y / max(length(uSys), 1e-12) / uTan.y * uRes.y * 0.5;
  gl_Position = vec4(c.xy, 0.0, 1.0);
  vT = aT;
  vA = uOrb * smoothstep(8.0, 30.0, pxr);
}
`
const HZ_FRAG = /* glsl */ `
varying float vT;
varying float vA;
void main() {
  float e = abs(vT * 2.0 - 1.0);
  float a = vA * 0.11 * (1.0 - e * e);
  if (a < 0.002) discard;
  gl_FragColor = vec4(0.35, 0.78, 0.62, a);
}
`

const PLANET_VERT = /* glsl */ `
${COMMON}
attribute float aSize;
attribute vec3 aCol;
uniform vec3 uSys;
uniform vec3 uE1;
uniform vec3 uE2;
uniform float uOrb;
uniform float uSizeScale;
varying vec3 vCol;
varying float vA;
void main() {
  vec3 local = uE1 * position.x + uE2 * position.y;
  vec3 c = camProject(uSys + local);
  if (c.z <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vA = 0.0;
    vCol = vec3(0.0);
    return;
  }
  float pxr = length(position) / max(length(uSys), 1e-12) / uTan.y * uRes.y * 0.5;
  gl_Position = vec4(c.xy, 0.0, 1.0);
  gl_PointSize = aSize * uDpr * uSizeScale;
  vA = uOrb * smoothstep(5.0, 20.0, pxr);
  vCol = aCol;
}
`
const PLANET_FRAG = /* glsl */ `
varying vec3 vCol;
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.55, r) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol, a);
}
`

// ======================================================================================================================
// Buffers
// ======================================================================================================================
const absMag = (v: number, ly: number) => v - 5 * Math.log10(ly / 32.616)
const tint = (bv: number): [number, number, number] => {
  const [r, g, b] = kelvinToRgb(bvToKelvin(bv))
  const keep = 0.55
  return [1 + (r - 1) * keep, 1 + (g - 1) * keep, 1 + (b - 1) * keep]
}

function buildStars(high: boolean) {
  const rnd = mulberry32(1977)
  const pos: number[] = []
  const mag: number[] = []
  const col: number[] = []
  const push = (p: Vec3, M: number, bv: number) => {
    pos.push(p[0], p[1], p[2])
    mag.push(M)
    const t = tint(bv)
    col.push(t[0], t[1], t[2])
  }
  // Real stars: the catalogue (Chapters 06–07) at their true 3D positions, and the exoplanet hosts.
  for (const s of STARS) if (s.ly && s.bv !== undefined) push(posOf(s.ra, s.dec, s.ly), absMag(s.mag, s.ly), s.bv)
  for (const e of EXOPLANETS) if (e.id !== 'kepler-186f') push(posOf(e.ra, e.dec, e.ly), absMag(e.hostV, e.ly), e.hostBV)
  // Generated field in three shells around the Sun. Thin-disc geometry: scale height ≈ 250 ly, in the galactic frame.
  const shell = (n: number, rXY: number, scaleH: number, mLo: number, mSpan: number, skew: number) => {
    for (let i = 0; i < n; i++) {
      const rr = rXY * Math.sqrt(rnd())
      const th = rnd() * Math.PI * 2
      const z = -scaleH * Math.log(1 - rnd() * 0.999) * (rnd() < 0.5 ? -1 : 1)
      const x = rr * Math.cos(th)
      const y = rr * Math.sin(th)
      const p: Vec3 = [x * GAL_X[0] + y * GAL_Y[0] + z * GAL_Z[0], x * GAL_X[1] + y * GAL_Y[1] + z * GAL_Z[1], x * GAL_X[2] + y * GAL_Y[2] + z * GAL_Z[2]]
      const M = mLo + mSpan * Math.pow(rnd(), skew)
      let bv: number
      if (M < 1.2) bv = rnd() < 0.72 ? -0.2 + 0.55 * rnd() : 1.0 + 0.6 * rnd()
      else bv = 0.3 + 1.3 * Math.pow((M - 1) / 9, 0.8) * (0.8 + 0.4 * rnd())
      push(p, M, bv)
    }
  }
  const k = high ? 1 : 0.5
  shell(Math.round(9000 * k), 260, 120, -1, 11, 0.7)
  shell(Math.round(9000 * k), 1100, 220, -3, 10, 0.8)
  shell(Math.round(5000 * k), 3600, 260, -5, 7, 1.0)
  return { pos: new Float32Array(pos), mag: new Float32Array(mag), col: new Float32Array(col) }
}

function buildGalaxies(count: number) {
  const rnd = mulberry32(31337)
  const pos = new Float32Array(count * 3)
  const shape = new Float32Array(count * 4)
  const col = new Float32Array(count * 3)
  let n = 0
  while (n < count) {
    // Uniform on the sphere, rejecting the zone of avoidance where the Milky Way's dust hides the extragalactic sky.
    const z = rnd() * 2 - 1
    const ph = rnd() * Math.PI * 2
    const s = Math.sqrt(1 - z * z)
    const d: Vec3 = [s * Math.cos(ph), s * Math.sin(ph), z]
    const sb = d[0] * GAL_Z[0] + d[1] * GAL_Z[1] + d[2] * GAL_Z[2]
    if (Math.abs(sb) < Math.sin((11 * Math.PI) / 180)) continue
    pos.set(d, n * 3)
    const spiral = rnd() < 0.62
    const size = 11 + 26 * Math.pow(rnd(), 2.2)
    shape[n * 4] = size
    shape[n * 4 + 1] = spiral ? 0.25 + 0.75 * rnd() : 0.55 + 0.45 * rnd()
    shape[n * 4 + 2] = rnd() * Math.PI
    shape[n * 4 + 3] = spiral ? 0 : 1
    const br = 0.6 + 0.8 * Math.pow(rnd(), 2)
    const c: Vec3 = spiral ? [0.62, 0.74, 1.0] : [1.0, 0.82, 0.58]
    col.set([c[0] * br, c[1] * br, c[2] * br], n * 3)
    n++
  }
  return { pos, shape, col }
}

// ======================================================================================================================
// Scene
// ======================================================================================================================
interface SceneProps {
  progress: RefObject<number>
  active: boolean
  /** The stage element: labels and readouts are found inside it (`data-ds-label`, `data-ds-planet`, `data-hud`). */
  stage: RefObject<HTMLElement | null>
  onReady: () => void
}

const v3 = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2])
const FOV_BASE = Math.tan((26 * Math.PI) / 180)

function Flight({ progress, stage, onReady, animate, tier, cursor }: Omit<SceneProps, 'active'> & { animate: boolean; tier: 'low' | 'high'; cursor: boolean }) {
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const high = tier === 'high'

  const built = useMemo(() => {
    const U = {
      uRight: { value: new THREE.Vector3(1, 0, 0) },
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uFwd: { value: new THREE.Vector3(0, 0, -1) },
      uTan: { value: new THREE.Vector2(FOV_BASE, FOV_BASE) },
      uShift: { value: new THREE.Vector2(0, 0) },
      uRes: { value: new THREE.Vector2(1000, 600) },
      uDpr: { value: 1 },
    }
    const make = (vertexShader: string, fragmentShader: string, extra: Record<string, THREE.IUniform>, blending: THREE.Blending) =>
      new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { ...U, ...extra }, transparent: blending !== THREE.NoBlending, blending, depthTest: false, depthWrite: false })
    const group = new THREE.Group()
    const add = (o: THREE.Object3D, order: number) => {
      o.frustumCulled = false
      o.renderOrder = order
      group.add(o)
      return o
    }
    const quad = new THREE.PlaneGeometry(2, 2)
    const disposables: { dispose: () => void }[] = [quad]

    // 0 sky
    const sky = make(SKY_VERT, SKY_FRAG, {
      uGX: { value: v3(GAL_X) }, uGY: { value: v3(GAL_Y) }, uGZ: { value: v3(GAL_Z) }, uNeb: { value: 0.3 },
    }, THREE.NoBlending)
    add(new THREE.Mesh(quad, sky), 0)

    // 1 galaxies
    const g = buildGalaxies(high ? 260 : 130)
    const gGeo = new THREE.BufferGeometry()
    gGeo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3))
    gGeo.setAttribute('aShape', new THREE.BufferAttribute(g.shape, 4))
    gGeo.setAttribute('aCol', new THREE.BufferAttribute(g.col, 3))
    const gal = make(GAL_VERT, GAL_FRAG, { uGal: { value: 0 }, uSizeScale: { value: 1 } }, THREE.AdditiveBlending)
    add(new THREE.Points(gGeo, gal), 1)
    disposables.push(gGeo)

    // 2 nebulae
    const nebs = NEBULAE.map((n) => {
      const m = make(NEB_VERT, NEB_FRAG, {
        uRel: { value: new THREE.Vector3() }, uHalf: { value: n.size * 1.25 }, uAspect: { value: n.aspect }, uRot: { value: n.rot }, uMinPx: { value: n.size < 10 ? 7 : 0 },
        uA: { value: v3(n.a) }, uB: { value: v3(n.b) }, uC: { value: v3(n.c) }, uMode: { value: n.mode }, uGain: { value: 0 }, uSeed: { value: n.seed },
      }, THREE.AdditiveBlending)
      add(new THREE.Mesh(quad, m), 2)
      return { n, m, pos: posOf(n.ra, n.dec, n.ly) }
    })

    // 3 stars
    const st = buildStars(high)
    const sGeo = new THREE.BufferGeometry()
    sGeo.setAttribute('position', new THREE.BufferAttribute(st.pos, 3))
    sGeo.setAttribute('aMag', new THREE.BufferAttribute(st.mag, 1))
    sGeo.setAttribute('aCol', new THREE.BufferAttribute(st.col, 3))
    const stars = make(STAR_VERT, STAR_FRAG, { uCam: { value: new THREE.Vector3() }, uGain: { value: 1 }, uSizeScale: { value: 1 } }, THREE.AdditiveBlending)
    add(new THREE.Points(sGeo, stars), 3)
    disposables.push(sGeo)

    // 4–7 the Kepler-186 system (positions relative to the star, in the orbital plane)
    const sys = { uSys: { value: new THREE.Vector3() }, uE1: { value: v3(PLANE_E1) }, uE2: { value: v3(PLANE_E2) }, uOrb: { value: 0 } }
    const SEG = 160
    const hzPos: number[] = []
    const hzT: number[] = []
    for (let k = 0; k < SEG; k++) {
      const a0 = (k / SEG) * Math.PI * 2
      const a1 = ((k + 1) / SEG) * Math.PI * 2
      const p = (a: number, t: number) => {
        hzPos.push(Math.cos(a), Math.sin(a), 0)
        hzT.push(t)
      }
      p(a0, 0); p(a0, 1); p(a1, 0)
      p(a1, 0); p(a0, 1); p(a1, 1)
    }
    const hzGeo = new THREE.BufferGeometry()
    hzGeo.setAttribute('position', new THREE.Float32BufferAttribute(hzPos, 3))
    hzGeo.setAttribute('aT', new THREE.Float32BufferAttribute(hzT, 1))
    const hz = make(HZ_VERT, HZ_FRAG, { ...sys, uHz: { value: new THREE.Vector2(HZ_AU[0] * LY_PER_AU, HZ_AU[1] * LY_PER_AU) } }, THREE.AdditiveBlending)
    hz.side = THREE.DoubleSide
    add(new THREE.Mesh(hzGeo, hz), 4)
    disposables.push(hzGeo)

    const oPos: number[] = []
    const oIdx: number[] = []
    for (let o = 0; o < SYSTEM_PLANETS.length; o++) {
      for (let k = 0; k < SEG; k++) {
        const a0 = (k / SEG) * Math.PI * 2
        const a1 = ((k + 1) / SEG) * Math.PI * 2
        oPos.push(Math.cos(a0), Math.sin(a0), 0, Math.cos(a1), Math.sin(a1), 0)
        oIdx.push(o, o)
      }
    }
    const oGeo = new THREE.BufferGeometry()
    oGeo.setAttribute('position', new THREE.Float32BufferAttribute(oPos, 3))
    oGeo.setAttribute('aOrb', new THREE.Float32BufferAttribute(oIdx, 1))
    const orbits = make(ORBIT_VERT, ORBIT_FRAG, { ...sys, uRad: { value: SYSTEM_AU.map((a) => a * LY_PER_AU) } }, THREE.AdditiveBlending)
    add(new THREE.LineSegments(oGeo, orbits), 5)
    disposables.push(oGeo)

    const glowCol = kelvinToRgb(TARGET_TEFF)
    const glow = make(GLOW_VERT, GLOW_FRAG, { uSys: sys.uSys, uPx: { value: 8 }, uCol: { value: new THREE.Vector3(glowCol[0], glowCol[1] * 0.95, glowCol[2] * 0.9) }, uBright: { value: 0 } }, THREE.AdditiveBlending)
    add(new THREE.Mesh(quad, glow), 6)

    const pPos = new Float32Array(SYSTEM_PLANETS.length * 3)
    const pGeo = new THREE.BufferGeometry()
    const pAttr = new THREE.BufferAttribute(pPos, 3)
    pAttr.setUsage(THREE.DynamicDrawUsage)
    pGeo.setAttribute('position', pAttr)
    pGeo.setAttribute('aSize', new THREE.Float32BufferAttribute(SYSTEM_PLANETS.map((p) => (p.id === 'f' ? 7 : 5)), 1))
    pGeo.setAttribute('aCol', new THREE.Float32BufferAttribute(SYSTEM_PLANETS.flatMap((p) => (p.id === 'f' ? [0.56, 0.71, 1.0] : [0.93, 0.9, 0.84])), 3))
    const planets = make(PLANET_VERT, PLANET_FRAG, { ...sys, uSizeScale: { value: 1 } }, THREE.NormalBlending)
    planets.blending = THREE.NormalBlending
    add(new THREE.Points(pGeo, planets), 7)
    disposables.push(pGeo)

    const mats = [sky, gal, stars, hz, orbits, glow, planets, ...nebs.map((n) => n.m)]
    return { U, group, sky, gal, stars, nebs, sys, glow, pAttr, pPos, mats, disposables }
  }, [high])

  useEffect(
    () => () => {
      built.mats.forEach((m) => m.dispose())
      built.disposables.forEach((d) => d.dispose())
    },
    [built],
  )

  const S = useRef({
    p: 0,
    yaw: 0,
    pitch: 0,
    tYaw: 0,
    tPitch: 0,
    inited: false,
    ready: false,
    labels: [] as { el: HTMLElement; id: string; w: [number, number, number, number]; side: 1 | -1; last: string; lastO: string; pos: Vec3 }[],
    planets: [] as { el: HTMLElement; i: number; last: string; lastO: string }[],
    sunHud: null as HTMLElement | null,
    tgtHud: null as HTMLElement | null,
    lastSun: '',
    lastTgt: '',
  }).current

  useEffect(() => {
    const root = stage.current
    if (!root) return
    S.labels = Array.from(root.querySelectorAll<HTMLElement>('[data-ds-label]')).flatMap((el) => {
      const l = SCENE_LABELS.find((x) => x.id === el.dataset.dsLabel)
      return l ? [{ el, id: l.id, w: l.w, side: l.side, last: '', lastO: '', pos: l.pos }] : []
    })
    S.planets = Array.from(root.querySelectorAll<HTMLElement>('[data-ds-planet]')).flatMap((el) => {
      const i = SYSTEM_PLANETS.findIndex((p) => p.id === el.dataset.dsPlanet)
      return i >= 0 ? [{ el, i, last: '', lastO: '' }] : []
    })
    S.sunHud = root.querySelector<HTMLElement>('[data-hud="sun"]')
    S.tgtHud = root.querySelector<HTMLElement>('[data-hud="target"]')
  }, [stage, S])

  // Cursor look-around: a few degrees, damped. Fine pointers only.
  useEffect(() => {
    if (!cursor) return
    const move = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2
      const ny = (e.clientY / window.innerHeight - 0.5) * 2
      S.tYaw = -nx * 0.045
      S.tPitch = -ny * 0.028
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => window.removeEventListener('pointermove', move)
  }, [cursor, S])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const target = animate ? progress.current ?? 0 : P_STILL
    if (!S.inited || !animate) {
      S.p = target
      S.inited = true
    } else S.p += (target - S.p) * (1 - Math.exp(-dt * 5.5))
    const p = S.p
    if (animate && cursor) {
      const k = 1 - Math.exp(-dt * 3)
      S.yaw += (S.tYaw - S.yaw) * k
      S.pitch += (S.tPitch - S.pitch) * k
    }
    const w = size.width
    const h = size.height
    const aspect = w / h
    const wide = aspect > 1.05
    const pose = poseAt(p, S.yaw, S.pitch)

    // Lens: slightly narrower for the system view; portrait screens keep a usable horizontal field.
    const zoom = 1 - 0.22 * pose.swing
    let tanX = FOV_BASE * zoom * aspect
    const tanMin = FOV_BASE * zoom * 0.95
    if (tanX < tanMin) tanX = tanMin
    const tanY = tanX / aspect
    const ease = smooth(0.0, 0.6, p)
    const shiftX = wide ? (0.17 + 0.22 * pose.swing) * ease : 0
    const shiftY = wide ? 0.04 * pose.swing : 0.2 * ease

    const { U } = built
    U.uRight.value.set(pose.right[0], pose.right[1], pose.right[2])
    U.uUp.value.set(pose.up[0], pose.up[1], pose.up[2])
    U.uFwd.value.set(pose.fwd[0], pose.fwd[1], pose.fwd[2])
    U.uTan.value.set(tanX, tanY)
    U.uShift.value.set(shiftX, shiftY)
    U.uRes.value.set(w, h)
    const dpr = state.viewport.dpr
    U.uDpr.value = dpr
    const sizeScale = Math.min(1.5, Math.max(0.75, h / 900))

    const cam = pose.pos
    built.stars.uniforms.uCam.value.set(cam[0], cam[1], cam[2])
    built.stars.uniforms.uSizeScale.value = sizeScale
    built.stars.uniforms.uGain.value = 0.75 + 0.25 * smooth(0, 0.3, p)
    built.sky.uniforms.uNeb.value = 0.12 + 0.88 * smooth(0.04, 0.5, p)
    built.gal.uniforms.uGal.value = 0.95 * smooth(0.25, 0.6, p)
    built.gal.uniforms.uSizeScale.value = sizeScale

    for (const nb of built.nebs) {
      const rel = vsub(nb.pos, cam)
      nb.m.uniforms.uRel.value.set(rel[0], rel[1], rel[2])
      nb.m.uniforms.uGain.value = nb.n.gain * smooth(0.18, 0.5, p) * (1 - 0.4 * smooth(0.85, 0.97, p))
    }

    // The Kepler-186 system, positioned relative to the camera in float64 before it reaches the GPU.
    const sysRel = vsub(TARGET_POS, cam)
    built.sys.uSys.value.set(sysRel[0], sysRel[1], sysRel[2])
    built.sys.uOrb.value = smooth(0.78, 0.88, p)
    const d = pose.dTarget
    const m = TARGET_ABS_MAG + 5 * Math.log10(d / 32.616)
    const b = Math.min(1, Math.max(0, (8.6 - m) / 9.6))
    built.glow.uniforms.uBright.value = Math.pow(b, 1.3)
    built.glow.uniforms.uPx.value = (5 + 40 * Math.pow(b, 1.4)) * sizeScale

    const t = animate ? clockSeconds() * DAYS_PER_SECOND : 0
    const local: Vec3[] = SYSTEM_PLANETS.map((pl, i) => {
      const ph = pl.phase + (2 * Math.PI * t) / pl.period
      const r = SYSTEM_AU[i] * LY_PER_AU
      return [Math.cos(ph) * r, Math.sin(ph) * r, 0]
    })
    local.forEach((l, i) => built.pPos.set(l, i * 3))
    built.pAttr.needsUpdate = true

    // ----- DOM: labels, planet labels, readouts ------------------------------------------------------------------------
    for (const L of S.labels) {
      const o = fadeAt(p, L.w)
      let x = -1e5
      let y = -1e5
      let vis = o
      if (o > 0.01) {
        const sc = projectToScreen(L.pos, pose, tanX, tanY, shiftX, shiftY, w, h)
        x = sc.x
        y = sc.y
        if (sc.z <= 0 || x < -20 || x > w + 20 || y < -20 || y > h + 20) vis = 0
        // Keep clear of the text block at the lower left.
        if (wide && L.id !== 'target' && x < Math.min(w * 0.52, 660) && y > h * 0.4) vis = 0
      }
      const tf = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      const op = vis.toFixed(2)
      if (tf !== L.last) {
        L.el.style.transform = tf
        L.last = tf
      }
      if (op !== L.lastO) {
        L.el.style.opacity = op
        L.lastO = op
      }
    }
    const planetsOn = smooth(0.9, 0.95, p)
    for (const P of S.planets) {
      const l = local[P.i]
      const world = vadd(TARGET_POS, vadd(vscale(PLANE_E1, l[0]), vscale(PLANE_E2, l[1])))
      const sc = projectToScreen(world, pose, tanX, tanY, shiftX, shiftY, w, h)
      const vis = sc.z > 0 && sc.x > -20 && sc.x < w + 20 && sc.y > -20 && sc.y < h + 20 ? planetsOn : 0
      const tf = `translate3d(${sc.x.toFixed(1)}px, ${sc.y.toFixed(1)}px, 0)`
      const op = vis.toFixed(2)
      if (tf !== P.last) {
        P.el.style.transform = tf
        P.last = tf
      }
      if (op !== P.lastO) {
        P.el.style.opacity = op
        P.lastO = op
      }
    }
    if (S.sunHud) {
      const txt = p < 0.004 ? '0 ly' : fmtDist(vlen(cam))
      if (txt !== S.lastSun) {
        S.sunHud.textContent = txt
        S.lastSun = txt
      }
    }
    if (S.tgtHud) {
      const txt = fmtDist(d)
      if (txt !== S.lastTgt) {
        S.tgtHud.textContent = txt
        S.lastTgt = txt
      }
    }

    if (!S.ready) {
      S.ready = true
      onReady()
    }
  })

  useEffect(() => {
    if (!animate) invalidate()
  }, [animate, invalidate, size.width, size.height])

  return <primitive object={built.group} />
}

/** Chapter 08 canvas. Lazy-loaded from `ChapterDeepSpace`. Opaque: it draws its own sky. */
export default function DeepSpaceScene({ progress, active, stage, onReady }: SceneProps) {
  const { tier, animate, maxDpr, cursorParallax } = useRenderProfile()
  return (
    <Canvas dpr={Math.min(maxDpr, 1.5)} frameloop={active && animate ? 'always' : 'demand'} gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}>
      <Flight progress={progress} stage={stage} onReady={onReady} animate={animate} tier={tier} cursor={cursorParallax} />
    </Canvas>
  )
}
