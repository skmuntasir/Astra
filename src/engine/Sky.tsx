import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { getTexture, getData } from './assets'
import { useStore } from './store'
import { WORLD_TO_GAL, galToWorld } from '@/lib/frames'
import { sky } from './world'

/**
 * THE BACKDROP (shared by every zone): the Milky Way panorama + the star layer, both in GALACTIC coordinates
 * (u = (180 - l) / 360, v = (90 - b) / 180), drawn on a unit sphere that always sits on the camera. The camera never
 * leaves the render origin (floating origin) so the sky is at infinity: no parallax, no seams between zones.
 * The shader rotates the world-space view ray into galactic coordinates with the matrix from src/lib/frames.ts
 * (galactic -> equatorial J2000 -> ecliptic -> y-up world; checked by tests/frames.test.ts).
 * The panorama is PROCEDURAL (tools/texgen/gen/sky.ts); the star layer is 136 real bright stars (positions typed from memory, // VERIFY) plus SIMULATED field stars (gen/starfield.ts, gen/sky.ts), drawn as sprites so they stay sharp at any resolution. The HUD says so.
 * Never depth-tested, never written to depth, drawn first.
 */
const vert = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  // rotation-only view: the sphere follows the camera orientation, never its position
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = p;
}`
const frag = /* glsl */ `
precision highp float;
uniform sampler2D uPano;
uniform mat3 uW2G;
uniform float uPanoGain, uSkyA;
varying vec3 vDir;
const float PI = 3.14159265358979;
void main(){
  vec3 g = normalize(uW2G * normalize(vDir));
  float l = atan(g.y, g.x);                       // galactic longitude, -pi..pi
  float u = 0.5 - l / (2.0 * PI);                 // u = (180 - l) / 360
  float v = 0.5 + asin(clamp(g.z, -1.0, 1.0)) / PI; // bitmap is decoded pre-flipped: v = (90 + b) / 180
  vec2 uv = vec2(u, v);
  // derivatives that do not jump across the atan seam (otherwise a one-pixel mip line shows at l = 180)
  vec2 uvAlt = vec2(fract(u + 0.5) - 0.5, v);
  vec2 dx = abs(dFdx(uv).x) < abs(dFdx(uvAlt).x) ? dFdx(uv) : dFdx(uvAlt);
  vec2 dy = abs(dFdy(uv).x) < abs(dFdy(uvAlt).x) ? dFdy(uv) : dFdy(uvAlt);
  vec3 col = textureGrad(uPano, uv, dx, dy).rgb * uPanoGain * uSkyA;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`

/** B-V -> approximate linear colour (blackbody via Ballesteros T + Planckian fit), max-normalised. */
function bvToRgb(bv: number): [number, number, number] {
  const T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62))
  const t = Math.max(1000, Math.min(40000, T)) / 100
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592)
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492)
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  const c = (x: number) => Math.max(0, Math.min(255, x)) / 255
  const o: [number, number, number] = [c(r), c(g), c(b)]
  const m = Math.max(...o) || 1
  return [0.35 + 0.65 * (o[0] / m), 0.35 + 0.65 * (o[1] / m), 0.35 + 0.65 * (o[2] / m)] // keep a little colour, never grey-out
}

/** Reads an 'AFS1' point file: 8 B header (magic, u32 count) then u16 l, i16 b, u8 V (4 + u8/255*12.75), u8 B-V (-0.4 + u8/255*2.55). */
function readAFS(buf: ArrayBuffer): Array<[number, number, number, number]> {
  const dv = new DataView(buf)
  const n = dv.getUint32(4, true)
  const out: Array<[number, number, number, number]> = new Array(n)
  for (let i = 0; i < n; i++) {
    const o = 8 + i * 6
    out[i] = [(dv.getUint16(o, true) / 65535) * 360, (dv.getInt16(o + 2, true) / 32767) * 90, 4 + (dv.getUint8(o + 4) / 255) * 12.75, -0.4 + (dv.getUint8(o + 5) / 255) * 2.55]
  }
  return out
}

const starVert = /* glsl */ `
attribute float aV; attribute vec3 aCol; attribute float aFaint; attribute float aNear;
uniform float uDpr, uFaintGain, uSkyA, uNearA;
varying vec3 vCol; varying float vPeak; varying float vBig;
void main(){
  float flux = pow(10.0, -0.4 * (aV - 6.0));            // 1.0 at V = 6
  float size = clamp(1.5 + 0.95 * log2(max(flux, 1.0)), 1.5, 11.0);
  vPeak = clamp(0.62 * sqrt(flux), 0.0, 1.0) * mix(1.0, uFaintGain, aFaint) * uSkyA * mix(1.0, uNearA, aNear);
  vBig = clamp((size - 3.0) / 8.0, 0.0, 1.0);
  vCol = aCol;
  gl_PointSize = size * uDpr;
  gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
}`
const starFrag = /* glsl */ `
precision highp float;
varying vec3 vCol; varying float vPeak; varying float vBig;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = exp(-d * d * 5.0);
  float halo = 0.22 * vBig * exp(-d * 3.5);
  float a = vPeak * (core + halo);
  gl_FragColor = vec4(vCol * a, 1.0);          // display-referred, added to the panorama
}`

/** Real bright stars that the beyond-the-system zone also draws as 3-D sprites at their true distance (Prompt 5): they fade out of the backdrop. */
const NEAR_STARS = new Set(['Sirius', 'Rigil Kentaurus', 'Procyon', 'Altair', 'Vega', 'Fomalhaut'])

/** The star layer: real bright stars (136, JSON) + simulated naked-eye field (12k) + simulated faint field (220k), all as sprites at infinity. */
function Stars() {
  const tier = useStore((s) => s.settings.tier)
  const gl = useThree((s) => s.gl)
  const { geo, mat } = useMemo(() => {
    const bright = (JSON.parse(new TextDecoder().decode(getData('stars-bright'))) as { stars: Array<{ name: string; l: number; b: number; V: number; rgb: [number, number, number] }> }).stars
    const field = readAFS(getData('stars-field'))
    const faintAll = readAFS(getData('stars-faint'))
    const stride = tier === 'low' ? 2 : 1
    const faint = stride === 1 ? faintAll : faintAll.filter((_, i) => i % stride === 0)
    const n = bright.length + field.length + faint.length
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), V = new Float32Array(n), F = new Float32Array(n), NR = new Float32Array(n)
    let k = 0
    const put = (l: number, b: number, v: number, rgb: [number, number, number], faintFlag: number, near = 0) => {
      const w = galToWorld(l, b)
      pos[k * 3] = w[0]; pos[k * 3 + 1] = w[1]; pos[k * 3 + 2] = w[2]
      col[k * 3] = rgb[0]; col[k * 3 + 1] = rgb[1]; col[k * 3 + 2] = rgb[2]
      V[k] = v; F[k] = faintFlag; NR[k] = near; k++
    }
    for (const s of bright) put(s.l, s.b, s.V, s.rgb, 0, NEAR_STARS.has(s.name) ? 1 : 0)
    for (const s of field) put(s[0], s[1], s[2], bvToRgb(s[3]), 0)
    for (const s of faint) put(s[0], s[1], s[2], bvToRgb(s[3]), 1)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3))
    g.setAttribute('aV', new THREE.BufferAttribute(V, 1))
    g.setAttribute('aFaint', new THREE.BufferAttribute(F, 1))
    g.setAttribute('aNear', new THREE.BufferAttribute(NR, 1))
    const m = new THREE.ShaderMaterial({
      vertexShader: starVert, fragmentShader: starFrag, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uDpr: { value: 1 }, uFaintGain: { value: 0.55 }, uSkyA: { value: 1 }, uNearA: { value: 1 } },
    })
    return { geo: g, mat: m }
  }, [tier])
  useFrame(() => { mat.uniforms.uDpr.value = gl.getPixelRatio(); mat.uniforms.uSkyA.value = sky.alpha; mat.uniforms.uNearA.value = sky.near })
  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={-999} />
}

export function Sky() {
  const ready = useStore((s) => s.assetsReady)
  const mat = useMemo(() => {
    if (!ready) return null
    const m = new THREE.Matrix3().set(...(WORLD_TO_GAL as [number, number, number, number, number, number, number, number, number]))
    return new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthTest: false, depthWrite: false,
      uniforms: { uPano: { value: getTexture('milkyway') }, uW2G: { value: m }, uPanoGain: { value: 0.55 }, uSkyA: { value: 1 } },
    })
  }, [ready])
  useFrame(() => { if (mat) mat.uniforms.uSkyA.value = sky.alpha })
  if (!mat) return null
  return (
    <>
      <mesh material={mat} frustumCulled={false} renderOrder={-1000}>
        <sphereGeometry args={[1, 48, 24]} />
      </mesh>
      <Stars />
    </>
  )
}
