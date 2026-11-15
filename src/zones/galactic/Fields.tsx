import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { cam, groups } from '@/engine/world'
import { focus } from '@/engine/api'
import { st } from '@/engine/store'
import { rngSeed } from '@/lib/rng'
import { Overlay } from '../solar/overlay'
import { DWARFS, GALAXIES, M87D, VIRGO, VIRGO_CLUSTER } from './data'
import { LY, MLY, MPC, SUN_G, eqDir, eqPos, smooth } from './units'
import { spriteVert, spriteFrag } from './shaders'
import { gx, makeProject, putSprite, spriteGeometry, spriteMaterial, syncSprite } from './state'
import { gPos } from './Galaxy'
import { GC_G } from './MilkyWay'
import { M87_G } from './M87'

/**
 * 'gx-fx' (origin = the Sun, unit = 1 ly): the Local Group's dwarf swarm (44 real galaxies at their real positions: a subset of the
 * 80-100+ known) and ALL the labels of the Local Group and nearby-galaxy zones. Galaxy labels are real <button>s (keyboard + click ->
 * focus(id)), like the planet labels of the Solar System zone. Positions and distances: data.ts (// VERIFY).
 * 'gx-virgo' (origin = M87, unit = 1 Mly): the Virgo cluster's members, SIMULATED (a Plummer sphere of ~ 1,300 points, scale radius
 * 0.5 Mpc, cut at 2 Mpc, around M87's position). The 7 brightest named members are real positions with distances ~ 16-18 Mpc.
 */
export function FieldsLayer() {
  const { camera, size } = useThree()
  const ov = useRef<Overlay | null>(null)
  const res = useMemo(() => {
    const sg = spriteGeometry(DWARFS.length)
    DWARFS.forEach((d, i) => {
      const v = eqDir(d.ra, d.dec)
      const col: [number, number, number] = d.group === 'mw' ? [1, 0.92, 0.78] : d.group === 'm31' ? [0.82, 0.9, 1] : [0.78, 1, 0.95]
      putSprite(sg.a, i, [v[0] * d.kly * 1000, v[1] * d.kly * 1000, v[2] * d.kly * 1000], col, 3.4, 0, 0.8)
    })
    return { g: sg.g, m: spriteMaterial(spriteVert, spriteFrag, { min: 2.4, max: 6 }) }
  }, [])
  useEffect(() => {
    const items = [
      ...GALAXIES.map((g) => ({ id: g.id, text: g.name, color: '#bcd2ff', button: true, onClick: () => { void focus(g.id) } })),
      { id: M87D.id, text: 'M87', color: '#ffd9a0', button: true, onClick: () => { void focus(M87D.id) } },
      { id: 'mw', text: 'Milky Way', color: '#ffe3a8', button: false },
      { id: 'virgo', text: 'Virgo Cluster', color: '#9aa6bf', button: false },
      ...DWARFS.filter((d) => d.label).map((d) => ({ id: 'dw-' + d.name, text: d.name, color: '#9aa6bf', button: false })),
      ...VIRGO.map((v) => ({ id: 'v-' + v.name, text: v.name, color: '#9aa6bf', button: false })),
    ]
    const o = new Overlay(items, 'galaxy-overlay')
    ov.current = o
    return () => { o.dispose(); ov.current = null }
  }, [])
  const P = useMemo(() => ({ x: 0, y: 0 }), [])
  useFrame(() => {
    const d = gx.sunLy
    syncSprite(res.m, smooth(30e3, 120e3, d) * (1 - smooth(25e6, 80e6, d)))
    const o = ov.current
    if (!o) return
    camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
    const proj = makeProject(camera, size)
    const tanH = Math.tan((cam.pose.fov * Math.PI) / 360)
    const live = st().focusPhase === 'idle' ? 1 : 0.0
    const lgW = smooth(0.12e6, 0.5e6, d) * (1 - smooth(40e6, 120e6, d))
    const nearW = smooth(10e6, 30e6, d) * (1 - smooth(120e6, 400e6, d)) // far fade added in final-series step 4: the universe zone zooms out far past these labels
    const interactive = (a: number) => a > 0.45 && st().focusPhase === 'idle' && !st().gate
    void interactive
    const px = (pos: [number, number, number], radiusM: number) => ((radiusM / (Math.hypot(pos[0] - cam.pos[0], pos[1] - cam.pos[1], pos[2] - cam.pos[2]) || 1)) * (size.height / 2)) / tanH
    for (const g of GALAXIES) {
      const pos = gPos.get(g.id)!
      const pr = px(pos, g.radiusLy * LY)
      const a = (g.zone === 'lg' ? lgW : nearW) * (1 - smooth(110, 360, pr)) * live
      const on = proj(pos[0], pos[1], pos[2], P)
      o.place(g.id, P.x, P.y, on ? a : 0, on ? a * 0.9 : 0, 12, -10, false)
    }
    {
      const pr = px(M87_G, M87D.radiusLy * LY)
      const a = nearW * (1 - smooth(110, 360, pr)) * live
      const on = proj(M87_G[0], M87_G[1], M87_G[2], P)
      o.place(M87D.id, P.x, P.y, on ? a : 0, on ? a * 0.9 : 0, 12, -10, false)
      const dMv = Math.hypot(cam.pos[0] - M87_G[0], cam.pos[1] - M87_G[1], cam.pos[2] - M87_G[2]) / LY
      const onV = proj(M87_G[0], M87_G[1], M87_G[2], P)
      o.place('virgo', P.x, P.y, onV ? 0.85 * smooth(8e6, 25e6, dMv) * (1 - smooth(120e6, 300e6, d)) * live : 0, 0, 0, 26, false)
    }
    const onMW = proj(GC_G[0], GC_G[1], GC_G[2], P)
    const prMW = px(GC_G, 50000 * LY)
    o.place('mw', P.x, P.y, onMW ? lgW * smooth(1, 4, prMW) * (1 - smooth(90, 250, prMW)) * 0.9 : 0, 0, 10, 12, false)
    const dwA = smooth(0.15e6, 0.4e6, d) * (1 - smooth(3e6, 8e6, d))
    for (const dw of DWARFS) {
      if (!dw.label) continue
      const v = eqDir(dw.ra, dw.dec)
      const rM = dw.kly * 1000 * LY
      const on = proj(SUN_G[0] + v[0] * rM, SUN_G[1] + v[1] * rM, SUN_G[2] + v[2] * rM, P)
      o.place('dw-' + dw.name, P.x, P.y, on ? dwA * 0.8 : 0, 0, 8, -6, false)
    }
    const dM = Math.hypot(cam.pos[0] - M87_G[0], cam.pos[1] - M87_G[1], cam.pos[2] - M87_G[2]) / LY
    const vA = smooth(0.8e6, 3e6, dM) * (1 - smooth(14e6, 40e6, dM))
    for (const m of VIRGO) {
      const p = eqPos(m.ra, m.dec, m.mpc * MPC)
      const on = proj(p[0], p[1], p[2], P)
      o.place('v-' + m.name, P.x, P.y, on ? vA * 0.75 : 0, 0, 8, -6, false)
    }
  })
  return (
    <group>
      <points geometry={res.g} material={res.m} frustumCulled={false} renderOrder={1} />
    </group>
  )
}

