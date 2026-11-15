import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getTexture } from '@/engine/assets'
import { useStore } from '@/engine/store'
import { solar } from './solar/state'
import { poleOf } from './solar/layout'

/**
 * Final series step 1 (known-issue fix): Earth's axis is the TRUE one. poleOf(0, 90) is the north celestial pole in the scene's world frame (the
 * Solar System ephemeris rotated by YAW so that Earth-Sun matches SUN_DIR). It leans toward world -Z (ecliptic longitude 90), and the Sun's
 * declination comes out -16.4 deg for the scene's date (the real value for 8 Nov is about -16.5): the southern hemisphere is the summer one.
 * Verified numerically (dot(pole, SUN_DIR) = -0.282 = sin(-16.4 deg)). The old tilt leaned toward -X and lit the north pole.
 */
const EARTH_TILT = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...poleOf(0, 90)))

/**
 * EARTH at unit radius (the engine scales it). Three meshes, one material set, ONE Earth for the whole journey:
 *  - surface: NASA-derived day / night / ocean mask + a normal map DERIVED from them (tools/texgen/gen/earthnormal.ts; not real
 *    topography), city lights under the cloud, cloud shadows, ocean glint, a sun that reddens with air mass at the terminator
 *  - clouds: the real cloud map, drifting in the shader (uv offset) slightly faster than the ground turns
 *  - atmosphere: single-scattering Rayleigh + Mie, ray-marched analytically in the shader (view ray through a shell, light ray to the Sun)
 * The Sun direction is solar.sunDir.get('earth'): the real direction Earth -> Sun in world space, rewritten every frame by stepSolar() (it equals SUN_DIR at the hero, where Earth is at the origin). Heights are exaggerated x ATM_EXAG so the limb stays legible
 * at 390 px; the scattering coefficients are the real sea-level values.
 */
const ATM_EXAG = 1.3
const HR = (8.5 / 6371) * ATM_EXAG // Rayleigh scale height, in planet radii (real: 8.5 km)
const HM = (1.2 / 6371) * ATM_EXAG // Mie scale height (real ~1.2 km)
const RA = 1 + (80 / 6371) * ATM_EXAG // top of the shell
// sea-level coefficients, per planet radius: beta [1/m] * 6.371e6 m
const BETA_R = [5.8e-6 * 6.371e6, 13.5e-6 * 6.371e6, 33.1e-6 * 6.371e6]
const BETA_M = 1.5e-6 * 6.371e6 // a clean-air aerosol load (Bruneton uses 4e-6): keeps the limb blue instead of grey
// Radiometric consistency: the ground uses sun colour x 2.15 (albedo * that * cos = radiance), i.e. an irradiance of 2.15 * pi.
// The same irradiance drives the scattering integral. Coefficients are divided by ATM_EXAG so the optical depth straight down stays real.
const SUN_IRR = 2.15 * Math.PI

