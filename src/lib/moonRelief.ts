import * as THREE from 'three'
import { generateLunarDetail } from '@/lib/lunarDetail'

/**
 * The Moon's generated crater relief (ported from the old project). v2 runs it ONCE, inside the preloader, with progress.
 * The result is a tangent-space slope map (RG, row 0 = south) used as a normal map.
 */
export const reliefWidth = (high: boolean) => (high ? 2048 : 1024)

export function buildMoonRelief(albedo: ImageBitmap | HTMLCanvasElement, high: boolean, onProgress: (f: number) => void): Promise<THREE.DataTexture> {
  return new Promise((resolve, reject) => {
    const lw = albedo.width
    const lh = albedo.height
    const cv = document.createElement('canvas')
    cv.width = lw
    cv.height = lh
    const ctx = cv.getContext('2d', { willReadFrequently: true })
    if (!ctx) return reject(new Error('2d canvas unavailable'))
    ctx.drawImage(albedo, 0, 0)
    const px = ctx.getImageData(0, 0, lw, lh).data
    const lum = new Float32Array(lw * lh)
    for (let i = 0; i < lum.length; i++) lum[i] = px[i * 4] / 255
    const W = reliefWidth(high)
    const params = high ? { craters: 9500, rMin: 1.4, rMax: 34 } : { craters: 3000, rMin: 1.2, rMax: 17 }
    generateLunarDetail({ width: W, height: W / 2, lum, lumW: lw, lumH: lh, seed: 1969, ...params }, (rgba) => {
      const tex = new THREE.DataTexture(rgba, W, W / 2, THREE.RGBAFormat)
      tex.wrapS = THREE.RepeatWrapping
      tex.wrapT = THREE.ClampToEdgeWrapping
      tex.magFilter = THREE.LinearFilter
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.generateMipmaps = true
      tex.anisotropy = 4
      tex.needsUpdate = true
      resolve(tex)
    }, onProgress)
  })
}
