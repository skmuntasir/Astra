import * as THREE from 'three'
import { traceVert, accumFrag, DISC_LUT_SIZE, TRACE_MAX_STEPS } from './shader'
import { schwTraceFrag } from './schwShader'
import { discTemperatureLUT, blackbodyLUT } from './kerr'
import { BH_TIERS, type BHTier } from './BlackHoleRenderer'

/**
 * Renderer of the journey's black hole (non-rotating, observer in radial free fall, valid inside the horizon). Same two passes as BlackHoleRenderer
 * (reduced-resolution trace with jitter -> temporal accumulation at full resolution; the present pass lives in BlackHole.tsx), different tracer
 * (schwShader.ts). Not React, no canvas: it draws into its own render targets with the persistent canvas's WebGLRenderer.
 */
export interface SchwParams {
  discOutRg: number; discTmaxK: number; disc: boolean; jet: boolean; jetGain: number; exposure: number; skyGain: number; skyShift: boolean
  /** 1 = physical Doppler colour; < 1 damps the colour shift only (brightness beaming is kept) */
  dopplerHue: number
  /** 0 = as before; 1 = EHT-style false-colour (red-orange) look (same palette as the Kerr renderer) */
  look?: number
  /** 1 = physical relativistic beaming (bright approaching side, dim receding side); < 1 softens that asymmetry */
  beam: number
}
/**
 * Look: a warm orange-gold disc in the manner of the film's Gargantua (tests/bh_look.py renders old vs new). Peak 3100 K (physical default was 5200 K,
 * blue-white on the approaching side); exposure compensates the lower temperature. dopplerHue 0.3 damps the colour shift (approaching side stays
 * gold, receding side deepens to red); beam 0.45 softens the left-right brightness asymmetry (physical beaming makes the receding side almost vanish).
 * Both are a CINEMATIC GRADE of a physically traced image: geometry (shadow, photon ring, lensing) is untouched. 1 / 1 = the physical look.
 */
export const SCHW_DEFAULTS: SchwParams = { discOutRg: 20, discTmaxK: 3100, disc: true, jet: true, jetGain: 0.03, exposure: 55, skyGain: 0.3, skyShift: true, dopplerHue: 0.3, beam: 0.45 }

export interface SchwView {
  /** camera space (x right, y up, z back) -> hole-local cartesian, column-major 3x3 (THREE.Matrix3.elements) */
  camRot: number[]
  tanHalf: [number, number]
  /** unit vector hole -> observer, hole-local */
  er: [number, number, number]
  r0: number
  Eo: number
  P: number
  /** hole-local -> galactic cartesian, column-major 3x3 */
  bh2g: number[]
  time: number
}
const halton = (i: number, b: number) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b) } return r }

