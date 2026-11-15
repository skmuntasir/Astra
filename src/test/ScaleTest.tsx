import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { registerObject, getObject } from '@/engine/journey'
import { cam } from '@/engine/world'
import { R_EARTH } from '@/zones/common'

/**
 * SCALE TEST FLIGHT (?test=scale). Proves the engine from 1 Earth radius to 1e10 Earth radii (6.4e16 m).
 * For each decade, camera distance D, the harness (through the REAL engine path: override pose -> Driver -> floating origin
 * -> log depth) renders into a 256x256 target and measures, in pixels:
 *   - JITTER:  a red sphere's centroid vs the exact double-precision projection (error must be < 0.6 px), over sub-pixel steps
 *   - CLIPPING: a far blue sphere 3e6 x D beyond the target still renders at its expected size; the near one is never cut
 *   - Z-FIGHT: two parallel yellow/cyan quads separated by only 2e-5 relative depth; any cyan pixel = z-fighting
 * The camera target sits at ~3000 D from the world origin, so single-precision world coordinates would visibly jitter.
 */
const on = new URLSearchParams(location.search).get('test') === 'scale'

const mkSphere = (color: number) =>
  function Sphere() {
    const g = new THREE.SphereGeometry(1, 64, 32)
    return <mesh geometry={g} material={new THREE.MeshBasicMaterial({ color })} />
  }
const mkPlane = (color: number) =>
  function Plane() {
    return <mesh geometry={new THREE.PlaneGeometry(2, 2)} material={new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })} />
  }
if (on) {
  const base = { name: 'test', position: [0, 0, 0] as [number, number, number], radius: 1 }
  registerObject({ ...base, id: 'T-near', Component: mkSphere(0xff0000) })
  registerObject({ ...base, id: 'T-far', Component: mkSphere(0x0000ff) })
  registerObject({ ...base, id: 'T-za', Component: mkPlane(0xffff00) })
  registerObject({ ...base, id: 'T-zb', Component: mkPlane(0x00ffff) })
}

const frames = (n: number) => new Promise<void>((res) => { const f = (i: number) => (i <= 0 ? res() : requestAnimationFrame(() => f(i - 1))); f(n) })
const SZ = 256
const FOV = 35
const TH = Math.tan((FOV * Math.PI) / 360)
const F = 1 / TH

export interface StepResult { expX?: number; expY?: number; mx?: number; my?: number; s: number; D: number; sub: number; centroidErr: number; areaRatio: number; farAreaRatio: number; yellowRatio: number; cyan: number; nearCenterRed: boolean; pass: boolean }

