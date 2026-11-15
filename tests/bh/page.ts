/** Browser side of tests/bh_gpu.py: runs the REAL trace shader (src/lib/bh/shader.ts) in raw WebGL2 and reads the float records back. */
import { traceVert, traceFrag } from '../../src/lib/bh/shader'
import { discTemperatureLUT, blackbodyLUT, isco, traceCPU } from '../../src/lib/bh/kerr'

const VS = '#version 300 es\n#define varying out\n#define attribute in\nin vec3 position;\n' + traceVert
const FS = '#version 300 es\nprecision highp float;\n#define varying in\n#define texture2D texture\nlayout(location=0) out highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n' + traceFrag

let gl: WebGL2RenderingContext, prog: WebGLProgram, fbo: WebGLFramebuffer, tex: WebGLTexture | null = null
const tex2D = (img: HTMLImageElement | null, unit: number) => {
  const t = gl.createTexture()!; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
  if (img) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img); else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([40, 40, 40, 255]))
  gl.generateMipmap(gl.TEXTURE_2D)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  return t
}
const loadImg = (url: string) => new Promise<HTMLImageElement | null>((res) => { if (!url) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url })

export async function init(skyUrl: string, noiseUrl: string) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 4; document.body.appendChild(c)
  gl = c.getContext('webgl2')!
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('no EXT_color_buffer_float')
  const mk = (t: number, src: string) => { const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s)); return s }
  prog = gl.createProgram()!
  gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(prog))
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'position'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0)
  fbo = gl.createFramebuffer()!
  tex2D(await loadImg(skyUrl), 0); tex2D(await loadImg(noiseUrl), 1)
  return gl.getParameter(gl.VERSION) + ' | ' + (gl.getExtension('WEBGL_debug_renderer_info') ? gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')!.UNMASKED_RENDERER_WEBGL) : '?')
}

export interface Cfg {
  w: number; h: number; spin: number; r0: number; mu0: number; phi0?: number; tanHalf: [number, number]
  camRot?: number[]; beta?: [number, number, number]; rOut?: number; tmax?: number; disc?: boolean; jet?: boolean
  exposure?: number; hue?: number; look?: number; beam?: number; skyGain?: number
  debug: 0 | 1 | 2; eps?: number; maxSteps?: number; time?: number; horizon?: number; pixAng?: number
  /** pixel list instead of a full image: [x, y] pairs; result is one record per pair */
}
export function render(c: Cfg) {
  gl.useProgram(prog)
  const U = (n: string) => gl.getUniformLocation(prog, n)
  const rIn = isco(c.spin), rOut = c.rOut ?? 30
  const { lut } = discTemperatureLUT(c.spin, rOut)
  gl.uniform2f(U('uRes'), c.w, c.h); gl.uniform2f(U('uJitter'), 0, 0); gl.uniform2f(U('uTanHalf'), c.tanHalf[0], c.tanHalf[1])
  gl.uniformMatrix3fv(U('uCamRot'), false, c.camRot ?? [0, 0, 1, 0, -1, 0, 1, 0, 0])
  gl.uniform1f(U('uA'), c.spin); gl.uniform1f(U('uR0'), c.r0); gl.uniform1f(U('uMu0'), c.mu0); gl.uniform1f(U('uPhi0'), c.phi0 ?? 0)
  gl.uniform3f(U('uBeta'), ...(c.beta ?? [0, 0, 0]))
  gl.uniform1f(U('uRIn'), rIn); gl.uniform1f(U('uROut'), rOut); gl.uniform1f(U('uTmaxK'), c.tmax ?? 7000); gl.uniform1f(U('uTime'), c.time ?? 0)
  gl.uniform1f(U('uEps'), c.eps ?? 0.1); gl.uniform1i(U('uMaxSteps'), c.maxSteps ?? 400)
  gl.uniform1f(U('uExposure'), c.exposure ?? 1.2); gl.uniform1f(U('uHue'), c.hue ?? 1); gl.uniform1f(U('uBeam'), c.beam ?? 1); gl.uniform1f(U('uLook'), c.look ?? 0); gl.uniform1f(U('uSkyGain'), c.skyGain ?? 0.55); gl.uniform1f(U('uPixAng'), c.pixAng ?? (2 * c.tanHalf[1]) / c.h)
  gl.uniform1f(U('uDisc'), c.disc === false ? 0 : 1); gl.uniform1f(U('uJet'), c.jet ? 1 : 0); gl.uniform1f(U('uJetGain'), 0.03); gl.uniform1f(U('uHorizon'), c.horizon ?? 0); gl.uniform1f(U('uDebug'), c.debug)
  gl.uniformMatrix3fv(U('uBH2G'), false, [1, 0, 0, 0, 1, 0, 0, 0, 1])
  gl.uniform1i(U('uSky'), 0); gl.uniform1i(U('uNoise'), 1)
  gl.uniform1fv(U('uDiscT[0]'), lut); gl.uniform4fv(U('uBB[0]'), blackbodyLUT())
  if (tex) gl.deleteTexture(tex)
  tex = gl.createTexture()!; gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, c.w, c.h, 0, gl.RGBA, gl.FLOAT, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  gl.viewport(0, 0, c.w, c.h)
  const t0 = performance.now()
  gl.drawArrays(gl.TRIANGLES, 0, 3)
  const out = new Float32Array(c.w * c.h * 4)
  gl.readPixels(0, 0, c.w, c.h, gl.RGBA, gl.FLOAT, out) // blocks until the GPU has finished
  const ms = performance.now() - t0
  return { data: Array.from(out), ms, err: gl.getError() }
}

