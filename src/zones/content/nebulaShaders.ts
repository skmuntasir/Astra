import * as THREE from 'three'

/**
 * Sharp procedural nebulae (Orion, Crab), BAKED once into a texture (NebulaBake, below) and shown as one camera-facing textured quad. The bake shader stacks NS thin slices of a 3-D
 * "ridged" noise field along the view direction, so gas reads as thin, crisp filaments (not soft blobs), and the slices shift with
 * the camera so the structure has real parallax. Engine rules kept: log-depth chunks in both stages, <colorspace_fragment> last, no
 * metre value in any uniform (all coordinates are local units of the object, the engine scales it).
 *
 * Local frame ("seen from the Sun"): x = sky right, y = celestial north, z = toward the Sun. The slab spans about +-1.2 units.
 * Output is PREMULTIPLIED (rgb = emission, a = 1 - transmittance), so dark dust lanes really darken the stars behind them.
 */
const vert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform vec3 uFwd; uniform float uHalf;
varying vec3 vP;
void main(){
  vec3 f = normalize(uFwd);
  vec3 up = abs(f.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 r = normalize(cross(f, up));
  vec3 u = cross(r, f);
  vP = (r * position.x + u * position.y) * uHalf;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vP, 1.0);
  #include <logdepthbuf_vertex>
}`

const noise = /* glsl */ `
float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * vn(p); p = p * 2.03 + vec3(17.1, 9.2, 5.7); a *= 0.5; } return s / 0.875; }
/** thin line on the w-neighbourhood of the 0.5 contour of a 0..1 noise: crisp strands of constant width */
float line(float n, float w){ return 1.0 - smoothstep(0.0, w, abs(n - 0.5)); }
`

const head = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uFwd; uniform float uOpacity, uDetail, uTilt;
varying vec3 vP;
`

/**
 * Crab: the real remnant's two colours. A bright, fibrous CYAN-BLUE synchrotron cloud fills the inside (patchy, with dark gaps), wrapped in a web of
 * ORANGE / amber / red-orange filaments (soft-edged and uneven in brightness, so they glow instead of reading as wires), with yellow-green and teal
 * threads where the gas overlaps the blue. Baked once into a texture (see NebulaBake), so the cost here is paid a single time.
 */
export const crabFrag = head + noise + /* glsl */ `
void main(){
  #include <logdepthbuf_fragment>
  vec3 f = normalize(uFwd);
  float ct = cos(uTilt), st = sin(uTilt);
  float w1 = mix(0.11, 0.075, uDetail), w2 = mix(0.1, 0.06, uDetail);
  float dz = 2.5 / float(NS);
  vec3 CF = vec3(0.0), CB = vec3(0.0);
  float Fd = 0.0;
  for (int i = 0; i < NS; i++) {
    float zs = (float(i) + 0.5) * dz - 1.25;
    vec3 p = vP + f * zs;
    vec3 q = vec3(p.x * ct + p.y * st, -p.x * st + p.y * ct, p.z);
    float e = length(q * vec3(1.0, 1.0 / 0.8, 1.0 / 0.8));
    if (e > 1.16) continue;
    vec3 wp = p + 0.15 * (vec3(vn(p * 2.6), vn(p * 2.6 + 7.7), vn(p * 2.6 + 15.1)) - 0.5);
    // ---- filaments: soft-edged ridges of 3-D noise, brightness varies a lot along and between strands
    float n1 = fbm3(wp * 4.4);
    float s1 = line(n1, w1), s1h = line(n1, w1 * 3.2);
    float s2 = line(vn(wp * 9.5 + 3.3), w2);
    float fil = max(s1 + 0.15 * s1h, 0.55 * s2);
    float vary = 0.12 + 1.3 * smoothstep(0.3, 0.75, vn(p * 2.9 + 8.0));
    float shell = smoothstep(1.14, 0.9, e) * (0.1 + 0.9 * smoothstep(0.25, 0.82, e));
    float cc = vn(p * 2.1 + 4.4);
    vec3 col = mix(vec3(1.0, 0.27, 0.07), vec3(1.0, 0.6, 0.15), smoothstep(0.25, 0.75, cc));
    col = mix(col, vec3(1.0, 0.78, 0.25), 0.5 * s1 * s1 * smoothstep(0.45, 0.8, vn(p * 3.7 + 1.0)));       // hot yellow strands
    col = mix(col, vec3(0.5, 0.95, 0.55), 0.8 * smoothstep(0.55, 0.8, vn(p * 1.8 + 9.0)) * (1.0 - smoothstep(0.5, 0.98, e))); // yellow-green / teal inside
    col = mix(col, vec3(0.95, 0.2, 0.08), 0.55 * smoothstep(0.88, 1.08, e));                                // red-orange rim
    float fw = fil * vary * shell * dz;
    CF += col * fw * 1.25; Fd += fw;
    // ---- blue synchrotron cloud: bright, fibrous, patchy (two big lobes with dark gaps), cyan to white-blue
    float bn = fbm3(wp * 2.9 + 2.0);
    float pat = 0.02 + 1.4 * smoothstep(0.38, 0.64, bn);
    float wisp = 0.3 + 0.7 * (1.0 - abs(2.0 * fbm3(wp * 7.0 + vec3(1.0, 5.0, 3.0)) - 1.0));
    float fill = smoothstep(1.0, 0.5, e);
    float hot = smoothstep(0.55, 0.9, bn) * exp(-e * e * 2.0);
    vec3 bc = mix(vec3(0.03, 0.42, 0.9), vec3(0.12, 0.9, 1.0), 0.35 + 0.65 * hot);
    bc = mix(bc, vec3(0.6, 0.97, 1.0), 0.3 * hot * hot);
    CB += bc * fill * pat * wisp * 2.0 * dz;
  }
  vec3 C = (CF + CB * exp(-Fd * 1.6)) * uOpacity; // filaments in front hide the blue behind them
  // hue-preserving soft clip (a per-channel curve would push every bright orange to cream-white)
  float mx = max(max(C.r, C.g), C.b);
  vec3 c = C * ((1.0 - exp(-mx * 1.7)) / max(mx, 1e-4));
  gl_FragColor = vec4(c, 0.0);
  #include <colorspace_fragment>
}`

