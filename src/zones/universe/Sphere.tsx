import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { groups } from '@/engine/world'
import { getTexture } from '@/engine/assets'
import { st } from '@/engine/store'
import { rngSeed } from '@/lib/rng'
import { Overlay } from '../solar/overlay'
import { SUN_G, smooth } from '../galactic/units'
import { spriteVert, spriteFrag } from '../galactic/shaders'
import { makeProject, putSprite, spriteGeometry, spriteMaterial, syncSprite } from '../galactic/state'
import { CMB_FRAC, R_U, R_U_GLY, R_CMB_GLY, T_REC_YR, round, fmt } from './model'
import { timeline } from '@/engine/timeline'
import { uni } from './state'

/**
 * 'uni-sphere' (origin = the Sun = the centre of OUR observable universe, local unit = its radius, 46.5 Gly comoving):
 *  - a haze of ~90k points: the large-scale matter (SIMULATED: random clusters on a uniform background), the sphere "filled in" from outside;
 *  - the CMB shell: the generated map ('cmb-color', simulated in the style of Planck) on a front-face sphere drawn from OUTSIDE (u flipped so it reads like a globe; inner-face shells froze the page in headless software GL, see STATUS) at the comoving distance of
 *    last scattering. It is only
 *    visible once the camera is clearly outside it (no crossing through the shell: it fades with distance), so there is no pop;
 *  - a thin horizon rim at the particle horizon (1.0 vs. the shell's 0.98), and a "you are here" dot at the centre.
 * Labels are DOM. Same objects are reused in the multiverse zone (the observable universe seen as one small sphere).
 */
const shellVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelViewMatrix) * normal);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`
const shellFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uTex; uniform float uOpacity, uGain;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  #include <logdepthbuf_fragment>
  vec3 c = texture2D(uTex, vec2(1.0 - vUv.x, vUv.y)).rgb * uGain;
  // the shell is seen through the transparent front of the sphere: a little limb darkening keeps it reading as a sphere
  float f = abs(dot(normalize(vN), normalize(vV)));
  c *= 0.55 + 0.45 * smoothstep(0.0, 0.7, f);
  gl_FragColor = vec4(c, uOpacity);
  #include <colorspace_fragment>
}`
const rimFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uOpacity;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  #include <logdepthbuf_fragment>
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.2);
  gl_FragColor = vec4(vec3(0.52, 0.72, 1.0), f * 0.7 * uOpacity);
  #include <colorspace_fragment>
}`

export function SphereLayer() {
  const { camera, size } = useThree()
  const ov = useRef<Overlay | null>(null)
  const res = useMemo(() => {
    const tier = st().settings.tier
    const nSeed = tier === 'low' ? 3500 : 9000, nBack = tier === 'low' ? 6000 : 16000, kids = 8
    const r = rngSeed(930)
    const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += r(); return (s - 2) * 1.7320508 }
    const ball = (): [number, number, number] => { for (;;) { const p: [number, number, number] = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]; if (Math.hypot(p[0], p[1], p[2]) < 0.985) return p } }
    const n = nSeed * kids + nBack + 1
    const sg = spriteGeometry(n)
    let i = 0
    for (let s = 0; s < nSeed; s++) {
      const c = ball()
      for (let k = 0; k < kids; k++) {
        const p: [number, number, number] = [c[0] + gauss() * 0.014, c[1] + gauss() * 0.014, c[2] + gauss() * 0.014]
        if (Math.hypot(p[0], p[1], p[2]) > 0.985) { putSprite(sg.a, i++, [0, 0, 0], [0, 0, 0], 1, 0, 0); continue }
        const warm = r() < 0.3
        putSprite(sg.a, i++, p, warm ? [1, 0.88, 0.68] : [0.7, 0.82, 1], 1.1 + r() * 0.8, 0, 0.18 + 0.3 * r())
      }
    }
    for (let b = 0; b < nBack; b++) putSprite(sg.a, i++, ball(), [0.66, 0.78, 1], 1.0, 0, 0.1)
    putSprite(sg.a, i++, [0, 0, 0], [1, 0.92, 0.7], 4, 0, 0.9) // you are here
    const tex = getTexture('cmb-color')
    const shell = new THREE.ShaderMaterial({ vertexShader: shellVert, fragmentShader: shellFrag, side: THREE.FrontSide, transparent: true, depthWrite: false, depthTest: false, uniforms: { uTex: { value: tex }, uOpacity: { value: 0 }, uGain: { value: 1.0 } } })
    const rim = new THREE.ShaderMaterial({ vertexShader: shellVert, fragmentShader: rimFrag, side: THREE.FrontSide, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: { uOpacity: { value: 0 } } })
    return {
      g: sg.g, m: spriteMaterial(spriteVert, spriteFrag, { min: 1.0, max: 8 }), shell, rim,
      shellGeo: new THREE.SphereGeometry(CMB_FRAC, 128, 64), rimGeo: new THREE.SphereGeometry(1, 96, 48),
    }
  }, [])
  useEffect(() => {
    const items = [
      { id: 'you', text: 'You are here', color: '#ffe3a8', button: false },
      { id: 'cmb', text: 'Cosmic microwave background', color: '#ffb48a', button: false },
    ]
    const o = new Overlay(items, 'sphere-overlay'); ov.current = o
    return () => { o.dispose(); ov.current = null }
  }, [])
  const P = useMemo(() => ({ x: 0, y: 0 }), [])
  const hidden = useRef(false)
  useFrame(() => {
    const grp = groups.get('uni-sphere')
    const o = ov.current
    if (!grp || !grp.visible) {
      if (o && !hidden.current) { for (const id of ['you', 'edge', 'cmb']) o.place(id, 0, 0, 0, 0, 0, 0, false); hidden.current = true }
      return
    }
    hidden.current = false
    const d = grp.position.length() / (grp.scale.x || 1e-9) // camera distance from the centre, in observable-universe radii
    uni.sphereD = d
    const tanH = Math.tan((60 * Math.PI) / 360)
    void tanH
    const hazeA = smooth(0.2, 0.6, d)
    const shellA = smooth(1.5, 2.7, d) * 0.88
    const rimA = smooth(1.4, 2.4, d)
    const pxR = ((1 / Math.max(d, 1e-6)) * (size.height / 2)) / Math.tan((camera as THREE.PerspectiveCamera).fov * Math.PI / 360)
    const dim = Math.min(1, Math.max(0.05, Math.pow(pxR / 300, 0.9)))
    syncSprite(res.m, hazeA, dim)
    res.shell.uniforms.uOpacity.value = shellA
    res.rim.uniforms.uOpacity.value = rimA
    if (!o) return
    camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
    const proj = makeProject(camera, size)
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    const at = (v: [number, number, number]): [number, number, number] => [SUN_G[0] + v[0] * R_U, SUN_G[1] + v[1] * R_U, SUN_G[2] + v[2] * R_U]
    const put = (id: string, p: [number, number, number], a: number, dx = 12, dy = -8) => { const on = proj(p[0], p[1], p[2], P); o.place(id, P.x, P.y, on ? a : 0, 0, dx, dy, false) }
    const L = smooth(1.3, 2.2, d) * (1 - smooth(6, 16, d))
    put('you', SUN_G, L, 14, -6)
    put('edge', at([right.x, right.y, right.z]), L * 0.95, -250, -14)
    put('cmb', at([0.52 * CMB_FRAC, 0.6 * CMB_FRAC, -0.6 * CMB_FRAC]), L * smooth(2.0, 2.8, d) * 0.9, 12, 0)
  })
  const q = useMemo(() => new THREE.Euler(0.5, 1.1, 0.2), [])
  return (
    <>
      <mesh geometry={res.shellGeo} material={res.shell} rotation={q} frustumCulled={false} renderOrder={2} />
      <points geometry={res.g} material={res.m} frustumCulled={false} renderOrder={3} />
      <mesh geometry={res.rimGeo} material={res.rim} frustumCulled={false} renderOrder={4} />
    </>
  )
}
void R_CMB_GLY
