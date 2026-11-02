import { D2R, norm360, type Site, type Vec3 } from '@/lib/astro'

/**
 * The view of the Observatory: a stereographic (conformal) projection of the horizontal sky. Wide views stay
 * undistorted near the centre and the horizon curves gently, which is what a very wide lens does.
 *
 * The shader (`SkyScene`) and this file implement the same maths twice; keep them in step.
 */
export interface Basis {
  fwd: Vec3
  right: Vec3
  up: Vec3
}

/** Camera basis in the (East, North, Up) frame for a view centred on (az, alt) degrees. */
export function basisFor(azDeg: number, altDeg: number): Basis {
  const az = azDeg * D2R
  const alt = altDeg * D2R
  const fwd: Vec3 = [Math.cos(alt) * Math.sin(az), Math.cos(alt) * Math.cos(az), Math.sin(alt)]
  const right: Vec3 = [Math.cos(az), -Math.sin(az), 0]
  // up = right × fwd
  const up: Vec3 = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ]
  return { fwd, right, up }
}

/** tan(fov / 4) for a vertical field of view in degrees: the one number the projection needs. */
export const tanQuarter = (fovDeg: number) => Math.tan((fovDeg * D2R) / 4)

export interface Screen {
  x: number
  y: number
  /** Angle from the view centre, radians. */
  theta: number
}

export function project(d: Vec3, b: Basis, tanQ: number, w: number, h: number): Screen {
  const cf = Math.max(-1, Math.min(1, d[0] * b.fwd[0] + d[1] * b.fwd[1] + d[2] * b.fwd[2]))
  const theta = Math.acos(cf)
  const px = d[0] - b.fwd[0] * cf
  const py = d[1] - b.fwd[1] * cf
  const pz = d[2] - b.fwd[2] * cf
  const pl = Math.hypot(px, py, pz)
  let dx = 0
  let dy = 0
  if (pl > 1e-6) {
    dx = (px * b.right[0] + py * b.right[1] + pz * b.right[2]) / pl
    dy = (px * b.up[0] + py * b.up[1] + pz * b.up[2]) / pl
  }
  const rho = Math.tan(Math.min(theta, 3) * 0.5) / tanQ
  return { x: w / 2 + ((dx * rho) / (w / h)) * (w / 2), y: h / 2 - dy * rho * (h / 2), theta }
}

/** Pixels per degree at the centre of the view (for sizing the Moon's disc to its true angular size). */
export const pxPerDegree = (h: number, fovDeg: number) => ((h / 2) / (2 * tanQuarter(fovDeg))) * D2R

// ---------------------------------------------------------------------------------------------------------------------
// Horizon. Two ridge lines (near, far) as altitude in radians vs azimuth in radians. Mirrored in GLSL below.
// ---------------------------------------------------------------------------------------------------------------------
export const ridgeNear = (az: number) =>
  0.016 + 0.006 * Math.sin(az * 2 + 0.7) + 0.005 * Math.sin(az * 5 + 2.1) + 0.003 * Math.sin(az * 11 + 0.3)
export const ridgeFar = (az: number) =>
  ridgeNear(az) + 0.01 + 0.01 * (0.5 + 0.5 * Math.sin(az * 1.7 + 1)) + 0.0012 * Math.sin(az * 23 + 4)

export const RIDGE_GLSL = /* glsl */ `
float ridgeNear(float az){ return 0.016 + 0.006*sin(az*2.0+0.7) + 0.005*sin(az*5.0+2.1) + 0.003*sin(az*11.0+0.3); }
float ridgeFar(float az){ return ridgeNear(az) + 0.01 + 0.01*(0.5+0.5*sin(az*1.7+1.0)) + 0.0012*sin(az*23.0+4.0); }
`

/** Eight-point compass name for an azimuth in degrees. */
export function compass(azDeg: number): string {
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(norm360(azDeg) / 45) % 8]
}

// ---------------------------------------------------------------------------------------------------------------------
// Shared, mutable control object. React writes to it from UI events, the scene reads it every frame. No React renders
// per frame.
// ---------------------------------------------------------------------------------------------------------------------
export interface SkyControl {
  /** Where the user is looking, degrees (targets; the scene damps towards them). */
  az: number
  alt: number
  fov: number
  /** Drag inertia, degrees per second. */
  vAz: number
  vAlt: number
  /** True once the user has moved the view: stops the opening's automatic framing. */
  touched: boolean
  /** Displayed instant, ms since epoch, and the allowed range (tonight). */
  t: number
  tMin: number
  tMax: number
  play: boolean
  lines: boolean
  names: boolean
  site: Site
  selected: string | null
  /** Set by the scene. */
  pickAt: ((x: number, y: number) => string | null) | null
  focusOn: ((id: string) => void) | null
  /** Called by the scene when time-lapse reaches the end of the night. */
  onPlayEnd: (() => void) | null
  /** Ask for a frame (reduced-motion / idle canvases render on demand). */
  poke: (() => void) | null
}

export function makeControl(site: Site, t: number, tMin: number, tMax: number): SkyControl {
  return {
    az: site.lat >= 0 ? 180 : 0,
    alt: 30,
    fov: 92,
    vAz: 0,
    vAlt: 0,
    touched: false,
    t,
    tMin,
    tMax,
    play: false,
    lines: true,
    names: true,
    site,
    selected: null,
    pickAt: null,
    focusOn: null,
    onPlayEnd: null,
    poke: null,
  }
}
