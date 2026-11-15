/** Browser side of tests/schw_gpu.py: the REAL schwTraceFrag in raw WebGL2, compared pixel by pixel with traceSchw() (CPU, float64). */
import { traceVert, DISC_LUT_SIZE } from '../../src/lib/bh/shader'
import { schwTraceFrag } from '../../src/lib/bh/schwShader'
import { discTemperatureLUT, blackbodyLUT } from '../../src/lib/bh/kerr'
import { traceSchw, type V3 } from '../../src/lib/bh/schw'

const VS = '#version 300 es\n#define varying out\n#define attribute in\nin vec3 position;\n' + traceVert
const FS = '#version 300 es\nprecision highp float;\n#define varying in\n#define texture2D texture\nlayout(location=0) out highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n' + schwTraceFrag
let gl: WebGL2RenderingContext, prog: WebGLProgram, fbo: WebGLFramebuffer
const tex2D = (unit: number) => { const t = gl.createTexture()!; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([40, 40, 40, 255])); gl.generateMipmap(gl.TEXTURE_2D) }
export function init() {
  const c = document.createElement('canvas'); document.body.appendChild(c)
  gl = c.getContext('webgl2')!
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('no EXT_color_buffer_float')
  const mk = (t: number, src: string) => { const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s)); return s }
  prog = gl.createProgram()!
  gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(prog))
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(prog, 'position'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0)
  fbo = gl.createFramebuffer()!
  tex2D(0); tex2D(1)
  return 'ok'
}
export interface Cfg { w: number; h: number; r0: number; Eo: number; P: number; er: V3; camRot: number[]; tanHalf: [number, number]; eps?: number; maxSteps?: number; disc?: boolean; jet?: boolean; debug: 0 | 1 | 2; rOut?: number }
function render(c: Cfg) {
  gl.useProgram(prog)
  const U = (n: string) => gl.getUniformLocation(prog, n)
  const rOut = c.rOut ?? 30
  const { lut } = discTemperatureLUT(0, rOut)
  gl.uniform2f(U('uRes'), c.w, c.h); gl.uniform2f(U('uJitter'), 0, 0); gl.uniform2f(U('uTanHalf'), c.tanHalf[0], c.tanHalf[1])
  gl.uniformMatrix3fv(U('uCamRot'), false, c.camRot); gl.uniform3f(U('uEr'), ...c.er)
  gl.uniform1f(U('uR0'), c.r0); gl.uniform1f(U('uEo'), c.Eo); gl.uniform1f(U('uP'), c.P)
  gl.uniform1f(U('uRIn'), 6); gl.uniform1f(U('uROut'), rOut); gl.uniform1f(U('uTmaxK'), 7000); gl.uniform1f(U('uTime'), 0)
  gl.uniform1f(U('uEps'), c.eps ?? 0.1); gl.uniform1i(U('uMaxSteps'), c.maxSteps ?? 400)
  gl.uniform1f(U('uExposure'), 1.2); gl.uniform1f(U('uHue'), 1); gl.uniform1f(U('uBeam'), 1); gl.uniform1f(U('uSkyGain'), 0.55); gl.uniform1f(U('uPixAng'), (2 * c.tanHalf[1]) / c.h)
  gl.uniform1f(U('uDisc'), c.disc === false ? 0 : 1); gl.uniform1f(U('uJet'), c.jet ? 1 : 0); gl.uniform1f(U('uJetGain'), 0.03); gl.uniform1f(U('uSkyShift'), 1); gl.uniform1f(U('uDebug'), c.debug)
  gl.uniformMatrix3fv(U('uBH2G'), false, [1, 0, 0, 0, 1, 0, 0, 0, 1])
  gl.uniform1i(U('uSky'), 0); gl.uniform1i(U('uNoise'), 1)
  gl.uniform1fv(U('uDiscT[0]'), lut); gl.uniform4fv(U('uBB[0]'), blackbodyLUT())
  const t = gl.createTexture()!; gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, c.w, c.h, 0, gl.RGBA, gl.FLOAT, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0)
  gl.viewport(0, 0, c.w, c.h)
  const t0 = performance.now(); gl.drawArrays(gl.TRIANGLES, 0, 3)
  const out = new Float32Array(c.w * c.h * 4); gl.readPixels(0, 0, c.w, c.h, gl.RGBA, gl.FLOAT, out)
  return { data: out, ms: performance.now() - t0, err: gl.getError() }
}
export function compare(c: Cfg) {
  const g1 = render({ ...c, debug: 1 }), g2 = render({ ...c, debug: 2 })
  const rot = c.camRot
  const names = ['', 'captured', 'escaped', 'disc', 'lost']
  let n = 0, agree = 0, bothEsc = 0, bothDisc = 0, kinds = [0, 0, 0, 0, 0]
  const sky: number[] = [], rE: number[] = [], gE: number[] = [], bad: string[] = []
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const ndx = ((x + 0.5) / c.w) * 2 - 1, ndy = ((y + 0.5) / c.h) * 2 - 1
    let dx = ndx * c.tanHalf[0], dy = ndy * c.tanHalf[1], dz = -1; const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L
    const look: V3 = [rot[0] * dx + rot[3] * dy + rot[6] * dz, rot[1] * dx + rot[4] * dy + rot[7] * dz, rot[2] * dx + rot[5] * dy + rot[8] * dz]
    const cp = traceSchw({ r0: c.r0, Eo: c.Eo, P: c.P, er: c.er, look, rIn: c.disc === false ? 0 : 6, rOut: c.disc === false ? -1 : c.rOut ?? 30, eps: c.eps ?? 0.1, maxSteps: c.maxSteps ?? 400 })
    const i = (y * c.w + x) * 4
    const gk = names[Math.round(g1.data[i])]
    n++; kinds[Math.round(g1.data[i])]++
    const eq = (a: string, b: string) => a === b || (a === 'lost' && b === 'captured') || (a === 'captured' && b === 'lost')
    if (eq(gk, cp.kind)) agree++; else if (bad.length < 6) bad.push(`(${x},${y}) gpu ${gk} cpu ${cp.kind}`)
    if (gk === 'escaped' && cp.kind === 'escaped') { bothEsc++; sky.push(Math.acos(Math.min(1, g2.data[i] * cp.sky[0] + g2.data[i + 1] * cp.sky[1] + g2.data[i + 2] * cp.sky[2]))) }
    if (gk === 'disc' && cp.kind === 'disc') { bothDisc++; rE.push(Math.abs(g1.data[i + 2] / cp.rHit - 1)); gE.push(Math.abs(g1.data[i + 3] / cp.g - 1)) }
  }
  const q = (a: number[], p: number) => { if (!a.length) return 0; const s = [...a].sort((u, v) => u - v); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
  return { n, agree, bothEsc, bothDisc, kinds, skyMed: q(sky, 0.5), skyP99: q(sky, 0.99), skyMax: q(sky, 1), rP99: q(rE, 0.99), gP99: q(gE, 0.99), bad, ms: g1.ms + g2.ms, err: gl.getError() }
}
;(window as unknown as Record<string, unknown>).schw = { init, compare }