const vert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vC; varying float vS;
void main(){
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position,1.0);
  vP = wp.xyz;
  vC = (modelMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
  vS = length(modelMatrix[0].xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`

/** Direct-sun colour at the ground for a given cos(zenith): Rayleigh + a little aerosol, Kasten-Young air mass. */
const sunGlsl = /* glsl */ `
vec3 sunAtGround(float mu){
  float m = max(mu, 0.0);
  float am = 1.0 / (m + 0.15 * pow(max(93.885 - degrees(acos(clamp(m, 0.0, 1.0))), 0.01), -1.253));
  am = min(am, 40.0);
  vec3 tau = vec3(0.050, 0.098, 0.236) + vec3(0.06);   // zenith optical depth at 650/550/440 nm (Rayleigh) + aerosol
  return exp(-tau * am);
}`

const earthFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uDay, uNight, uOcean, uClouds, uNormal; uniform vec3 uSun; uniform float uCloudU;
varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vC; varying float vS;
${sunGlsl}
void main(){
  #include <logdepthbuf_fragment>
  vec3 N0 = normalize(vN); vec3 L = normalize(uSun); vec3 V = normalize(-vP);
  float oc = texture2D(uOcean, vUv).r;                // 1 = ocean
  float land = 1.0 - oc;
  // tangent frame from screen-space derivatives (sphere uv: T = +u east, B = +v north)
  vec3 dp1 = dFdx(vP), dp2 = dFdy(vP); vec2 du1 = dFdx(vUv), du2 = dFdy(vUv);
  vec3 d2p = cross(dp2, N0), d1p = cross(N0, dp1);
  vec3 T = d2p * du1.x + d1p * du2.x; vec3 B = d2p * du1.y + d1p * du2.y;
  float inv = inversesqrt(max(max(dot(T,T), dot(B,B)), 1e-20));
  vec3 Tn = T * inv, Bn = B * inv;
  vec3 nm = texture2D(uNormal, vUv).xyz * 2.0 - 1.0;
  nm.xy *= land * 0.42;                               // the sea stays flat
  vec3 N = normalize(mat3(Tn, Bn, N0) * normalize(vec3(nm.xy, max(nm.z, 0.2))));
  float ndl0 = dot(N0, L);
  float ndl = dot(N, L);
  float dayW = smoothstep(-0.12, 0.20, ndl0);
  vec3 day = texture2D(uDay, vUv).rgb;
  vec3 night = texture2D(uNight, vUv).rgb;
  // cloud, and its shadow on the ground (cloud deck ~10 km up: the shadow slides away from the Sun)
  float lat = (vUv.y - 0.5) * 3.14159265;
  vec2 sh = -vec2(dot(L, Tn) / max(cos(lat), 0.06) / 6.2831853, dot(L, Bn) / 3.14159265) * 0.0016 / max(ndl0, 0.12);
  float cl = texture2D(uClouds, vec2(vUv.x - uCloudU, vUv.y)).r;
  float clSh = texture2D(uClouds, vec2(vUv.x - uCloudU + sh.x, clamp(vUv.y + sh.y, 0.0, 1.0))).r;
  vec3 sunCol = sunAtGround(ndl0) * 2.15;
  vec3 skyAmb = vec3(0.32, 0.46, 0.95) * 0.085 * smoothstep(-0.22, 0.25, ndl0);
  float diff = max(ndl, 0.0);
  vec3 lit = day * (sunCol * diff * (1.0 - 0.42 * clSh) + skyAmb * (1.0 - 0.3 * clSh));
  // ocean: glint (tight GGX-like lobe + broad lobe) and a little sky reflection at grazing angles, both hidden by cloud
  vec3 H = normalize(L + V);
  float nh = max(dot(N0, H), 0.0);
  float a2 = 0.0016;                                   // roughness ~0.04: a calm-sea glint
  float D = a2 / (3.14159265 * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
  float Fr = 0.02 + 0.98 * pow(1.0 - max(dot(N0, V), 0.0), 5.0);
  float spec = (D * 0.045 + pow(nh, 36.0) * 0.06) * Fr * 6.0 * smoothstep(0.0, 0.15, ndl0);
  vec3 glint = sunAtGround(ndl0) * spec * oc * (1.0 - clamp(cl * 1.4, 0.0, 1.0));
  lit += glint * 2.2;
  lit += vec3(0.20, 0.38, 0.85) * Fr * oc * 0.16 * smoothstep(-0.1, 0.4, ndl0);
  // city lights: under the cloud, fading out into the day
  vec3 lights = night * vec3(1.0, 0.82, 0.58) * 11.0 * (1.0 - clamp(cl * 1.1, 0.0, 0.9)) * (1.0 - dayW);
  vec3 col = lit * dayW + lights + day * 0.004 * (1.0 - dayW);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`

const cloudFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uClouds; uniform vec3 uSun; uniform float uCloudU;
varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vC; varying float vS;
${sunGlsl}
void main(){
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vN); float ndl = dot(N, normalize(uSun));
  float c = texture2D(uClouds, vec2(vUv.x - uCloudU, vUv.y)).r;
  vec3 sunCol = sunAtGround(ndl) * 2.15;
  float l = smoothstep(-0.10, 0.18, ndl);
  vec3 skyAmb = vec3(0.32, 0.46, 0.95) * 0.11 * smoothstep(-0.22, 0.25, ndl);
  vec3 col = vec3(0.97, 0.98, 1.0) * (sunCol * max(ndl, 0.0) * 0.78 + skyAmb) * l;
  gl_FragColor = vec4(col, c * 0.94);
  #include <colorspace_fragment>
}`

const atmoFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSun; uniform float uRa, uHR, uHM, uI; uniform vec3 uBetaR; uniform float uBetaM;
varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vC; varying float vS;
const int NV = 14; const int NL = 5;
vec2 sph(vec3 ro, vec3 rd, float R){
  float b = dot(ro, rd); float c = dot(ro, ro) - R * R; float h = b * b - c;
  if (h < 0.0) return vec2(-1.0, -1.0);
  h = sqrt(h); return vec2(-b - h, -b + h);
}
void main(){
  #include <logdepthbuf_fragment>
  vec3 ro = (cameraPosition - vC) / vS;                 // camera in planet-radius units, planet at the origin
  vec3 rd = normalize(vP - cameraPosition);
  vec3 L = normalize(uSun);
  vec2 at = sph(ro, rd, uRa);
  if (at.y < 0.0) discard;
  float t0 = max(at.x, 0.0), t1 = at.y;
  vec2 pl = sph(ro, rd, 1.0);
  if (pl.x > 0.0) t1 = min(t1, pl.x);
  float ds = (t1 - t0) / float(NV);
  float odR = 0.0, odM = 0.0; vec3 sR = vec3(0.0), sM = vec3(0.0);
  for (int i = 0; i < NV; i++){
    vec3 p = ro + rd * (t0 + (float(i) + 0.5) * ds);
    float h = length(p) - 1.0;
    float dr = exp(-h / uHR) * ds, dm = exp(-h / uHM) * ds;
    odR += dr; odM += dm;
    if (sph(p, L, 1.0).x > 0.0) continue;               // planet shadow
    float tl = sph(p, L, uRa).y;
    float dl = tl / float(NL); float lR = 0.0, lM = 0.0;
    for (int j = 0; j < NL; j++){
      vec3 q = p + L * (float(j) + 0.5) * dl; float hq = length(q) - 1.0;
      lR += exp(-hq / uHR) * dl; lM += exp(-hq / uHM) * dl;
    }
    vec3 tau = uBetaR * (odR + lR) + vec3(uBetaM * 1.1) * (odM + lM);
    vec3 att = exp(-tau);
    sR += att * dr; sM += att * dm;
  }
  float mu = dot(rd, L);
  float phR = 3.0 / (16.0 * 3.14159265) * (1.0 + mu * mu);
  float g = 0.76; float phM = 3.0 / (8.0 * 3.14159265) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  vec3 col = uI * (phR * uBetaR * sR + phM * uBetaM * sM);
  col = 1.0 - exp(-col * 1.0);
  col = mix(vec3(dot(col, vec3(0.3, 0.55, 0.15))), col, 1.3); // a touch of saturation: the shoulder desaturates bright limb pixels                         // soft shoulder, linear light in / out
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`

export function EarthBody() {
  const seg = useStore((s) => s.settings.segments)
  const atmo = useStore((s) => s.settings.atmosphere)
  const geo = useMemo(() => new THREE.SphereGeometry(1, seg, seg / 2), [seg])
  const spinRef = useRef<THREE.Group>(null)
  const cloudU = useRef({ value: 0 })
  const sun = solar.sunDir.get('earth')! // one persistent Vector3, mutated in place each frame: the uniforms see the change
  const mats = useMemo(() => {
    const day = getTexture('earth-day'), night = getTexture('earth-night'), ocean = getTexture('earth-ocean'), clouds = getTexture('earth-clouds'), normal = getTexture('earth-normal')
    const earth = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: earthFrag, uniforms: { uSun: { value: sun }, uDay: { value: day }, uNight: { value: night }, uOcean: { value: ocean }, uClouds: { value: clouds }, uNormal: { value: normal }, uCloudU: cloudU.current } })
    const cloud = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: cloudFrag, transparent: true, depthWrite: false, uniforms: { uSun: { value: sun }, uClouds: { value: clouds }, uCloudU: cloudU.current } })
    const atm = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: atmoFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uSun: { value: sun }, uRa: { value: RA }, uHR: { value: HR }, uHM: { value: HM }, uI: { value: SUN_IRR * 0.42 }, uBetaR: { value: new THREE.Vector3(...BETA_R).multiplyScalar(1 / ATM_EXAG) }, uBetaM: { value: BETA_M / ATM_EXAG } },
    })
    return { earth, cloud, atm }
  }, [sun])
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.1)
    if (spinRef.current) spinRef.current.rotation.y += d * 0.012
    cloudU.current.value += d * 0.0007 // clouds drift east relative to the ground (fraction of a turn / s)
  })
  return (
    <group quaternion={EARTH_TILT}>
      <group ref={spinRef} rotation={[0, THREE.MathUtils.degToRad(-100), 0]}>
        <mesh geometry={geo} material={mats.earth} />
        <mesh geometry={geo} material={mats.cloud} scale={1.004} renderOrder={1} />
      </group>
      {atmo && <mesh geometry={geo} material={mats.atm} scale={RA} renderOrder={2} />}
    </group>
  )
}
