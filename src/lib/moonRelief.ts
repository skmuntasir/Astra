import * as THREE from 'three'
import { generateLunarDetail } from '@/lib/lunarDetail'

/**
 * The Moon's generated crater relief, built once per page and shared by every scene that draws the Moon.
 * (Chapters 02 and 03 each own a WebGL canvas; the ~0.5 s CPU generation and the pixel array are not duplicated —
 * only the GPU upload is, because textures cannot be shared between contexts.)
 */

interface Entry {
  data: Uint8Array | null
  waiters: Set<(rgba: Uint8Array) => void>
  cancel: (() => void) | null
}

const entries = new Map<string, Entry>()

/** Relief map width for a tier (height is half). */
export const reliefWidth = (high: boolean) => (high ? 2048 : 1024)

/**
 * Ask for the relief pixels. Calls back (once) with the shared RGBA array, immediately if it already exists.
 * Returns a cancel function; generation stops only if nobody else is waiting for it.
 */
export function requestMoonRelief(moonMap: THREE.Texture, high: boolean, onDone: (rgba: Uint8Array) => void): () => void {
  const key = high ? 'high' : 'low'
  let e = entries.get(key)

  if (!e) {
    const entry: Entry = { data: null, waiters: new Set(), cancel: null }
    entries.set(key, entry)
    e = entry

    // Read the albedo's luminance (a canvas read-back), then build the slope map in time slices.
    const img = moonMap.image as CanvasImageSource & { width: number; height: number }
    const lw = img.width
    const lh = img.height
    const cv = document.createElement('canvas')
    cv.width = lw
    cv.height = lh
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      entries.delete(key)
      return () => {}
    }
    ctx.drawImage(img, 0, 0)
    const px = ctx.getImageData(0, 0, lw, lh).data
    const lum = new Float32Array(lw * lh)
    for (let i = 0; i < lum.length; i++) lum[i] = px[i * 4] / 255

    const W = reliefWidth(high)
    const params = high ? { craters: 9500, rMin: 1.4, rMax: 34 } : { craters: 3000, rMin: 1.2, rMax: 17 }
    entry.cancel = generateLunarDetail({ width: W, height: W / 2, lum, lumW: lw, lumH: lh, seed: 1969, ...params }, (rgba) => {
      entry.data = rgba as Uint8Array
      entry.cancel = null
      entry.waiters.forEach((w) => w(entry.data as Uint8Array))
      entry.waiters.clear()
    })
  }

  if (e.data) {
    onDone(e.data)
    return () => {}
  }
  const entry = e
  entry.waiters.add(onDone)
  return () => {
    entry.waiters.delete(onDone)
    if (!entry.data && entry.waiters.size === 0 && entry.cancel) {
      entry.cancel()
      entries.delete(key)
    }
  }
}

/** A fresh GPU texture over the shared pixels. The caller owns (and disposes) the texture, never the pixels. */
export function makeReliefTexture(rgba: Uint8Array, high: boolean) {
  const W = reliefWidth(high)
  const tex = new THREE.DataTexture(rgba, W, W / 2, THREE.RGBAFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}
