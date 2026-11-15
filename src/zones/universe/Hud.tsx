import { useEffect, useState } from 'react'
import { useStore } from '@/engine/store'
import { timeline } from '@/engine/timeline'
import { ranges } from '@/engine/journey'
import { curtain } from '@/engine/api'
import { scrollToT } from '@/engine/scroll'
import { zoneLocal } from './state'
import { TEXT } from './model'

/**
 * Multiverse HUD: (1) the persistent hypothesis label, shown for the whole zone (and its fade-in), (2) the end card with the way back to
 * the start (curtain dissolve, then the journey begins again at Earth). Both are DOM, outside the canvas.
 */
export function UniverseHud() {
  const tl = useStore((s) => s.timelineId)
  const motion = useStore((s) => s.motion)
  const [l, setL] = useState(-1)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (tl !== 'main') { setL(-1); return }
    const id = setInterval(() => { setL(zoneLocal('multiverse', timeline.t)) }, 110)
    return () => clearInterval(id)
  }, [tl])
  const restart = async () => {
    if (busy) return
    setBusy(true)
    await curtain(1, motion === 'reduced' ? 150 : 1000)
    const first = ranges('main')[0]
    const t = first.t0 + 0.002
    scrollToT(t, true)
    timeline.snap(t)
    await new Promise((r) => setTimeout(r, 160))
    await curtain(0, motion === 'reduced' ? 150 : 1300)
    setBusy(false)
  }
  // the multiverse is the last zone: the hypothesis chip stays on for all of it, and the end card appears as its final beat settles
  const end = l >= 0.965
  if (l < 0) return null
  if (!end) return null
  return (
    <div data-testid="end-restart" className="fixed bottom-24 left-1/2 z-30 -translate-x-1/2">
      <button className="glass hud-chip rounded px-4 py-2" data-testid="restart-journey" onClick={restart} disabled={busy}>↺ Begin again from Earth</button>
    </div>
  )
}
