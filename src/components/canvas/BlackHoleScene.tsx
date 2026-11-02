import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useRenderProfile } from '@/hooks/useRenderProfile'
import { clockSeconds } from '@/lib/clock'
import { formatLength, niceBar, fadeAt } from '@/lib/cosmicScale'
import {
  B_SHADOW,
  FOV_HALF_TAN,
  HORIZON_FADE,
  NOTES,
  P_STILL,
  ROLL,
  RS_M,
  R_ISCO,
  cameraAt,
  fmtRs,
  lateralB,
  type CamTarget,
} from '@/lib/blackHole'

/**
 * Chapter 05 — one full-screen fragment shader that traces light through the Schwarzschild geometry.
 *
 * For every pixel a ray is stepped backwards from the camera. Its path bends by the null-geodesic law for a
 * non-rotating hole (a = -3/2 · h² · r̂ / r⁴, rs = 1, h = the ray's angular momentum), so lensing, the shadow, the photon ring and
 * the multiple images of the disc all come out of one rule rather than being painted on.
 *  - Disc: thin, equatorial, r = 3…15 rs. Temperature follows the standard thin-disc profile (zero at the innermost stable
 *    orbit, peak near 4 rs). Observed colour and brightness use the real shift g = Doppler × gravitational, so the
 *    approaching side is brighter and bluer. Surface texture is procedural turbulence sheared by differential rotation.
 *  - Sky: procedural stars and a faint galactic band, sampled in the direction the ray finally escapes in.
 *  - Far camera: beyond 48 rs the straight leg to that radius is skipped; rays that miss are bent analytically.
 * Cost control: a pixel-count budget (not DPR) sets the internal resolution, a frame-time governor lowers it further,
 * the loop breaks as soon as a ray escapes or is captured, and the render rate falls to 24 fps while the camera rests.
 */
const VERT = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const FRAG = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCam;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform vec2 uShift;
uniform float uTanHalf;
uniform int uSteps;

const int MAXS = 128;
const float PI = 3.14159265;
const float R_IN = 3.0;
const float R_OUT = 12.0;
const float R0 = 48.0;
const float R_ESC = 64.0;
const float T_PEAK = 5000.0;

float hash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }

