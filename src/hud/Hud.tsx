import { useEffect, useRef, useState, type TouchEvent as RTouchEvent } from 'react'
import { useStore, st } from '@/engine/store'
import { ranges, getObject, type Beat } from '@/engine/journey'
import { cam } from '@/engine/world'
import { timeline } from '@/engine/timeline'
import { jumpToZone, release, choiceGate, focus, focusStep, focusState, focusZoomBy, zoomOf } from '@/engine/api'
import { startIntro, introVeil, introRamp, INTRO } from '@/engine/intro'
import { groupOf, neighbour } from '@/engine/focusGroups'
import { infoFor } from '@/lib/focusData'
import { MOON_SPEEDUP } from '@/zones/solar/satellites'
import { SPIN_SPEEDUP } from '@/zones/solar/bodies'
import { setMotion } from '@/engine/scroll'
import { setPref, needsReload, resolveSettings, type TierPref } from '@/engine/quality'
import { formatLength } from '@/lib/scale'

const useRaf = (fn: () => void) => {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    let id = 0
    const loop = () => { ref.current(); id = requestAnimationFrame(loop) }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [])
}

export function LoadingScreen() {
  const phase = useStore((s) => s.phase)
  const p = useStore((s) => s.progress)
  const label = useStore((s) => s.progressLabel)
  const error = useStore((s) => s.error)
  const [gone, setGone] = useState(false)
  // The journey starts by itself as soon as everything is loaded: no tap is needed. Sound starts on its own where the browser allows it,
  // otherwise on the person's first scroll / touch / key (see installSound in lib/audio/sound.ts).
  const [checked, setChecked] = useState(false)
  useEffect(() => { if (phase === 'ready') { const t = setTimeout(() => setChecked(true), 150); return () => clearTimeout(t) } }, [phase])
  const go = phase === 'ready' && checked
  useEffect(() => { if (go) { const t = setTimeout(() => setGone(true), 900); return () => clearTimeout(t) } }, [go])
  // the opening sequence starts once the loading screen has begun to lift (see engine/intro.ts)
  useEffect(() => {
    if (!go) return
    const h = setTimeout(startIntro, st().motion === 'reduced' ? 100 : 450)
    return () => clearTimeout(h)
  }, [go])
  if (gone) return null
  const pct = Math.round(p * 100)
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ background: 'var(--bg)', opacity: go ? 0 : 1, transition: 'opacity .8s ease', pointerEvents: go ? 'none' : 'auto', touchAction: 'none'}} role="status" aria-live="polite">
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem,6vw,3.5rem)', letterSpacing: '0.3em' }}>ASTRA</div>
      <div className="mt-8 h-[2px] w-[min(320px,70vw)] overflow-hidden" style={{ background: 'var(--line)' }}>
        <div id="load-bar" style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', transition: 'width .2s linear' }} />
      </div>
      <div className="hud-chip mt-4" data-testid="load-pct">{phase === 'error' ? `Error: ${error}` : `${label} · ${pct}%`}</div>
    </div>
  )
}

export function Title() {
  const title = useStore((s) => s.zoneTitle)
  return (
    <div className="hud-fade pointer-events-none fixed left-5 top-5 z-30 sm:left-8 sm:top-7" data-testid="hud-title" style={{ ['--d' as string]: '0s' }}>
      <div className="hud-chip">ASTRA</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', marginTop: 4 }}>{title}</div>
    </div>
  )
}

