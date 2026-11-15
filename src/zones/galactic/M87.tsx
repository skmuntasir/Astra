import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { cam, groups } from '@/engine/world'
import { getTexture } from '@/engine/assets'
import { st } from '@/engine/store'
import { rngSeed } from '@/lib/rng'
import { M87D, type GalaxySpec } from './data'
import { LY, MPC, eqDir, eqPos, mul3, add3, smooth } from './units'
import { quadVert, quadFrag, spriteVert, spriteFrag } from './shaders'
import { skyBasis, planeMatrix, HitSphere } from './Galaxy'
import { gx, putSprite, spriteGeometry, spriteMaterial, syncSprite } from './state'
import type { V3 } from '@/engine/journey'
import { bhFade } from '../blackhole/state'

/**
 * M87 and its core, ONE object ('gx-m87', local unit = 60,000 ly). The final move of the zone dives into it, so every scale from the
 * galaxy (1e21 m) down to the black hole's surroundings (1e16 m) must have something to look at, with no pop:
 *  - the picture plane (procedural elliptical placeholder) fades out as the camera comes within ~1.6 radii;
 *  - stars: SIMULATED, a density cusp ~ r^-1.5 (count ~ r^1.5) from 6e20 m to 1e15 m, plus a thin log-uniform nuclear cluster;
 *  - the jet: SCHEMATIC (shape, brightness and knots are not to scale). Real facts used: position angle ~ 288 deg, ~ 17 deg to the line of
 *    sight, visible out to ~ 5,000 ly; the receding counter-jet is faint (drawn at 18 %). // VERIFY
 *  - a nucleus glow sized in metres (so it grows as the camera falls in) and the black hole itself is NOT drawn here: Prompt 6 owns it.
 * Dive end state is documented in docs/STATUS.md (M87_END).
 */
export const M87_G: V3 = eqPos(M87D.ra, M87D.dec, M87D.mpc * MPC)
export const M87_R = M87D.radiusLy * LY
const SPEC = { mode: 'baked', fill: 0.9 } as unknown as GalaxySpec

