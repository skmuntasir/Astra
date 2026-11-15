import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { cam, groups } from '@/engine/world'
import { getTexture } from '@/engine/assets'
import { focus } from '@/engine/api'
import { st } from '@/engine/store'
import { rngSeed } from '@/lib/rng'
import { GALAXIES, type GalaxySpec } from './data'
import { LY, SUN_G, eqDir, eqPos, norm3, cross3, dot3, mul3, add3, sub3, smooth, dirToAE } from './units'
import { quadVert, quadFrag, spriteVert, spriteFrag } from './shaders'
import { gx, putSprite, spriteGeometry, spriteMaterial, syncSprite } from './state'
import type { V3 } from '@/engine/journey'

/**
 * A galaxy as a registered, focusable object. Local unit = the galaxy's visible half-extent (the engine scales it to radiusLy).
 *  - a picture plane in 3-D (so it has perspective and parallax, and fades when seen edge-on instead of showing a line), oriented by
 *    the true inclination and position angle where the picture is a face-on one ('disk'), turned to the sky position angle for an
 *    edge-on picture ('pa'), or facing the Sun for a picture that already contains the tilt ('baked');
 *  - a few thousand particles in the same disc (spiral / ellipsoid / irregular) that give depth when the camera moves;
 *  - a small glow sprite so a distant galaxy is still a visible dot;
 *  - an invisible hit sphere (never smaller than 24 px) for click -> focus().
 * THE PICTURES ARE PROCEDURAL PLACEHOLDERS (tools/texgen), not Hubble/Webb images; the focus panel says so.
 */
/**
 * Per-galaxy colour of the picture (final series, step 1): the procedural pictures are shared between galaxies of one kind (M81, M101, M51 use
 * the same face-on spiral), so each gets a MILD multiplicative grade toward its real colour. Multiplicative only (no additive stacking, no
 * tone-mapping), at most about +-12 % per channel, so nothing washes out and cores keep their own hue.
 * Real colours: M31 yellowish core with bluer outer ring; M33 blue-white with pink star-forming knots; LMC pale yellow-white bar; SMC bluer;
 * M81 yellow core, blue arms; M82 reddish starburst; Cen A warm elliptical with a dark lane; M101 blue arms; M51 blue-white arms; M104 cream bulge; NGC 1365 gold bar, blue arms.
 */
const PIC_GRADE: Record<string, [number, number, number]> = {
  'gx-m31': [1.03, 1.0, 0.94], 'gx-m33': [0.93, 0.98, 1.1], 'gx-lmc': [1.03, 1.0, 0.96], 'gx-smc': [0.93, 0.98, 1.1],
  'gx-m81': [1.06, 1.0, 0.9], 'gx-m82': [1.1, 0.94, 0.86], 'gx-cena': [1.05, 1.0, 0.92], 'gx-m101': [0.92, 0.98, 1.12],
  'gx-m51': [0.96, 0.98, 1.08], 'gx-m104': [1.06, 1.0, 0.9], 'gx-n1365': [1.03, 1.0, 0.96],
}

export const gPos = new Map<string, V3>()
for (const g of GALAXIES) gPos.set(g.id, eqPos(g.ra, g.dec, g.ly * LY))

/** Sky basis at a direction d (Sun -> galaxy): u = celestial north projected on the sky, r = right (west) = d x u, e = east = -r. */
export function skyBasis(d: V3) {
  const npole = eqDir(0, 90)
  const u = norm3(sub3(npole, mul3(d, dot3(npole, d))))
  const r = norm3(cross3(d, u))
  return { u, r, e: mul3(r, -1) }
}

/** Disc basis from inclination / position angle: major axis m, in-plane minor q, normal n (pointing to the Sun's side). */
export function discBasis(d: V3, inc: number, pa: number) {
  const { u, e } = skyBasis(d)
  const P = (pa * Math.PI) / 180, I = (inc * Math.PI) / 180
  const m = add3(mul3(u, Math.cos(P)), mul3(e, Math.sin(P)))
  const p = add3(mul3(u, -Math.sin(P)), mul3(e, Math.cos(P))) // sky-plane perpendicular to the major axis
  const toSun = mul3(d, -1)
  let n = norm3(add3(mul3(toSun, Math.cos(I)), mul3(p, Math.sin(I))))
  if (dot3(n, toSun) < 0) n = mul3(n, -1)
  const q = norm3(cross3(n, m))
  return { m, q, n }
}