export function Rail() {
  const zi = useStore((s) => s.zoneIndex)
  const tl = useStore((s) => s.timelineId)
  const rs = ranges(tl)
  const fill = useRef<HTMLDivElement>(null)
  useRaf(() => { if (fill.current) fill.current.style.height = `${timeline.t * 100}%` })
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); jumpToZone(Math.min(rs.length - 1, zi + 1)) }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); jumpToZone(Math.max(0, zi - 1)) }
  }
  return (
    <nav aria-label="Journey progress" className="hud-fade fixed right-4 top-1/2 z-30 -translate-y-1/2 sm:right-7" onKeyDown={onKey} style={{ ['--d' as string]: '0.7s' }}>
      <div className="relative" style={{ height: '56svh', width: 24 }}>
        <div className="absolute right-[11px] top-0 h-full w-px" style={{ background: 'var(--line)' }} />
        <div ref={fill} className="absolute right-[11px] top-0 w-px" style={{ background: 'var(--accent)' }} />
        {rs.map((z) => {
          const c = ((z.t0 + z.t1) / 2) * 100
          const active = z.index === zi
          return (
            <button key={z.id} data-testid={`tick-${z.id}`} aria-label={`Jump to ${z.title}`} aria-current={active ? 'step' : undefined} onClick={() => jumpToZone(z.index)}
              className="group absolute right-0 flex items-center" style={{ top: `${c}%`, transform: 'translateY(-50%)', height: 28, width: 110, justifyContent: 'flex-end', flexDirection: 'row-reverse', background: 'none', border: 0, cursor: 'pointer' }}>
              <span style={{ width: active ? 11 : 7, height: active ? 11 : 7, marginRight: active ? 7 : 9, borderRadius: 99, background: active ? 'var(--accent)' : 'rgba(210,225,255,.55)', boxShadow: active ? '0 0 12px var(--accent)' : 'none', flex: 'none' }} />
              <span className="hud-chip mr-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" style={{ opacity: active ? 1 : undefined, color: active ? 'var(--ink)' : undefined, whiteSpace: 'nowrap' }}>{z.tick}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

const isLong = (b: Beat) => b.style === 'hero' && b.title.length > 40
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1))); return t * t * (3 - 2 * t) }
export function Beats() {
  const tl = useStore((s) => s.timelineId)
  const motion = useStore((s) => s.motion)
  const rs = ranges(tl)
  const items = rs.flatMap((z) => z.beats.map((b) => ({ z, b }))).filter(({ b }) => b.style === 'hero') // exploring, not reading: only the opening line stays
  const refs = useRef<Array<HTMLDivElement | null>>([])
  useRaf(() => {
    const T = timeline.t
    items.forEach(({ z, b }, i) => {
      const el = refs.current[i]
      if (!el) return
      const span = z.t1 - z.t0
      const [a, c, d, e] = b.w.map((x) => z.t0 + x * span)
      const hide = 1 - Math.min(1, focusState.f * 3) // beat text and the focus panel never share the screen
      const ih = b.id === 'hero' ? introRamp(INTRO.titleFrom, INTRO.titleTo) : 1 // the opening title emerges after the planet
      const o = (motion === 'reduced' ? (T >= a && T <= e ? 1 : 0) : sm(a, c, T) * (1 - sm(d, e, T))) * hide * ih
      el.style.opacity = String(o)
      if (b.id === 'hero') {
        const h2 = el.querySelector('h2')
        if (h2) { h2.style.letterSpacing = `${0.04 + 0.1 * (1 - ih)}em`; h2.style.filter = ih < 1 ? `blur(${(1 - ih) * 8}px)` : '' }
      }
      // a long closing line is centred on the screen (the short opening title keeps its original placement)
      el.style.transform = isLong(b) ? `translateY(calc(-50% + ${(1 - o) * 14}px))` : `translateY(${(1 - o) * 14}px)`
      el.style.visibility = o < 0.01 ? 'hidden' : 'visible'
    })
  })
  return (
    <div className="pointer-events-none fixed inset-0 z-20" data-testid="beats">
      {items.map(({ b }: { b: Beat }, i) => (
        <div key={b.id} ref={(el) => { refs.current[i] = el }} data-beat={b.id} className={isLong(b) ? 'absolute px-11 sm:px-14' : 'absolute px-6 sm:px-14'}
          style={{ top: b.style === 'hero' ? '50%' : '58%', transform: 'translateY(-50%)', left: b.side === 'center' ? '50%' : 0, textAlign: b.side === 'center' ? 'center' : 'left', width: isLong(b) ? 'min(980px, 100%)' : 'min(640px, 100%)', marginLeft: b.side === 'center' ? (isLong(b) ? 'calc(min(980px,100%) / -2)' : 'calc(min(640px,100%) / -2)') : 0, visibility: 'hidden' }}>
          {b.kicker && <div className="hud-chip mb-3">{b.kicker}</div>}
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 400, lineHeight: isLong(b) ? 1.15 : 1.05, fontSize: isLong(b) ? 'clamp(1.5rem,4.4vw,3.1rem)' : b.style === 'hero' ? 'clamp(2.6rem,8vw,6rem)' : 'clamp(1.5rem,3.4vw,2.4rem)', letterSpacing: isLong(b) ? '0.02em' : b.style === 'hero' ? '0.04em' : 0, textShadow: '0 2px 30px rgba(0,0,0,.7)', whiteSpace: b.id === 'hero' ? 'pre-line' : undefined }}>{b.id === 'hero' ? b.title.replace(/ (\S+)$/, '\n$1') : b.title /* the opening title always breaks before its last word ("WE ARE" / "HERE."), on a phone as on a big screen */}</h2>
        </div>
      ))}
    </div>
  )
}

