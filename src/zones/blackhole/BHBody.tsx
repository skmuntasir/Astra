import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { cam, groups } from '@/engine/world'
import { getTexture } from '@/engine/assets'
import { st } from '@/engine/store'
import { timeline } from '@/engine/timeline'
import { ranges } from '@/engine/journey'
import { choiceGate } from '@/engine/api'
import { SchwRenderer, SCHW_DEFAULTS, type SchwParams, type SchwView } from '@/lib/bh/SchwRenderer'
import { BH_TIERS, BlackHoleRenderer, DEFAULT_PARAMS, type BHParams, type BHView } from '@/lib/bh/BlackHoleRenderer'
import { presentVert, presentFrag } from '@/lib/bh/shader'
import { FrameGuard } from '@/lib/bh/guard'
import { speedP } from '@/lib/bh/infall'
import { observerRg, holeToGalacticSpin, jetToSpin, SPIN } from './frame'
import { kerrObserver, type V3 as KV3 } from './kerrFrame'
import { FALLER, GATE_FROM, KERR_SPIN, HANDOFF_S, INFALL_BUDGET, infallYawDeg, infallFade } from './model'
import { bhFade, bhStats, live, useBh } from './state'
import { bhOut } from '../universe/state'
import { smooth } from '../galactic/units'

export const BH_ID = 'bh-m87'
const sm = smooth
/** EHT-style look for the journey's M87*: the red-orange false-colour ramp of the real EHT releases (display choice, not true colour). Used by BOTH renderers so the hand-off at the gate keeps the same colours. */
const LOOK = { look: 1, discOutRg: 40, discTmaxK: 7000, exposure: 2.2, dopplerHue: 1, beam: 1 }

/**
 * The black hole of the journey: ONE object, mounted once, kept forever (hidden = not traced, never disposed). It draws a full-screen ray-traced image
 * in place of the sky. Final series 5a: the APPROACH (and the universe seam) is the spinning Kerr renderer (a* = KERR_SPIN, a model choice); the INFALL
 * BRANCH keeps the non-rotating Schwarzschild tracer (option (b)), and the hand-off is a HANDOFF_S cross-fade at the start of the branch, where the pose
 * is identical (the branch starts from the last approach key). Both use the same spin frame (frame.ts SPIN); the camera pose comes from the master timeline like every other object, so nothing here owns the camera.
 *  - approach zone: static observer at the camera's distance;
 *  - infall branch: radial free fall from rest at R_RELEASE; the camera's distance (path) is the radius, the view turns by infallYawDeg(r).
 * Also: the performance guard, the choice-gate trigger, and the fade at the end of the infall / back on the main path.
 */