/** Orion: bright white-cream heart with a teal [O III] rim, pink-red H-alpha wings of billowy, sharply sculpted gas, the dark "Fish Mouth" lanes, blue reflection in the north. */
export const orionFrag = head + noise + /* glsl */ `
float laneMask(vec2 xy){
  float tA = (xy.x + 0.9) / 0.95;
  float yA = -0.06 + sin(tA * 3.4) * 0.2 - 0.12 * tA;
  float rag = 0.55 + 0.9 * vn(vec3(xy * 6.0, 3.0));
  float a = exp(-pow((xy.y - yA) / (0.06 * rag), 2.0)) * smoothstep(0.0, 0.12, tA) * smoothstep(1.0, 0.8, tA);
  float tB = (xy.x + 0.1) / 1.0;
  float yB = -0.4 + sin(tB * 2.6) * 0.16;
  float b = exp(-pow((xy.y - yB) / (0.05 * rag), 2.0)) * smoothstep(0.0, 0.15, tB) * smoothstep(1.0, 0.75, tB);
  return max(a, 0.85 * b);
}
/** large-scale gas layout (smooth); the cloud texture below carves it into billows */
float gasLayout(vec2 xy){
  float core = exp(-dot(xy * vec2(1.0, 1.1), xy * vec2(1.0, 1.1)) * 6.0);
  vec2 a = (xy - vec2(-0.72, 0.12)) / vec2(0.62, 0.3);
  vec2 b = (xy - vec2(0.7, 0.02)) / vec2(0.55, 0.34);
  float wl = exp(-dot(a, a) * 1.3) * smoothstep(-0.9, 0.3, a.y + 0.35 * a.x);
  float wr = exp(-dot(b, b) * 1.3) * smoothstep(-0.9, 0.3, b.y - 0.3 * b.x);
  float halo = 0.12 * exp(-dot(xy * vec2(0.8, 1.05), xy * vec2(0.8, 1.05)) * 1.6);
  return clamp(1.25 * core + wl + 0.9 * wr + halo, 0.0, 1.6);
}
float cloud(vec3 p){
  vec3 wp = p + 0.22 * (vec3(vn(p * 2.1 + 1.3), vn(p * 2.1 + 5.9), vn(p * 2.1 + 9.1)) - 0.5);
  float n = 0.55 * fbm3(wp * 3.4 + 4.0) + 0.45 * fbm3(wp * 8.5 + 11.0);
  float L = gasLayout(wp.xy);
  return L * smoothstep(0.44, 0.6, n + 0.2 * L);
}
void main(){
  #include <logdepthbuf_fragment>
  vec3 f = normalize(uFwd);
  float sh = mix(0.012, 0.03, uDetail); // offset for the sculpting (light from the upper left)
  float dz = 2.2 / float(NS);
  vec3 C = vec3(0.0);
  float T = 1.0;
  for (int i = 0; i < NS; i++) {
    float zs = 1.1 - (float(i) + 0.5) * dz; // back to front
    vec3 p = vP + f * zs;
    float zt = exp(-pow(p.z / 0.4, 2.0));
    if (zt < 0.02) continue;
    vec2 xy = p.xy;
    float rb = length(xy * vec2(0.9, 1.0));
    // dust absorption: a thin layer a little in front of the gas
    float tau = 9.0 * laneMask(xy) * exp(-pow((p.z - 0.12) / 0.18, 2.0)) * (5.0 / float(NS)) * (0.6 + 0.6 * vn(p * 9.0));
    T *= exp(-tau); C *= exp(-tau);
    // billowy gas, lit from one side: bright sculpted edges, dim shadowed flanks
    float D = cloud(p);
    float D2 = cloud(p + vec3(0.7, -0.7, 0.0) * sh * 1.4);
    float lit = clamp((D - D2) * 9.0, 0.0, 1.0);
    float fine = line(fbm3(p * 13.0 + 5.0), mix(0.12, 0.05, uDetail));
    float rim = smoothstep(0.2, 0.34, rb) * smoothstep(0.64, 0.44, rb);
    float wingShare = smoothstep(0.25, 0.7, rb);
    vec3 inner = mix(vec3(1.0, 0.66, 0.78), vec3(0.2, 0.88, 0.74), rim * 0.9);
    vec3 outer = mix(vec3(1.0, 0.16, 0.3), vec3(1.0, 0.5, 0.64), smoothstep(0.35, 0.85, vn(p * 2.3 + 3.0)));
    vec3 gasCol = mix(inner, outer, wingShare);
    vec3 E = gasCol * (0.32 * D + 2.6 * lit * D) * (0.55 + 0.9 * fine);
    E += vec3(1.0, 0.93, 0.84) * (exp(-rb * rb * 110.0) * (0.12 + 0.6 * D) + 2.0 * exp(-rb * rb * 700.0)); // the bright heart
    // the Bright Bar: a sharp, teal-white ridge to the lower right of the heart
    vec2 ba = vec2(0.08, -0.2), bd = vec2(0.34, -0.16);
    float bt = clamp(dot(xy - ba, bd) / dot(bd, bd), 0.0, 1.0);
    E += vec3(0.55, 1.0, 0.9) * exp(-pow(length(xy - ba - bd * bt) / 0.02, 2.0)) * (0.4 + 0.8 * vn(p * 10.0)) * 0.9;
    float bl = exp(-(pow((xy.x - 0.15) / 0.3, 2.0) + pow((xy.y - 0.95) / 0.22, 2.0)));
    float bc = smoothstep(0.3, 0.7, 0.6 * fbm3(p * 5.0 + 20.0) + 0.4 * vn(p * 12.0)) * bl;
    E += vec3(0.4, 0.6, 1.0) * (0.25 * bl + 0.9 * bc);
    C += E * zt * dz * 1.1;
  }
  C *= uOpacity;
  vec3 c = 1.0 - exp(-C * 1.5);
  gl_FragColor = vec4(c, (1.0 - T) * uOpacity);
  #include <colorspace_fragment>
}`

