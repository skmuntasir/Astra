/**
 * GLSL for the Solar System zone. Every ShaderMaterial includes the logarithmic-depth chunks and ends with colorspace_fragment
 * (HANDOFF rule). Positions inside shaders are planet-radius units relative to the planet centre (never world metres).
 */
const VARY = /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vC; varying float vS; varying vec3 vO;`

/** Body vertex shader: flattening (oblateness) is applied to the position and the normal; the group scale stays uniform. */
export const bodyVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uFlat;
${VARY}
void main(){
  vUv = uv;
  vO = position; // object-space unit-sphere position: the detail noise is anchored to the surface, not the screen
  vec3 pos = vec3(position.x, position.y * uFlat, position.z);
  vec3 nrm = normalize(vec3(normal.x, normal.y / max(uFlat, 0.5), normal.z));
  vN = normalize(mat3(modelMatrix) * nrm);
  vec4 wp = modelMatrix * vec4(pos, 1.0);
  vP = wp.xyz;
  vC = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vS = length(modelMatrix[0].xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`

/**
 * Planet surface. Lambert with a wrap term (soft terminator for atmospheres), optional normal map (screen-space tangent frame),
 * a sunward limb haze, and the RING SHADOW on the planet: for each surface point the ray to the Sun is intersected with the ring
 * plane (normal = the planet's pole); if it lands inside the ring annulus the strip's opacity darkens the point.
 */