export function BHBody() {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const camera = useThree((s) => s.camera)
  const res = useMemo(() => {
    const tier = st().settings.tier
    const renderer = new SchwRenderer(getTexture('milkyway'), getTexture('bh-disc-noise'))
    renderer.tier = tier
    const kerr = new BlackHoleRenderer(getTexture('milkyway'), getTexture('bh-disc-noise'))
    kerr.tier = tier
    const mkMat = () => new THREE.ShaderMaterial({ vertexShader: presentVert, fragmentShader: presentFrag, depthTest: false, depthWrite: false, transparent: true, uniforms: { uTex: { value: null }, uAlpha: { value: 0 } } })
    const mat = mkMat(), matK = mkMat()
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3))
    return { renderer, kerr, mat, matK, geo, guard: new FrameGuard(BH_TIERS[tier].scale), bh2g: holeToGalacticSpin() }
  }, [])
  const mesh = useRef<THREE.Mesh>(null)
  const meshK = useRef<THREE.Mesh>(null)
  const tmp = useMemo(() => ({ q: new THREE.Quaternion(), ax: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], x0: new THREE.Vector3(), z0: new THREE.Vector3(), camAx: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], prevTl: 'main', fadeIn: 1, armed: true, hand: 0 }), [])
  useEffect(() => { bhStats.mounted = true; return () => { bhStats.mounted = false } }, [])
  useEffect(() => { res.renderer.setSize(size.width * dpr, size.height * dpr); res.renderer.setScale(res.guard.scale); res.kerr.setSize(size.width * dpr, size.height * dpr); res.kerr.scaleOverride = res.guard.scale; res.kerr.refreshScale() }, [res, size.width, size.height, dpr])
  const params = useMemo<SchwParams>(() => ({ ...SCHW_DEFAULTS, ...LOOK }), [])
  const kparams = useMemo<BHParams>(() => ({ ...DEFAULT_PARAMS, spin: KERR_SPIN, jet: true, jetGain: SCHW_DEFAULTS.jetGain, skyGain: SCHW_DEFAULTS.skyGain, ...LOOK }), [])
  const kview = useMemo<BHView>(() => ({ camRot: new Array(9).fill(0), tanHalf: [0.3, 0.3], r0: 100, mu0: 0, phi0: 0, bh2g: res.bh2g, time: 0 }), [res])
  const view = useMemo<SchwView>(() => ({ camRot: new Array(9).fill(0), tanHalf: [0.3, 0.3], er: [0, 0, 1], r0: 100, Eo: 1, P: 0, bh2g: res.bh2g, time: 0 }), [res])

  useFrame((state, dt) => {
    const grp = groups.get(BH_ID)
    const m = mesh.current
    const mk = meshK.current
    if (!grp || !grp.visible) { if (m) m.visible = false; if (mk) mk.visible = false; live.alpha = 0; bhFade.m87 = 1; return }
    const s = st()
    const tl = s.timelineId
    const T = timeline.t
    const inFall = tl === 'infall'
    // ---- observer
    const { r, er } = observerRg(cam.pose)
    const useFall = inFall // main path (approach, gate, universe seam) = Kerr; only the branch is the non-rotating fall
    // ---- opacity: fade in at the start of the approach, out at the end of the infall, back in after a return
    let alpha = 1
    const ap = ranges('main').find((z) => z.id === 'bh-approach')
    if (!inFall && ap) alpha = sm(0, 0.12, (T - ap.t0) / (ap.t1 - ap.t0))
    bhFade.m87 = inFall || !ap ? 0 : 1 - sm(0.02, 0.11, (T - ap.t0) / (ap.t1 - ap.t0))
    if (inFall) alpha = infallFade(T)
    // final series step 4: past the approach zone the hole dissolves over the first part of the 'universe' zone (the pull-back), and the M87 glow returns
    const bo = !inFall && ap && T > ap.t1 - 1e-9 ? bhOut(T) : -1
    if (bo >= 0) { alpha *= 1 - bo; bhFade.m87 = bo }
    if (tmp.prevTl === 'infall' && !inFall) tmp.fadeIn = 0
    tmp.prevTl = tl
    // hand-off Kerr -> Schwarzschild: 0..1 over HANDOFF_S seconds after the branch starts (same pose: a pure cross-fade); 0 on the main path
    tmp.hand = inFall ? Math.min(1, tmp.hand + Math.min(dt, 0.1) / HANDOFF_S) : 0
    const w = sm(0, 1, tmp.hand)
    if (tmp.fadeIn < 1) { tmp.fadeIn = Math.min(1, tmp.fadeIn + Math.min(dt, 0.1) / 1.3); alpha *= sm(0, 1, tmp.fadeIn) }
    if (bo >= 0 && alpha < 0.002) { if (m) m.visible = false; if (mk) mk.visible = false; live.alpha = 0; return } // dissolved: stop tracing
    // ---- camera axes in the hole frame (+ the look-around of the infall)
    tmp.q.copy(camera.quaternion)
    const ax = tmp.ax
    ax[0].set(1, 0, 0).applyQuaternion(tmp.q); ax[1].set(0, 1, 0).applyQuaternion(tmp.q); ax[2].set(0, 0, 1).applyQuaternion(tmp.q)
    if (inFall) {
      // negative yaw: the squeezed sky appears on the right, the text stays on the dark left
      const y = -(infallYawDeg(r) * Math.PI) / 180, c = Math.cos(y), sn = Math.sin(y)
      const x0 = tmp.x0.copy(ax[0]), z0 = tmp.z0.copy(ax[2]) // reused vectors: no per-frame allocation
      ax[0].copy(x0).multiplyScalar(c).addScaledVector(z0, sn)
      ax[2].copy(z0).multiplyScalar(c).addScaledVector(x0, -sn)
    }
    const dh = (a: THREE.Vector3, b: readonly number[]) => a.x * b[0] + a.y * b[1] + a.z * b[2]
    // the Kerr image uses the camera axes WITHOUT the infall look-around (it is only visible before / at the very start of the branch, where the look-around is 0)
    const camAx = tmp.camAx
    for (let j = 0; j < 3; j++) camAx[j].set(j === 0 ? 1 : 0, j === 1 ? 1 : 0, j === 2 ? 1 : 0).applyQuaternion(camera.quaternion)
    for (let j = 0; j < 3; j++) { view.camRot[3 * j] = dh(ax[j], SPIN.KX); view.camRot[3 * j + 1] = dh(ax[j], SPIN.KY); view.camRot[3 * j + 2] = dh(ax[j], SPIN.KZ) }
    const pm = camera.projectionMatrix.elements
    view.tanHalf = [1 / pm[0], 1 / pm[5]]
    const erK = jetToSpin(er)
    view.er = erK; view.r0 = r
    if (useFall) { view.Eo = FALLER.E; view.P = speedP(FALLER, r) } else { view.Eo = Math.sqrt(Math.max(0, 1 - 2 / r)); view.P = 0 }
    view.time = s.motion === 'reduced' ? 0 : timeline.clock * 10
    // ---- performance guard (frame time of the whole page while the hole is drawn)
    if (s.phase === 'ready' && res.guard.update(dt * 1000)) { res.renderer.setScale(res.guard.scale); res.renderer.stepScale = res.guard.stepScale; res.kerr.scaleOverride = res.guard.scale; res.kerr.refreshScale() }
    if (w < 1) {
      const ko = kerrObserver([erK[0] * r, erK[1] * r, erK[2] * r] as KV3, camAx.map((v) => [v.x, v.y, v.z] as KV3) as [KV3, KV3, KV3], SPIN)
      kview.camRot = ko.camRot; kview.r0 = ko.r0; kview.mu0 = ko.mu0; kview.phi0 = ko.phi0; kview.tanHalf = view.tanHalf; kview.time = view.time
      res.kerr.render(gl, kparams, kview)
    }
    if (w > 0) res.renderer.render(gl, params, view) // Schwarzschild drawn first at full opacity, Kerr on top at (1 - w): an exact cross-fade while alpha = 1
    if (m) { m.visible = alpha > 0.001 && w > 0; res.mat.uniforms.uTex.value = res.renderer.texture; res.mat.uniforms.uAlpha.value = alpha }
    if (mk) { mk.visible = alpha * (1 - w) > 0.001; res.matK.uniforms.uTex.value = res.kerr.texture; res.matK.uniforms.uAlpha.value = alpha * (1 - w) }
    live.r = r; live.alpha = alpha; live.inInfall = inFall
    bhStats.framesDrawn = res.renderer.framesDrawn + res.kerr.framesDrawn; bhStats.lastMs = res.renderer.lastMs; bhStats.scale = res.guard.scale; bhStats.stepScale = res.guard.stepScale; bhStats.guardChanges = res.guard.changes; bhStats.lastR = r
    if (s.phase !== 'ready') bhStats.framesBeforeReady = res.renderer.framesDrawn + res.kerr.framesDrawn
    // ---- the choice
    if (tl === 'main' && ap) watchGate(ap, T, tmp)
  })
  return (
    <>
      <mesh ref={mesh} geometry={res.geo} material={res.mat} frustumCulled={false} renderOrder={-901} visible={false} />
      <mesh ref={meshK} geometry={res.geo} material={res.matK} frustumCulled={false} renderOrder={-900} visible={false} />
    </>
  )
}

