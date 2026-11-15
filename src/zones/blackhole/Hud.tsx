import { useEffect, useState } from 'react'
import { useStore } from '@/engine/store'
import { timeline } from '@/engine/timeline'
import { cam } from '@/engine/world'
import { ranges } from '@/engine/journey'
import { exitBranch, curtain, choiceGate, jumpToZone } from '@/engine/api'
import { properRemaining, coordSinceRelease, tidalAccel, G_EARTH, tgOf, rgOf, M87_MASS_SUN, formatDuration, betaStatic } from '@/lib/bh/infall'
import { FALLER, R_RELEASE, sci } from './model'
import { observerRg } from './frame'
import { useBh } from './state'

/** Numbers shown in the infall panel, ALL computed from r with the formulas of src/lib/bh/infall.ts (r = camera distance / r_g). */
export function readouts(r: number) {
  const tg = tgOf(M87_MASS_SUN), rg = rgOf(M87_MASS_SUN)
  const outside = r > 2.0005
  return {
    r, rs: r / 2, km: r * rg / 1000,
    proper: properRemaining(FALLER, Math.min(r, R_RELEASE)) * tg,
    distant: outside ? coordSinceRelease(FALLER, Math.min(r, R_RELEASE - 1e-9)) * tg : Infinity,
    beta: outside ? betaStatic(FALLER, r) : NaN,
    tidalG: tidalAccel(M87_MASS_SUN, r) / G_EARTH,
    inside: r < 2,
    status: r > 2.02 ? 'Outside the horizon' : r > 1.98 ? 'CROSSING THE EVENT HORIZON' : 'Inside the event horizon',
  }
}

export function BlackHoleHud() {
  const tl = useStore((s) => s.timelineId)
  const motion = useStore((s) => s.motion)
  const [r, setR] = useState(R_RELEASE)
  const [T, setT] = useState(0)
  const end = useBh((s) => s.endCard)
  const returning = useBh((s) => s.returning)
  useEffect(() => {
    if (tl !== 'infall') return
    const id = setInterval(() => { setR(observerRg(cam.pose).r); setT(timeline.t) }, 90)
    return () => clearInterval(id)
  }, [tl])
  // close the end card when the user scrolls back up
  useEffect(() => {
    if (!end) return
    const id = setInterval(() => {
      const ap = ranges('main').find((z) => z.id === 'bh-approach')
      if (ap && (timeline.t - ap.t0) / (ap.t1 - ap.t0) < 0.9) useBh.getState().set({ endCard: false })
    }, 300)
    return () => clearInterval(id)
  }, [end])
  const doReturn = async () => {
    if (useBh.getState().returning) return
    useBh.getState().set({ returning: true })
    await curtain(1, motion === 'reduced' ? 150 : 550)
    exitBranch()
    await new Promise((res) => setTimeout(res, 80))
    await curtain(0, motion === 'reduced' ? 150 : 900)
    useBh.getState().set({ returning: false })
  }
  if (tl === 'infall') {
    return (
      <>
        <div className="pointer-events-auto fixed left-5 top-[84px] z-30 sm:left-8 sm:top-[92px]">
          <button data-testid="infall-return" className="hud-chip glass rounded px-3 py-1.5" onClick={doReturn} disabled={returning}>↩ Return to the journey</button>
        </div>
        <Dread r={readouts(r).r} T={T} />
      </>
    )
  }
  if (end) {
    return (
      <div className="fixed bottom-24 left-1/2 z-30 -translate-x-1/2" data-testid="end-card">
        <div className="flex justify-center gap-3">
          <button className="glass hud-chip rounded px-4 py-2" data-testid="end-fall" onClick={() => { useBh.getState().set({ endCard: false }); void choiceGate.open({ id: 'bh-fall', title: 'Fall into the black hole?', note: 'Simulation · non-rotating model', prompt: 'A free-falling observer, released from rest at 60 gravitational radii.', options: [{ id: 'yes', label: 'Yes, fall in', branch: 'infall' }, { id: 'no', label: 'No, continue' }] }).then((o) => { if (o.id === 'no') useBh.getState().set({ endCard: true }) }) }}>Fall in after all</button>
          <button className="glass hud-chip rounded px-4 py-2" data-testid="end-restart" onClick={() => { useBh.getState().set({ endCard: false }); void jumpToZone(0) }}>Back to Earth</button>
        </div>
      </div>
    )
  }
  return null
}

const fmt = (x: number) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x >= 1 ? x.toFixed(2) : x.toFixed(3))
function Row({ k, v, sub, id }: { k: string; v: string; sub: string; id: string }) {
  return (
    <div style={{ padding: '3px 0', borderTop: '1px solid var(--line)' }}>
      <div className="flex justify-between gap-2"><dt style={{ color: 'var(--ink-dim)' }}>{k}</dt><dd data-testid={id} style={{ margin: 0, textAlign: 'right' }}>{v}</dd></div>
      <div style={{ color: 'var(--ink-dim)', fontSize: 10.5, opacity: 0.8, lineHeight: 1.3 }}>{sub}</div>
    </div>
  )
}

/** Slow darkening of the screen edges as the fall deepens: nothing is drawn by the black-hole shader here, this is only a soft vignette over it (pointer-events: none). */
function Dread({ r, T }: { r: number; T: number }) {
  const inner = Math.min(1, Math.max(0, (Math.log(30) - Math.log(Math.max(r, 0.01))) / (Math.log(30) - Math.log(0.01)))) // 0 at r = 30, 1 at r = 0.01
  const a = 0.15 + 0.6 * inner * inner
  const breathe = 1 + 0.04 * Math.sin(T * 400)
  return <div data-testid="infall-dread" aria-hidden className="pointer-events-none fixed inset-0 z-10" style={{ background: `radial-gradient(ellipse at 62% 50%, rgba(0,0,0,0) ${Math.round(58 - 30 * inner)}%, rgba(0,0,0,${(a * breathe).toFixed(3)}) 100%)` }} />
}