export class SchwRenderer {
  private scene = new THREE.Scene()
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private trace: THREE.ShaderMaterial
  private accum: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private lowRT: THREE.WebGLRenderTarget
  private hist: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]
  private cur = 0
  private frame = 0
  private prev: { rot: number[]; lr: number; er: number[]; key: string } | null = null
  private outW = 2
  private outH = 2
  private lutKey = ''
  tier: BHTier = 'medium'
  /** resolution scale of the trace relative to the output; 0 = the tier's value. The performance guard writes this. */
  scaleOverride = 0
  /** step-count multiplier (guard) */
  stepScale = 1
  temporal = true
  debug = false
  /** how many frames this renderer has drawn (tests / preloader check) */
  framesDrawn = 0
  /** last measured CPU+GPU-submit time of render(), ms (tests) */
  lastMs = 0

  constructor(readonly sky: THREE.Texture, readonly noise: THREE.Texture) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
    this.trace = new THREE.ShaderMaterial({
      vertexShader: traceVert, fragmentShader: schwTraceFrag, depthTest: false, depthWrite: false,
      uniforms: {
        uRes: { value: new THREE.Vector2(2, 2) }, uJitter: { value: new THREE.Vector2() }, uTanHalf: { value: new THREE.Vector2(0.3, 0.3) },
        uCamRot: { value: new THREE.Matrix3() }, uEr: { value: new THREE.Vector3(0, 0, 1) }, uR0: { value: 100 }, uEo: { value: 1 }, uP: { value: 0 },
        uRIn: { value: 6 }, uROut: { value: 30 }, uTmaxK: { value: 7000 }, uTime: { value: 0 }, uEps: { value: 0.1 }, uMaxSteps: { value: 240 },
        uExposure: { value: 1 }, uHue: { value: 1 }, uBeam: { value: 1 }, uLook: { value: 0 }, uSkyGain: { value: 0.55 }, uPixAng: { value: 1e-3 }, uDisc: { value: 1 }, uJet: { value: 0 }, uJetGain: { value: 1 }, uSkyShift: { value: 1 }, uDebug: { value: 0 },
        uBH2G: { value: new THREE.Matrix3() }, uSky: { value: sky }, uNoise: { value: noise },
        uDiscT: { value: new Float32Array(DISC_LUT_SIZE) }, uBB: { value: blackbodyLUT() },
      },
    })
    this.accum = new THREE.ShaderMaterial({
      vertexShader: traceVert, fragmentShader: accumFrag, depthTest: false, depthWrite: false,
      uniforms: {
        uCur: { value: null }, uHist: { value: null }, uCurRes: { value: new THREE.Vector2(2, 2) }, uOutRes: { value: new THREE.Vector2(2, 2) },
        uBlend: { value: 0 }, uReproj: { value: new THREE.Matrix3() }, uTanHalf: { value: new THREE.Vector2(0.3, 0.3) }, uJitterUv: { value: new THREE.Vector2() },
      },
    })
    this.mesh = new THREE.Mesh(geo, this.trace); this.mesh.frustumCulled = false; this.scene.add(this.mesh)
    const mk = (w: number, h: number) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false })
    this.lowRT = mk(2, 2); this.hist = [mk(2, 2), mk(2, 2)]
  }
  get texture(): THREE.Texture { return this.hist[this.cur].texture }
  get scale() { return this.scaleOverride || BH_TIERS[this.tier].scale }
  setSize(w: number, h: number) {
    w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h))
    if (w === this.outW && h === this.outH) return
    this.outW = w; this.outH = h
    this.applyScale()
    this.hist[0].setSize(w, h); this.hist[1].setSize(w, h)
    this.prev = null
  }
  private applyScale() { const s = this.scale; this.lowRT.setSize(Math.max(2, Math.round(this.outW * s)), Math.max(2, Math.round(this.outH * s))) }
  /** change the trace resolution (performance guard); keeps the history (it is full resolution) */
  setScale(s: number) { this.scaleOverride = s; this.applyScale() }
  refreshScale() { this.applyScale() }

  private updateLut(p: SchwParams) {
    const key = `${p.discOutRg}`
    if (key === this.lutKey) return
    this.lutKey = key
    this.trace.uniforms.uDiscT.value = discTemperatureLUT(0, p.discOutRg, DISC_LUT_SIZE).lut
  }

  render(gl: THREE.WebGLRenderer, p: SchwParams, v: SchwView) {
    const t0 = performance.now()
    this.updateLut(p)
    const T = BH_TIERS[this.tier]
    const u = this.trace.uniforms
    const lw = this.lowRT.width, lh = this.lowRT.height
    const key = `${p.discOutRg}|${p.discTmaxK}|${p.disc}|${p.jet}|${p.exposure}|${p.skyGain}|${p.skyShift}|${p.dopplerHue}|${p.beam}|${p.look ?? 0}`
    // history weight shrinks with how far the observer moved this frame (radial infall changes the whole image, not just a rotation)
    let blend = this.temporal ? T.history : 0
    if (!this.prev || this.prev.key !== key) blend = 0
    else {
      const dl = Math.abs(Math.log(v.r0 / this.prev.lr))
      const de = Math.hypot(v.er[0] - this.prev.er[0], v.er[1] - this.prev.er[1], v.er[2] - this.prev.er[2])
      blend *= Math.exp(-(dl * 50 + de * 400))
    }
    const j = this.temporal ? [halton((this.frame % 16) + 1, 2) - 0.5, halton((this.frame % 16) + 1, 3) - 0.5] : [0, 0]
    u.uRes.value.set(lw, lh); u.uJitter.value.set(j[0], j[1]); u.uTanHalf.value.set(v.tanHalf[0], v.tanHalf[1])
    ;(u.uCamRot.value as THREE.Matrix3).fromArray(v.camRot)
    ;(u.uEr.value as THREE.Vector3).set(...v.er)
    u.uR0.value = v.r0; u.uEo.value = v.Eo; u.uP.value = v.P
    u.uRIn.value = 6; u.uROut.value = p.discOutRg; u.uTmaxK.value = p.discTmaxK; u.uTime.value = v.time
    u.uEps.value = T.eps; u.uMaxSteps.value = Math.max(60, Math.min(Math.round(T.maxSteps * 1.5 * this.stepScale), TRACE_MAX_STEPS))
    u.uExposure.value = p.exposure; u.uHue.value = p.dopplerHue; u.uBeam.value = p.beam; u.uLook.value = p.look ?? 0; u.uSkyGain.value = p.skyGain; u.uPixAng.value = (2 * v.tanHalf[1]) / lh
    u.uDisc.value = p.disc ? 1 : 0; u.uJet.value = p.jet ? 1 : 0; u.uJetGain.value = p.jetGain; u.uSkyShift.value = p.skyShift ? 1 : 0; u.uDebug.value = this.debug ? 1 : 0
    ;(u.uBH2G.value as THREE.Matrix3).fromArray(v.bh2g)
    const oldTarget = gl.getRenderTarget(), oldAuto = gl.autoClear
    gl.autoClear = false
    this.mesh.material = this.trace
    gl.setRenderTarget(this.lowRT); gl.render(this.scene, this.cam)
    const src = this.hist[this.cur], dst = this.hist[1 - this.cur]
    const a = this.accum.uniforms
    a.uCur.value = this.lowRT.texture; a.uHist.value = src.texture
    a.uCurRes.value.set(lw, lh); a.uOutRes.value.set(this.outW, this.outH)
    a.uBlend.value = blend; a.uTanHalf.value.set(v.tanHalf[0], v.tanHalf[1]); a.uJitterUv.value.set(j[0] / lw, j[1] / lh)
    const R = new THREE.Matrix3().fromArray(v.camRot)
    if (this.prev) (a.uReproj.value as THREE.Matrix3).copy(new THREE.Matrix3().fromArray(this.prev.rot).transpose().multiply(R)); else (a.uReproj.value as THREE.Matrix3).identity()
    this.mesh.material = this.accum
    gl.setRenderTarget(dst); gl.render(this.scene, this.cam)
    gl.setRenderTarget(oldTarget); gl.autoClear = oldAuto
    this.cur = 1 - this.cur
    this.prev = { rot: v.camRot.slice(), lr: v.r0, er: [...v.er], key }
    this.frame++; this.framesDrawn++
    this.lastMs = performance.now() - t0
  }
  /** Compile both shaders (blocking) and draw one frame at the given view, so the first frame in the journey costs nothing extra. */
  warm(gl: THREE.WebGLRenderer, p: SchwParams, v: SchwView) {
    gl.compile(this.scene, this.cam) // scene has the mesh with the trace material; accum is compiled by the first full render below
    this.prev = null
    this.render(gl, p, v)
    this.render(gl, p, v)
    this.prev = null
  }
  resetHistory() { this.prev = null }
  dispose() { this.lowRT.dispose(); this.hist[0].dispose(); this.hist[1].dispose(); this.trace.dispose(); this.accum.dispose(); this.mesh.geometry.dispose() }
}
