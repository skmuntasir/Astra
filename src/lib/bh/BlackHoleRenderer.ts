import * as THREE from 'three'
import { traceVert, traceFrag, accumFrag, DISC_LUT_SIZE, BB_LUT_SIZE, TRACE_MAX_STEPS } from './shader'
import { discTemperatureLUT, blackbodyLUT, horizon, isco } from './kerr'

/**
 * Reusable Kerr black-hole renderer. NOT a React component and NOT a canvas: it draws into its own render targets with whatever
 * THREE.WebGLRenderer it is given (the persistent canvas's, in the journey; no second WebGL context), and exposes `texture`
 * (tone-mapping happens when the texture is presented, see BlackHole.tsx).
 *
 * Passes per frame: (1) trace at reduced resolution with a sub-pixel jitter, (2) temporal accumulation into a full-resolution history
 * (rotation reprojection + neighbourhood clamp), ping-pong. Quality tiers set resolution scale, step accuracy and step budget.
 */
export type BHTier = 'high' | 'medium' | 'low'
export const BH_TIERS: Record<BHTier, { scale: number; eps: number; maxSteps: number; history: number }> = {
  high: { scale: 0.85, eps: 0.07, maxSteps: 360, history: 0.9 },
  medium: { scale: 0.6, eps: 0.10, maxSteps: 240, history: 0.9 },
  low: { scale: 0.4, eps: 0.14, maxSteps: 160, history: 0.88 },
}

export interface BHParams {
  spin: number
  discOutRg: number
  discTmaxK: number
  disc: boolean
  jet: boolean
  jetGain: number
  horizonMarker: number
  exposure: number
  skyGain: number
  /** 1 = physical Doppler colour; < 1 damps the colour shift only (brightness beaming is kept) */
  dopplerHue: number
  /** 1 = physical relativistic beaming (bright approaching side, dim receding side); < 1 softens that asymmetry */
  beam: number
  /** 0 = black-body colours; 1 = EHT-style false-colour (red-orange) look */
  look: number
}
export const DEFAULT_PARAMS: BHParams = { spin: 0.9, discOutRg: 30, discTmaxK: 7000, disc: true, jet: false, jetGain: 0.03, horizonMarker: 0, exposure: 2.2, skyGain: 0.55, dopplerHue: 1, beam: 1, look: 0 }

/** everything that changes with the camera, per frame */
export interface BHView {
  /** camera axes (x right, y up, z back) as observer-local (r-hat, theta-hat, phi-hat) components: 9 numbers, column-major like THREE.Matrix3.elements */
  camRot: number[]
  tanHalf: [number, number]
  r0: number; mu0: number; phi0: number
  beta?: [number, number, number]
  /** hole-local cartesian (z = spin axis) -> galactic cartesian, column-major 3x3 */
  bh2g: number[]
  /** simulation time (r_g / c) */
  time: number
}

/**
 * Builds a BHView from a camera position in HOLE-LOCAL cartesian coordinates (r_g, z = spin axis) and the camera orientation expressed
 * in the same frame (a quaternion that rotates camera space -> hole-local space). Position is passed as numbers (doubles): the caller
 * does the floating-origin subtraction. BL (r, theta, phi) are taken as the spherical coordinates of that position (exact for a = 0;
 * for a > 0 the BL coordinate lines are oblate, a difference of order a^2/r^2 that only changes where the camera "sits"; see docs).
 */
export function makeView(posRg: [number, number, number], camToHole: THREE.Quaternion, tanHalf: [number, number], hole2gal: THREE.Matrix3, time: number, beta?: [number, number, number]): BHView {
  const [x, y, z] = posRg
  const r = Math.hypot(x, y, z), mu = z / r, st = Math.sqrt(Math.max(0, 1 - mu * mu)), phi = Math.atan2(y, x)
  const cp = Math.cos(phi), sp = Math.sin(phi)
  const rh = new THREE.Vector3(st * cp, st * sp, mu), th = new THREE.Vector3(mu * cp, mu * sp, -st), ph = new THREE.Vector3(-sp, cp, 0)
  const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].map((v) => v.applyQuaternion(camToHole))
  const m: number[] = []
  for (const e of axes) m.push(rh.dot(e), th.dot(e), ph.dot(e)) // column = one camera axis
  return { camRot: m, tanHalf, r0: r, mu0: mu, phi0: phi, beta, bh2g: hole2gal.elements.slice(), time }
}

const halton = (i: number, b: number) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b) } return r }

