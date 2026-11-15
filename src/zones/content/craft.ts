import * as THREE from 'three'

/**
 * The Voyager spacecraft as simple, recognisable geometry in units of the high-gain dish radius (1.83 m): a 3.7 m dish, the ten-sided bus,
 * the RTG boom with three generators, the science boom with the scan platform, the long magnetometer boom, the Golden Record. +Z = the dish axis.
 * SCHEMATIC: proportions follow the real craft roughly (the real magnetometer boom is 13 m, shortened here to fit); no antennas, thrusters or wiring.
 * Shading is a small custom shader (light from the Sun's real direction); no scene lights are used, so nothing recompiles when a probe becomes visible.
 */
export const DISH_R_M = 1.83

const vert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vN; varying vec3 vV;
void main(){
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`
const frag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor; uniform vec3 uSun; uniform float uMetal; uniform mat3 uView;
varying vec3 vN; varying vec3 vV;
void main(){
  #include <logdepthbuf_fragment>
  vec3 n = normalize(vN);
  vec3 L = normalize(uSun);
  float d = max(dot(n, L), 0.0);
  vec3 vw = normalize(uView * vV);
  vec3 h = normalize(L + vw);
  float s = pow(max(dot(n, h), 0.0), mix(24.0, 90.0, uMetal)) * (0.25 + 0.9 * uMetal);
  float rim = pow(1.0 - max(dot(n, vw), 0.0), 3.0) * 0.12;
  vec3 c = uColor * (0.12 + 0.95 * d) + vec3(s) * mix(vec3(1.0), uColor * 1.6, uMetal) + rim * vec3(0.5, 0.6, 0.8);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`

export function craftMaterial(color: [number, number, number], metal: number, sun: THREE.Vector3) {
  return new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: { uColor: { value: new THREE.Color(...color) }, uSun: { value: sun }, uMetal: { value: metal }, uView: { value: new THREE.Matrix3() } } })
}

export interface CraftPart { geo: THREE.BufferGeometry; color: [number, number, number]; metal: number }
let cached: CraftPart[] | null = null

/** One shared set of geometries (both probes use it; each probe has its own materials). */
export function craftParts(): CraftPart[] {
  if (cached) return cached
  const parts: CraftPart[] = []
  const add = (geo: THREE.BufferGeometry, color: [number, number, number], metal: number) => parts.push({ geo, color, metal })
  const zAxis = (g: THREE.BufferGeometry) => g.rotateX(Math.PI / 2) // lathe / cylinder axis y -> z

  // high-gain dish: a closed parabolic shell (back surface, rim, front surface), so every face is a front face
  const prof: THREE.Vector2[] = []
  const N = 14
  const depth = 0.38, th = 0.04
  for (let i = 0; i <= N; i++) { const r = (i / N) * 1.0; prof.push(new THREE.Vector2(r, depth * r * r - th)) }
  prof.push(new THREE.Vector2(1.0, depth))
  for (let i = N; i >= 0; i--) { const r = (i / N) * 1.0; prof.push(new THREE.Vector2(r, depth * r * r)) }
  add(zAxis(new THREE.LatheGeometry(prof, 48)), [0.88, 0.88, 0.85], 0.1)
  // sub-reflector on three struts (just the small cap)
  add(zAxis(new THREE.ConeGeometry(0.1, 0.09, 16)).translate(0, 0, 0.62), [0.7, 0.7, 0.68], 0.2)
  // bus: ten-sided
  add(zAxis(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 10)).translate(0, 0, -0.22), [0.8, 0.62, 0.24], 0.85)
  // Golden Record on the side of the bus (axis along x)
  add(new THREE.CylinderGeometry(0.17, 0.17, 0.014, 28).rotateZ(Math.PI / 2).translate(0.505, 0.05, -0.22), [1.0, 0.8, 0.28], 1)
  // RTG boom (+x) with three generators, science boom (-y) with scan platform, magnetometer boom (-x)
  add(new THREE.CylinderGeometry(0.022, 0.022, 1.7, 8).rotateZ(Math.PI / 2).translate(1.35, 0, -0.3), [0.3, 0.3, 0.32], 0.4)
  for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.075, 0.075, 0.5, 14).rotateZ(Math.PI / 2).translate(1.6 + i * 0.28 - 0.1, 0, -0.3 + (i - 1) * 0.0), [0.2, 0.2, 0.22], 0.5)
  add(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 8).translate(0.0, -1.2, -0.3), [0.3, 0.3, 0.32], 0.4)
  add(new THREE.BoxGeometry(0.22, 0.2, 0.22).translate(0, -1.95, -0.3), [0.55, 0.55, 0.58], 0.4)
  add(new THREE.CylinderGeometry(0.012, 0.012, 5.2, 6).rotateZ(Math.PI / 2).translate(-3.05, 0.1, -0.3), [0.34, 0.34, 0.36], 0.4)
  add(new THREE.BoxGeometry(0.1, 0.1, 0.1).translate(-5.7, 0.1, -0.3), [0.5, 0.5, 0.54], 0.4)
  cached = parts
  return parts
}
