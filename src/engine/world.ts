import type * as THREE from 'three'
import type { Pose } from './path'
import type { V3 } from './journey'

/** Shared per-frame camera + world state (plain object: read it in useFrame, never in React state). */
export const cam = {
  /** Global metres (double precision). The THREE camera itself always sits at the render origin. */
  pos: [0, 0, 0] as V3,
  pose: { target: [0, 0, 0] as V3, dist: 1, azim: 0, elev: 0, fov: 35, roll: 0 } as Pose,
  /** metres -> render units for this frame: the target is always `RENDER_DIST` units away. */
  k: 1,
  /** Test hook: when set, replaces the scroll/focus pose. */
  override: null as Pose | null,
  /** Test hook: when set, only these object ids are visible. */
  solo: null as Set<string> | null,
  /** Branch / zone join blend. */
  join: null as { from: Pose; f: number } | null,
  aspect: 1,
}
export const RENDER_DIST = 10

/** Scene groups of every registered object, by id (mounted once, never disposed). */
export const groups = new Map<string, THREE.Group>()
/** Mutable per-frame visibility alpha of each object (0..1) for materials that want to cross-fade. */
export const alphas = new Map<string, number>()

/**
 * Backdrop control (Prompt 5). The sky (panorama + stars) is the view from the Sun, so it must fade once the camera is far from the Sun.
 * `alpha` multiplies the panorama and every star; `near` additionally multiplies the few real bright stars that also exist as 3-D
 * sprites in the beyond-the-system zone (so a star is never drawn twice). Written every frame by src/zones/galactic (default = 1, 0).
 */
export const sky = { alpha: 1, near: 1 }