export function M87Body() {
  const quad = useRef<THREE.Mesh>(null)
  const { size } = useThree()
  const res = useMemo(() => {
    const t = st().settings.tier, sc = t === 'low' ? 0.4 : t === 'medium' ? 0.7 : 1
    const d = eqDir(M87D.ra, M87D.dec)
    const r = rngSeed(8787)
    const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += r(); return (s - 2) * 1.7320508 }
    const nStar = Math.round(42000 * sc), nCore = Math.round(3500 * sc), nJet = Math.round(5200 * sc)
    const sg = spriteGeometry(nStar + nCore + nJet + 6)
    let k = 0
    for (let i = 0; i < nStar; i++) {
      const R = (6e20 * Math.pow(r(), 2 / 3) * (r() < 0.18 ? 1 + 2.2 * r() : 1)) / M87_R, c = 2 * r() - 1, ph = r() * 6.2831853, s = Math.sqrt(1 - c * c)
      const blue = r() < 0.04
      putSprite(sg.a, k++, [R * s * Math.cos(ph), R * s * Math.sin(ph) * 0.85, R * c * 0.8], blue ? [0.7, 0.82, 1] : [1.0, 0.9, 0.7], 0, 0, 0.4)
    }
    for (let i = 0; i < nCore; i++) {
      const R = Math.pow(10, 15 + 2.5 * r()) / M87_R, c = 2 * r() - 1, ph = r() * 6.2831853, s = Math.sqrt(1 - c * c)
      putSprite(sg.a, k++, [R * s * Math.cos(ph), R * s * Math.sin(ph), R * c], [1.0, 0.86, 0.62], 0, 0, 0.35)
    }
    // jet
    const { u, e } = skyBasis(d)
    const PA = (M87D.jetPA * Math.PI) / 180, I = (M87D.jetInc * Math.PI) / 180
    const mj = add3(mul3(u, Math.cos(PA)), mul3(e, Math.sin(PA)))
    const axis = add3(mul3(d, -Math.cos(I)), mul3(mj, Math.sin(I)))
    const p1 = skyBasis(axis).u, p2: V3 = [axis[1] * p1[2] - axis[2] * p1[1], axis[2] * p1[0] - axis[0] * p1[2], axis[0] * p1[1] - axis[1] * p1[0]]
    for (let i = 0; i < nJet; i++) {
      const back = r() < 0.18
      const tm = Math.pow(10, 13 + 6.7 * r()) / M87_R * (back ? -1 : 1) // metres -> local, up to ~ 5,000 ly
      const w = 0.09 * Math.abs(tm)
      const knot = !back && r() < 0.03
      putSprite(sg.a, k++, [axis[0] * tm + p1[0] * gauss() * w + p2[0] * gauss() * w, axis[1] * tm + p1[1] * gauss() * w + p2[1] * gauss() * w, axis[2] * tm + p1[2] * gauss() * w + p2[2] * gauss() * w], [0.6, 0.76, 1], knot ? 3 : 1.4, 0, back ? 0.25 : knot ? 0.9 : 0.55)
    }
    // nucleus glows, sized in local units from metres (grow as the camera falls in)
    putSprite(sg.a, k++, [0, 0, 0], [1.0, 0.8, 0.52], 0, 1.2e15 / M87_R, 0.9)
    putSprite(sg.a, k++, [0, 0, 0], [1.0, 0.86, 0.66], 0, 2.5e17 / M87_R, 0.22)
    sg.g.setDrawRange(0, k)
    const pm = spriteMaterial(spriteVert, spriteFrag, { min: 1.3, max: 200 })
    const dot = spriteGeometry(1); putSprite(dot.a, 0, [0, 0, 0], [1, 0.92, 0.8], 9, 0, 1)
    const dm = spriteMaterial(spriteVert, spriteFrag, { min: 3, max: 9 })
    const qm = new THREE.ShaderMaterial({ vertexShader: quadVert, fragmentShader: quadFrag, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uTex: { value: getTexture('galaxy-elliptical') }, uOpacity: { value: 0 }, uGain: { value: 1 }, uTint: { value: new THREE.Color(1, 0.96, 0.9) } } })
    return { M: planeMatrix(SPEC, d).M, g: sg.g, pm, dot, dm, qm }
  }, [])
  useLayoutEffect(() => { const q = quad.current; if (q) { q.matrixAutoUpdate = false; q.matrix.copy(res.M); q.matrixWorldNeedsUpdate = true } }, [res])
  useFrame(() => {
    const grp = groups.get(M87D.id)
    if (!grp || !grp.visible) return
    const dist = grp.position.length() || 1e-9
    const tanH = Math.tan((cam.pose.fov * Math.PI) / 360)
    const pxR = ((grp.scale.x / dist) * (size.height / 2)) / tanH
    const dC = dist / (grp.scale.x || 1e-9)
    const gate = smooth(4e5, 2e6, gx.sunLy) * bhFade.m87 // bhFade: cross-dissolve into the black hole (final series step 3)
    res.qm.uniforms.uOpacity.value = smooth(0.3, 1.6, dC) * smooth(2.5, 9, pxR) * 0.95 * gate
    syncSprite(res.pm, smooth(1.2, 5, pxR) * gate, Math.min(1, Math.max(0.01, Math.pow(pxR / 70, 1.2))))
    syncSprite(res.dm, (1 - smooth(5, 26, pxR)) * gate, 1)
  })
  return (
    <group>
      <mesh ref={quad} material={res.qm} frustumCulled={false} renderOrder={-2}><planeGeometry args={[2, 2]} /></mesh>
      <points geometry={res.g} material={res.pm} frustumCulled={false} renderOrder={0} />
      <points geometry={res.dot.g} material={res.dm} frustumCulled={false} renderOrder={1} />
      <HitSphere id={M87D.id} radiusM={M87_R} />
    </group>
  )
}