export const bodyFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uMap, uNormal, uRingTex;
uniform float uHasNormal, uWrap, uGain, uAmb, uRing, uRin, uRout, uRingStr, uTime;
uniform vec3 uSun, uPole;
uniform vec4 uRim;
uniform vec4 uDetail;   // x amplitude, y frequency (cycles per radius), z mode (0 isotropic rock/ice, 1 banded gas), w anisotropy of the bands
uniform vec2 uTexSize;  // size of the albedo map in texels
uniform vec4 uShear;    // x max longitude shift (in u), y loop period (s), z spared latitude (rad), w its half-width (rad); x = 0 disables
${VARY}
float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float vn(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * vn(p); p = p * 2.03 + vec3(7.1, 3.3, 1.7); a *= 0.5; } return s; }
void main(){
  #include <logdepthbuf_fragment>
  vec3 N0 = normalize(vN);
  vec3 L = normalize(uSun);
  vec3 V = normalize(cameraPosition - vP);
  vec3 N = N0;
  if (uHasNormal > 0.5) {
    vec3 dp1 = dFdx(vP), dp2 = dFdy(vP); vec2 du1 = dFdx(vUv), du2 = dFdy(vUv);
    vec3 d2p = cross(dp2, N0), d1p = cross(N0, dp1);
    vec3 T = d2p * du1.x + d1p * du2.x; vec3 B = d2p * du1.y + d1p * du2.y;
    float inv = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-20));
    vec3 nm = texture2D(uNormal, vUv).xyz * 2.0 - 1.0;
    N = normalize(mat3(T * inv, B * inv, N0) * normalize(vec3(nm.xy, max(nm.z, 0.2))));
  }
  float ndl = dot(N, L);
  float dl = max((ndl + uWrap) / (1.0 + uWrap), 0.0);
  dl *= smoothstep(-0.02 - uWrap * 0.5, 0.06, dot(N0, L) + uWrap); // keep the far side dark even with a bumpy normal
  float shadow = 1.0;
  if (uRing > 0.5) {
    vec3 p = (vP - vC) / vS;
    float dn = dot(L, uPole);
    if (abs(dn) > 1e-3) {
      float t = -dot(p, uPole) / dn;
      if (t > 0.0) {
        float rr = length(p + L * t);
        if (rr > uRin && rr < uRout) {
          float u = clamp((rr - uRin) / (uRout - uRin), 0.0005, 0.9995);
          shadow = 1.0 - texture2D(uRingTex, vec2(u, 0.5)).a * uRingStr * 0.96;
        }
      }
    }
  }
  vec3 on = normalize(vO);
  vec3 alb;
  if (uShear.x > 0.0) {
    // Jupiter: zonal jets slide the cloud bands past each other and past the Great Red Spot's latitude band. Two samples of a looping
    // flow, cross-faded (weights always sum to 1), so the drift never accumulates into a smear. EXAGGERATED for visibility.
    float lat = asin(clamp(on.y, -1.0, 1.0));
    float prof = (sin(lat * 10.0) + 0.5 * sin(lat * 23.0 + 1.0)) * cos(lat);
    float gw = 1.0 - exp(-pow((lat - uShear.z) / uShear.w, 2.0));
    float sh = uShear.x * prof * gw;
    float p0 = fract(uTime / uShear.y), p1 = fract(uTime / uShear.y + 0.5);
    float w0 = 1.0 - abs(2.0 * p0 - 1.0);
    vec3 a0 = texture2D(uMap, vec2(vUv.x + (p0 - 0.5) * sh, vUv.y)).rgb;
    vec3 a1 = texture2D(uMap, vec2(vUv.x + (p1 - 0.5) * sh, vUv.y)).rgb;
    alb = mix(a1, a0, w0);
  } else alb = texture2D(uMap, vUv).rgb;
  if (uDetail.x > 0.0) {
    // Close-up detail: where the generated map is magnified (fewer texels than screen pixels) add fine noise in object space. It fades
    // out once the map is sharp enough by itself, so it only ever adds detail, and it is multiplicative (no brightening, no wash-out).
    float texelAng = 6.2831853 / max(uTexSize.x, 1.0);
    float magn = length(fwidth(on)) / texelAng;                 // screen pixels cover this many texels
    float need = 1.0 - smoothstep(0.5, 1.4, magn);
    if (need > 0.01) {
      vec3 q = uDetail.z < 0.5 ? on * uDetail.y : vec3(on.x, on.y * uDetail.w, on.z) * uDetail.y;
      float n = fbm3(q) - 0.47;
      alb *= clamp(1.0 + uDetail.x * need * n * 2.2, 0.6, 1.5);
    }
  }
  vec3 col = alb * (uGain * dl * shadow + uAmb);
  float fr = pow(1.0 - max(dot(N0, V), 0.0), 3.0);
  float lit = smoothstep(-0.25, 0.55, dot(N0, L));
  col += uRim.rgb * uRim.a * fr * lit * 0.5;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`

/** Ring annulus. uv.x = strip coordinate (0..1 = r0..r1). Planet shadow on the ring by line-sphere distance. */
export const ringVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying vec3 vP; varying vec3 vC; varying float vS;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  vC = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vS = length(modelMatrix[0].xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`
export const ringFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uTex;
uniform vec3 uSun, uPole;
uniform float uStr, uRingDetail, uRingTexW;
varying vec2 vUv; varying vec3 vP; varying vec3 vC; varying float vS;
float rh(float x){ return fract(sin(x * 127.1) * 43758.5453); }
float rn(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(rh(i), rh(i + 1.0), f); }
void main(){
  #include <logdepthbuf_fragment>
  vec4 t = texture2D(uTex, vec2(clamp(vUv.x, 0.0005, 0.9995), 0.5));
  if (t.a < 0.003) discard;
  if (uRingDetail > 0.0) {
    // ringlets: fine radial structure added where the strip is magnified (a few km per ringlet), multiplicative on colour and opacity
    float px = fwidth(vUv.x) * uRingTexW;                       // strip texels per screen pixel
    float need = 1.0 - smoothstep(0.5, 1.4, px);
    float rr = vUv.x * uRingTexW;
    float n = 0.5 * rn(rr * 0.9) + 0.3 * rn(rr * 2.7 + 11.0) + 0.2 * rn(rr * 7.1 + 5.0) - 0.5;
    float m = clamp(1.0 + uRingDetail * need * n * 2.0, 0.55, 1.45);
    t.rgb *= m; t.a = clamp(t.a * (0.75 + 0.25 * m), 0.0, 1.0);
  }
  vec3 q = (vP - vC) / vS;
  vec3 L = normalize(uSun);
  vec3 V = normalize(cameraPosition - vP);
  float dn = dot(L, uPole);
  // planet's shadow: the ray from q toward the Sun passes within one planet radius of the centre, on the sunward side of q
  float b = dot(q, L);
  float dline = length(q - L * b);
  float sh = b < 0.0 ? 1.0 - smoothstep(0.994, 1.006, dline) : 0.0;
  bool sameSide = dot(V, uPole) * dn > 0.0;
  // brightness: not physically scaled by sin(elevation) (that would make the rings black near equinox); floored for legibility
  float lit = 0.45 + 0.55 * smoothstep(0.0, 0.45, abs(dn));
  float bright = sameSide ? lit : lit * (0.06 + 0.75 * (1.0 - t.a)); // seen from the unlit side only thin parts glow (transmitted light)
  vec3 col = t.rgb * 2.0 * bright * (1.0 - 0.95 * sh) + t.rgb * 0.02;
  gl_FragColor = vec4(col, t.a * uStr);
  #include <colorspace_fragment>
}`

/**
 * Atmosphere shell (Venus). Analytic limb haze from the closest approach of the view ray: density falls with the altitude of that
 * point, brightness follows how sunlit the limb point is (haze scatters light past the terminator) plus a forward-scatter lobe when the
 * Sun is behind the planet. The haze HEIGHT is exaggerated (~x4.5) so it reads at overview scale. Not a physical radiative-transfer model.
 */
export const atmoFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uSun, uColor;
uniform float uH, uK;
varying vec2 vUv; varying vec3 vN; varying vec3 vP; varying vec3 vC; varying float vS;
void main(){
  #include <logdepthbuf_fragment>
  vec3 ro = (cameraPosition - vC) / vS;
  vec3 rd = normalize(vP - cameraPosition);
  float tc = -dot(ro, rd);
  vec3 pc = ro + rd * tc;
  float b = length(pc);
  float h = max(b - 1.0, 0.0);
  float dens = exp(-h / uH);
  if (dens < 0.002) discard;
  vec3 L = normalize(uSun);
  float mu = dot(rd, L);
  vec3 limb = normalize(pc + 1e-6);
  float lit = smoothstep(-0.55, 0.35, dot(limb, L));
  float g = 0.72;
  float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) * 0.08;
  float onDisc = b < 1.0 ? 0.38 : 1.0;
  float a = dens * onDisc * (0.25 * lit + phase * (0.3 + 0.7 * lit)) * uK;
  gl_FragColor = vec4(uColor * a, 1.0);
  #include <colorspace_fragment>
}`