export function Controls() {
  const pref = useStore((s) => s.pref)
  const motion = useStore((s) => s.motion)
  const loadedTex = useRef(st().settings.tex).current
  const onTier = (p: TierPref) => {
    setPref(p)
    useStore.setState({ pref: p, settings: { ...resolveSettings(p), tex: loadedTex } })
    if (needsReload(p, loadedTex)) location.reload()
  }
  return (
    <div className="hud-fade fixed bottom-4 left-4 z-30 flex items-center gap-2 sm:bottom-6 sm:left-8" style={{ ['--d' as string]: '1.1s' }}>
      <label className="hud-chip glass rounded px-2 py-1">
        <span className="sr-only">Quality</span>
        Quality{' '}
        <select data-testid="quality" value={pref} onChange={(e) => onTier(e.target.value as TierPref)} style={{ background: 'transparent', color: 'var(--ink)', border: 0 }}>
          {(['auto', 'high', 'medium', 'low'] as const).map((p) => <option key={p} value={p} style={{ color: '#000' }}>{p}</option>)}
        </select>
      </label>
      <button data-testid="motion" className="hud-chip glass rounded px-2 py-1" aria-pressed={motion === 'reduced'} onClick={() => setMotion(motion === 'reduced' ? 'full' : 'reduced')}>
        Reduced motion: {motion === 'reduced' ? 'on' : 'off'}
      </button>
      {motion === 'reduced' && <StillNav />}
    </div>
  )
}
function StillNav() {
  const zi = useStore((s) => s.zoneIndex)
  const n = ranges(st().timelineId).length
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); jumpToZone(Math.min(n - 1, zi + 1)) }
      if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); jumpToZone(Math.max(0, zi - 1)) }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [zi, n])
  return (
    <>
      <button className="hud-chip glass rounded px-2 py-1" onClick={() => jumpToZone(Math.max(0, zi - 1))} disabled={zi === 0}>Previous</button>
      <button className="hud-chip glass rounded px-2 py-1" onClick={() => jumpToZone(Math.min(n - 1, zi + 1))} disabled={zi >= n - 1}>Next</button>
    </>
  )
}

const NEWLINE = '\n'
void NEWLINE
const isSmall = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 700px), (max-aspect-ratio: 1/1)').matches

/** Keyboard + touch while an object is focused: Esc = back, Left / Right = previous / next in the group, swipe = same, wheel locked (except on a zoomable object, Sagittarius A*: wheel, pinch and + / - zoom). */
function FocusKeys() {
  useEffect(() => {
    const active = () => st().focusPhase !== 'idle'
    const onKey = (e: KeyboardEvent) => {
      if (!active()) return
      const t = e.target as HTMLElement | null
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); void release(); return }
      if (e.key === 'Tab') {
        // while an object is focused the panel is the only thing to tab through (Esc leaves): enter it from anywhere and wrap round inside it
        const panel = document.querySelector<HTMLElement>('[data-testid=focus-panel]')
        if (!panel || getComputedStyle(panel).visibility === 'hidden') return
        const items = [...panel.querySelectorAll<HTMLElement>('button:not([disabled])')]
        if (!items.length) return
        const cur = document.activeElement as HTMLElement | null
        const i = cur ? items.indexOf(cur) : -1
        if (i === -1 && cur && panel.contains(cur) === false) { e.preventDefault(); (e.shiftKey ? items[items.length - 1] : items[0]).focus(); return }
        if (i === -1) { e.preventDefault(); (e.shiftKey ? items[items.length - 1] : items[0]).focus(); return }
        if (!e.shiftKey && i === items.length - 1) { e.preventDefault(); items[0].focus() } else if (e.shiftKey && i === 0) { e.preventDefault(); items[items.length - 1].focus() }
        return
      }
      if (zoomOf() && (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_')) { e.preventDefault(); focusZoomBy(e.key === '-' || e.key === '_' ? 1 / 1.4 : 1.4); return }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        // while focused the arrows step through the group; they must not reach the rail (which would jump zones)
        e.preventDefault(); e.stopPropagation()
        if (!e.repeat) focusStep(e.key === 'ArrowRight' ? 1 : -1)
      }
    }
    let sx = 0, sy = 0, st0 = 0
    const onStart = (e: TouchEvent) => { if (!active() || e.touches.length !== 1) return; sx = e.touches[0].clientX; sy = e.touches[0].clientY; st0 = performance.now() }
    const onEnd = (e: TouchEvent) => {
      if (!active() || !st0) return
      const c = e.changedTouches[0]
      const dx = c.clientX - sx, dy = c.clientY - sy
      const dt = performance.now() - st0
      st0 = 0
      if (Math.abs(dx) > 56 && Math.abs(dx) > 1.6 * Math.abs(dy) && dt < 900) focusStep(dx < 0 ? 1 : -1)
    }
    const onWheel = (e: WheelEvent) => {
      if (!active()) return
      if ((e.target as HTMLElement | null)?.closest?.('[data-testid=focus-panel]')) return
      e.preventDefault()
      if (zoomOf()) focusZoomBy(Math.exp(-(e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY) * 0.002))
    }
    // two-finger pinch zooms a zoomable object
    let pd = 0
    const gap = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
    const onPinchStart = (e: TouchEvent) => { pd = active() && zoomOf() && e.touches.length === 2 ? gap(e) : 0 }
    const onPinchMove = (e: TouchEvent) => {
      if (!pd || e.touches.length !== 2) return
      const d = gap(e)
      if (d > 0) { focusZoomBy(d / pd); pd = d }
    }
    const onPinchEnd = () => { pd = 0 }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('touchstart', onPinchStart, { passive: true })
    window.addEventListener('touchmove', onPinchMove, { passive: true })
    window.addEventListener('touchend', onPinchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onPinchStart)
      window.removeEventListener('touchmove', onPinchMove)
      window.removeEventListener('touchend', onPinchEnd)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('wheel', onWheel)
    }
  }, [])
  return null
}

