import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { BY_ID } from '@/data/sky'
import {
  D2R, EQ_TO_GAL, PLANET_IDS, apply, azOf, altOf, ephemeris, fmtLmt, fmtLocalDate, horizontalMatrix, jdFromMs, mulMat, sunDirection,
  norm180, topocentric, transpose, type Ephemeris, type Mat3, type Vec3,
} from '@/lib/astro'
import { FIXED_DIRS, buildLines, buildStars, constellationCentres } from '@/lib/skyGeometry'
import { dirOf, isMoving } from '@/lib/skyInfo'
import {
  RIDGE_GLSL, basisFor, compass, project, pxPerDegree, ridgeFar, tanQuarter, type SkyControl,
} from '@/lib/skyView'
import { useRenderProfile } from '@/hooks/useRenderProfile'
import { clockSeconds } from '@/lib/clock'

// ---------------------------------------------------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------------------------------------------------
const PROJ = /* glsl */ `
uniform vec3 uFwd; uniform vec3 uRight; uniform vec3 uUp; uniform float uTan; uniform float uAspect;
vec2 projectDir(vec3 d, out float cf){
  cf = clamp(dot(d, uFwd), -1.0, 1.0);
  float th = acos(cf);
  vec3 pr = d - uFwd * cf;
  float pl = length(pr);
  vec2 dir = pl > 1e-5 ? vec2(dot(pr, uRight), dot(pr, uUp)) / pl : vec2(0.0);
  float rho = tan(min(th, 3.0) * 0.5) / uTan;
  return vec2(dir.x * rho / uAspect, dir.y * rho);
}
`

const BG_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const BG_FRAG = /* glsl */ `
varying vec2 vUv;
uniform vec3 uFwd; uniform vec3 uRight; uniform vec3 uUp; uniform float uTan; uniform float uAspect;
uniform float uTime; uniform float uReveal; uniform float uExpo; uniform float uMoonLight; uniform float uSunAlt; uniform float uSunAz;
uniform vec3 uMoonDir; uniform mat3 uG;
${RIDGE_GLSL}
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float a = 0.5; float s = 0.0; for (int i = 0; i < 4; i++){ s += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }

void main(){
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  float rho = length(p);
  float th = 2.0 * atan(rho * uTan);
  vec3 dir = rho > 1e-5 ? uFwd * cos(th) + (uRight * p.x + uUp * p.y) / rho * sin(th) : uFwd;
  float alt = asin(clamp(dir.z, -1.0, 1.0));
  float az = atan(dir.x, dir.y);
  float rn = ridgeNear(az);
  float rf = ridgeFar(az);
  float aa = max(fwidth(alt) * 1.2, 1e-4);

  // Twilight: 0 in full night, 1 at sunset.
  float tw = smoothstep(-0.314, -0.0145, uSunAlt);
  float warm = smoothstep(-0.2, -0.01, uSunAlt);
  float sw = 0.5 + 0.5 * cos(az - uSunAz);

  vec3 zen = vec3(0.007, 0.010, 0.026);
  vec3 hor = vec3(0.024, 0.034, 0.070);
  float h01 = pow(clamp(1.0 - max(alt, 0.0) / 1.2, 0.0, 1.0), 2.0);
  vec3 col = mix(zen, hor, h01);
  vec3 twc = mix(vec3(0.05, 0.10, 0.24), vec3(1.0, 0.50, 0.25), warm * sw);
  col += twc * pow(tw, 1.6) * (0.10 + 0.9 * sw * sw) * exp(-max(alt, 0.0) / (0.10 + 0.5 * tw)) * 0.55;
  col += vec3(0.015, 0.03, 0.06) * tw * tw;
  col += vec3(0.006, 0.014, 0.012) * exp(-max(alt, 0.0) / 0.10) * (1.0 - tw);

  // Moonlight: a halo around the Moon and a faint wash over the whole sky.
  float md = acos(clamp(dot(dir, uMoonDir), -1.0, 1.0));
  col += uMoonLight * (vec3(0.50, 0.58, 0.78) * exp(-md * md / 0.0035) * 0.30 + vec3(0.12, 0.16, 0.26) * exp(-md / 0.45) * 0.20);
  col += vec3(0.010, 0.014, 0.026) * uMoonLight;

  // Milky Way, in galactic coordinates: band + bulge, mottled by noise, cut by dust lanes.
  float ext = smoothstep(0.0, 0.35, alt);
  float dark = (1.0 - tw) * (1.0 - tw);
  if (dark > 0.01 && uReveal > 0.5) {
    vec3 g = uG * dir;
    float b = asin(clamp(g.z, -1.0, 1.0));
    float l = atan(g.y, g.x);
    float band = exp(-b * b / (2.0 * 0.12 * 0.12)) + 0.28 * exp(-b * b / (2.0 * 0.4 * 0.4));
    float lw = 0.5 + 0.5 * cos(l);
    float core = exp(-l * l / 0.28) * exp(-b * b / (2.0 * 0.14 * 0.14)) * 0.7;
    float n1 = fbm(g * 5.0);
    float n2 = fbm(g * 14.0 + 3.0);
    float lane = smoothstep(0.50, 0.72, fbm(vec3(g.xy * 3.6, g.z * 10.0) + 9.0)) * exp(-b * b / (2.0 * 0.08 * 0.08));
    float mw = (band * (0.35 + 0.65 * lw * lw) + 1.1 * core) * (0.7 + 0.6 * n1) * (0.85 + 0.3 * n2) * (1.0 - 0.8 * lane);
    vec3 mwc = mix(vec3(0.60, 0.70, 1.00), vec3(1.0, 0.88, 0.74), clamp(core * 1.0 + lw * lw * 0.25, 0.0, 1.0));
    float mwR = smoothstep(0.55, 1.0, uReveal);
    col += mwc * mw * 0.14 * mwR * ext * dark * (1.0 - 0.85 * uMoonLight);
  }

  // Ground: a hazy far ridge and a black near ridge.
  vec3 haze = mix(hor * 0.9, twc * 0.25, tw * 0.6) * 0.5;
  float farM = 1.0 - smoothstep(rf - aa, rf + aa, alt);
  float nearM = 1.0 - smoothstep(rn - aa, rn + aa, alt);
  vec3 farCol = haze * (0.7 + 0.3 * smoothstep(-0.2, rf, alt));
  col = mix(col, farCol, farM);
  col = mix(col, vec3(0.0015, 0.002, 0.004), nearM);

  col *= uExpo;
  col *= 1.0 - 0.14 * dot(vUv, vUv);
  col += (hash(vec3(gl_FragCoord.xy, 1.0)) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`

