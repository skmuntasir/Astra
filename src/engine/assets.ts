import * as THREE from 'three'
import type { Tier } from './quality'

/**
 * The asset MANIFEST. Everything the journey will ever draw is listed here and loaded before the journey starts.
 * `tex` urls: `hi` is used on the desktop tier (<= 4k), `lo` on the mobile tier (2k max). If `lo` is omitted the same
 * file is used for both (it is already <= 2k). Keep in step with public/textures/manifest.json (npm run check:budget).
 */
export type AssetKind = 'texture' | 'model' | 'data'
export interface AssetEntry {
  id: string
  kind: AssetKind
  hi: string
  lo?: string
  colorSpace: 'srgb' | 'linear'
  zone: string
  /** 'core' = the same file on every tier; 'hi' = desktop-only file, `lo` (<= 2k) is loaded on the mobile / low tier. npm run check:budget verifies this against manifest.json. */
  tier: 'core' | 'hi' | 'mid'
  /** false = reference only (credits page): listed, never loaded at startup. */
  preload?: boolean
  noMip?: boolean
}
const T = '/textures/'
export const ASSETS: AssetEntry[] = [
  { id: 'earth-day', kind: 'texture', hi: T + 'real/earth-day.jpg', lo: T + 'real/earth-day_m.jpg', colorSpace: 'srgb', zone: 'earth', tier: 'hi' },
  { id: 'earth-night', kind: 'texture', hi: T + 'real/earth-night.jpg', lo: T + 'real/earth-night_m.jpg', colorSpace: 'srgb', zone: 'earth', tier: 'hi' },
  { id: 'earth-clouds', kind: 'texture', hi: T + 'real/earth-clouds.jpg', lo: T + 'real/earth-clouds_m.jpg', colorSpace: 'linear', zone: 'earth', tier: 'hi' },
  { id: 'earth-ocean', kind: 'texture', hi: T + 'real/earth-ocean.png', colorSpace: 'linear', zone: 'earth', tier: 'core' },
  { id: 'earth-normal', kind: 'texture', hi: T + 'earth_normal_2k.jpg', lo: T + 'earth_normal_m.jpg', colorSpace: 'linear', zone: 'earth', tier: 'hi' },
  { id: 'moon-albedo', kind: 'texture', hi: T + 'real/moon-albedo.jpg', colorSpace: 'srgb', zone: 'moon', tier: 'core' },
  { id: 'sun', kind: 'texture', hi: T + 'sun_4k.jpg', lo: T + 'sun_m.jpg', colorSpace: 'srgb', zone: 'sun', tier: 'hi' },
  { id: 'mercury-albedo', kind: 'texture', hi: T + 'mercury_albedo_2k.jpg', lo: T + 'mercury_albedo_m.jpg', colorSpace: 'srgb', zone: 'solar-system', tier: 'hi' },
  { id: 'mercury-normal', kind: 'texture', hi: T + 'mercury_normal_2k.jpg', lo: T + 'mercury_normal_m.jpg', colorSpace: 'linear', zone: 'solar-system', tier: 'hi' },
  { id: 'venus-clouds', kind: 'texture', hi: T + 'venus_clouds_2k.jpg', lo: T + 'venus_clouds_m.jpg', colorSpace: 'srgb', zone: 'solar-system', tier: 'hi' },
  { id: 'venus-radar', kind: 'texture', hi: T + 'venus_radar_2k.jpg', colorSpace: 'srgb', zone: 'credits', preload: false, tier: 'core' },
  { id: 'mars-albedo', kind: 'texture', hi: T + 'mars_albedo_2k.jpg', lo: T + 'mars_albedo_m.jpg', colorSpace: 'srgb', zone: 'solar-system', tier: 'hi' },
  { id: 'mars-normal', kind: 'texture', hi: T + 'mars_normal_2k.jpg', lo: T + 'mars_normal_m.jpg', colorSpace: 'linear', zone: 'solar-system', tier: 'hi' },
  { id: 'saturn-rings', kind: 'texture', hi: T + 'saturn_rings_4k.png', colorSpace: 'srgb', zone: 'solar-system', noMip: true, tier: 'core' },
  // ---- Prompt 2 image set (all procedural, tools/texgen). Planets / moons: 2k max on mobile.
  { id: 'jupiter', kind: 'texture', hi: T + 'jupiter_4k.jpg', lo: T + 'jupiter_m.jpg', colorSpace: 'srgb', zone: 'solar-system', tier: 'hi' },
  { id: 'saturn', kind: 'texture', hi: T + 'saturn_4k.jpg', lo: T + 'saturn_m.jpg', colorSpace: 'srgb', zone: 'solar-system', tier: 'hi' },
  { id: 'uranus', kind: 'texture', hi: T + 'uranus_2k.jpg', lo: T + 'uranus_m.jpg', colorSpace: 'srgb', zone: 'solar-system', tier: 'hi' },
  { id: 'neptune', kind: 'texture', hi: T + 'neptune_2k.jpg', lo: T + 'neptune_m.jpg', colorSpace: 'srgb', zone: 'solar-system', tier: 'hi' },
  { id: 'uranus-rings', kind: 'texture', hi: T + 'uranus_rings_2k.png', colorSpace: 'srgb', zone: 'solar-system', noMip: true, tier: 'core' },
  { id: 'jupiter-ring', kind: 'texture', hi: T + 'jupiter_ring_1k.png', colorSpace: 'srgb', zone: 'solar-system', noMip: true, tier: 'core' },
  { id: 'pluto', kind: 'texture', hi: T + 'pluto_2k.jpg', lo: T + 'pluto_m.jpg', colorSpace: 'srgb', zone: 'solar-system', tier: 'hi' },
  { id: 'charon', kind: 'texture', hi: T + 'charon_1k.jpg', colorSpace: 'srgb', zone: 'solar-system', tier: 'core' },
  { id: 'ceres', kind: 'texture', hi: T + 'ceres_1k.jpg', colorSpace: 'srgb', zone: 'solar-system', tier: 'core' },
  { id: 'io', kind: 'texture', hi: T + 'io_2k.jpg', lo: T + 'io_m.jpg', colorSpace: 'srgb', zone: 'solar-system', tier: 'hi' },
  { id: 'europa', kind: 'texture', hi: T + 'europa_2k.jpg', lo: T + 'europa_m.jpg', colorSpace: 'srgb', zone: 'solar-system', tier: 'hi' },
  { id: 'ganymede', kind: 'texture', hi: T + 'ganymede_2k.jpg', lo: T + 'ganymede_m.jpg', colorSpace: 'srgb', zone: 'solar-system', tier: 'hi' },
  { id: 'callisto', kind: 'texture', hi: T + 'callisto_2k.jpg', lo: T + 'callisto_m.jpg', colorSpace: 'srgb', zone: 'solar-system', tier: 'hi' },
  { id: 'titan', kind: 'texture', hi: T + 'titan_2k.jpg', lo: T + 'titan_m.jpg', colorSpace: 'srgb', zone: 'solar-system', tier: 'hi' },
  { id: 'enceladus', kind: 'texture', hi: T + 'enceladus_1k.jpg', colorSpace: 'srgb', zone: 'solar-system', tier: 'core' },
  { id: 'triton', kind: 'texture', hi: T + 'triton_2k.jpg', lo: T + 'triton_m.jpg', colorSpace: 'srgb', zone: 'solar-system', tier: 'hi' },
  // ---- sky (galactic coordinates: u = (180 - l) / 360, v = (90 - b) / 180)
  { id: 'milkyway', kind: 'texture', hi: T + 'milkyway_8k.jpg', lo: T + 'milkyway_2k.jpg', colorSpace: 'srgb', zone: 'sky', tier: 'hi' },
  // star TEXTURES are no longer preloaded: the star layer is point sprites (stars-bright / stars-field / stars-faint), sharp at any resolution
  { id: 'stars', kind: 'texture', hi: T + 'stars_8k.jpg', lo: T + 'stars_2k.jpg', colorSpace: 'srgb', zone: 'sky', preload: false, tier: 'hi' },
  { id: 'sky-fallback', kind: 'texture', hi: T + 'sky_fallback_256.jpg', colorSpace: 'srgb', zone: 'sky', tier: 'core' },
  { id: 'milkyway-4k', kind: 'texture', hi: T + 'milkyway_4k.jpg', colorSpace: 'srgb', zone: 'sky', preload: false, tier: 'mid' },
  { id: 'stars-4k', kind: 'texture', hi: T + 'stars_4k.jpg', colorSpace: 'srgb', zone: 'sky', preload: false, tier: 'mid' },
  { id: 'stars-field', kind: 'data', hi: T + 'stars_field.bin', colorSpace: 'linear', zone: 'sky', tier: 'core' },
  { id: 'cosmicweb3d', kind: 'data', hi: T + 'cosmicweb3d.bin', lo: T + 'cosmicweb3d_lo.bin', colorSpace: 'linear', zone: 'universe', tier: 'hi' },
  { id: 'stars-faint', kind: 'data', hi: T + 'stars_faint.bin', colorSpace: 'linear', zone: 'sky', tier: 'core' },
  { id: 'stars-bright', kind: 'data', hi: T + 'stars_bright.json', colorSpace: 'linear', zone: 'sky', tier: 'core' },
  // ---- galaxies (RGBA webp, straight alpha)
  { id: 'galaxy-spiral-face', kind: 'texture', hi: T + 'galaxy_spiral_face_2k.webp', lo: T + 'galaxy_spiral_face_1k.webp', colorSpace: 'srgb', zone: 'galaxies', tier: 'hi' },
  { id: 'galaxy-spiral-edge', kind: 'texture', hi: T + 'galaxy_spiral_edge_2k.webp', lo: T + 'galaxy_spiral_edge_1k.webp', colorSpace: 'srgb', zone: 'galaxies', tier: 'hi' },
  { id: 'galaxy-spiral-barred', kind: 'texture', hi: T + 'galaxy_spiral_barred_2k.webp', lo: T + 'galaxy_spiral_barred_1k.webp', colorSpace: 'srgb', zone: 'galaxies', tier: 'hi' },
  { id: 'galaxy-elliptical', kind: 'texture', hi: T + 'galaxy_elliptical_2k.webp', lo: T + 'galaxy_elliptical_1k.webp', colorSpace: 'srgb', zone: 'galaxies', tier: 'hi' },
  { id: 'galaxy-irregular', kind: 'texture', hi: T + 'galaxy_irregular_2k.webp', lo: T + 'galaxy_irregular_1k.webp', colorSpace: 'srgb', zone: 'galaxies', tier: 'hi' },
  { id: 'galaxy-m31', kind: 'texture', hi: T + 'galaxy_m31_2k.webp', lo: T + 'galaxy_m31_1k.webp', colorSpace: 'srgb', zone: 'galaxies', tier: 'hi' },
  { id: 'galaxy-m33', kind: 'texture', hi: T + 'galaxy_m33_2k.webp', lo: T + 'galaxy_m33_1k.webp', colorSpace: 'srgb', zone: 'galaxies', tier: 'hi' },
  { id: 'galaxy-milkyway-topdown', kind: 'texture', hi: T + 'galaxy_milkyway_topdown_2k.webp', lo: T + 'galaxy_milkyway_topdown_1k.webp', colorSpace: 'srgb', zone: 'galaxies', tier: 'hi' },
  // ---- cosmos / black hole
  { id: 'cmb-color', kind: 'texture', hi: T + 'cmb_color_2k.jpg', lo: T + 'cmb_color_m.jpg', colorSpace: 'srgb', zone: 'universe', tier: 'hi' },
  { id: 'cmb-temp', kind: 'texture', hi: T + 'cmb_temp_2k.png', lo: T + 'cmb_temp_m.png', colorSpace: 'linear', zone: 'universe', tier: 'hi' },
  { id: 'cosmic-web', kind: 'texture', hi: T + 'cosmicweb_2k.jpg', lo: T + 'cosmicweb_1k.jpg', colorSpace: 'srgb', zone: 'universe', tier: 'hi' },
  { id: 'dust-noise', kind: 'texture', hi: T + 'dust_noise_1k.png', colorSpace: 'linear', zone: 'universe', tier: 'core' },
  { id: 'bh-disc-noise', kind: 'texture', hi: T + 'bh_disc_noise_2k.png', colorSpace: 'linear', zone: 'black-hole', tier: 'core' },
]