/** GPU (float32, GLSL) vs CPU (float64, TypeScript) for every pixel of a w x h image */
export function compare(c: Cfg) {
  const g1 = render({ ...c, debug: 1 }), g2 = render({ ...c, debug: 2 })
  const rot = c.camRot ?? [0, 0, 1, 0, -1, 0, 1, 0, 0]
  const rIn = isco(c.spin), rOut = c.rOut ?? 30
  const names = ['', 'captured', 'escaped', 'disc', 'lost']
  let n = 0, agree = 0, bothEsc = 0, bothDisc = 0
  const skyErr: number[] = [], skyByR: Array<[number, number]> = [], rErr: number[] = [], gErr: number[] = []
  const disagree: string[] = []
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const ndx = ((x + 0.5) / c.w) * 2 - 1, ndy = ((y + 0.5) / c.h) * 2 - 1
    let dx = ndx * c.tanHalf[0], dy = ndy * c.tanHalf[1], dz = -1; const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L
    const nn: [number, number, number] = [rot[0] * dx + rot[3] * dy + rot[6] * dz, rot[1] * dx + rot[4] * dy + rot[7] * dz, rot[2] * dx + rot[5] * dy + rot[8] * dz]
    const cp = traceCPU({ a: c.spin, r0: c.r0, mu0: c.mu0, phi0: c.phi0 ?? 0, n: nn, beta: c.beta, rIn: c.disc === false ? 0 : rIn, rOut: c.disc === false ? -1 : rOut, eps: c.eps ?? 0.1, maxSteps: c.maxSteps ?? 400 })
    const i = (y * c.w + x) * 4
    const gk = names[Math.round(g1.data[i])]
    n++
    if (gk === cp.kind) agree++; else if (disagree.length < 6) disagree.push(`(${x},${y}) gpu ${gk} cpu ${cp.kind}`)
    if (gk === 'escaped' && cp.kind === 'escaped') {
      bothEsc++
      const d = g2.data[i] * cp.sky[0] + g2.data[i + 1] * cp.sky[1] + g2.data[i + 2] * cp.sky[2]
      const ang = Math.acos(Math.min(1, d)); skyErr.push(ang); skyByR.push([cp.rMin, ang])
    }
    if (gk === 'disc' && cp.kind === 'disc') { bothDisc++; rErr.push(Math.abs(g1.data[i + 2] / cp.rHit - 1)); gErr.push(Math.abs(g1.data[i + 3] / cp.g - 1)) }
  }
  const q = (a: number[], p: number) => { if (!a.length) return 0; const s = [...a].sort((u, v) => u - v); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
  const band = (lo: number, hi: number) => { const e = skyByR.filter(([r]) => r >= lo && r < hi).map(([, a]) => a); return { n: e.length, median: q(e, 0.5), p99: q(e, 0.99), max: q(e, 1) } }
  return { bands: { 'rMin<3.3': band(0, 3.3), '3.3-4': band(3.3, 4), '4-6': band(4, 6), '6-12': band(6, 12), '>12': band(12, 1e9) }, n, agree, bothEsc, bothDisc, skyMedian: q(skyErr, 0.5), skyP99: q(skyErr, 0.99), skyMax: q(skyErr, 1), rMedian: q(rErr, 0.5), rP99: q(rErr, 0.99), rMax: q(rErr, 1), gMedian: q(gErr, 0.5), gP99: q(gErr, 0.99), gMax: q(gErr, 1), disagree, msGpu: g1.ms + g2.ms }
}
;(window as unknown as Record<string, unknown>).bh = { init, render, compare }
;(window as unknown as Record<string, unknown>).bhCPU = (c: { a: number; r0: number; mu0: number; n: [number, number, number]; rIn: number; rOut: number; eps: number; maxSteps: number }) => traceCPU(c)

