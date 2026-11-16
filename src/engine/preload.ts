import * as THREE from 'three'
import { ASSETS, makeTexture, putTexture, putExtra, putData, urlFor, allTextures, type AssetEntry } from './assets'
import { buildMoonRelief } from '@/lib/moonRelief'
import { useStore } from './store'

/**
 * Preloader, stage 1 (no GL needed): fetch every manifest file with byte-accurate progress, decode off the main thread, build the Moon relief.
 * Stage 2 (GPU upload, shader compile, per-zone warm-up frame) lives in <Preloader/> because it needs the renderer.
 *
 * Faster than the first version, with the same guarantee (the journey starts only when EVERYTHING is loaded):
 *  - it can START before React mounts (`startPrefetch()` is called from main.tsx), so the network works while the bundle parses and WebGL starts;
 *  - the biggest files are requested first (no long tail of one huge file at the end), and every file is decoded the moment its bytes arrive
 *    (the old code decoded one by one after the LAST byte); decoding is capped at 3 at once so an 8k texture cannot spike memory;
 *  - the Moon relief (CPU) starts as soon as the Moon texture is decoded, in parallel with the downloads of everything else;
 *  - repeat visits read the files from the Cache API (keyed by the manifest's byte size, so a regenerated texture is fetched again).
 * Progress weights are unchanged: fetch 55 %, decode 8 %, relief 10 %, GPU upload 9 %, shaders + warm-up 18 %; the first three now overlap in time and
 * are summed into one monotonic bar.
 */
export const W = { fetch: 0.55, decode: 0.08, relief: 0.1, upload: 0.09, warm: 0.18 }
let base = 0
export const report = (frac: number, label: string) => useStore.setState({ progress: Math.min(1, Math.max(0, frac)), progressLabel: label })

interface ManifestRow { file: string; bytes: number }

const CACHE_NAME = 'astra-assets-v1'
const MAX_DECODES = 3
const NET_SLOTS = 10
let netFree = NET_SLOTS
const netWaiting: Array<() => void> = []
const netAcquire = () => (netFree > 0 ? (netFree--, Promise.resolve()) : new Promise<void>((r) => netWaiting.push(r)))
const netRelease = () => { const w = netWaiting.shift(); if (w) w(); else netFree++ }

/** Decode an image off the main thread. Some Android WebViews / older Chrome refuse the createImageBitmap options: then decode with an <img> and flip it on a canvas (same orientation, so flipY stays false). */
async function decodeImage(blob: Blob): Promise<ImageBitmap | HTMLCanvasElement> {
  try { return await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }) } catch { /* fall through */ }
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const cv = document.createElement('canvas')
    cv.width = img.naturalWidth; cv.height = img.naturalHeight
    const c = cv.getContext('2d')
    if (!c) throw new Error('2d canvas unavailable')
    c.translate(0, cv.height); c.scale(1, -1); c.drawImage(img, 0, 0)
    return cv
  } finally { URL.revokeObjectURL(url) }
}

const prog = { got: 0, total: 1, decoded: 0, count: 1, relief: 0 }
let lastShown = 0
let lastReported = -1
let lastLabel = ''
function paint() {
  const fetchF = Math.min(1, prog.got / prog.total)
  const v = W.fetch * fetchF + W.decode * (prog.decoded / prog.count) + W.relief * prog.relief
  lastShown = Math.max(lastShown, v) // monotonic: the byte estimate is reconciled with reality as files finish
  const label = fetchF < 1 ? 'Fetching textures' : prog.decoded < prog.count ? 'Decoding images' : prog.relief < 1 ? 'Building lunar relief' : 'Uploading to GPU'
  if (lastShown - lastReported < 0.002 && label === lastLabel) return // a store update per network chunk would re-render the loading screen thousands of times
  lastReported = lastShown; lastLabel = label
  report(lastShown, label)
}

interface Stage1 { tex: 'hi' | 'lo'; done: Promise<void>; bitmaps: Map<string, ImageBitmap | HTMLCanvasElement>; relief: THREE.DataTexture | null }
let stage1: Stage1 | null = null

async function openCache(): Promise<Cache | null> {
  try { return typeof caches !== 'undefined' ? await caches.open(CACHE_NAME) : null } catch { return null } // not a secure context / private mode: just use the network
}

/** Start stage 1 now (idempotent). Safe to call before React and before the renderer exists. */
export function startPrefetch(tex: 'hi' | 'lo'): Stage1 {
  if (stage1) return stage1
  const s1: Stage1 = { tex, done: Promise.resolve(), bitmaps: new Map(), relief: null }
  stage1 = s1
  s1.done = run(s1)
  s1.done.catch(() => { /* reported by loadAssets(), which awaits it */ })
  return s1
}

