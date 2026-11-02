import * as THREE from 'three'

/**
 * Where the foreground camera is looking, for the global StarField behind it.
 *
 * A scene whose camera turns (Chapter 03) writes the INVERSE of its camera rotation here; StarField applies it to the
 * whole sky every frame, so the stars swing the way a real backdrop would when the camera yaws. Identity (the default)
 * is the page's normal view, so every other chapter is unaffected.
 */
export const sky = { q: new THREE.Quaternion() }