const STAR_VERT = /* glsl */ `
attribute float aMag; attribute vec3 aCol; attribute float aSeed;
uniform mat3 uM; uniform float uPx; uniform float uZoom; uniform float uTime; uniform float uReveal; uniform float uExpo;
uniform float uMoonLight; uniform float uTwi;
${PROJ}
${RIDGE_GLSL}
varying vec3 vCol; varying float vA;
void main(){
  vec3 d = uM * position;
  float alt = asin(clamp(d.z, -1.0, 1.0));
  float az = atan(d.x, d.y);
  float vis = smoothstep(ridgeFar(az), ridgeFar(az) + 0.025, alt);
  float ext = mix(0.30, 1.0, smoothstep(0.0, 0.40, alt));
  float cf;
  vec2 q = projectDir(d, cf);
  gl_Position = vec4(q, 0.0, 1.0);
  float thr = clamp((aMag + 1.5) / 8.0, 0.0, 1.0) * 0.88;
  float rv = smoothstep(thr, thr + 0.12, uReveal);
  float wash = 1.0 - uMoonLight * smoothstep(1.5, 5.0, aMag) * 0.9;
  wash *= 1.0 - uTwi * smoothstep(-0.5, 3.5, aMag) * 0.97;
  float flick = 1.0 + 0.10 * sin(uTime * (2.0 + aSeed * 3.0) + aSeed * 60.0) * (1.0 + (1.0 - ext) * 2.0);
  float size = (2.0 + 6.0 * pow(10.0, -0.13 * (aMag + 1.5))) * uZoom;
  vA = clamp(0.42 + 0.75 * pow(10.0, -0.14 * aMag), 0.0, 1.0) * vis * ext * rv * wash * flick * uExpo;
  vCol = aCol;
  gl_PointSize = size * uPx;
}
`
const STAR_FRAG = /* glsl */ `
varying vec3 vCol; varying float vA;
void main(){
  float r = length(gl_PointCoord - 0.5) * 2.0;
  if (r > 1.0 || vA < 0.003) discard;
  float a = (exp(-r * r * 6.0) + exp(-r * 4.0) * 0.35) * vA;
  gl_FragColor = vec4(vCol, a);
}
`

const LINE_VERT = /* glsl */ `
attribute float aAster;
uniform mat3 uM; uniform float uReveal; uniform float uExpo; uniform float uLines; uniform float uTwi;
${PROJ}
${RIDGE_GLSL}
varying float vA;
void main(){
  vec3 d = uM * position;
  float alt = asin(clamp(d.z, -1.0, 1.0));
  float az = atan(d.x, d.y);
  float vis = smoothstep(ridgeFar(az), ridgeFar(az) + 0.03, alt);
  float cf;
  vec2 q = projectDir(d, cf);
  gl_Position = vec4(q, 0.0, 1.0);
  vA = vis * (1.0 - aAster * 0.45) * 0.20 * uLines * smoothstep(0.55, 0.95, uReveal) * uExpo * (1.0 - uTwi * 0.8);
}
`
const LINE_FRAG = /* glsl */ `
varying float vA;
void main(){ gl_FragColor = vec4(0.62, 0.72, 1.0, vA); }
`