const textures = new Map<string, THREE.Texture>()
const dataStore = new Map<string, ArrayBuffer>()
const extra = new Map<string, THREE.Texture>()
export const urlFor = (a: AssetEntry, tex: 'hi' | 'lo') => (tex === 'lo' && a.lo ? a.lo : a.hi)

export function getTexture(id: string): THREE.Texture {
  const t = textures.get(id) ?? extra.get(id)
  if (!t) throw new Error(`texture "${id}" was not preloaded`)
  return t
}
/** Non-image assets (kind 'data': faint-star buffer, bright-star JSON), fetched by the preloader. */
export const putData = (id: string, b: ArrayBuffer) => dataStore.set(id, b)
export function getData(id: string): ArrayBuffer {
  const b = dataStore.get(id)
  if (!b) throw new Error(`data "${id}" was not preloaded`)
  return b
}
export const hasTexture = (id: string) => textures.has(id) || extra.has(id)
export const putTexture = (id: string, t: THREE.Texture) => textures.set(id, t)
export const putExtra = (id: string, t: THREE.Texture) => extra.set(id, t)
export const allTextures = () => [...textures.values(), ...extra.values()]

export function makeTexture(bmp: ImageBitmap | HTMLCanvasElement, a: AssetEntry, anisotropy: number): THREE.Texture {
  const t = new THREE.Texture(bmp as unknown as HTMLImageElement)
  t.flipY = false // the bitmap was decoded already flipped
  t.colorSpace = a.colorSpace === 'srgb' ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.ClampToEdgeWrapping
  t.anisotropy = anisotropy
  t.generateMipmaps = !a.noMip
  t.minFilter = a.noMip ? THREE.LinearFilter : THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.needsUpdate = true
  return t
}
export type { Tier }