// ================================================================================================================================
// BAKING. The two fragment shaders above are expensive (NS slices x several noise octaves per pixel). Running them every frame at screen
// resolution made the page laggy while a nebula was on screen. So each one is rendered ONCE into a half-float texture, in horizontal strips
// (one strip per frame, so there is no hitch), and the nebula on screen is just a textured quad: one texture read per pixel.
// ================================================================================================================================
const BAKE_HALF = 1.6 // the baked area is the same square (+-1.6 local units) the live quad used to cover

/** The same fragments, without the engine chunks (they are not needed while baking into a render target). */
const forBake = (src: string) => src.replace(/#include <(common|logdepthbuf_pars_fragment|logdepthbuf_fragment|colorspace_fragment)>/g, '')
const bakeVert = /* glsl */ `
uniform float uHalf;
varying vec3 vP;
void main(){
  vP = vec3(position.xy * uHalf, 0.0);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`
export const bakeFragSource = (kind: 'crab' | 'orion') => forBake(kind === 'crab' ? crabFrag : orionFrag)
export const bakeVertSource = bakeVert

let plane: THREE.PlaneGeometry | null = null
const quad = () => (plane ??= new THREE.PlaneGeometry(2, 2))

export interface BakeOptions { size: number; strips: number; slices: number; tilt?: number }

export class NebulaBake {
  readonly rt: THREE.WebGLRenderTarget
  done = false
  private row = 0
  private readonly scene = new THREE.Scene()
  private readonly cam = new THREE.Camera()
  private mat: THREE.ShaderMaterial
  constructor(kind: 'crab' | 'orion', private o: BakeOptions) {
    this.rt = new THREE.WebGLRenderTarget(o.size, o.size, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    })
    this.rt.texture.anisotropy = 4
    this.mat = new THREE.ShaderMaterial({
      vertexShader: bakeVert, fragmentShader: bakeFragSource(kind), defines: { NS: o.slices },
      blending: THREE.NoBlending, depthTest: false, depthWrite: false, transparent: false, toneMapped: false,
      uniforms: { uFwd: { value: new THREE.Vector3(0, 0, -1) }, uHalf: { value: BAKE_HALF }, uOpacity: { value: 1 }, uDetail: { value: 1 }, uTilt: { value: o.tilt ?? 0 } },
    })
    const mesh = new THREE.Mesh(quad(), this.mat)
    mesh.frustumCulled = false
    this.scene.add(mesh)
  }
  /** Compiles the bake shader in the background (parallel shader compile) so the first strip never freezes the page. */
  prepare(gl: THREE.WebGLRenderer) {
    if (this.done) return
    try { void gl.compileAsync(this.scene, this.cam).catch(() => { /* compiled on the first strip instead */ }) } catch { /* same */ }
  }
  /** Renders the next strip. Returns true once the whole texture is done. */
  step(gl: THREE.WebGLRenderer): boolean {
    if (this.done) return true
    const { size, strips } = this.o
    const h = Math.ceil(size / strips), y = this.row * h, hh = Math.min(h, size - y)
    const prevRT = gl.getRenderTarget(), prevAuto = gl.autoClear
    this.rt.scissor.set(0, y, size, hh)
    this.rt.scissorTest = true
    gl.setRenderTarget(this.rt)
    gl.autoClear = false
    gl.render(this.scene, this.cam)
    gl.setRenderTarget(prevRT)
    gl.autoClear = prevAuto
    if (++this.row >= strips) { this.done = true; this.rt.scissorTest = false; this.mat.dispose() }
    return this.done
  }
}

