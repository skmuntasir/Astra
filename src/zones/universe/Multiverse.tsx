import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { groups } from '@/engine/world'
import { timeline } from '@/engine/timeline'
import { st } from '@/engine/store'
import { rngSeed } from '@/lib/rng'
import { Overlay } from '../solar/overlay'
import { SUN_G, smooth } from '../galactic/units'
import { spriteVert, spriteFrag } from '../galactic/shaders'
import { makeProject, putSprite, spriteGeometry, spriteMaterial, syncSprite } from '../galactic/state'
import { R_U } from './model'
import { uni, zoneLocal } from './state'

/**
 * 'mv-field' (origin = the Sun, local unit = the observable-universe radius, as in 'uni-sphere'): the multiverse HYPOTHESIS, a schematic.
 * Our bubble (radius 6.5 units, far larger than the observable sphere, offset so the sphere is not at its centre) plus ~44 other bubble
 * universes in a faint glow of still-inflating space. Each bubble is tinted differently (= "different constants", hypothetical); bubbles
 * nucleate and grow with scroll progress (reversible, nothing time-driven), with a brief bright wall while forming.
 * Nothing here is an observation or a prediction of positions. The HUD keeps "Hypothesis. Not observed." on screen the whole zone.
 */
const bubVert = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec4 aC; attribute vec4 aT;
uniform float uProg;
varying vec3 vN; varying vec3 vV; varying vec3 vCol; varying float vG; varying vec3 vObj;
void main(){
  float g = smoothstep(aT.w, aT.w + 0.12, uProg);
  vG = g;
  vec3 p = aC.xyz + position * aC.w * g;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(mat3(modelViewMatrix) * position);
  vV = -mv.xyz;
  vCol = aT.rgb; vObj = position;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`
const bubFrag = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uOpacity;
varying vec3 vN; varying vec3 vV; varying vec3 vCol; varying float vG; varying vec3 vObj;
float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h(i), h(i+vec3(1,0,0)), f.x), mix(h(i+vec3(0,1,0)), h(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h(i+vec3(0,0,1)), h(i+vec3(1,0,1)), f.x), mix(h(i+vec3(0,1,1)), h(i+vec3(1,1,1)), f.x), f.y), f.z); }
void main(){
  #include <logdepthbuf_fragment>
  if (vG < 0.002) discard;
  float f = abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(1.0 - f, 2.3);
  float foam = vn(vObj * 5.0) * 0.6 + vn(vObj * 11.0) * 0.4;
  float forming = (1.0 - vG);
  float a = (rim * 0.85 + 0.05 + 0.07 * foam + forming * (0.35 + rim)) * uOpacity;
  vec3 c = vCol * (0.55 + 0.9 * rim + 0.4 * foam * (1.0 - rim));
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`

export interface Bubble { c: [number, number, number]; r: number; col: [number, number, number]; birth: number; label?: string }
const PAL: Array<[number, number, number]> = [[0.95, 0.45, 0.78], [0.5, 0.95, 0.58], [1.0, 0.68, 0.3], [0.72, 0.55, 1.0], [0.35, 0.9, 0.92], [1.0, 0.46, 0.42]]
const OURS: Bubble = { c: [2.6, -1.2, 0.6], r: 6.5, col: [0.55, 0.78, 1.0], birth: -1 }
export function makeBubbles(): Bubble[] {
  const r = rngSeed(8008)
  const out: Bubble[] = [OURS]
  let guard = 0
  while (out.length < 46 && guard++ < 6000) {
    const rad = 2.6 + 9 * Math.pow(r(), 1.6)
    const c: [number, number, number] = [(r() * 2 - 1) * 56, (r() * 2 - 1) * 40, (r() * 2 - 1) * 56]
    let ok = true
    for (const b of out) if (Math.hypot(c[0] - b.c[0], c[1] - b.c[1], c[2] - b.c[2]) < (rad + b.r) * 0.96) { ok = false; break }
    if (ok) out.push({ c, r: rad, col: PAL[Math.floor(r() * PAL.length)], birth: 0 })
  }
  const dmax = Math.max(...out.map((b) => Math.hypot(b.c[0] - OURS.c[0], b.c[1] - OURS.c[1], b.c[2] - OURS.c[2])))
  for (const b of out) if (b.birth !== -1) b.birth = 0.22 + 0.48 * Math.pow(Math.hypot(b.c[0] - OURS.c[0], b.c[1] - OURS.c[1], b.c[2] - OURS.c[2]) / dmax, 0.8) + (r() - 0.5) * 0.04
  return out
}
export const LABELLED = [
  'Other bubble · other constants?',
  'Stronger or weaker forces? No atoms?',
  'More dark energy: no galaxies?',
]

export function MultiverseLayer() {
  const { camera, size } = useThree()
  const ov = useRef<Overlay | null>(null)
  const res = useMemo(() => {
    const bubbles = makeBubbles()
    const g = new THREE.InstancedBufferGeometry()
    g.copy(new THREE.SphereGeometry(1, 56, 36) as unknown as THREE.InstancedBufferGeometry)
    const n = bubbles.length
    const aC = new Float32Array(n * 4), aT = new Float32Array(n * 4)
    bubbles.forEach((b, i) => { aC.set([b.c[0], b.c[1], b.c[2], b.r], i * 4); aT.set([b.col[0], b.col[1], b.col[2], b.birth], i * 4) })
    g.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 4))
    g.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 4))
    g.instanceCount = n
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e30)
    const m = new THREE.ShaderMaterial({ vertexShader: bubVert, fragmentShader: bubFrag, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: { uProg: { value: 0 }, uOpacity: { value: 0 } } })
    // the faint glow of space that is still inflating: points around and between the bubbles
    const tier = st().settings.tier
    const N = tier === 'low' ? 9000 : 24000
    const r = rngSeed(77)
    const sg = spriteGeometry(N)
    for (let i = 0; i < N; i++) putSprite(sg.a, i, [(r() * 2 - 1) * 80, (r() * 2 - 1) * 56, (r() * 2 - 1) * 80], r() < 0.5 ? [0.55, 0.5, 1] : [0.8, 0.6, 1], 1.1, 0, 0.1 + 0.14 * r())
    // pick three outer bubbles to label (the largest ones that are not ours)
    const lab = bubbles.map((b, i) => ({ b, i })).filter((x) => x.i > 0).sort((a, b) => b.b.r - a.b.r).slice(0, 3)
    return { bubbles, g, m, sg: sg.g, pm: spriteMaterial(spriteVert, spriteFrag, { min: 1.0, max: 3 }), lab }
  }, [])
  useEffect(() => {
    const items = [
      { id: 'mv-us', text: 'Our observable universe', color: '#ffe3a8', button: false },
    ]
    const o = new Overlay(items, 'multiverse-overlay'); ov.current = o
    return () => { o.dispose(); ov.current = null }
  }, [res])
  const P = useMemo(() => ({ x: 0, y: 0 }), [])
  const hidden = useRef(false)
  useFrame(() => {
    const grp = groups.get('mv-field')
    const o = ov.current
    const ids = ['mv-us', 'mv-ours', 'mv-b0', 'mv-b1', 'mv-b2']
    if (!grp || !grp.visible) {
      if (o && !hidden.current) { for (const id of ids) o.place(id, 0, 0, 0, 0, 0, 0, false); hidden.current = true }
      return
    }
    hidden.current = false
    const prog = Math.min(1, Math.max(0, zoneLocal('multiverse', timeline.t)))
    uni.mvProg = prog
    res.m.uniforms.uProg.value = prog
    res.m.uniforms.uOpacity.value = smooth(0.02, 0.16, prog)
    syncSprite(res.pm, smooth(0.2, 0.5, prog) * 0.9, 1)
    if (!o) return
    camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert()
    const proj = makeProject(camera, size)
    const at = (v: [number, number, number]): [number, number, number] => [SUN_G[0] + v[0] * R_U, SUN_G[1] + v[1] * R_U, SUN_G[2] + v[2] * R_U]
    const put = (id: string, p: [number, number, number], a: number, dx = 12, dy = -8) => { const on = proj(p[0], p[1], p[2], P); o.place(id, P.x, P.y, on ? a : 0, 0, dx, dy, false) }
    put('mv-us', at([0, 0, 0]), smooth(0.04, 0.12, prog) * (1 - smooth(0.34, 0.5, prog)), 10, -6)
    put('mv-ours', at([OURS.c[0], OURS.c[1] + OURS.r, OURS.c[2]]), smooth(0.22, 0.34, prog) * (1 - smooth(0.82, 0.95, prog)), -150, -14)
    res.lab.forEach((x, i) => put('mv-b' + i, at([x.b.c[0], x.b.c[1] + x.b.r, x.b.c[2]]), smooth(x.b.birth + 0.1, x.b.birth + 0.2, prog) * smooth(0.6, 0.72, prog) * (1 - smooth(0.94, 1.0, prog)), -110, -12))
  })
  return (
    <>
      <mesh geometry={res.g} material={res.m} frustumCulled={false} renderOrder={5} />
      <points geometry={res.sg} material={res.pm} frustumCulled={false} renderOrder={4} />
    </>
  )
}