export function FocusPanel() {
  const id = useStore((s) => s.focusId)
  const phase = useStore((s) => s.focusPhase)
  const ref = useRef<HTMLElement>(null)
  const o = id ? getObject(id) : undefined
  const info = infoFor(id)
  const g = groupOf(id)
  const prev = neighbour(id, -1), next = neighbour(id, 1)
  const arrived = phase === 'focused'
  useEffect(() => {
    if (!arrived) return
    // after the panel has actually become visible (a hidden element cannot take focus)
    const h = setTimeout(() => ref.current?.focus({ preventScroll: true }), 120)
    return () => clearTimeout(h)
  }, [arrived, id])
  const nameOf = (i: string | null) => (i ? getObject(i)?.name ?? i : '')
  const KIND: Record<string, string> = { star: 'Star', planet: 'Planet', moon: 'Moon', galaxy: 'Galaxy', probe: 'Spacecraft', nebula: 'Nebula', blackhole: 'Black hole' }
  const eyebrow = info ? (info.kind === 'moon' && info.parent ? `Moon of ${nameOf(info.parent)}` : KIND[info.kind] ?? '') : ''
  return (
    <>
      <FocusKeys />
      {phase !== 'idle' && o && (
        <aside ref={ref} tabIndex={-1} aria-label={`${info?.title ?? o.name}: details`} data-testid="focus-panel" data-focus-id={id ?? ''}
          className="glass fp fixed z-40 overflow-y-auto rounded-xl p-4 outline-none max-sm:p-3 sm:p-5 left-3 right-3 bottom-14 max-h-[52svh] sm:left-auto sm:right-20 sm:bottom-auto sm:top-1/2 sm:max-h-[min(80svh,720px)] sm:w-[372px] sm:-translate-y-1/2"
          style={{ outline: 'none', opacity: arrived ? 1 : 0, visibility: arrived ? 'visible' : 'hidden', transition: 'opacity .5s ease, visibility .5s' }}>
          <div className="sr-only" role="status" aria-live="polite">{arrived ? `Focused on ${info?.title ?? o.name}${g ? `, ${g.index + 1} of ${g.ids.length}` : ''}. Left and right arrows change object, Escape goes back.` : ''}</div>

          {/* top bar: the way out, and where you are in the set */}
          <div className="fp-head">
            <button data-testid="focus-back" className="fp-back" onClick={() => void release()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
              <span>Back</span>
              <kbd className="fp-kbd" aria-hidden="true">Esc</kbd>
            </button>
            <span className="fp-count" data-testid="focus-count">{g ? <><b>{g.index + 1}</b> / {g.ids.length}</> : ''}</span>
          </div>

          {/* what it is */}
          <div>
            {eyebrow && <div className="fp-eyebrow" data-testid="focus-kind">{eyebrow}</div>}
            <h3 data-testid="focus-title" className="fp-title">{info?.title ?? o.info?.title ?? o.name}</h3>
          </div>

          {/* previous / next in the set */}
          {g && g.ids.length > 1 && (
            <div className="fp-nav">
              <button data-testid="focus-prev" className="fp-step" disabled={!prev} onClick={() => focusStep(-1)} aria-label={`Previous: ${nameOf(prev)}`}>
                <span className="fp-step-dir">‹ Previous</span>
                <span className="fp-step-name">{nameOf(prev)}</span>
              </button>
              <button data-testid="focus-next" className="fp-step fp-step-next" disabled={!next} onClick={() => focusStep(1)} aria-label={`Next: ${nameOf(next)}`}>
                <span className="fp-step-dir">Next ›</span>
                <span className="fp-step-name">{nameOf(next)}</span>
              </button>
            </div>
          )}

          {o.focus?.zoom && (
            <div className="fp-section fp-zoom" data-testid="focus-zoom">
              <span className="fp-label">Zoom</span>
              <div className="fp-seg">
                <button data-testid="focus-zoom-out" aria-label="Zoom out" onClick={() => focusZoomBy(1 / 1.6)}>−</button>
                <button data-testid="focus-zoom-in" aria-label="Zoom in" onClick={() => focusZoomBy(1.6)}>+</button>
              </div>
            </div>
          )}

          {info?.parent && (
            <div className="fp-section">
              <span className="fp-label">Orbits</span>
              <div className="fp-chips"><button className="fp-chip" onClick={() => void focus(info.parent!)}>{nameOf(info.parent)}</button></div>
            </div>
          )}
          {info?.moons && (
            <div className="fp-section" data-testid="focus-moons">
              <span className="fp-label">{info.moons.length === 1 ? 'Moon' : 'Moons'}</span>
              <div className="fp-chips">
                {info.moons.map((m) => <button key={m} className="fp-chip" onClick={() => void focus(m)}>{nameOf(m)}</button>)}
              </div>
            </div>
          )}
        </aside>
      )}
    </>
  )
}

export function GateOverlay() {
  const g = useStore((s) => s.gate)
  const first = useRef<HTMLButtonElement>(null)
  const touch = useRef<{ id: string; x: number; y: number } | null>(null)
  useEffect(() => { if (g) first.current?.focus({ preventScroll: true }) }, [g])
  if (!g) return null
  // A finger acts on its own release. A tap that lands while the page is still gliding from the scroll can end as a touchcancel instead of a
  // touchend, so a cancel with (almost) no movement counts as the tap too: one tap is enough. preventDefault stops the duplicate click.
  const down = (id: string) => (e: RTouchEvent) => { const t = e.touches[0]; touch.current = t ? { id, x: t.clientX, y: t.clientY } : null }
  const up = (id: string) => (e: RTouchEvent) => {
    const start = touch.current
    touch.current = null
    const t = e.changedTouches[0]
    if (start && t && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 14) return // it was a drag, not a tap
    if (e.cancelable) e.preventDefault()
    choiceGate.choose(id)
  }
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(2,3,10,.55)', touchAction: 'none' }} role="dialog" aria-modal="true" aria-labelledby="gate-title" data-testid="gate">
      <div className="glass rounded-xl p-8 text-center max-sm:p-5" style={{ width: 'min(520px,90vw)' }}>
        <h2 id="gate-title" style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 'clamp(1.5rem,5vw,2rem)', margin: '0 0 22px' }}>{g.title}</h2>
        <div className="flex justify-center gap-3">
          {g.options.map((o, i) => (
            <button key={o.id} ref={i === 0 ? first : undefined} data-testid={`gate-${o.id}`} onClick={() => choiceGate.choose(o.id)}
              onTouchStart={down(o.id)} onTouchEnd={up(o.id)} onTouchCancel={up(o.id)}
              className="glass rounded px-5 py-2" style={{ fontFamily: 'var(--font-ui)', touchAction: 'manipulation', minHeight: 46, minWidth: 120, WebkitTapHighlightColor: 'transparent' }}>{o.label}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function Curtain() {
  const c = useStore((s) => s.curtain)
  return <div className="pointer-events-none fixed inset-0 z-[45]" style={{ background: '#02030a', opacity: c }} />
}

/** Black cover over the scene (below the interface) that lifts slowly at the start; the interface itself fades in later (.hud-fade). */
export function IntroVeil() {
  const ref = useRef<HTMLDivElement>(null)
  const [done, setDone] = useState(false)
  useRaf(() => {
    const v = introVeil()
    if (ref.current) ref.current.style.opacity = String(v)
    if (v <= 0.001 && !done) setDone(true)
  })
  if (done) return null
  return <div ref={ref} className="pointer-events-none fixed inset-0 z-[25]" style={{ background: '#02030a', opacity: 1 }} />
}