export class BlackHoleRenderer {
  readonly sky: THREE.Texture
  readonly noise: THREE.Texture
  private scene = new THREE.Scene()
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private trace: THREE.ShaderMaterial
  private accum: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private lowRT: THREE.WebGLRenderTarget
  private hist: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget]
  private cur = 0
  private frame = 0
  private lutKey = ''
  private prev: { rot: number[]; r0: number; mu0: number; key: string } | null = null
  private outW = 2
  private outH = 2
  tier: BHTier = 'medium'
  /** override of the tier's resolution scale (lab slider); 0 = use the tier */
  scaleOverride = 0
  /** temporal accumulation on/off (tests turn it off for exact readback) */
  temporal = true
  jitter = true
  /** debug records instead of colours (tests) */
  debug = false
  rIn = 6

  constructor(sky: THREE.Texture, noise: THREE.Texture) {
    this.sky = sky; this.noise = noise
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
    const bb = blackbodyLUT()
    this.trace = new THREE.ShaderMaterial({
      vertexShader: traceVert, fragmentShader: traceFrag, depthTest: false, depthWrite: false,
      uniforms: {
        uRes: { value: new THREE.Vector2(2, 2) }, uJitter: { value: new THREE.Vector2() }, uTanHalf: { value: new THREE.Vector2(0.3, 0.3) },
        uCamRot: { value: new THREE.Matrix3() }, uA: { value: 0 }, uR0: { value: 100 }, uMu0: { value: 0 }, uPhi0: { value: 0 }, uBeta: { value: new THREE.Vector3() },
        uRIn: { value: 6 }, uROut: { value: 30 }, uTmaxK: { value: 7000 }, uTime: { value: 0 }, uEps: { value: 0.1 }, uMaxSteps: { value: 240 },
        uExposure: { value: 1 }, uHue: { value: 1 }, uBeam: { value: 1 }, uLook: { value: 0 }, uSkyGain: { value: 0.55 }, uPixAng: { value: 1e-3 }, uDisc: { value: 1 }, uJet: { value: 0 }, uJetGain: { value: 1 }, uHorizon: { value: 0 }, uDebug: { value: 0 },
        uBH2G: { value: new THREE.Matrix3() }, uSky: { value: sky }, uNoise: { value: noise },
        uDiscT: { value: new Float32Array(DISC_LUT_SIZE) }, uBB: { value: bb },
      },
    })
    this.accum = new THREE.ShaderMaterial({
      vertexShader: traceVert, fragmentShader: accumFrag, depthTest: false, depthWrite: false,
      uniforms: {
        uCur: { value: null }, uHist: { value: null }, uCurRes: { value: new THREE.Vector2(2, 2) }, uOutRes: { value: new THREE.Vector2(2, 2) },
        uBlend: { value: 0 }, uReproj: { value: new THREE.Matrix3() }, uTanHalf: { value: new THREE.Vector2(0.3, 0.3) }, uJitterUv: { value: new THREE.Vector2() },
      },
    })
    this.mesh = new THREE.Mesh(geo, this.trace)
    this.mesh.frustumCulled = false
    this.scene.add(this.mesh)
    const mk = (w: number, h: number, linear = true) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: linear ? THREE.LinearFilter : THREE.NearestFilter, magFilter: linear ? THREE.LinearFilter : THREE.NearestFilter, depthBuffer: false, generateMipmaps: false })
    this.lowRT = mk(2, 2)
    this.hist = [mk(2, 2), mk(2, 2)]
  }

  /** frames drawn so far (tests / preloader check) */
  get framesDrawn(): number { return this.frame }
  /** the finished (linear HDR) image, output resolution */
  get texture(): THREE.Texture { return this.hist[this.cur].texture }
  /** the disc's inner edge for the current spin */
  get discInner(): number { return this.rIn }

  setSize(w: number, h: number) {
    w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h))
    if (w === this.outW && h === this.outH) return
    this.outW = w; this.outH = h
    const s = this.scaleOverride || BH_TIERS[this.tier].scale
    this.lowRT.setSize(Math.max(2, Math.round(w * s)), Math.max(2, Math.round(h * s)))
    this.hist[0].setSize(w, h); this.hist[1].setSize(w, h)
    this.prev = null
  }
  /** call after changing tier / scaleOverride */
  refreshScale() { const w = this.outW, h = this.outH; this.outW = 0; this.setSize(w, h) }

  private updateLut(p: BHParams) {
    const key = `${p.spin.toFixed(4)}|${p.discOutRg.toFixed(2)}`
    if (key === this.lutKey) return
    this.lutKey = key
    const { lut, rIn } = discTemperatureLUT(p.spin, p.discOutRg, DISC_LUT_SIZE)
    this.trace.uniforms.uDiscT.value = lut
    this.rIn = rIn
  }

  /** Renders one frame into `texture`. Leaves the renderer's target and viewport as it found them. */
  render(gl: THREE.WebGLRenderer, p: BHParams, v: BHView) {
    this.updateLut(p)
    const T = BH_TIERS[this.tier]
    const u = this.trace.uniforms
    const lw = this.lowRT.width, lh = this.lowRT.height
    // temporal-AA state: any change of the look (not the camera) drops the history; a moving camera shortens it (rotation is reprojected, translation is not)
    const key = `${p.spin}|${p.discOutRg}|${p.discTmaxK}|${p.disc}|${p.jet}|${p.exposure}|${p.skyGain}|${p.horizonMarker}|${p.dopplerHue}|${p.beam}|${p.look}`
    const moved = this.prev ? Math.abs(this.prev.r0 - v.r0) / v.r0 > 2e-3 || Math.abs(this.prev.mu0 - v.mu0) > 2e-4 : true
    let blend = this.temporal ? T.history : 0
    if (!this.prev || this.prev.key !== key) blend = 0
    else if (moved) blend = Math.min(blend, 0.55)
    const j = this.jitter && this.temporal ? [halton((this.frame % 16) + 1, 2) - 0.5, halton((this.frame % 16) + 1, 3) - 0.5] : [0, 0]
    // trace
    u.uRes.value.set(lw, lh); u.uJitter.value.set(j[0], j[1]); u.uTanHalf.value.set(v.tanHalf[0], v.tanHalf[1])
    ;(u.uCamRot.value as THREE.Matrix3).fromArray(v.camRot)
    u.uA.value = p.spin; u.uR0.value = v.r0; u.uMu0.value = v.mu0; u.uPhi0.value = v.phi0
    ;(u.uBeta.value as THREE.Vector3).set(...(v.beta ?? [0, 0, 0]))
    u.uRIn.value = this.rIn; u.uROut.value = p.discOutRg; u.uTmaxK.value = p.discTmaxK; u.uTime.value = v.time
    u.uEps.value = T.eps; u.uMaxSteps.value = Math.min(T.maxSteps, TRACE_MAX_STEPS)
    u.uExposure.value = p.exposure; u.uHue.value = p.dopplerHue; u.uBeam.value = p.beam; u.uLook.value = p.look ?? 0; u.uSkyGain.value = p.skyGain
    u.uPixAng.value = (2 * v.tanHalf[1]) / lh // radians per low-res pixel (small-angle)
    u.uDisc.value = p.disc ? 1 : 0; u.uJet.value = p.jet ? 1 : 0; u.uJetGain.value = p.jetGain; u.uHorizon.value = p.horizonMarker; u.uDebug.value = this.debug ? 1 : 0
    ;(u.uBH2G.value as THREE.Matrix3).fromArray(v.bh2g)
    const oldTarget = gl.getRenderTarget(), oldAuto = gl.autoClear
    gl.autoClear = false
    this.mesh.material = this.trace
    gl.setRenderTarget(this.lowRT); gl.render(this.scene, this.cam)
    // accumulate
    const src = this.hist[this.cur], dst = this.hist[1 - this.cur]
    const a = this.accum.uniforms
    a.uCur.value = this.lowRT.texture; a.uHist.value = src.texture
    a.uCurRes.value.set(lw, lh); a.uOutRes.value.set(this.outW, this.outH)
    a.uBlend.value = blend; a.uTanHalf.value.set(v.tanHalf[0], v.tanHalf[1]); a.uJitterUv.value.set(j[0] / lw, j[1] / lh)
    const R = new THREE.Matrix3().fromArray(v.camRot)
    if (this.prev) { const Rp = new THREE.Matrix3().fromArray(this.prev.rot); (a.uReproj.value as THREE.Matrix3).copy(Rp.clone().transpose().multiply(R)) } else (a.uReproj.value as THREE.Matrix3).identity()
    this.mesh.material = this.accum
    gl.setRenderTarget(dst); gl.render(this.scene, this.cam)
    gl.setRenderTarget(oldTarget); gl.autoClear = oldAuto
    this.cur = 1 - this.cur
    this.prev = { rot: v.camRot.slice(), r0: v.r0, mu0: v.mu0, key }
    this.frame++
  }

  /** forget the history (call after a cut / large change) */
  resetHistory() { this.prev = null }
  /** the horizon radius of the current spin */
  static horizonOf(spin: number) { return horizon(spin) }
  static iscoOf(spin: number) { return isco(spin) }

  dispose() {
    this.lowRT.dispose(); this.hist[0].dispose(); this.hist[1].dispose(); this.trace.dispose(); this.accum.dispose(); this.mesh.geometry.dispose()
  }
}