const COARSE = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
const settle = { y: -1, at: 0 }
function watchGate(ap: { t0: number; t1: number }, T: number, tmp: { armed: boolean }) {
  const s = st()
  if (cam.override) return
  const local = (T - ap.t0) / (ap.t1 - ap.t0)
  if (local < 0.85) tmp.armed = true
  if (!tmp.armed || local < GATE_FROM || s.gate || s.focusPhase !== 'idle' || s.phase !== 'ready' || timeline.frozen) return
  // On a touch screen the choice waits until the scroll glide has stopped (the pose is constant in this final hold, so nothing visible changes).
  // A tap that lands on a gliding page is swallowed by iOS just to stop the glide, which is what made every choice need two taps.
  if (COARSE()) {
    const y = window.scrollY, now = performance.now()
    if (y !== settle.y) { settle.y = y; settle.at = now }
    if (now - settle.at < 250) return
  }
  tmp.armed = false
  void choiceGate.open({
    id: 'bh-fall', title: 'Fall into the black hole?', note: 'Simulation · the fall uses a non-rotating simplification',
    prompt: `A free-falling observer, released from rest at 60 gravitational radii. About ${INFALL_BUDGET} scroll-heights of falling, into the part of the sky where light, time and space stop behaving as you know them, ending where the equations stop being reliable. The fall is computed for a non-rotating hole (a simplification: the spinning image you see now cross-fades into it). You can return to this exact spot.`,
    options: [{ id: 'yes', label: 'Yes, fall in', branch: 'infall' }, { id: 'no', label: 'No, continue' }],
  }).then((o) => {
    if (o.id === 'no') {
      const last = ranges('main').at(-1)
      if (last?.id === 'bh-approach') useBh.getState().set({ endCard: true })
    }
  })
}