const BODY_VERT = /* glsl */ `
attribute float aSize; attribute vec3 aCol; attribute float aKind;
uniform float uPx; uniform float uReveal; uniform float uExpo;
${PROJ}
${RIDGE_GLSL}
varying vec3 vCol; varying float vA; varying float vKind;
void main(){
  float alt = asin(clamp(position.z, -1.0, 1.0));
  float az = atan(position.x, position.y);
  float rf = ridgeFar(az);
  float vis = smoothstep(rf - 0.003, rf + 0.012, alt);
  float ext = mix(0.45, 1.0, smoothstep(0.0, 0.3, alt));
  float cf;
  vec2 q = projectDir(position, cf);
  gl_Position = vec4(q, 0.0, 1.0);
  vA = vis * ext * smoothstep(0.08, 0.32, uReveal) * uExpo;
  vCol = aCol; vKind = aKind;
  gl_PointSize = aSize * uPx;
}
`
const BODY_FRAG = /* glsl */ `
varying vec3 vCol; varying float vA; varying float vKind;
uniform float uMoonR; uniform vec2 uLimb; uniform float uPhaseI;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  if (vA < 0.003) discard;
  if (vKind < 0.5) {
    float r = length(c) * 2.0;
    if (r > 1.0) discard;
    float a = (exp(-r * r * 14.0) + exp(-r * 3.5) * 0.5) * vA;
    gl_FragColor = vec4(vCol * a, 1.0);
  } else {
    vec2 u = vec2(c.x, -c.y) * 2.0 / uMoonR;
    float rr = length(u);
    float px = fwidth(rr);
    float edge = 1.0 - smoothstep(1.0 - px, 1.0 + px, rr);
    vec3 n = vec3(u, sqrt(max(0.0, 1.0 - rr * rr)));
    vec3 L = vec3(sin(uPhaseI) * uLimb, cos(uPhaseI));
    float lit = smoothstep(0.0, 0.10, dot(n, L));
    float k = 0.5 * (1.0 + cos(uPhaseI));
    vec3 disc = vec3(0.93, 0.92, 0.88) * (0.035 + 0.95 * lit);
    float halo = exp(-max(rr - 1.0, 0.0) * 1.8) * 0.30 * k * (1.0 - edge) * step(rr, 1.0 / uMoonR);
    vec3 rgb = (disc * edge + vec3(0.62, 0.70, 0.90) * halo) * vA;
    gl_FragColor = vec4(rgb, 1.0);
  }
}
`

// ---------------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------------
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const smooth = (x: number) => {
  const t = clamp01(x)
  return t * t * (3 - 2 * t)
}
const smoothRange = (a: number, b: number, x: number) => smooth((x - a) / (b - a))

const BODY_COL: Record<string, [number, number, number]> = {
  mercury: [0.79, 0.76, 0.72], venus: [0.97, 0.93, 0.82], mars: [0.88, 0.54, 0.39], jupiter: [0.92, 0.85, 0.72],
  saturn: [0.91, 0.85, 0.66], moon: [0.91, 0.93, 0.96],
}
const BODY_IDS = [...PLANET_IDS, 'moon'] as const
const NIGHT_SPEED = 900 // simulated seconds per real second in time-lapse

interface Item {
  id: string
  el: HTMLElement
  last: string
  prio: number
  boxW: number
  kind: string
  mag: number
}
interface Hit {
  id: string
  x: number
  y: number
  r: number
}

export interface SkySceneProps {
  progress: RefObject<number>
  active: boolean
  stage: RefObject<HTMLElement | null>
  ctrl: SkyControl
  onReady: () => void
}

