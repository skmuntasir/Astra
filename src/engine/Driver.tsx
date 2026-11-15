import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useEffect } from 'react'
import { activeZones, getObject, allObjects, type V3 } from './journey'
import { evalPose, poseCameraPos, type Pose } from './path'
import { cam, groups, alphas, RENDER_DIST } from './world'
import { timeline, publishZone } from './timeline'
import { raf } from './scroll'
import { stepFocus, focusState, focusBase, updateFocusTarget, exitBranch } from './api'
import { zoneAt } from './journey'
import { st } from './store'
import { introCamK } from './intro'

const poseA: Pose = { target: [0, 0, 0], dist: 1, azim: 0, elev: 0, fov: 35, roll: 0 }
const out: Pose = { target: [0, 0, 0], dist: 1, azim: 0, elev: 0, fov: 35, roll: 0 }
const camPos: V3 = [0, 0, 0]
const dirV = new THREE.Vector3()
const upV = new THREE.Vector3()
const m4 = new THREE.Matrix4()
const zero = new THREE.Vector3(0, 0, 0)
const axisV = new THREE.Vector3()
const liveSet = new Set<string>() // reused every frame (a new Set per frame = garbage = a stutter every few seconds)
const sm = (x: number) => x * x * x * (x * (x * 6 - 15) + 10)

/**
 * Blend two poses. `zoomPan` (used by focus flights) couples the pan to the zoom: the look-at point moves in proportion to how far the DISTANCE
 * has travelled, not to the eased time f. Without it a big zoom (distance changes 100x, interpolated in log space) with a linearly-moving target
 * leaves the object far off screen halfway and it swings in at the end; with it the object's angular offset never grows beyond its start, so it
 * stays in frame for the whole flight, in both directions (fly in and fly out are exact mirrors).
 */
function blend(a: Pose, b: Pose, f: number, o: Pose, zoomPan = false) {
  const d0 = a.dist, d1 = b.dist
  const dist = Math.exp(Math.log(d0) + (Math.log(d1) - Math.log(d0)) * f)
  let ft = f
  if (zoomPan && f > 0 && f < 1 && Math.abs(d0 - d1) > 1e-3 * Math.max(d0, d1)) ft = Math.min(1, Math.max(0, (d0 - dist) / (d0 - d1)))
  for (let i = 0; i < 3; i++) o.target[i] = a.target[i] + (b.target[i] - a.target[i]) * ft
  o.dist = dist
  let da = b.azim - a.azim
  while (da > 180) da -= 360
  while (da < -180) da += 360
  o.azim = a.azim + da * f
  o.elev = a.elev + (b.elev - a.elev) * f
  o.fov = a.fov + (b.fov - a.fov) * f
  o.roll = a.roll + (b.roll - a.roll) * f
  return o
}
const copy = (s: Pose, d: Pose) => { d.target[0] = s.target[0]; d.target[1] = s.target[1]; d.target[2] = s.target[2]; d.dist = s.dist; d.azim = s.azim; d.elev = s.elev; d.fov = s.fov; d.roll = s.roll }

let endHold = 0

/**
 * The single per-frame driver (one useFrame, fixed order): scroll -> smoother -> path pose -> join/focus blend ->
 * floating-origin camera -> world objects. The THREE camera never leaves the render origin; every object is placed at
 * (position - cameraPosition) * k in double precision, then handed to float32.
 */
export function Driver() {
  const { camera, size } = useThree()
  useEffect(() => { cam.aspect = size.width / size.height }, [size])

  useFrame((_, dt) => {
    raf(performance.now())
    const s = st()
    timeline.update(dt)
    publishZone()
    const T = timeline.t

    // 1. pose from the path (or a test override)
    if (cam.override) copy(cam.override, poseA)
    else evalPose(T, s.timelineId, poseA)

    // 2. join blend (branch enter/exit): from the last applied pose to the new path, eased
    let p = poseA
    if (cam.join && !cam.override) {
      cam.join.f = Math.min(1, cam.join.f + Math.min(dt, 0.1) / 1.6)
      p = blend(cam.join.from, poseA, sm(cam.join.f), out)
      if (cam.join.f >= 1) cam.join = null
    }
    // 2b. zone framing (e.g. portrait phones need a wider view of the Solar System): a distance multiplier that is 1 at every zone seam
    if (!cam.override && cam.aspect < 1.6) {
      const za = zoneAt(T, s.timelineId)
      const fr = za?.zone.framing
      if (fr) {
        const m = fr(za.local, cam.aspect)
        if (m !== 1) { if (p === poseA) { copy(poseA, out); p = out } p.dist *= m }
      }
    }
    // 2c. the opening: the camera starts a little further out and to one side, and glides in to the authored view (0 once it has settled)
    if (!cam.override) {
      const ik = introCamK()
      if (ik > 0) { if (p === poseA) { copy(poseA, out); p = out } p.dist *= 1 + 0.6 * ik; p.azim -= 14 * ik }
    }
    // 3. focus blend (the focus transition always blends from the frozen scroll pose; hops blend from the pose we left)
    const ff = cam.override ? 0 : stepFocus(dt)
    if (ff > 0 && focusState.to) {
      updateFocusTarget(dt)
      const base = focusBase((a, b, f, o) => blend(a, b, f, o, true), sm)
      if (base) p = blend(p, base, ff, out, true)
    }
    copy(p, cam.pose)

    // branch auto-return at the end of a sub-timeline
    if (s.timelineId !== 'main' && T > 0.9995) { endHold += dt; if (endHold > 0.8) { endHold = 0; exitBranch() } } else endHold = 0

    // 4. floating-origin camera
    poseCameraPos(cam.pose, camPos)
    cam.pos[0] = camPos[0]; cam.pos[1] = camPos[1]; cam.pos[2] = camPos[2]
    const k = RENDER_DIST / cam.pose.dist
    cam.k = k
    const pc = camera as THREE.PerspectiveCamera
    pc.position.set(0, 0, 0)
    dirV.set((cam.pose.target[0] - camPos[0]) * k, (cam.pose.target[1] - camPos[1]) * k, (cam.pose.target[2] - camPos[2]) * k)
    upV.set(0, 1, 0)
    if (cam.pose.roll) upV.applyAxisAngle(axisV.copy(dirV).normalize(), (cam.pose.roll * Math.PI) / 180)
    m4.lookAt(zero, dirV, upV)
    pc.quaternion.setFromRotationMatrix(m4)
    if (pc.fov !== cam.pose.fov || pc.aspect !== size.width / size.height) {
      pc.fov = cam.pose.fov
      pc.aspect = size.width / size.height
      pc.near = 0.01
      pc.far = 1e11
      pc.updateProjectionMatrix()
    }

    // 5. world objects
    const live = liveSet
    live.clear()
    if (cam.solo) cam.solo.forEach((id) => live.add(id))
    else {
      for (const z of activeZones(T, s.timelineId)) for (const id of z.objects) live.add(id)
      if (s.focusId) live.add(s.focusId)
    }
    for (const o of allObjects()) {
      const g = groups.get(o.id)
      if (!g) continue
      const vis = live.has(o.id)
      g.visible = vis
      alphas.set(o.id, vis ? 1 : 0)
      if (!vis) continue
      g.position.set((o.position[0] - camPos[0]) * k, (o.position[1] - camPos[1]) * k, (o.position[2] - camPos[2]) * k)
      g.scale.setScalar(o.radius * k)
    }
    void getObject
  })
  return null
}