export function planeMatrix(g: GalaxySpec, d: V3): { M: THREE.Matrix4; focusDir: V3 } {
  const s = 1 / g.fill
  const toSun = mul3(d, -1)
  let x: V3, y: V3, z: V3
  if (g.mode === 'baked') {
    const b = skyBasis(d); x = b.r; y = b.u; z = toSun
  } else if (g.mode === 'pa') {
    const b = discBasis(d, 0, g.pa ?? 0); x = b.m; z = toSun; y = cross3(z, x)
  } else {
    const b = discBasis(d, g.inc ?? 0, g.pa ?? 0); x = b.m; y = b.q; z = b.n
  }
  const M = new THREE.Matrix4().makeBasis(new THREE.Vector3(...x).multiplyScalar(s), new THREE.Vector3(...y).multiplyScalar(s), new THREE.Vector3(...z).multiplyScalar(s))
  return { M, focusDir: g.mode === 'disk' ? z : toSun }
}

/** focus camera angles for a galaxy */
export function focusAngles(g: GalaxySpec) {
  const d = eqDir(g.ra, g.dec)
  const { focusDir } = planeMatrix(g, d)
  return dirToAE(focusDir)
}

const hitMat = new THREE.MeshBasicMaterial({ visible: false })
const hitGeo = new THREE.SphereGeometry(1, 16, 10)
const NOOP = () => {}
const meshRaycast = THREE.Mesh.prototype.raycast
/** Invisible click target. `id` = registered object id (focus target). */
export function HitSphere({ id, radiusM }: { id: string; radiusM: number }) {
  const m = useRef<THREE.Mesh>(null)
  const { size } = useThree()
  useFrame(() => {
    const mesh = m.current
    const grp = groups.get(id)
    if (!mesh || !grp) return
    const can = grp.visible && st().focusPhase === 'idle' && !st().gate
    mesh.raycast = can ? meshRaycast : NOOP
    if (!can) return
    // px radius of the body (local unit 1 = the object's radius)
    const dist = grp.position.length() || 1e-9
    const tanH = Math.tan((cam.pose.fov * Math.PI) / 360)
    const pxR = ((grp.scale.x / dist) * (size.height / 2)) / tanH
    mesh.scale.setScalar(Math.max(1, 24 / Math.max(pxR, 1e-6)))
  })
  void radiusM
  return (
    <mesh ref={m} geometry={hitGeo} material={hitMat} frustumCulled={false}
      onPointerOver={(e) => { if (!grp(id)) return; e.stopPropagation(); document.body.style.cursor = 'pointer'; gx.hover = id }}
      onPointerOut={() => { if (gx.hover === id) { gx.hover = null; document.body.style.cursor = '' } }}
      onClick={(e) => { if (!grp(id) || st().focusPhase !== 'idle') return; e.stopPropagation(); void focus(id) }}
    />
  )
}
const grp = (id: string) => !!groups.get(id)?.visible

function discParticles(g: GalaxySpec, d: V3, n: number) {
  const r = rngSeed(Math.floor(g.ly) % 99991 + 7)
  const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += r(); return (s - 2) * 1.7320508 }
  const { m, q, n: nrm } = g.mode === 'pa' ? discBasis(d, 85, g.pa ?? 0) : discBasis(d, g.inc ?? 30, g.pa ?? 0)
  const sg = spriteGeometry(n)
  const t = g.parts
  const tint = g.tint
  for (let i = 0; i < n; i++) {
    let a = 0, b = 0, c = 0
    const bulge = r() < t.bulge
    if (t.shape === 'ellipsoid') {
      const R = Math.pow(r(), 1.7) * 0.9, cth = 2 * r() - 1, ph = r() * 6.2831853, s = Math.sqrt(1 - cth * cth)
      a = R * s * Math.cos(ph); b = R * s * Math.sin(ph) * 0.8; c = R * cth * 0.75
    } else if (t.shape === 'irregular') {
      const cl = Math.floor(r() * 6), cx = Math.sin(cl * 2.1) * 0.35, cy = Math.cos(cl * 1.7) * 0.3
      a = cx + gauss() * 0.3; b = cy + gauss() * 0.22; c = gauss() * t.thick
    } else if (bulge) {
      const R = Math.abs(gauss()) * 0.12, cth = 2 * r() - 1, ph = r() * 6.2831853, s = Math.sqrt(1 - cth * cth)
      a = R * s * Math.cos(ph); b = R * s * Math.sin(ph); c = R * cth * 0.8
    } else {
      // exponential disc modulated into two logarithmic arms
      let R = 0, th = 0
      for (let k = 0; k < 30; k++) {
        R = -0.28 * (Math.log(1 - r()) + Math.log(1 - r())); th = r() * 6.2831853
        const arm = Math.exp(-Math.pow(Math.sin(((t.arms ?? 2) * (th - Math.log(Math.max(R, 0.05) / 0.2) / Math.tan(0.28))) / 2), 2) * 6)
        if (R < 0.95 && r() < 0.25 + 0.75 * arm) break
      }
      a = R * Math.cos(th); b = R * Math.sin(th); c = gauss() * t.thick * 0.5
    }
    const young = !bulge && t.shape === 'spiral' && r() < 0.4
    // colour: the picture now carries the galaxy's colour, so the particles must not wash it out. Young stars are saturated blue, old
    // stars golden; an irregular galaxy's old stars are a little paler. (`tint` = the galaxy's overall colour, used for the far dot.)
    const col: [number, number, number] = young ? [0.5, 0.7, 1] : t.shape === 'irregular' ? [0.95, 0.86, 0.74] : [1, 0.84, 0.6]
    const p: V3 = [m[0] * a + q[0] * b + nrm[0] * c, m[1] * a + q[1] * b + nrm[1] * c, m[2] * a + q[2] * b + nrm[2] * c]
    putSprite(sg.a, i, p, col, young ? 1.7 : 0, 0, young ? 0.55 : 0.4)
  }
  return sg.g
}

