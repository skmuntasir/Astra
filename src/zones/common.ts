import * as THREE from 'three'
/**
 * THE Sun direction: ONE world-space unit vector (from Earth toward the Sun), used by the Earth, Moon and Sun shaders, the scene
 * light and the Sun's placement, for the whole journey. It lies in the ecliptic plane (world XZ): the Sun is always on the ecliptic.
 * With the Earth's 23.4 deg axial tilt (tilted toward -X in this scene) the Sun's declination is about +16 deg, i.e. early May
 * or early August (northern spring/summer: the north pole is lit). // VERIFY the date only if a date is ever shown.
 */
export const SUN_DIR = new THREE.Vector3(-0.7, 0, 0.714).normalize()
export const R_EARTH = 6.371e6
export const MOON_DIST = 3.844e8
export const R_MOON_M = 1.7374e6
export const R_SUN = 6.957e8
/** True mean Earth-Sun distance (1 AU), metres. */
export const AU = 1.495978707e11
/** The Sun is PLACED at a compressed distance so the whole Earth -> Moon -> Sun flight fits one continuous scroll (sizes are true). */
export const SUN_COMPRESSION = 8
export const SUN_DIST = AU / SUN_COMPRESSION