/** compile + run the temporal-accumulation shader on synthetic inputs (cur = horizontal gradient, hist = flat 0.5 or a gradient) */
import { accumFrag, presentFrag } from '../../src/lib/bh/shader'
export function accumTest() {
  const mk = (t: number, src: string) => { const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s)); return s }
  const pre = '#version 300 es\nprecision highp float;\n#define varying in\n#define texture2D texture\nlayout(location=0) out highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n'
  const p2 = gl.createProgram()!
  gl.attachShader(p2, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p2, mk(gl.FRAGMENT_SHADER, pre + accumFrag)); gl.linkProgram(p2)
  if (!gl.getProgramParameter(p2, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p2))
  // present shader: three's <colorspace_fragment> chunk is not available here; compile it with the chunk stubbed
  const p3 = gl.createProgram()!
  gl.attachShader(p3, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p3, mk(gl.FRAGMENT_SHADER, pre + presentFrag.replace('#include <colorspace_fragment>', ''))); gl.linkProgram(p3)
  if (!gl.getProgramParameter(p3, gl.LINK_STATUS)) throw new Error('link present: ' + gl.getProgramInfoLog(p3))
  const W = 16, H = 16
  const mkTex = (fn: (x: number, y: number) => number) => {
    const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t)
    const d = new Float32Array(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = fn(x, y); d.set([v, v, v, 1], (y * W + x) * 4) }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W, H, 0, gl.RGBA, gl.FLOAT, d)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }
  const run = (blend: number, curFn: (x: number, y: number) => number, histFn: (x: number, y: number) => number) => {
    gl.useProgram(p2)
    const cur = mkTex(curFn), hist = mkTex(histFn)
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, cur); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, hist)
    const U = (n: string) => gl.getUniformLocation(p2, n)
    gl.uniform1i(U('uCur'), 2); gl.uniform1i(U('uHist'), 3); gl.uniform2f(U('uCurRes'), W, H); gl.uniform2f(U('uOutRes'), W, H); gl.uniform1f(U('uBlend'), blend)
    gl.uniformMatrix3fv(U('uReproj'), false, [1, 0, 0, 0, 1, 0, 0, 0, 1]); gl.uniform2f(U('uTanHalf'), 0.5, 0.5); gl.uniform2f(U('uJitterUv'), 0, 0)
    const out = gl.createTexture()!; gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, out)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W, H, 0, gl.RGBA, gl.FLOAT, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out, 0); gl.viewport(0, 0, W, H)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    const px = new Float32Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, px)
    return px
  }
  const grad = (x: number) => x / (W - 1)
  const a = run(0, (x) => grad(x), () => 0.5)           // no history: output = current
  const b = run(0.9, (x) => grad(x), (x) => grad(x))    // history == current: output unchanged
  const c = run(0.9, () => 0.2, () => 0.9)              // history far outside the neighbourhood: must be clamped to the current value (no ghosting)
  const at = (px: Float32Array, x: number, y: number) => px[(y * W + x) * 4]
  return {
    noHistory: Math.max(...Array.from({ length: W }, (_, x) => Math.abs(at(a, x, 8) - grad(x)))),
    sameHistory: Math.max(...Array.from({ length: W }, (_, x) => Math.abs(at(b, x, 8) - grad(x)))),
    clamped: at(c, 8, 8),
    err: gl.getError(),
  }
}
;(window as unknown as Record<string, unknown>).bhAccum = accumTest