async function run(s1: Stage1): Promise<void> {
  const tex = s1.tex
  const list = ASSETS.filter((a) => a.preload !== false)
  let sizes = new Map<string, number>()
  try {
    const rows = (await (await fetch('/textures/manifest.json')).json()) as ManifestRow[]
    sizes = new Map(rows.map((r) => ['/textures/' + r.file, r.bytes]))
  } catch { /* fall back to Content-Length */ }
  const sizeOf = (a: AssetEntry) => sizes.get(urlFor(a, tex)) ?? 400_000
  prog.total = Math.max(1, list.reduce((s, a) => s + sizeOf(a), 0))
  prog.count = Math.max(1, list.length)
  const cache = await openCache()
  const high = tex === 'hi'
  let slots = MAX_DECODES
  const waiting: Array<() => void> = []
  const acquire = () => (slots > 0 ? (slots--, Promise.resolve()) : new Promise<void>((r) => waiting.push(r))) // a waiter is handed the freed slot directly
  const release = () => { const w = waiting.shift(); if (w) w(); else slots++ }
  let reliefP: Promise<void> = Promise.resolve()
  report(0, 'Fetching textures')

  const ordered = [...list].sort((a, b) => sizeOf(b) - sizeOf(a)) // biggest first
  await Promise.all(ordered.map(async (a) => {
    const url = urlFor(a, tex)
    const key = sizes.has(url) ? `${url}?v=${sizes.get(url)}` : null
    let res: Response | undefined
    if (cache && key) { try { res = await cache.match(key) } catch { /* ignore */ } }
    const fromNet = !res
    if (fromNet) await netAcquire() // at most NET_SLOTS files in flight: ~60 parallel streams starve a weak phone's network and memory
    let blob = new Blob()
    try {
      if (!res) {
        res = await fetch(url)
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
      }
      const expected = sizeOf(a)
      const parts: BlobPart[] = []
      let mine = 0
      const reader = res.body?.getReader()
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          parts.push(value as BlobPart)
          mine += value.length
          prog.got += value.length
          paint()
        }
      } else {
        const b = await res.blob(); parts.push(b); mine = b.size; prog.got += mine
      }
      prog.got += Math.max(0, expected - mine) // reconcile the estimate with reality
      blob = new Blob(parts, { type: res.headers.get('content-type') ?? undefined })
    } finally { if (fromNet) netRelease() }
    // cache write AFTER the download, from the finished blob (Response.clone() tees the stream, and a cache write that fails early can stall the download on Chrome / Android)
    if (fromNet && cache && key) void cache.put(key, new Response(blob, { headers: { 'content-type': blob.type } })).catch(() => { /* quota: fine, next visit refetches */ })
    paint()
    // decode right away (does not wait for the other files)
    if (a.kind === 'data') {
      putData(a.id, await blob.arrayBuffer())
    } else {
      await acquire()
      try {
        s1.bitmaps.set(a.id, await decodeImage(blob))
      } finally { release() }
      // the Moon relief (CPU, time-sliced) starts as soon as its texture exists, in parallel with the remaining downloads
      if (a.id === 'moon-albedo') {
        reliefP = buildMoonRelief(s1.bitmaps.get(a.id)!, high, (f) => { prog.relief = f; paint() }).then((t) => { s1.relief = t; prog.relief = 1; paint() })
      }
    }
    prog.decoded++
    paint()
  }))
  if (!s1.bitmaps.has('moon-albedo')) prog.relief = 1
  await reliefP
}

export async function loadAssets(tex: 'hi' | 'lo', anisotropy: number): Promise<void> {
  const s1 = startPrefetch(tex)
  await s1.done
  const byId = new Map(ASSETS.map((a) => [a.id, a]))
  for (const [id, bmp] of s1.bitmaps) {
    const a = byId.get(id)
    if (a) putTexture(id, makeTexture(bmp, a, anisotropy))
  }
  if (s1.relief) putExtra('moon-relief', s1.relief)
  base = W.fetch + W.decode + W.relief
  report(base, 'Uploading to GPU')
}

export const afterFetchBase = () => base

/** Yield to the browser without the 4 ms clamp of nested setTimeout(0) (a MessageChannel hop is ~0.1 ms). */
const yieldNow = () => new Promise<void>((res) => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); res() }; c.port2.postMessage(0) })

/** Stage 2 helper: GPU-upload every texture (renderer.initTexture) with progress. Yields only when ~10 ms have passed, so the bar stays alive without wasted waits. */
export async function uploadAll(gl: THREE.WebGLRenderer) {
  const list = allTextures()
  let t0 = performance.now()
  for (let i = 0; i < list.length; i++) {
    gl.initTexture(list[i])
    report(base + W.upload * ((i + 1) / list.length), 'Uploading to GPU')
    if (performance.now() - t0 > 10) { await yieldNow(); t0 = performance.now() }
  }
  base += W.upload
}
export const warmBase = () => base