export function ScaleTestObjects() {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    if (!on) return
    const rt = new THREE.WebGLRenderTarget(SZ, SZ, { depthBuffer: true })
    const buf = new Uint8Array(SZ * SZ * 4)
    const set = (id: string, p: [number, number, number], r: number) => { const o = getObject(id)!; o.position = p; o.radius = r }

    async function runStep(s: number, mult: number, sub: number): Promise<StepResult> {
      const D = Math.pow(10, s) * R_EARTH * mult
      const P: [number, number, number] = [D * 3000 + 0.123 * D, -D * 1700, D * 900]
      // the sub-step shifts the camera target by sub * 0.37 px (in NDC: 0.37 / 128)
      const shift = (sub * 0.37) / (SZ / 2)
      const H = D * TH
      const target: [number, number, number] = [P[0] + shift * H, P[1], P[2]]
      cam.override = { target, dist: D, azim: 0, elev: 0, fov: FOV, roll: 0 }
      cam.solo = new Set(['T-near', 'T-far', 'T-za', 'T-zb'])
      // near sphere: offset (0.2H, -0.1H) from P (so from target: 0.2H - shift*H in x)
      const rN = 0.12 * D
      const nearC: [number, number, number] = [P[0] + 0.2 * H, P[1] - 0.1 * H, P[2]]
      set('T-near', nearC, rN)
      // far sphere: 3e6 D beyond the target
      const dF = 3e6 * D
      const czF = D + dF
      const rF = 0.05 * czF
      set('T-far', [P[0] - 0.4 * czF * TH, P[1] + 0.3 * czF * TH, P[2] - dF], rF)
      // z-fight pair
      const za = 0.7 * D, e = 2e-5, zb = za * (1 + e)
      set('T-za', [P[0] - 0.5 * za * TH, P[1] - 0.5 * za * TH, P[2] + D - za], 0.25 * za * TH)
      set('T-zb', [P[0] - 0.5 * zb * TH, P[1] - 0.5 * zb * TH, P[2] + D - zb], 0.25 * zb * TH)
      await frames(3)

      const pc = camera as THREE.PerspectiveCamera
      const aspect = pc.aspect
      pc.aspect = 1
      pc.updateProjectionMatrix()
      const prevClear = new THREE.Color()
      gl.getClearColor(prevClear)
      gl.setRenderTarget(rt)
      gl.setClearColor(0x000000, 1)
      gl.clear()
      gl.render(scene, camera)
      gl.readRenderTargetPixels(rt, 0, 0, SZ, SZ, buf)
      gl.setRenderTarget(null)
      gl.setClearColor(prevClear, 1)
      pc.aspect = aspect
      pc.updateProjectionMatrix()

      let rn = 0, rx = 0, ry = 0, bn = 0, yn = 0, cn = 0
      for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) {
        const i = (y * SZ + x) * 4
        const r = buf[i], g = buf[i + 1], b = buf[i + 2]
        const yy = y // readRenderTargetPixels rows are already bottom-up (y up)
        if (r > 200 && g < 60 && b < 60) { rn++; rx += x + 0.5; ry += yy + 0.5 }
        else if (b > 200 && r < 60 && g < 60) bn++
        else if (r > 200 && g > 200 && b < 60) yn++
        else if (g > 200 && b > 200 && r < 60) cn++
      }
      // exact expectations in doubles
      const cx = 0.2 * H - shift * H, cy = -0.1 * H, cz = D
      const ndcx = (F * cx * cz) / (cz * cz - rN * rN), ndcy = (F * cy * cz) / (cz * cz - rN * rN)
      const expX = (0.5 + 0.5 * ndcx) * SZ, expY = (0.5 + 0.5 * ndcy) * SZ
      const dc = Math.hypot(cx, cy, cz)
      const rpx = (SZ / 2) * F * (rN / Math.sqrt(dc * dc - rN * rN))
      const err = rn ? Math.hypot(rx / rn - expX, ry / rn - expY) : 99
      const areaRatio = rn / (Math.PI * rpx * rpx)
      const rFpx = (SZ / 2) * F * (rF / Math.sqrt(czF * czF * (1 + 0.5 * TH * TH) - rF * rF))
      const farAreaRatio = bn / (Math.PI * rFpx * rFpx)
      const yellowRatio = yn / (4 * (0.25 * 128) ** 2)
      const nearCenterRed = rn > 0
      const pass = err < 0.6 && Math.abs(areaRatio - 1) < 0.08 && Math.abs(farAreaRatio - 1) < 0.15 && cn === 0 && Math.abs(yellowRatio - 1) < 0.05 && nearCenterRed
      return { expX, expY, mx: rn ? rx / rn : -1, my: rn ? ry / rn : -1, s, D, sub, centroidErr: err, areaRatio, farAreaRatio, yellowRatio, cyan: cn, nearCenterRed, pass }
    }

    ;(window as unknown as { __scaleTest: () => Promise<unknown> }).__scaleTest = async () => {
      const steps: StepResult[] = []
      for (let s = 0; s <= 10; s++) for (const [mult, sub] of [[1, 0], [2.5, 1], [6, 2]] as const) steps.push(await runStep(s, mult, sub))
      cam.override = null
      cam.solo = null
      return {
        pass: steps.every((x) => x.pass),
        maxCentroidErrPx: Math.max(...steps.map((x) => x.centroidErr)),
        minArea: Math.min(...steps.map((x) => x.areaRatio)),
        maxArea: Math.max(...steps.map((x) => x.areaRatio)),
        minFar: Math.min(...steps.map((x) => x.farAreaRatio)),
        maxFar: Math.max(...steps.map((x) => x.farAreaRatio)),
        totalCyanPixels: steps.reduce((a, x) => a + x.cyan, 0),
        failures: steps.filter((x) => !x.pass),
        steps,
      }
    }
    return () => rt.dispose()
  }, [gl, scene, camera])
  return null
}