function Sky({ progress, stage, ctrl, onReady, animate, tier }: Omit<SkySceneProps, 'active'> & { animate: boolean; tier: 'low' | 'high' }) {
  const high = tier === 'high'
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)

  const stars = useMemo(() => buildStars(high ? 4200 : 2200), [high])
  const lineBuf = useMemo(() => buildLines(), [])

  const U = useMemo(
    () => ({
      uM: { value: new THREE.Matrix3() },
      uG: { value: new THREE.Matrix3() },
      uFwd: { value: new THREE.Vector3(0, 1, 0) },
      uRight: { value: new THREE.Vector3(1, 0, 0) },
      uUp: { value: new THREE.Vector3(0, 0, 1) },
      uTan: { value: 0.5 },
      uAspect: { value: 1.6 },
      uPx: { value: 1 },
      uZoom: { value: 1 },
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uExpo: { value: 0 },
      uMoonLight: { value: 0 },
      uMoonDir: { value: new THREE.Vector3(0, 0, -1) },
      uSunAlt: { value: -1 },
      uSunAz: { value: 0 },
      uTwi: { value: 0 },
      uLines: { value: 1 },
      uMoonR: { value: 0.3 },
      uLimb: { value: new THREE.Vector2(1, 0) },
      uPhaseI: { value: 0 },
    }),
    [],
  )

  const bg = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(2, 2)
    const material = new THREE.ShaderMaterial({ vertexShader: BG_VERT, fragmentShader: BG_FRAG, uniforms: U, depthTest: false, depthWrite: false })
    return { geometry, material }
  }, [U])

  const starObj = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(stars.pos, 3))
    geometry.setAttribute('aMag', new THREE.BufferAttribute(stars.mag, 1))
    geometry.setAttribute('aCol', new THREE.BufferAttribute(stars.col, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(stars.seed, 1))
    const material = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: U, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return { geometry, material }
  }, [stars, U])

  const lineObj = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(lineBuf.pos, 3))
    geometry.setAttribute('aAster', new THREE.BufferAttribute(lineBuf.aster, 1))
    const material = new THREE.ShaderMaterial({
      vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, uniforms: U, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return { geometry, material }
  }, [lineBuf, U])

  const bodyObj = useMemo(() => {
    const n = BODY_IDS.length
    const geometry = new THREE.BufferGeometry()
    const pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3)
    const sz = new THREE.BufferAttribute(new Float32Array(n), 1)
    const col = new Float32Array(n * 3)
    const kind = new Float32Array(n)
    BODY_IDS.forEach((id, i) => {
      col.set(BODY_COL[id], i * 3)
      kind[i] = id === 'moon' ? 1 : 0
    })
    geometry.setAttribute('position', pos)
    geometry.setAttribute('aSize', sz)
    geometry.setAttribute('aCol', new THREE.BufferAttribute(col, 3))
    geometry.setAttribute('aKind', new THREE.BufferAttribute(kind, 1))
    const material = new THREE.ShaderMaterial({
      vertexShader: BODY_VERT, fragmentShader: BODY_FRAG, uniforms: U, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    })
    return { geometry, material, pos, sz }
  }, [U])

  useEffect(
    () => () => {
      for (const o of [bg, starObj, lineObj, bodyObj]) {
        o.geometry.dispose()
        o.material.dispose()
      }
    },
    [bg, starObj, lineObj, bodyObj],
  )

  const dpr = useMemo(() => Math.min(window.devicePixelRatio || 1, high ? 1.75 : 1.25), [high])
  useEffect(() => {
    gl.setPixelRatio(dpr)
    if (!animate) invalidate()
  }, [gl, dpr, animate, invalidate, size.width, size.height])

  const centres = useMemo(() => constellationCentres(), [])

  const S = useRef({
    items: [] as Item[],
    cons: [] as Item[],
    compass: [] as Item[],
    hits: [] as Hit[],
    cur: { az: ctrl.az, alt: ctrl.alt, fov: ctrl.fov },
    inited: false,
    ready: false,
    lastRender: 0,
    tPrev: Number.NaN,
    sitePrev: '',
    eph: null as Ephemeris | null,
    M: null as Mat3 | null,
    lastP: -1,
    lastView: '',
    lines: 1,
    focused: false,
    timeTarget: null as number | null,
    lastText: new Map<string, string>(),
    ring: null as HTMLElement | null,
  }).current

  // Find the DOM nodes the scene drives. Labels are rendered once by the chapter; their ids are in data attributes.
  useEffect(() => {
    const root = stage.current
    if (!root) return
    const labelOf = (o: { id: string; kind: string; label: number; mag: number }): number => {
      if (o.id === 'moon') return 90
      if (isMoving(o.id)) return 80
      if (o.kind === 'centre') return 70
      if (o.kind === 'dso') return 40 + o.label
      return o.label * 2 + (4 - Math.min(4, o.mag))
    }
    S.items = Array.from(root.querySelectorAll<HTMLElement>('[data-sky-label]')).flatMap<Item>((el) => {
      const id = el.dataset.skyLabel ?? ''
      const o = BY_ID[id]
      const kind = id === 'moon' ? 'moon' : isMoving(id) ? 'planet' : o?.kind
      if (!kind) return []
      const mag = o?.mag ?? 0
      const text = el.dataset.skyName ?? id
      return [{ id, el, last: '', prio: labelOf({ id, kind, label: o?.label ?? 9, mag }), boxW: text.length * 7.6 + 18, kind, mag }]
    })
    S.items.sort((a, b) => b.prio - a.prio)
    S.cons = Array.from(root.querySelectorAll<HTMLElement>('[data-sky-con]')).map((el) => ({
      id: el.dataset.skyCon ?? '', el, last: '', prio: 0, boxW: (el.dataset.skyName ?? '').length * 8 + 12, kind: 'con', mag: 0,
    }))
    S.compass = Array.from(root.querySelectorAll<HTMLElement>('[data-sky-compass]')).map((el) => ({
      id: el.dataset.skyCompass ?? '', el, last: '', prio: 0, boxW: 20, kind: 'compass', mag: 0,
    }))
    S.ring = root.querySelector<HTMLElement>('[data-sky-ring]')
  }, [stage, S])

  const text = (key: string, value: string) => {
    if (S.lastText.get(key) === value) return
    S.lastText.set(key, value)
    const el = stage.current?.querySelector<HTMLElement>(`[data-sky="${key}"]`)
    if (el) el.textContent = value
  }

  // Controls the chapter can call.
  useEffect(() => {
    ctrl.poke = () => invalidate()
    ctrl.pickAt = (x, y) => {
      let best: Hit | null = null
      let bd = 1e9
      for (const h of S.hits) {
        const d = Math.hypot(h.x - x, h.y - y)
        if (d < Math.max(26, h.r) && d < bd) {
          bd = d
          best = h
        }
      }
      return best ? best.id : null
    }
    ctrl.focusOn = (id) => {
      if (!S.eph || !S.M) return
      const o = isMoving(id) ? null : BY_ID[id]
      const dir = isMoving(id) ? dirOf(id, S.eph) : o ? FIXED_DIRS[id] : null
      if (!dir) return
      let h = apply(S.M, dir)
      if (id === 'moon') h = topocentric(h, S.eph.moon.distKm)
      if (altOf(h) < -1) return
      ctrl.az = S.cur.az + norm180(azOf(h) - S.cur.az)
      ctrl.alt = Math.max(14, Math.min(66, altOf(h) + 8))
      ctrl.vAz = ctrl.vAlt = 0
      ctrl.touched = true
      invalidate()
    }
    return () => {
      ctrl.poke = ctrl.pickAt = ctrl.focusOn = null
    }
  }, [ctrl, S, invalidate])

  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const p = animate ? progress.current ?? 0 : 1
    const w = size.width
    const h = size.height
    const aspect = w / h
    const now = clockSeconds()

    // ---- time
    if (ctrl.play && animate) {
      ctrl.t += dt * NIGHT_SPEED * 1000
      if (ctrl.t >= ctrl.tMax) {
        ctrl.t = ctrl.tMax
        ctrl.play = false
        ctrl.onPlayEnd?.()
      }
    }
    const timeChanged = ctrl.t !== S.tPrev || ctrl.site.id !== S.sitePrev
    if (timeChanged || !S.eph || !S.M) {
      const jd = jdFromMs(ctrl.t)
      S.eph = ephemeris(jd)
      S.M = horizontalMatrix(jd, ctrl.site.lat, ctrl.site.lon)
      S.tPrev = ctrl.t
      S.sitePrev = ctrl.site.id
    }
    const eph = S.eph
    const M = S.M

    // ---- opening (scroll-driven) and view
    const e = animate ? smoothRange(0.04, 0.32, p) : 1
    const reveal = animate ? smoothRange(0.05, 0.4, p) : 1
    const expo = animate ? smoothRange(0.02, 0.12, p) : 1

    if (Math.abs(ctrl.vAz) > 0.02 || Math.abs(ctrl.vAlt) > 0.02) {
      ctrl.az += ctrl.vAz * dt
      ctrl.alt += ctrl.vAlt * dt
      const k = Math.exp(-3.2 * dt)
      ctrl.vAz *= k
      ctrl.vAlt *= k
    }
    ctrl.alt = Math.max(0, Math.min(89, ctrl.alt))
    ctrl.fov = Math.max(26, Math.min(128, ctrl.fov))

    const sgra = apply(M, FIXED_DIRS.sgra)
    const sgAlt = altOf(sgra)
    const sgAz = azOf(sgra)
    // Beat 3 (while the person has not taken the view themselves): if the Galactic Centre is not up yet, let the night
    // turn forward until it is; then follow it with the camera.
    const guided = animate && !ctrl.touched && p > 0.4 && p < 0.66
    if (guided && !S.focused) {
      S.focused = true
      S.timeTarget = null
      if (sgAlt < 8) {
        // Highest the Galactic Centre gets while it is properly dark (Sun below −12°).
        let best = -90
        let bestT = ctrl.t
        for (let t = ctrl.tMin; t <= ctrl.tMax; t += 10 * 60_000) {
          const jd = jdFromMs(t)
          const m = horizontalMatrix(jd, ctrl.site.lat, ctrl.site.lon)
          if (altOf(apply(m, sunDirection(jd))) > -12) continue
          const a = altOf(apply(m, FIXED_DIRS.sgra))
          if (a > best) { best = a; bestT = t }
        }
        if (best > 8) S.timeTarget = bestT
      }
    }
    if (p < 0.3) { S.focused = false; S.timeTarget = null }
    if (S.timeTarget !== null && !ctrl.touched) {
      ctrl.t += (S.timeTarget - ctrl.t) * (1 - Math.exp(-1.6 * dt))
      if (Math.abs(S.timeTarget - ctrl.t) < 120_000) { ctrl.t = S.timeTarget; S.timeTarget = null }
    }
    if (guided && sgAlt > 2) {
      ctrl.az += norm180(sgAz - ctrl.az) * (1 - Math.exp(-2 * dt))
      ctrl.alt += (Math.max(16, Math.min(50, sgAlt + 10)) - ctrl.alt) * (1 - Math.exp(-2 * dt))
    }

    if (!S.inited || !animate) {
      S.cur.az = ctrl.az
      S.cur.alt = ctrl.alt
      S.cur.fov = ctrl.fov
      S.inited = true
    } else {
      const k = 1 - Math.exp(-3.5 * dt)
      S.cur.az += norm180(ctrl.az - S.cur.az) * k
      S.cur.alt += (ctrl.alt - S.cur.alt) * k
      S.cur.fov += (ctrl.fov - S.cur.fov) * k
    }
    const viewAlt = Math.min(89, S.cur.alt + (1 - e) * (84 - S.cur.alt))
    let fov = S.cur.fov * (0.62 + 0.38 * e)
    if (aspect < 1) fov *= 1 + 0.9 * (1 - aspect)
    fov = Math.max(26, Math.min(135, fov))
    const viewKey = `${S.cur.az.toFixed(3)}|${viewAlt.toFixed(3)}|${fov.toFixed(2)}|${w}|${h}`
    const moving = timeChanged || viewKey !== S.lastView || Math.abs(p - S.lastP) > 1e-5 || reveal < 1 || ctrl.play
    S.lastView = viewKey
    S.lastP = p

    const due = !S.ready || !animate || moving || now - S.lastRender > 1 / 15
    if (!due) return
    S.lastRender = now

    // ---- uniforms
    const b = basisFor(S.cur.az, viewAlt)
    const tq = tanQuarter(fov)
    U.uFwd.value.set(...b.fwd)
    U.uRight.value.set(...b.right)
    U.uUp.value.set(...b.up)
    U.uTan.value = tq
    U.uAspect.value = aspect
    U.uPx.value = gl.getPixelRatio()
    U.uZoom.value = Math.max(0.85, Math.min(1.5, Math.sqrt(92 / fov)))
    U.uTime.value = animate ? now : 3
    U.uReveal.value = reveal
    U.uExpo.value = expo
    U.uM.value.set(...M)
    U.uG.value.set(...mulMat(EQ_TO_GAL, transpose(M)))
    U.uLines.value += ((ctrl.lines ? 1 : 0) - U.uLines.value) * (animate ? 1 - Math.exp(-6 * dt) : 1)

    const sunH = apply(M, eph.sunDir)
    const sunAlt = Math.asin(Math.max(-1, Math.min(1, sunH[2])))
    U.uSunAlt.value = sunAlt
    U.uSunAz.value = Math.atan2(sunH[0], sunH[1])
    U.uTwi.value = smooth((sunAlt + 0.314) / (0.314 - 0.0145))

    const moonH = topocentric(apply(M, eph.moon.dir), eph.moon.distKm)
    const moonAlt = Math.asin(Math.max(-1, Math.min(1, moonH[2])))
    U.uMoonDir.value.set(...moonH)
    U.uMoonLight.value = eph.moon.illum * smooth((moonAlt + 0.03) / 0.38)

    // ---- bodies
    const pxDeg = pxPerDegree(h, fov)
    const moonRadiusPx = Math.max(4.5, 0.2575 * pxDeg)
    const BOX = 3.4
    const bodyScreen: Record<string, ReturnType<typeof project>> = {}
    BODY_IDS.forEach((id, i) => {
      let hv: Vec3 = apply(M, dirOf(id, eph))
      if (id === 'moon') hv = topocentric(hv, eph.moon.distKm)
      bodyObj.pos.setXYZ(i, hv[0], hv[1], hv[2])
      const mag = id === 'moon' ? -12 : eph.planets[id].mag
      bodyObj.sz.setX(i, id === 'moon' ? moonRadiusPx * BOX * 2 : Math.max(14, Math.min(40, 30 - 3.2 * mag)))
      bodyScreen[id] = project(hv, b, tq, w, h)
    })
    bodyObj.pos.needsUpdate = true
    bodyObj.sz.needsUpdate = true
    U.uMoonR.value = 1 / BOX
    // Phase: the Sun's direction as seen from the Moon on screen, and the Sun–Moon–Earth angle.
    const mv = moonH
    const toSun: Vec3 = [sunH[0] - mv[0] * (sunH[0] * mv[0] + sunH[1] * mv[1] + sunH[2] * mv[2]), sunH[1] - mv[1] * (sunH[0] * mv[0] + sunH[1] * mv[1] + sunH[2] * mv[2]), sunH[2] - mv[2] * (sunH[0] * mv[0] + sunH[1] * mv[1] + sunH[2] * mv[2])]
    const tl = Math.hypot(...toSun) || 1
    const m2: Vec3 = [mv[0] + (toSun[0] / tl) * 0.01, mv[1] + (toSun[1] / tl) * 0.01, mv[2] + (toSun[2] / tl) * 0.01]
    const a0 = project(mv, b, tq, w, h)
    const a1 = project(m2, b, tq, w, h)
    const lx = a1.x - a0.x
    const ly = -(a1.y - a0.y)
    const ll = Math.hypot(lx, ly) || 1
    U.uLimb.value.set(lx / ll, ly / ll)
    U.uPhaseI.value = Math.acos(Math.max(-1, Math.min(1, 2 * eph.moon.illum - 1)))

    gl.render(state.scene, state.camera)
    if (!S.ready) {
      S.ready = true
      onReady()
    }

    // ---- DOM
    const reveal01 = reveal
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = []
    // Keep labels out from under the Sky Tonight list (left) and the object panel (right) on wide screens.
    if (w >= 768) {
      placed.push({ x0: 0, y0: 180, x1: 330, y1: h - 100 })
      if (ctrl.selected) placed.push({ x0: w - 360, y0: 180, x1: w, y1: h - 100 })
    }
    const fits = (x0: number, y0: number, x1: number, y1: number) => {
      for (const q of placed) if (x0 < q.x1 && x1 > q.x0 && y0 < q.y1 && y1 > q.y0) return false
      return true
    }
    const set = (it: Item, x: number, y: number, a: number) => {
      const key = a < 0.02 ? '' : `${x.toFixed(1)},${y.toFixed(1)},${a.toFixed(2)}`
      if (key === it.last) return
      it.last = key
      if (key) {
        it.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
        it.el.style.opacity = a.toFixed(2)
      } else it.el.style.opacity = '0'
    }
    const margin = 14
    const labelTop = animate || w >= 768 ? 196 : 160
    const on = (s: { x: number; y: number }) => s.x > margin && s.x < w - margin && s.y > labelTop && s.y < h - 90
    const selected = ctrl.selected

    S.hits = []
    const posOf = new Map<string, { x: number; y: number; alt: number }>()
    const order = selected ? [...S.items].sort((a, c) => (a.id === selected ? -1 : c.id === selected ? 1 : 0)) : S.items
    for (const it of order) {
      let hv: Vec3
      let s
      if (isMoving(it.id)) {
        hv = it.id === 'moon' ? moonH : apply(M, dirOf(it.id, eph))
        s = bodyScreen[it.id]
      } else {
        hv = apply(M, FIXED_DIRS[it.id])
        s = project(hv, b, tq, w, h)
      }
      const alt = Math.asin(Math.max(-1, Math.min(1, hv[2])))
      const az = Math.atan2(hv[0], hv[1])
      const above = alt > ridgeFar(az) + 0.006
      const thr = Math.max(0, Math.min(1, (it.mag + 1.5) / 8)) * 0.88
      const rv = it.kind === 'star' ? smoothRange(thr, thr + 0.12, reveal01) : smoothRange(0.12, 0.34, reveal01)
      const inView = s.theta < 2.6 && on(s)
      if (above && inView) {
        const r = it.id === 'moon' ? moonRadiusPx * 1.4 : 0
        S.hits.push({ id: it.id, x: s.x, y: s.y, r })
        posOf.set(it.id, { x: s.x, y: s.y, alt })
      }
      let a = 0
      const isSel = it.id === selected
      if (above && inView && (ctrl.names || isSel)) {
        const off = it.id === 'moon' ? moonRadiusPx + 8 : it.kind === 'planet' ? 14 : it.kind === 'dso' || it.kind === 'centre' ? 12 : 8
        const x0 = s.x + off
        const y0 = s.y - 9
        if (isSel || (x0 + it.boxW < w - 8 && fits(x0, y0, x0 + it.boxW, y0 + 18))) {
          placed.push({ x0, y0, x1: x0 + it.boxW, y1: y0 + 18 })
          a = rv * (isSel ? 1 : 0.9) * clamp01((alt - ridgeFar(az)) / 0.06 + 0.3)
        }
      }
      // The anchor (marker) shows even when the text is culled, for deep-sky objects and planets.
      if (a === 0 && above && inView && rv > 0.02 && (it.kind === 'dso' || it.kind === 'centre' || it.kind === 'planet')) {
        it.el.dataset.skyText = '0'
        a = rv * 0.9
      } else it.el.dataset.skyText = a > 0 ? '1' : '0'
      set(it, s.x, s.y, a)
    }

    // Constellation names: only where nothing else sits.
    for (const c of S.cons) {
      const cc = centres.find((q) => q.id === c.id)
      if (!cc) continue
      const hv = apply(M, cc.dir)
      const s = project(hv, b, tq, w, h)
      const alt = Math.asin(Math.max(-1, Math.min(1, hv[2])))
      const az = Math.atan2(hv[0], hv[1])
      let a = 0
      if (ctrl.names && ctrl.lines && alt > ridgeFar(az) + 0.05 && s.theta < 2.4 && on(s)) {
        const x0 = s.x - c.boxW / 2
        const y0 = s.y - 8
        if (x0 > 8 && x0 + c.boxW < w - 8 && fits(x0, y0, x0 + c.boxW, y0 + 16)) {
          placed.push({ x0, y0, x1: x0 + c.boxW, y1: y0 + 16 })
          a = smoothRange(0.6, 0.95, reveal01) * (cc.asterism ? 0.55 : 0.75)
        }
      }
      set(c, s.x, s.y, a)
    }

    // Compass points sit just under the horizon.
    for (const c of S.compass) {
      const azr = (['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].indexOf(c.id) * 45) * D2R
      const hv: Vec3 = [Math.sin(azr), Math.cos(azr), 0]
      const s = project(hv, b, tq, w, h)
      const underList = w >= 768 && s.x < 330 && s.y > 180
      const a = !underList && s.theta < 2.4 && s.x > 8 && s.x < w - 8 && s.y > 8 && s.y < h - 40 ? smoothRange(0.1, 0.4, reveal01) * (c.id.length === 1 ? 1 : 0.55) : 0
      set(c, s.x, s.y + 16, a)
    }

    // Selection ring
    if (S.ring) {
      const id = selected ?? (animate && p > 0.44 && p < 0.65 && sgAlt > 6 ? 'sgra' : null)
      const q = id ? posOf.get(id) : undefined
      const key = q ? `${q.x.toFixed(1)},${q.y.toFixed(1)}` : ''
      if (key !== S.ring.dataset.last) {
        S.ring.dataset.last = key
        if (q) {
          S.ring.style.transform = `translate3d(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px, 0)`
          S.ring.style.opacity = '1'
        } else S.ring.style.opacity = '0'
      }
    }

    // Readouts
    text('facing', `${compass(S.cur.az)} ${Math.round(((S.cur.az % 360) + 360) % 360)}° · Alt ${Math.round(viewAlt)}°`)
    text('time', fmtLmt(ctrl.t, ctrl.site.lon))
    text('date', fmtLocalDate(ctrl.t, ctrl.site.lon))
    text('sgra', sgAlt > 0 ? `Tonight at this hour: ${Math.round(sgAlt)}° above the ${compass(sgAz)} horizon` : 'Below the horizon at this hour; scrub the night to find it')
    if (selected) {
      const q = posOf.get(selected)
      let hv: Vec3 | null = null
      if (isMoving(selected)) hv = selected === 'moon' ? moonH : apply(M, dirOf(selected, eph))
      else if (FIXED_DIRS[selected]) hv = apply(M, FIXED_DIRS[selected])
      if (hv) {
        const al = altOf(hv)
        text('sel-pos', al < 0 ? 'Below the horizon' : `Alt ${Math.round(al)}° · ${compass(azOf(hv))} ${Math.round(azOf(hv))}°${q ? '' : ' · out of view'}`)
      }
    }
    const scrub = stage.current?.querySelector<HTMLInputElement>('[data-sky="scrub"]')
    if (scrub && document.activeElement !== scrub) {
      const v = String(Math.round(((ctrl.t - ctrl.tMin) / Math.max(1, ctrl.tMax - ctrl.tMin)) * 1000))
      if (scrub.value !== v) scrub.value = v
    }
  }, 1)

  useEffect(() => {
    if (!animate) invalidate()
  }, [animate, invalidate, size.width, size.height])

  return (
    <>
      <mesh geometry={bg.geometry} material={bg.material} frustumCulled={false} renderOrder={0} />
      <points geometry={starObj.geometry} material={starObj.material} frustumCulled={false} renderOrder={1} />
      <lineSegments geometry={lineObj.geometry} material={lineObj.material} frustumCulled={false} renderOrder={2} />
      <points geometry={bodyObj.geometry} material={bodyObj.material} frustumCulled={false} renderOrder={3} />
    </>
  )
}

/** Chapter 06 canvas. Lazy-loaded from `ChapterObservatory`. Opaque: it draws the whole sky. */
export default function SkyScene({ progress, active, stage, ctrl, onReady }: SkySceneProps) {
  const { tier, animate } = useRenderProfile()
  return (
    <Canvas dpr={1} frameloop={active && animate ? 'always' : 'demand'} gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}>
      <Sky progress={progress} stage={stage} ctrl={ctrl} onReady={onReady} animate={animate} tier={tier} />
    </Canvas>
  )
}