export function VirgoLayer() {
  const res = useMemo(() => {
    const t = st().settings.tier
    const n = Math.round(VIRGO_CLUSTER.members * (t === 'low' ? 0.5 : 1))
    const r = rngSeed(1687)
    const a = (VIRGO_CLUSTER.scaleMpc * MPC) / MLY, cut = (VIRGO_CLUSTER.edgeMpc * MPC) / MLY
    const sg = spriteGeometry(n + VIRGO.length)
    let k = 0
    while (k < n) {
      const u = r(), R = a / Math.sqrt(Math.pow(Math.max(u, 1e-4), -2 / 3) - 1)
      if (R > cut) continue
      const c = 2 * r() - 1, ph = r() * 6.2831853, s = Math.sqrt(1 - c * c)
      const hot = r() < 0.15
      putSprite(sg.a, k, [R * s * Math.cos(ph), R * c, R * s * Math.sin(ph)], hot ? [1, 0.82, 0.6] : [1, 0.93, 0.82], hot ? 3 : 1.8, 0, hot ? 0.8 : 0.55)
      k++
    }
    for (const m of VIRGO) {
      const p = eqPos(m.ra, m.dec, m.mpc * MPC)
      putSprite(sg.a, k++, [(p[0] - M87_G[0]) / MLY, (p[1] - M87_G[1]) / MLY, (p[2] - M87_G[2]) / MLY], [1, 0.9, 0.72], 4, 0, 0.9)
    }
    return { g: sg.g, m: spriteMaterial(spriteVert, spriteFrag, { min: 1.6, max: 6 }) }
  }, [])
  useFrame(() => {
    const grp = groups.get('gx-virgo')
    if (!grp || !grp.visible) return
    const dM = (grp.position.length() / (grp.scale.x || 1e-9)) // camera distance, in Mly
    syncSprite(res.m, smooth(0.08, 0.5, dM) * smooth(4e5, 2e6, gx.sunLy) * (1 - smooth(60, 240, dM))) // far fade: the universe zone zooms out past the cluster
  })
  return <points geometry={res.g} material={res.m} frustumCulled={false} renderOrder={1} />
}
