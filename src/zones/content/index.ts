import { registerObject, addZoneObjects, addZoneBeat } from '@/engine/journey'
import { registerFocusGroup } from '@/engine/focusGroups'
import { LY, SUN_G, dirToAE, eqDir, mul3 } from '../galactic/units'
import { GC_G } from '../galactic/MilkyWay'
import { DISH_R_M } from './craft'
import { CRAB, ORION, SGRA, VOYAGERS, nebulaPos, voyagerPos } from './data'
import { makeVoyager, VoyagerFx } from './Voyager'
import { ContentLabels, CrabBody, OrionBody, SgrABody, SGRA_RADIUS_LY } from './Nebulae'
import './info'

/** Final series 5c, parts 1-3: Voyager 1 and 2 (in the Beyond zone), Orion Nebula, Crab Nebula + pulsar and Sagittarius A* (in the Milky Way zone). Call AFTER registerGalactic(). */
export function registerContent() {
  registerObject({ id: 'voy-fx', name: 'Voyager markers and trajectories', position: [...SUN_G], radius: LY, Component: VoyagerFx })
  for (const v of VOYAGERS) {
    registerObject({
      id: v.id, name: v.name, position: voyagerPos(v), radius: DISH_R_M, Component: makeVoyager(v),
      focus: { distRadii: 8, litFrom: [...SUN_G], swing: 28, elev: 16 }, info: { title: v.name, lines: [] },
    })
  }
  registerObject({ id: 'cn-fx', name: 'Nebula labels', position: [...SUN_G], radius: LY, Component: ContentLabels })
  const toSun = (ra: number, dec: number) => { const d = eqDir(ra, dec); return dirToAE(mul3(d, -1)) }
  const a1 = toSun(ORION.raDeg, ORION.decDeg), a2 = toSun(CRAB.raDeg, CRAB.decDeg)
  registerObject({ id: ORION.id, name: ORION.name, position: nebulaPos(ORION), radius: ORION.radiusLy * LY, Component: OrionBody, focus: { distRadii: 3.2, azim: a1.azim, elev: a1.elev }, info: { title: ORION.name, lines: [] } })
  registerObject({ id: CRAB.id, name: 'Crab Nebula', position: nebulaPos(CRAB), radius: CRAB.radiusLy * LY, Component: CrabBody, focus: { distRadii: 3.0, azim: a2.azim, elev: a2.elev }, info: { title: 'Crab Nebula', lines: [] } })
  const gcToSun = dirToAE(eqDir(266.4168, -29.0078).map((x) => -x) as [number, number, number])
  registerObject({ id: SGRA.id, name: SGRA.name, position: [...GC_G], radius: SGRA_RADIUS_LY * LY, Component: SgrABody, focus: { distRadii: 1.6, azim: gcToSun.azim, elev: gcToSun.elev, zoom: { in: 2.2, out: 7.5 } }, info: { title: SGRA.name, lines: [] } })
  registerFocusGroup('voyagers', VOYAGERS.map((v) => v.id))
  registerFocusGroup('deep-objects', [ORION.id, CRAB.id, SGRA.id])

  addZoneObjects('beyond', ['voy-fx', ...VOYAGERS.map((v) => v.id)])
  addZoneObjects('milky-way', ['cn-fx', ORION.id, CRAB.id, SGRA.id])
  addZoneObjects('local-group', ['cn-fx']) // labels fade out by distance; keeps the overlay alive through the exit window
  addZoneBeat('beyond', { id: 'by-voy', kicker: 'Voyager 1 and 2', title: 'The farthest things we have ever made.', body: 'Launched in 1977, both are beyond the heliopause. Voyager 1 is the more distant: click either to see it up close.', w: [0.15, 0.2, 0.3, 0.34], side: 'right' })
}