/** one bake strip per frame in total, however many nebulae are waiting (they take turns) */
let lastStepAt = -1e9
export function bakeStep(b: NebulaBake, gl: THREE.WebGLRenderer) {
  const now = performance.now()
  if (now - lastStepAt < 5) return
  lastStepAt = now
  b.step(gl)
}

// ------------------------------------------------------------------------------------------------ the on-screen quad (cheap)
const dispFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uTex; uniform vec3 uFwd; uniform float uOpacity, uHalf;
varying vec3 vP;
void main(){
  #include <logdepthbuf_fragment>
  // where the view ray meets the baked sheet (z = 0): a gentle parallax / tilt as the camera drifts around the nebula
  vec3 d = normalize(uFwd);
  float dz = min(d.z, -0.4);
  vec2 xy = vP.xy - d.xy / dz * vP.z;
  vec2 uv = xy / (2.0 * uHalf) + 0.5;
  vec2 ed = min(uv, 1.0 - uv);
  float edge = smoothstep(0.0, 0.04, min(ed.x, ed.y));
  gl_FragColor = texture2D(uTex, uv) * (uOpacity * edge);
  #include <colorspace_fragment>
}`

export function nebulaMaterial(kind: 'crab' | 'orion', o: BakeOptions) {
  const bake = new NebulaBake(kind, o)
  const m = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: dispFrag,
    transparent: true, premultipliedAlpha: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    uniforms: { uTex: { value: bake.rt.texture }, uFwd: { value: new THREE.Vector3(0, 0, -1) }, uHalf: { value: BAKE_HALF }, uOpacity: { value: 0 } },
  })
  m.visible = false
  return { m, geometry: quad(), bake }
}
