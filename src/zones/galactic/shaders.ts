/**
 * GLSL for the Prompt 5 layers. All of it follows the engine rules: log-depth chunks in every vertex/fragment stage,
 * `<colorspace_fragment>` at the end, and no world-space metre value ever enters a shader (positions are local units of the object,
 * the engine scales the object).
 */

/** Soft round sprites. Size = max(aPx, aSize in local units projected) clamped to [uMin, uMax] px. Additive. */
export const spriteVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aCol; attribute float aSize; attribute float aPx; attribute float aA;
uniform float uViewH, uDpr, uMin, uMax, uOpacity, uDim;
varying vec3 vCol; varying float vA; varying float vBig;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float S = length(modelMatrix[0].xyz);
  float worldPx = aSize * S * projectionMatrix[1][1] * uViewH * 0.5 / max(-mv.z, 1e-9);
  float px = clamp(max(aPx, worldPx), uMin, uMax);
  gl_PointSize = px * uDpr;
  // flux conservation: a sprite that was clamped UP to the minimum size is dimmer than its area suggests
  vA = aA * uOpacity * uDim;
  vBig = clamp((px - 3.0) / 9.0, 0.0, 1.0);
  vCol = aCol;
  #include <logdepthbuf_vertex>
}`
export const spriteFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vCol; varying float vA; varying float vBig;
void main(){
  #include <logdepthbuf_fragment>
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = exp(-d * d * 4.5);
  float halo = 0.18 * vBig * exp(-d * 3.0);
  float a = vA * (core + halo);
  if (a < 0.002) discard;
  gl_FragColor = vec4(vCol, a);
  #include <colorspace_fragment>
}`

/** Image plane (galaxy picture, straight alpha). Fades when seen edge-on so a flat picture never shows as a line. */
export const quadVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying float vFace;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelViewMatrix) * vec3(0.0, 0.0, 1.0));
  vFace = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`
export const quadFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uTex; uniform float uOpacity, uGain; uniform vec3 uTint;
varying vec2 vUv; varying float vFace;
void main(){
  #include <logdepthbuf_fragment>
  vec4 t = texture2D(uTex, vUv);
  float face = smoothstep(0.06, 0.4, vFace);
  float a = t.a * uOpacity * face;
  if (a < 0.002) discard;
  gl_FragColor = vec4(t.rgb * uTint * uGain, a);
  #include <colorspace_fragment>
}`
