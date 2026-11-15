import * as THREE from 'three'

/**
 * Sagittarius A* as the Event Horizon Telescope showed it (12 May 2022): a dark central shadow inside a lopsided, glowing ring of hot gas, brighter on
 * one side (Doppler beaming), with a thin photon ring on the inner edge and orbiting clumps of turbulence. PROCEDURAL illustration (analytic, no ray
 * tracing, no texture): one camera-facing quad, a handful of noise reads per pixel. The shadow is a real dark disc (alpha), so stars behind it are hidden.
 * Local units of the object (the engine scales them), no metre value in any uniform; log-depth chunks in both stages; <colorspace_fragment> last.
 */
const vert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uQ;
varying vec2 vU;
void main(){
  vU = position.xy;
  float s = length(modelViewMatrix[0].xyz);
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uQ * s;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`

const frag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime, uA, uSpan;
varying vec2 vU;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn2(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
/** EHT-style "afmhot" ramp: deep red, orange, amber, pale yellow-white */
vec3 pal(float m){
  vec3 c0 = vec3(0.5, 0.02, 0.0), c1 = vec3(1.0, 0.3, 0.03), c2 = vec3(1.0, 0.68, 0.16), c3 = vec3(1.0, 0.95, 0.78);
  float x = clamp(m, 0.0, 1.0) * 3.0;
  return x < 1.0 ? mix(c0, c1, x) : (x < 2.0 ? mix(c1, c2, x - 1.0) : mix(c2, c3, x - 2.0));
}
void main(){
  #include <logdepthbuf_fragment>
  vec2 p = vU * uSpan;                    // ring radius = 1
  float r = length(p);
  float a = atan(p.y, p.x);
  float dop = 0.26 + 0.95 * pow(0.5 + 0.5 * cos(a + 2.2), 1.6); // brighter to the lower left, like the 2022 image
  // orbiting clumps (turning slowly as one pattern: a shear by radius would wind them into thin concentric streaks as time passes); noise sampled on a circle so there is no seam
  float ang = a + uTime * 0.2;
  vec2 q = vec2(cos(ang), sin(ang)) * 1.5 + vec2(r * 0.4, r * 0.25);
  float turb = 0.62 + 0.62 * vn2(q * 2.2 + vec2(0.0, uTime * 0.05)) + 0.4 * vn2(q * 4.0 + 4.0 - vec2(uTime * 0.04, 0.0));
  float w = r < 1.0 ? 0.17 : 0.24;
  float body = smoothstep(0.62, 0.86, r) * exp(-pow((r - 1.0) / w, 2.0));
  float photon = exp(-pow((r - 0.84) / 0.035, 2.0)) * (0.35 + 0.65 * dop);
  float glow = 0.035 * exp(-pow(r - 0.95, 2.0) / 0.9) * dop;
  float L = body * dop * turb * 1.3 + photon * 0.7 + glow;
  float m = 1.0 - exp(-L * 1.7);
  vec3 c = pal(m) * m * 1.2;
  float shadow = (1.0 - smoothstep(0.52, 0.72, r)) * 0.92;
  float edge = 1.0 - smoothstep(0.82, 1.0, length(vU));
  gl_FragColor = vec4(c * edge * uA, shadow * edge * uA);
  #include <colorspace_fragment>
}`

let plane: THREE.PlaneGeometry | null = null
/** `radius` = ring radius in local units of the object, `span` = how many ring radii the quad covers each way. */
export function ringMaterial(radius: number, span: number) {
  plane ??= new THREE.PlaneGeometry(2, 2)
  const m = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag,
    transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    uniforms: { uQ: { value: radius * span }, uSpan: { value: span }, uA: { value: 0 }, uTime: { value: 0 } },
  })
  m.visible = false
  return { m, geometry: plane }
}
