import * as THREE from 'three'
import { solarTints } from '@/lib/tokens'

/**
 * Layout of the Solar System for Chapter 03.
 *
 * World units are Earth radii, with Earth at the origin, so the scene joins Chapter 02's (Earth, Moon, camera) exactly.
 *
 * What is true and what is not (the page says so):
 *  - Body sizes are true, in Earth radii (the Sun is 109, Jupiter 11.2). Anything that would fall under ~1.5 px is drawn
 *    at that floor so it stays visible; that is the only exaggeration.
 *  - Order is true. Distances are compressed: a planet at `a` AU sits `AU_DISPLAY · √a` Earth radii from the Sun, so
 *    Mercury and Neptune are 9× apart in the picture rather than 78×, and the real order (and a believable look) is kept.
 *    The Earth–Sun distance is 600 Earth radii here; really it is 23,481.
 *  - Heliocentric angles (`theta`) are composed by hand for a readable picture, loosely echoing a real configuration.
 *    They are not today's positions.
 */

/** Earth–Sun distance in Earth radii (really 23,481): the display "AU". */
export const AU_DISPLAY = 600
/** Sun radius in Earth radii (true). */
export const SUN_RADIUS = 109.1

export interface PlanetSpec {
  id: string
  name: string
  /** Semi-major axis, AU (shown as a label). */
  au: number
  auText: string
  /** Radius in Earth radii (true). */
  radius: number
  /** Heliocentric angle in degrees; 0 = the Earth side of the Sun. */
  theta: number
  /** Axial tilt, degrees (used to orient bands and Saturn's ring). */
  tilt: number
  /** Cloud-band strength 0…1. */
  bands: number
  color: string
}

// Sorted by distance from the Sun: the index is also the order orbits and labels are revealed in.
export const PLANETS: PlanetSpec[] = [
  { id: 'mercury', name: 'Mercury', au: 0.387, auText: '0.39 AU', radius: 0.383, theta: -52, tilt: 0.03, bands: 0, color: solarTints.mercury },
  { id: 'venus', name: 'Venus', au: 0.723, auText: '0.72 AU', radius: 0.949, theta: -112, tilt: 177, bands: 0.1, color: solarTints.venus },
  { id: 'earth', name: 'Earth', au: 1.0, auText: '1.00 AU', radius: 1, theta: 0, tilt: 23.4, bands: 0, color: solarTints.earth },
  { id: 'mars', name: 'Mars', au: 1.524, auText: '1.52 AU', radius: 0.532, theta: 118, tilt: 25.2, bands: 0.15, color: solarTints.mars },
  { id: 'jupiter', name: 'Jupiter', au: 5.203, auText: '5.20 AU', radius: 11.21, theta: -62, tilt: 3.1, bands: 1, color: solarTints.jupiter },
  { id: 'saturn', name: 'Saturn', au: 9.537, auText: '9.54 AU', radius: 9.45, theta: 158, tilt: 26.7, bands: 0.7, color: solarTints.saturn },
  { id: 'uranus', name: 'Uranus', au: 19.19, auText: '19.2 AU', radius: 4.01, theta: 52, tilt: 97.8, bands: 0.12, color: solarTints.uranus },
  { id: 'neptune', name: 'Neptune', au: 30.07, auText: '30.1 AU', radius: 3.88, theta: 14, tilt: 28.3, bands: 0.3, color: solarTints.neptune },
]

/** Distance of a planet's orbit from the Sun, in display units (Earth radii). */
export const orbitRadius = (au: number) => AU_DISPLAY * Math.sqrt(au)

export interface EclipticFrame {
  sunPos: THREE.Vector3
  /** Unit vector Sun → Earth (θ = 0). */
  a1: THREE.Vector3
  /** In-plane unit vector at θ = 90°. */
  a2: THREE.Vector3
  /** Ecliptic north. */
  n: THREE.Vector3
}

/**
 * The ecliptic plane through Earth (origin) and the Sun, which sits `AU_DISPLAY` away in the direction `sunDir`
 * (the Moon scene's light direction, so the lighting in Chapter 02 is already correct). Its north is world-up, made
 * perpendicular to the Earth–Sun line.
 */
export function eclipticFrame(sunDir: THREE.Vector3): EclipticFrame {
  const s = sunDir.clone().normalize()
  const sunPos = s.clone().multiplyScalar(AU_DISPLAY)
  const a1 = s.clone().negate()
  const up = new THREE.Vector3(0, 1, 0)
  const n = up.clone().addScaledVector(s, -up.dot(s)).normalize()
  const a2 = new THREE.Vector3().crossVectors(n, a1)
  return { sunPos, a1, a2, n }
}

export function planetPosition(p: PlanetSpec, f: EclipticFrame, out: THREE.Vector3) {
  const r = orbitRadius(p.au)
  const th = THREE.MathUtils.degToRad(p.theta)
  return out.copy(f.sunPos).addScaledVector(f.a1, r * Math.cos(th)).addScaledVector(f.a2, r * Math.sin(th))
}