// Value noise whose x lattice wraps with period px (so the disc has no seam at angle ±π).
float vnoiseP(vec2 p, float px) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, px); float x1 = mod(i.x + 1.0, px);
  float a = hash12(vec2(x0, i.y)); float b = hash12(vec2(x1, i.y));
  float c = hash12(vec2(x0, i.y + 1.0)); float d = hash12(vec2(x1, i.y + 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}

// Blackbody chromaticity, 1000–40000 K (Tanner Helland's fit), returned in linear light, luminance-normalised.
vec3 blackbody(float T) {
  float t = clamp(T, 1000.0, 40000.0) / 100.0;
  float r = t <= 66.0 ? 255.0 : 329.698727446 * pow(t - 60.0, -0.1332047592);
  float g = t <= 66.0 ? 99.4708025861 * log(t) - 161.1195681661 : 288.1221695283 * pow(t - 60.0, -0.0755148492);
  float b = t >= 66.0 ? 255.0 : (t <= 19.0 ? 0.0 : 138.5177312231 * log(t - 10.0) - 305.0447927307);
  vec3 c = pow(clamp(vec3(r, g, b) / 255.0, 0.0, 1.0), vec3(2.2));
  return c / max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
}

vec3 stars(vec3 d, float px) {
  vec3 acc = vec3(0.0);
  for (int L = 0; L < 2; L++) {
    float S = L == 0 ? 64.0 : 150.0;
    float dens = L == 0 ? 0.035 : 0.09;
    vec3 c = floor(d * S);
    float h = hash13(c + float(L) * 17.0);
    if (h < dens) {
      vec3 q = c + vec3(hash13(c + 3.1), hash13(c + 7.7), hash13(c + 11.3)) * 0.5 + 0.25;
      float dist = length(d - normalize(q));
      float sig = max(L == 0 ? 0.0006 : 0.0005, px * 0.6);
      float m = hash13(c + 5.5);
      float b = (L == 0 ? 0.25 : 0.1) + (L == 0 ? 1.6 : 0.5) * pow(m, 6.0);
      vec3 tint = mix(vec3(1.0, 0.86, 0.72), vec3(0.78, 0.87, 1.0), hash13(c + 9.1));
      tint = mix(tint, vec3(1.0), 0.45);
      acc += tint * b * exp(-0.5 * dist * dist / (sig * sig)) * (0.0007 / sig);
    }
  }
  // Faint galactic band.
  vec3 n = normalize(vec3(0.3, 0.9, 0.35));
  float band = exp(-pow(dot(d, n), 2.0) * 16.0);
  float cloud = 0.55 + 0.9 * vnoise3(d * 7.0) * vnoise3(d * 17.0 + 4.0);
  acc += vec3(0.95, 0.88, 0.8) * 0.016 * band * cloud;
  return acc;
}

// Disc surface: structure sheared by differential rotation, two phases cross-faded so it never winds up.
float discTexture(float rr, float ph) {
  float lr = log(rr);
  float T = 45.0;
  float p = fract(uTime / T);
  float w0 = 1.0 - abs(1.0 - 2.0 * p);
  float om = 1.5 * pow(rr, -1.2);
  float tA = p * T; float tB = fract(p + 0.5) * T;
  float aA = (ph - om * tA) / (2.0 * PI);
  float aB = (ph - om * tB) / (2.0 * PI);
  float nA = vnoiseP(vec2(aA * 24.0, lr * 20.0), 24.0) * 0.65 + vnoiseP(vec2(aA * 48.0, lr * 44.0 + 3.0), 48.0) * 0.35;
  float nB = vnoiseP(vec2(aB * 24.0, lr * 20.0), 24.0) * 0.65 + vnoiseP(vec2(aB * 48.0, lr * 44.0 + 3.0), 48.0) * 0.35;
  float n = mix(nB, nA, w0);
  return 0.55 + 0.9 * n;
}

void main() {
  vec2 ndc = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  ndc.x *= uRes.x / uRes.y;
  ndc -= uShift;
  vec3 dirL = normalize(uFwd + (uRight * ndc.x + uUp * ndc.y) * uTanHalf);
  float D = length(uCam);

  // Local (static-observer) angle → coordinate direction.
  float ca = dot(dirL, uFwd);
  vec3 perp = dirL - ca * uFwd;
  float sa = length(perp);
  float sp = min(sa / sqrt(1.0 - 1.0 / D), 0.999);
  vec3 vel = uFwd * sqrt(1.0 - sp * sp) + (sa > 1e-6 ? perp / sa : vec3(0.0)) * sp;
  vec3 pos = uCam;

  vec3 col = vec3(0.0);
  float transmit = 1.0;
  bool captured = false;
  bool escaped = false;

  if (D > R0) {
    float pd = dot(pos, vel);
    float disc = pd * pd - (dot(pos, pos) - R0 * R0);
    if (pd < 0.0 && disc > 0.0) {
      pos += vel * (-pd - sqrt(disc));
    } else {
      if (pd < 0.0) {
        vec3 pp = pos - vel * pd;
        float b = length(pp);
        float dl = 2.0 / b + 2.9452 / (b * b);
        vel = normalize(vel * cos(dl) - (pp / b) * sin(dl));
      }
      escaped = true;
    }
  }

  if (!escaped) {
    vec3 cr = cross(pos, vel);
    float h2 = dot(cr, cr);
    for (int i = 0; i < MAXS; i++) {
      if (i >= uSteps) break;
      float r2 = dot(pos, pos);
      float r = sqrt(r2);
      if (r < 1.0) { captured = true; break; }
      if (r > R_ESC && dot(pos, vel) > 0.0) {
        // Residual weak-field bend beyond the escape radius, applied analytically.
        float b = sqrt(h2) / length(vel);
        float dl = (1.0 - sqrt(max(0.0, 1.0 - b * b / r2))) / max(b, 1e-3);
        vec3 pp = pos - vel * (dot(pos, vel) / dot(vel, vel));
        vel = normalize(vel * cos(dl) - normalize(pp) * sin(dl));
        escaped = true; break;
      }
      float dt = clamp(0.09 * r, 0.03, 6.0);
      vel += (-1.5 * h2 * pos / (r2 * r2 * r)) * (0.5 * dt);
      vec3 np = pos + vel * dt;
      float nr2 = dot(np, np);
      vel += (-1.5 * h2 * np / (nr2 * nr2 * sqrt(nr2))) * (0.5 * dt);

      if (pos.y * np.y < 0.0) {
        float t = pos.y / (pos.y - np.y);
        vec3 hit = mix(pos, np, t);
        float rr = length(hit.xz);
        if (rr > R_IN && rr < R_OUT) {
          float q = rr / R_IN;
          float prof = pow(q, -0.75) * pow(max(1.0 - inversesqrt(q), 0.0), 0.25) / 0.4874;
          float Tem = T_PEAK * prof;
          float v = sqrt(0.5 / (rr - 1.0));
          vec3 beta = normalize(vec3(-hit.z, 0.0, hit.x)) * v;
          vec3 nph = -normalize(vel);
          float dop = sqrt(1.0 - v * v) / (1.0 - dot(beta, nph));
          float g = dop * sqrt(1.0 - 1.0 / rr) / sqrt(1.0 - 1.0 / D);
          float I = pow(prof, 4.0) * pow(g, 3.5);
          vec3 em = blackbody(Tem * g) * I * discTexture(rr, atan(hit.z, hit.x)) * 0.8;
          em *= smoothstep(R_OUT, R_OUT - 4.0, rr);
          float tau = 2.2 / max(abs(vel.y) / length(vel), 0.12);
          float a = 1.0 - exp(-tau);
          col += transmit * em * a;
          transmit *= 1.0 - a;
          if (transmit < 0.02) break;
        }
      }
      pos = np;
    }
  }

  if (escaped && !captured) {
    float px = 2.0 * uTanHalf / uRes.y;
    col += transmit * stars(normalize(vel), px);
  }

  // Filmic curve, then display encoding (this scene writes display values directly, like the other chapters).
  col *= 1.1;
  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  col *= 1.0 - 0.28 * dot(ndc * 0.5, ndc * 0.5);
  col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`

interface SceneProps {
  progress: RefObject<number>
  active: boolean
  /** The stage element: annotations and readouts are found inside it (`data-bh-note`, `data-hud`, `data-bh-horizon`). */
  stage: RefObject<HTMLElement | null>
  onReady: () => void
}

interface NoteRef {
  note: (typeof NOTES)[number]
  el: HTMLElement
  last: string
}

const _right = new THREE.Vector3()
const _up = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _cam = new THREE.Vector3()
const _tmp = new THREE.Vector3()
const Y = new THREE.Vector3(0, 1, 0)

function Hole({ progress, stage, onReady, animate, tier }: Omit<SceneProps, 'active'> & { animate: boolean; tier: 'low' | 'high' }) {
  const high = tier === 'high'
  const size = useThree((s) => s.size)
  const setDpr = useThree((s) => s.setDpr)
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)
  const budget = high ? 620_000 : 230_000 // internal pixels
  const ratioCap = high ? 1.25 : 1
  const ratio = useRef(1)
  const gov = useRef({ acc: 0, n: 0, cooldown: 90 })

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uRes: { value: new THREE.Vector2(1, 1) },
          uTime: { value: 0 },
          uCam: { value: new THREE.Vector3(0, 0, 100) },
          uRight: { value: new THREE.Vector3(1, 0, 0) },
          uUp: { value: new THREE.Vector3(0, 1, 0) },
          uFwd: { value: new THREE.Vector3(0, 0, -1) },
          uShift: { value: new THREE.Vector2(0, 0) },
          uTanHalf: { value: FOV_HALF_TAN },
          uSteps: { value: high ? 112 : 72 },
        },
      }),
    [high],
  )
  const geometry = useMemo(() => new THREE.PlaneGeometry(2, 2), [])
  useEffect(
    () => () => {
      material.dispose()
      geometry.dispose()
    },
    [material, geometry],
  )

  // Internal resolution from a pixel budget; the governor below can only lower it.
  useEffect(() => {
    const base = Math.min(ratioCap, window.devicePixelRatio || 1, Math.sqrt(budget / Math.max(1, size.width * size.height)))
    ratio.current = Math.max(0.35, base)
    setDpr(ratio.current)
    if (!animate) invalidate()
  }, [size.width, size.height, budget, ratioCap, setDpr, animate, invalidate])

  const S = useRef({
    notes: [] as NoteRef[],
    dist: null as HTMLElement | null,
    barLine: null as HTMLElement | null,
    barText: null as HTMLElement | null,
    horizon: null as HTMLElement | null,
    lastDist: '',
    lastBar: '',
    lastHorizon: '',
    cur: { logD: Math.log(3000), elev: 0, azim: 0 } as CamTarget,
    tgt: { logD: 0, elev: 0, azim: 0 } as CamTarget,
    inited: false,
    lastP: -1,
    lastRender: 0,
    ready: false,
  }).current

  useEffect(() => {
    const root = stage.current
    if (!root) return
    S.notes = Array.from(root.querySelectorAll<HTMLElement>('[data-bh-note]')).flatMap<NoteRef>((el) => {
      const note = NOTES.find((n) => n.id === el.dataset.bhNote)
      return note ? [{ note, el, last: '' }] : []
    })
    S.dist = root.querySelector<HTMLElement>('[data-hud="dist"]')
    S.barLine = root.querySelector<HTMLElement>('[data-hud="bar-line"]')
    S.barText = root.querySelector<HTMLElement>('[data-hud="bar-text"]')
    S.horizon = root.querySelector<HTMLElement>('[data-bh-horizon]')
  }, [stage, S])

  const u = material.uniforms
  useFrame((state, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const p = animate ? progress.current ?? 0 : P_STILL
    const w = size.width
    const h = size.height
    const aspect = w / h
    const wide = aspect > 1.05
    // Portrait screens widen the lens so the hole keeps the same share of the screen width.
    const tanH = FOV_HALF_TAN * Math.max(1, 0.9 / aspect)

    // Camera: damped follow of the scroll target.
    cameraAt(p, S.tgt)
    if (!S.inited || !animate) {
      S.cur.logD = S.tgt.logD
      S.cur.elev = S.tgt.elev
      S.cur.azim = S.tgt.azim
      S.inited = true
    } else {
      const k = 1 - Math.exp(-4.5 * dt)
      S.cur.logD += (S.tgt.logD - S.cur.logD) * k
      S.cur.elev += (S.tgt.elev - S.cur.elev) * k
      S.cur.azim += (S.tgt.azim - S.cur.azim) * k
    }
    const D = Math.exp(S.cur.logD)
    const moving = Math.abs(S.cur.logD - S.tgt.logD) > 1e-4 || Math.abs(p - S.lastP) > 1e-5
    S.lastP = p

    const now = clockSeconds()
    // Rest → 24 fps; moving → every frame. Always render while the first frames are compiling / when not animating.
    const due = !S.ready || !animate || moving || now - S.lastRender > 1 / 24
    if (!due) return
    S.lastRender = now

    _cam.set(Math.cos(S.cur.elev) * Math.cos(S.cur.azim), Math.sin(S.cur.elev), Math.cos(S.cur.elev) * Math.sin(S.cur.azim))
    _fwd.copy(_cam).multiplyScalar(-1)
    const camHat = _cam.clone()
    _cam.multiplyScalar(D)
    _right.crossVectors(_fwd, Y).normalize()
    _up.crossVectors(_right, _fwd)
    // Unrolled right (for the disc's line of nodes) before the roll is applied.
    const lateral = _right.clone()
    const cr = Math.cos(ROLL)
    const sr = Math.sin(ROLL)
    const r2 = _right.clone().multiplyScalar(cr).addScaledVector(_up, sr)
    const u2 = _up.clone().multiplyScalar(cr).addScaledVector(_right, -sr)

    const sx = wide ? 0.34 * aspect * 0.62 : 0
    const sy = wide ? 0.02 : 0.3
    u.uRes.value.set(gl.domElement.width, gl.domElement.height)
    u.uTime.value = animate ? now : 4
    u.uCam.value.copy(_cam)
    u.uFwd.value.copy(_fwd)
    u.uRight.value.copy(r2)
    u.uUp.value.copy(u2)
    u.uShift.value.set(sx, sy)
    u.uTanHalf.value = tanH

    gl.render(state.scene, state.camera)
    if (!S.ready) {
      S.ready = true
      onReady()
    }

    // Frame-time governor: lower the internal resolution if frames are consistently slow. Never raises it again.
    if (animate && moving) {
      const g = gov.current
      g.acc += dtRaw
      g.n++
      if (g.n >= 40) {
        const avg = g.acc / g.n
        g.acc = 0
        g.n = 0
        if (g.cooldown > 0) g.cooldown--
        else if (avg > 0.026 && ratio.current > 0.4) {
          ratio.current *= 0.85
          setDpr(ratio.current)
          g.cooldown = 3
        }
      }
    }

    // ---- DOM: positions from the exact camera used for the render.
    const sqrtF = Math.sqrt(Math.max(1e-6, 1 - 1 / D))
    const cxp = w / 2 + sx * (h / 2)
    const cyp = h / 2 - sy * (h / 2)
    const pxOf = (b: number) => (Math.tan(Math.asin(Math.min(0.999, (b * sqrtF) / D))) / tanH) * (h / 2)
    const rollA = -ROLL
    // Which lateral side is approaching: orbit direction is counter-clockwise about +Y.
    const sideSign = _tmp.crossVectors(Y, lateral).dot(camHat) > 0 ? -1 : 1 // +1: the +lateral side is the one turning toward us

    for (const n of S.notes) {
      const a = fadeAt(p, n.note.fade)
      let out = ''
      if (a > 0.01) {
        let b = B_SHADOW
        let ang = 0
        switch (n.note.kind) {
          case 'lens': b = 7; ang = (160 * Math.PI) / 180; break
          case 'outer': b = lateralB(11); ang = rollA + Math.PI; break
          case 'approach': b = 6.5; ang = rollA + (sideSign > 0 ? 0 : Math.PI); break
          case 'recede': b = 6.5; ang = rollA + (sideSign > 0 ? Math.PI : 0); break
          case 'isco': b = lateralB(R_ISCO); ang = rollA; break
          case 'ring': b = B_SHADOW; ang = (48 * Math.PI) / 180; break
          case 'shadow': b = B_SHADOW; ang = (192 * Math.PI) / 180; break
          case 'singularity': b = 0; break
        }
        const r = b === 0 ? 0 : pxOf(b)
        const x = cxp + Math.cos(ang) * r
        const y = cyp - Math.sin(ang) * r
        out = x > -60 && x < w + 60 && y > -60 && y < h + 60 ? `${x.toFixed(1)},${y.toFixed(1)},${a.toFixed(2)}` : ''
      }
      if (out !== n.last) {
        n.last = out
        if (out) {
          const [x, y, o] = out.split(',')
          n.el.style.transform = `translate3d(${x}px, ${y}px, 0)`
          n.el.style.opacity = o
        } else n.el.style.opacity = '0'
      }
    }

    if (S.horizon) {
      const a = fadeAt(p, HORIZON_FADE)
      const rad = (Math.tan(Math.asin(Math.min(0.999, 1 / D))) / tanH) * (h / 2)
      const key = a < 0.01 ? '' : `${cxp.toFixed(0)},${cyp.toFixed(0)},${rad.toFixed(1)},${a.toFixed(2)}`
      if (key !== S.lastHorizon) {
        S.lastHorizon = key
        if (key) {
          const el = S.horizon
          el.style.width = el.style.height = `${(rad * 2).toFixed(1)}px`
          el.style.transform = `translate3d(${(cxp - rad).toFixed(1)}px, ${(cyp - rad).toFixed(1)}px, 0)`
          el.style.opacity = a.toFixed(2)
        } else S.horizon.style.opacity = '0'
      }
    }

    if (S.dist) {
      const t = `${formatLength(D * RS_M)} · ${fmtRs(D)} rs`
      if (t !== S.lastDist) {
        S.lastDist = t
        S.dist.textContent = t
      }
    }
    if (S.barLine && S.barText) {
      // True length across the hole's own distance: pixels × km per pixel at that distance.
      const mPerPx = ((D * tanH) / (h / 2)) * RS_M
      const bar = niceBar((wide ? 140 : 90) * mPerPx)
      const key = bar.label + Math.round(bar.metres / mPerPx)
      if (key !== S.lastBar) {
        S.lastBar = key
        S.barLine.style.width = `${(bar.metres / mPerPx).toFixed(1)}px`
        S.barText.textContent = bar.label
      }
    }
  }, 1)

  // Still frame (reduced motion) and resize: ask for a frame.
  useEffect(() => {
    if (!animate) invalidate()
  }, [animate, invalidate, size.width, size.height])

  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

/** Chapter 05 canvas. Lazy-loaded from `ChapterBlackHoles`. Opaque: it draws its own sky. */
export default function BlackHoleScene({ progress, active, stage, onReady }: SceneProps) {
  const { tier, animate } = useRenderProfile()
  return (
    <Canvas
      dpr={1}
      frameloop={active && animate ? 'always' : 'demand'}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
    >
      <Hole progress={progress} stage={stage} onReady={onReady} animate={animate} tier={tier} />
    </Canvas>
  )
}
