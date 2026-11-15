import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getTexture } from '@/engine/assets'
import { timeline } from '@/engine/timeline'

/**
 * THE SUN at unit radius (the engine scales it to 6.957e8 m; its distance from Earth is compressed, its size is true).
 *  - photosphere: the procedural sun map (tools/texgen, labelled procedural) + animated 3-D cellular granulation in the shader,
 *    limb darkening with a per-channel linear law, and slow evolution (granules advect and re-form).
 *  - corona + glow: an additive camera-facing quad with a radial falloff and faint streamers. This is the "selective bloom":
 *    only the Sun glows, no full-screen post pass (no extra dependency, nothing else can bloom).
 * Granule size is EXAGGERATED (true granules are ~1,000 km = 0.0014 R_sun and would be sub-pixel). The HUD says so.
 */
const vert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying vec3 vO; varying vec3 vN; varying vec3 vP;
void main(){
  vUv = uv; vO = position;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`

const photoFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uMap; uniform float uTime;
varying vec2 vUv; varying vec3 vO; varying vec3 vN; varying vec3 vP;
vec3 h33(vec3 p){ p = vec3(dot(p, vec3(127.1,311.7,74.7)), dot(p, vec3(269.5,183.3,246.1)), dot(p, vec3(113.5,271.9,124.6))); return fract(sin(p) * 43758.5453); }
// 3-D cellular noise: returns (F1, F2-F1); cell points drift with time so granules slowly boil
vec2 cell(vec3 p, float t){
  vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = h33(i + g); o = 0.5 + 0.5 * sin(t * (0.3 + o * 0.7) + 6.2831 * o);
    float d = length(g + o - f);
    if (d < d1){ d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return vec2(d1, d2 - d1);
}
void main(){
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vN); vec3 V = normalize(-vP);
  float mu = clamp(dot(N, V), 0.0, 1.0);
  vec3 base = texture2D(uMap, vUv).rgb;
  vec3 p = normalize(vO);
  // granulation: bright cell centres, dark intergranular lanes; supergranule modulation underneath
  vec2 g = cell(p * 150.0, uTime * 0.35);
  vec2 s = cell(p * 22.0 + 7.0, uTime * 0.06);
  float lane = smoothstep(0.0, 0.16, g.y);                 // 0 in the lanes, 1 inside the cell
  float gran = mix(0.72, 1.12, lane) * (1.0 - 0.12 * smoothstep(0.55, 0.9, g.x));
  gran *= 0.94 + 0.10 * smoothstep(0.0, 0.2, s.y);
  vec3 col = base * gran * 1.12;
  // limb darkening, I(mu)/I(1) = 1 - u (1 - mu): stronger toward blue // VERIFY coefficients (approximate visible-band values)
  vec3 u = vec3(0.52, 0.66, 0.84);
  col *= 1.0 - u * (1.0 - mu);
  col *= vec3(1.0, 0.96, 0.90) * 1.55;                    // overall brightness / a slightly warm white
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`

const glowVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vQ;
uniform float uSize;
void main(){
  vQ = position.xy;
  vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  c.xy += position.xy * uSize * length(modelViewMatrix[0].xyz);
  gl_Position = projectionMatrix * c;
  #include <logdepthbuf_vertex>
}`
const glowFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime, uSize;
varying vec2 vQ;
void main(){
  #include <logdepthbuf_fragment>
  float r = length(vQ) * uSize;                        // in solar radii from the centre
  if (r < 0.985) discard;                              // the disc itself is the sphere
  float ang = atan(vQ.y, vQ.x);
  float streak = 0.75 + 0.25 * sin(ang * 7.0 + uTime * 0.05) * sin(ang * 3.0 - uTime * 0.03 + 1.0);
  float inner = exp(-(r - 1.0) * 5.5) * 0.9;                           // bright inner corona / chromosphere edge
  float outer = pow(1.0 / max(r, 1.0), 3.2) * 0.42 * streak;        // streamer-like falloff
  float halo = exp(-(r - 1.0) * 0.55) * 0.07;                          // wide glow ("bloom")
  float edge = smoothstep(uSize, uSize * 0.55, r);
  vec3 c = (vec3(1.0, 0.93, 0.78) * (inner + outer) + vec3(1.0, 0.82, 0.55) * halo) * edge;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`

const SIZE = 9
export function SunBody() {
  const geo = useMemo(() => new THREE.SphereGeometry(1, 96, 48), [])
  const mats = useMemo(() => {
    const photo = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: photoFrag, uniforms: { uMap: { value: getTexture('sun') }, uTime: { value: 0 } } })
    const glow = new THREE.ShaderMaterial({
      vertexShader: glowVert, fragmentShader: glowFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uSize: { value: SIZE } },
    })
    return { photo, glow }
  }, [])
  useFrame(() => { mats.photo.uniforms.uTime.value = timeline.clock; mats.glow.uniforms.uTime.value = timeline.clock })
  return (
    <group>
      <mesh geometry={geo} material={mats.photo} />
      <mesh material={mats.glow} renderOrder={3} frustumCulled={false}>
        <planeGeometry args={[2, 2]} />
      </mesh>
    </group>
  )
}