export function makeGalaxy(g: GalaxySpec) {
  const d = eqDir(g.ra, g.dec)
  const radiusM = g.radiusLy * LY
  return function Galaxy() {
    const quad = useRef<THREE.Mesh>(null)
    const { size } = useThree()
    const res = useMemo(() => {
      const tier = st().settings.tier
      const n = Math.round(g.parts.n * (tier === 'low' ? 0.4 : tier === 'medium' ? 0.7 : 1))
      const pm = spriteMaterial(spriteVert, spriteFrag, { min: 1.3, max: 4 })
      const dot = spriteGeometry(1); putSprite(dot.a, 0, [0, 0, 0], g.tint, 9, 0, 1)
      const dm = spriteMaterial(spriteVert, spriteFrag, { min: 4, max: 10 })
      const qm = new THREE.ShaderMaterial({ vertexShader: quadVert, fragmentShader: quadFrag, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uTex: { value: getTexture(g.tex) }, uOpacity: { value: 0 }, uGain: { value: 1 }, uTint: { value: new THREE.Color(...(PIC_GRADE[g.id] ?? [1, 1, 1])) } } })
      return { M: planeMatrix(g, d).M, parts: discParticles(g, d, n), pm, dot, dm, qm }
    }, [])
    useLayoutEffect(() => { const q = quad.current; if (q) { q.matrixAutoUpdate = false; q.matrix.copy(res.M); q.matrixWorldNeedsUpdate = true } }, [res])
    useFrame(() => {
      const grp = groups.get(g.id)
      if (!grp || !grp.visible) return
      const dC = grp.position.length() / (grp.scale.x || 1e-9) // camera distance in galaxy radii
      const tanH = Math.tan((cam.pose.fov * Math.PI) / 360)
      const pxR = ((grp.scale.x / (grp.position.length() || 1e-9)) * (size.height / 2)) / tanH
      // distance gate: a galaxy is only 'there' once the camera has left the Sun's neighbourhood far enough (no pop when its zone's window opens)
      const gate = g.zone === 'lg' ? smooth(3e4, 1.5e5, gx.sunLy) : smooth(4e5, 2e6, gx.sunLy)
      const imageA = smooth(0.35, 1.8, dC) * smooth(2.5, 9, pxR)
      res.qm.uniforms.uOpacity.value = imageA * 0.95 * gate
      syncSprite(res.pm, 0.9 * smooth(1.2, 5, pxR) * gate, Math.min(1, Math.max(0.01, Math.pow(pxR / 70, 1.2))))
      syncSprite(res.dm, (1 - smooth(5, 26, pxR)) * gate, 1)
    })
    return (
      <group>
        <mesh ref={quad} material={res.qm} frustumCulled={false} renderOrder={-2}><planeGeometry args={[2, 2]} /></mesh>
        <points geometry={res.parts} material={res.pm} frustumCulled={false} renderOrder={0} />
        <points geometry={res.dot.g} material={res.dm} frustumCulled={false} renderOrder={1} />
        <HitSphere id={g.id} radiusM={radiusM} />
      </group>
    )
  }
}
void SUN_G