/** Belt particles: fixed pixel size, soft round sprite. */
export const pointsVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aSeed;
uniform float uSize, uPx;
varying float vSeed;
void main(){
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPx * (0.55 + 0.9 * aSeed);
  #include <logdepthbuf_vertex>
}`
export const pointsFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uOpacity;
varying float vSeed;
void main(){
  #include <logdepthbuf_fragment>
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.25, d) * uOpacity * (0.45 + 0.55 * vSeed);
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * (0.8 + 0.4 * vSeed), a);
  #include <colorspace_fragment>
}`

/** Billboard halo of the Sun for the overview (the Sun's own corona quad takes over when it is large). Size in CSS pixels. */
export const haloVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uSizePx; uniform vec2 uView;
varying vec2 vQ;
void main(){
  vQ = position.xy;
  vec4 c = projectionMatrix * viewMatrix * modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  c.xy += position.xy * uSizePx * 2.0 / uView * c.w;
  gl_Position = c;
  #include <logdepthbuf_vertex>
}`
export const haloFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uAlpha;
varying vec2 vQ;
void main(){
  #include <logdepthbuf_fragment>
  float r = length(vQ);
  if (r > 1.0) discard;
  float core = exp(-r * r * 90.0);
  float glow = exp(-r * 5.0) * 0.28 + exp(-r * 14.0) * 0.5;
  vec3 c = (vec3(1.0, 0.95, 0.82) * core + vec3(1.0, 0.82, 0.55) * glow) * (1.0 - smoothstep(0.7, 1.0, r)) * uAlpha;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`

/** Heliopause: a faint limb-brightened shell, visible from outside and, grazing, from inside. */
export const shellVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vN; varying vec3 vP;
void main(){
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`
export const shellFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor; uniform float uAlpha;
varying vec3 vN; varying vec3 vP;
void main(){
  #include <logdepthbuf_fragment>
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(cameraPosition - vP))), 3.0);
  gl_FragColor = vec4(uColor * f * uAlpha, 1.0);
  #include <colorspace_fragment>
}`
