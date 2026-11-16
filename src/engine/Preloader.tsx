import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { loadAssets, uploadAll, report, W, warmBase } from './preload'
import { useStore, st } from './store'
import { ranges, getBranchIds, allObjects } from './journey'
import { evalPose } from './path'
import { cam } from './world'
import { timeline } from './timeline'
import { sound, autoplaySound } from '@/lib/audio/sound'
import { waitForEnter } from './enter'

const frames = (n: number) => new Promise<void>((res) => { const f = (i: number) => (i <= 0 ? res() : requestAnimationFrame(() => f(i - 1))); f(n) })

/**
 * Preloader stage 2 (needs the renderer): after the files are decoded and the Moon relief is built, mount the scene
 * objects, upload every texture to the GPU (renderer.initTexture), precompile every shader, then render one warm-up
 * frame per zone. The loading screen shows the real percentage the whole way; the journey only starts at 100 %.
 */
export function Preloader() {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const s = st().settings
        await loadAssets(s.tex, Math.min(s.anisotropy, gl.capabilities.getMaxAnisotropy()))
        if (dead) return
        useStore.setState({ assetsReady: true }) // <Scene/> mounts every object now, once, forever
        await frames(2) // React commits the scene objects
        await uploadAll(gl)
        // precompile: everything visible at once
        const base = warmBase()
        report(base, 'Compiling shaders')
        cam.solo = new Set(allObjects().map((o) => o.id))
        await frames(2)
        // parallel shader compile can fail to report completion on some Android GPU drivers: never wait for it more than 12 s (shaders then compile on first use)
        await Promise.race([gl.compileAsync(scene, camera).catch(() => { /* compiled on first use */ }), new Promise<void>((r) => setTimeout(r, 12000))])
        report(base + W.warm * 0.4, 'Compiling shaders')
        // one warm-up render per DISTINCT (timeline, visible object set): the 6 infall stages show the same object, so they are warmed once, not six times.
        // The first one gets 2 frames (first use of every pipeline), the rest 1.
        const tls = ['main', ...getBranchIds()]
        const all = tls.flatMap((id) => ranges(id).map((z) => ({ id, z })))
        const seen = new Set<string>()
        const jobs = all.filter(({ id, z }) => { const k = id + '|' + [...z.objects].sort().join(','); if (seen.has(k)) return false; seen.add(k); return true })
        for (let i = 0; i < jobs.length; i++) {
          const { id, z } = jobs[i]
          cam.solo = new Set(z.objects)
          cam.override = evalPose((z.t0 + z.t1) / 2, id)
          await frames(i === 0 ? 2 : 1)
          report(base + W.warm * (0.4 + 0.6 * ((i + 1) / jobs.length)), `Warming up: ${z.title}`)
        }
        cam.solo = null
        cam.override = null
        timeline.snap(0)
        report(1, 'Ready')
        document.documentElement.dataset.astraReady = '1'
        await frames(2)
        // sound ON from the first moment: try to start it now; if the browser blocks it (no tap yet), ask for one tap on the loading screen (automated tests skip it)
        const playing = await autoplaySound().catch(() => false)
        if (sound.wanted && !playing && !navigator.webdriver) await waitForEnter()
        useStore.setState({ phase: 'ready' })
      } catch (e) {
        console.error(e)
        useStore.setState({ phase: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    })()
    return () => { dead = true }
  }, [gl, scene, camera])
  return null
}
export { THREE }
