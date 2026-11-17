import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useStore, st } from '@/engine/store'
import { timeline } from '@/engine/timeline'
import { ranges, zoneAt } from '@/engine/journey'
import { jumpToZone, jumpToT, focus } from '@/engine/api'
import { lock, unlock, scrollToT } from '@/engine/scroll'
import { installSound, toggleSound, subscribeSound, soundSnapshot, feedMood, blip, sound } from '@/lib/audio/sound'
import { mk, moodAt, moodInfall } from '@/lib/audio/moods'
import { hintPos } from './hint'
import { menuRows, infallLine, infallBudget } from './zoneInfo'
import { buildLink, hashNow, parseNow, tOfTarget } from './linkSync'
import { INTRO } from '@/engine/intro'

/**
 * Final series, step 5b: the four experience features, all DOM (outside the canvas), all quiet:
 *   <ExperienceTop/>   top-right: "Journey" menu button + "Sound" button (the only permanent additions to the HUD)
 *   <SoundFeed/>       aims the ambient sound at the scroll position, 4 times a second
 *   <ScrollHint/>      "Scroll to begin" on the hero
 *   <PlanetHint/>      one-time "Click a planet" in the Solar System
 *   <LinkSync/>        keeps the URL hash on the position and opens shared links
 */

const K_PLANET = 'astra.hint.planet'
const readFlag = (k: string) => { try { return localStorage.getItem(k) === '1' } catch { return false } }
const writeFlag = (k: string) => { try { localStorage.setItem(k, '1') } catch { /* storage blocked: the hint may return next visit, nothing breaks */ } }
const isCoarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

// ---------------------------------------------------------------------------------------------------- sound

export function SoundButton() {
  useSyncExternalStore(subscribeSound, soundSnapshot)
  const state = sound.playing ? 'on' : sound.wanted ? 'pending' : 'off' // pending = wanted, waiting for the first gesture (or for the tab to come back)
  return (
    <button type="button" data-sound-button data-testid="sound" data-state={state} aria-pressed={state === 'on'} aria-keyshortcuts="M"
      aria-label="Ambient sound (M)" title={state === 'on' ? 'Mute (M)' : state === 'pending' ? 'Start the sound (M)' : 'Unmute (M)'}
      onClick={toggleSound} className="hud-chip glass flex items-center gap-1.5 rounded px-2 py-1">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4z" />
        {state === 'on' ? <><path d="M16.5 8.5a5 5 0 0 1 0 7" /><path d="M19 6a8.5 8.5 0 0 1 0 12" /></> : <path d="M17 9l5 6M22 9l-5 6" />}
      </svg>
      <span>Sound<span className="hidden sm:inline">{state === 'on' ? ': on' : state === 'off' ? ': off' : ''}</span></span>
    </button>
  )
}

/** Aims the ambient graph at the scroll position. 2 Hz, plain objects reused, nothing per frame. */
export function SoundFeed() {
  const focusId = useStore((s) => s.focusId)
  useEffect(() => installSound(), [])
  useEffect(() => {
    const m = mk()
    const id = setInterval(() => {
      const s = st()
      if (s.phase !== 'ready') return
      if (s.timelineId !== 'main') moodInfall(timeline.t, m)
      else {
        const z = zoneAt(timeline.t, 'main')
        if (!z) return
        const prev = z.zone.index > 0 ? ranges('main')[z.zone.index - 1].id : null
        moodAt(z.zone.id, z.local, prev, m)
      }
      feedMood(m)
    }, 500) // twice a second is plenty for a sound that glides over seconds (and the graph skips writes that did not change)
    return () => clearInterval(id)
  }, [])
  useEffect(() => { if (focusId) blip() }, [focusId])
  return null
}

// ---------------------------------------------------------------------------------------------------- hints

const NAV_KEYS = new Set(['ArrowDown', 'ArrowRight', 'PageDown', ' ', 'End', 'Enter', 'ArrowUp', 'PageUp'])

export function ScrollHint() {
  const phase = useStore((s) => s.phase)
  const motion = useStore((s) => s.motion)
  const [state, setState] = useState<'idle' | 'shown' | 'hiding' | 'gone'>('idle')
  useEffect(() => {
    if (phase !== 'ready' || state !== 'idle') return
    // after the loading screen has faded; only when the person really is at the very start (a shared link into the journey never shows it)
    const h = setTimeout(() => setState(timeline.target < 0.0005 && st().zoneIndex === 0 && st().focusPhase === 'idle' ? 'shown' : 'gone'), st().motion === 'reduced' ? 1100 : INTRO.scrollHint) // after the opening has settled
    return () => clearTimeout(h)
  }, [phase, state])
  useEffect(() => {
    if (state !== 'shown') return
    const dismiss = () => setState('hiding')
    const onKey = (e: KeyboardEvent) => { if (NAV_KEYS.has(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) dismiss() }
    const poll = setInterval(() => { if (timeline.target > 0.0008 || st().zoneIndex > 0) dismiss() }, 120)
    window.addEventListener('wheel', dismiss, { passive: true })
    window.addEventListener('touchmove', dismiss, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => { clearInterval(poll); window.removeEventListener('wheel', dismiss); window.removeEventListener('touchmove', dismiss); window.removeEventListener('keydown', onKey) }
  }, [state])
  useEffect(() => {
    if (state !== 'hiding') return
    const h = setTimeout(() => setState('gone'), 700)
    return () => clearTimeout(h)
  }, [state])
  if (state === 'idle' || state === 'gone') return null
  return (
    <div data-testid="hint-scroll" data-visible={state === 'shown'} aria-hidden="true" className="pointer-events-none fixed bottom-16 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center sm:bottom-10"
      style={{ opacity: state === 'shown' ? 1 : 0, transition: 'opacity .6s ease' }}>
      <svg className={motion === 'reduced' ? '' : 'astra-bob'} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 6, opacity: 0.8 }}>
        <path d="M5 9l7 7 7-7" />
      </svg>
    </div>
  )
}

/** Solar System zone-local range in which the planet overview is on screen (the camera holds there). */
const SS_ZONE = 'solar-system', SS_FROM = 0.32, SS_TO = 0.45

export function PlanetHint() {
  const [seen, setSeen] = useState(() => readFlag(K_PLANET))
  const [mounted, setMounted] = useState(false)
  const [show, setShow] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const motion = useStore((s) => s.motion)
  const fp = useStore((s) => s.focusPhase)
  const dismiss = () => { writeFlag(K_PLANET); setSeen(true) }
  useEffect(() => { if (fp !== 'idle' && !seen) dismiss() }, [fp, seen])
  useEffect(() => {
    if (seen) return
    let shownMs = 0
    const id = setInterval(() => {
      const s = st()
      const z = s.phase === 'ready' && s.timelineId === 'main' ? zoneAt(timeline.t, 'main') : null
      const inRange = !!z && z.zone.id === SS_ZONE && z.local >= SS_FROM && z.local <= SS_TO && s.focusPhase === 'idle' && !s.gate && hintPos.on
      if (inRange) { shownMs += 120; setMounted(true) }
      else if (shownMs >= 1500 && z && (z.zone.index > ranges('main').findIndex((r) => r.id === SS_ZONE) || (z.zone.id === SS_ZONE && z.local > SS_TO))) { dismiss() } // seen it and scrolled on
      setShow(inRange)
    }, 120)
    const onDown = () => { if (st().phase === 'ready') { const z = zoneAt(timeline.t, 'main'); if (z?.zone.id === SS_ZONE && z.local >= SS_FROM - 0.02 && z.local <= SS_TO + 0.02) dismiss() } }
    const onKey = (e: KeyboardEvent) => { if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement | null)?.closest?.('button')) onDown() }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('click', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => { clearInterval(id); window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('click', onDown, true); window.removeEventListener('keydown', onKey, true) }
  }, [seen])
  useEffect(() => {
    if (!mounted || seen) return
    let raf = 0
    const loop = () => {
      const el = box.current
      if (el) {
        const w = el.offsetWidth || 220
        const x = Math.min(Math.max(hintPos.x, 12 + w / 2), (typeof innerWidth === 'number' ? innerWidth : 1280) - 12 - w / 2)
        el.style.transform = `translate(${hintPos.x}px, ${hintPos.y}px)`
        const cap = el.querySelector<HTMLElement>('[data-hint-caption]')
        if (cap) cap.style.transform = `translate(calc(-50% + ${x - hintPos.x}px), 0)`
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [mounted, seen])
  if (seen || !mounted) return null
  return (
    <div ref={box} data-testid="hint-planet" data-visible={show} role="note" className="pointer-events-none fixed left-0 top-0 z-30"
      style={{ opacity: show ? 1 : 0, transition: 'opacity .5s ease', willChange: 'transform' }}>
      <span className={motion === 'reduced' ? '' : 'astra-pulse'} style={{ position: 'absolute', left: 0, top: 0, width: 46, height: 46, borderRadius: 99, border: '1.5px solid var(--accent)', transform: 'translate(-50%,-50%)', boxShadow: '0 0 14px var(--accent)' }} />
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------- journey menu + share

async function copyText(text: string): Promise<boolean> {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true } } catch { /* fall through to the old way */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch { return false }
}

export function ExperienceTop() {
  const [open, setOpen] = useState(false)
  const fp = useStore((s) => s.focusPhase)
  const gate = useStore((s) => s.gate)
  const phase = useStore((s) => s.phase)
  const btn = useRef<HTMLButtonElement>(null)
  const canOpen = phase === 'ready' && fp === 'idle' && !gate
  useEffect(() => { if (open && !canOpen) setOpen(false) }, [open, canOpen])
  return (
    <>
      <div className="hud-fade fixed right-4 top-5 z-30 flex items-center gap-2 sm:right-7 sm:top-7" style={{ ['--d' as string]: '0.35s' }}>
        <button ref={btn} type="button" data-testid="journey-button" aria-haspopup="dialog" aria-expanded={open} disabled={!canOpen} onClick={() => setOpen(true)}
          className="hud-chip glass flex items-center gap-1.5 rounded px-2 py-1" style={{ opacity: canOpen ? 1 : 0.5 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          <span>Journey</span>
        </button>
        <SoundButton />
      </div>
      {open && <JourneyPanel onClose={() => { setOpen(false) }} returnTo={btn} />}
    </>
  )
}

function JourneyPanel({ onClose, returnTo }: { onClose: () => void; returnTo: React.RefObject<HTMLButtonElement | null> }) {
  const zi = useStore((s) => s.zoneIndex)
  const tl = useStore((s) => s.timelineId)
  const panel = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('')
  const rows = menuRows()
  const inFall = tl !== 'main'
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function' && isCoarse()
  const after = Math.max(0, rows.findIndex((r) => r.id === 'bh-approach'))

  useEffect(() => {
    lock()
    const items = () => [...(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])]
    const cur = panel.current?.querySelector<HTMLElement>('[aria-current="step"]:not([disabled])') ?? items()[0]
    cur?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') return // the mute key keeps working inside the menu
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return }
      const list = items()
      if (!list.length) return
      const i = list.indexOf(document.activeElement as HTMLElement)
      if (e.key === 'Tab') {
        if (i === -1) { e.preventDefault(); list[e.shiftKey ? list.length - 1 : 0].focus(); return }
        if (!e.shiftKey && i === list.length - 1) { e.preventDefault(); list[0].focus() } else if (e.shiftKey && i === 0) { e.preventDefault(); list[list.length - 1].focus() }
        return
      }
      const zoneBtns = list.filter((b) => b.dataset.zone)
      const zi2 = zoneBtns.indexOf(document.activeElement as HTMLElement)
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && zi2 !== -1) { e.preventDefault(); zoneBtns[(zi2 + (e.key === 'ArrowDown' ? 1 : -1) + zoneBtns.length) % zoneBtns.length].focus() }
      if (e.key === 'Home' && zoneBtns.length && zi2 !== -1) { e.preventDefault(); zoneBtns[0].focus() }
      if (e.key === 'End' && zoneBtns.length && zi2 !== -1) { e.preventDefault(); zoneBtns[zoneBtns.length - 1].focus() }
      e.stopPropagation() // while the menu is open nothing behind it (rail arrows, focus keys) reacts
    }
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true); unlock(); returnTo.current?.focus({ preventScroll: true }) }
  }, [])

  // adjacent = fly, far = the engine's cross-fade. The menu's cleanup restarts the scroller (unlock) which cancels any smooth scroll in progress,
  // so the jump starts only after the menu has closed and unlocked: otherwise a click on a neighbouring zone silently did nothing.
  const go = (i: number) => { onClose(); setTimeout(() => { void jumpToZone(i) }, 60) }
  const copy = async () => {
    const ok = await copyText(buildLink())
    setCopied(ok ? 'ok' : 'fail')
    setTimeout(() => setCopied(''), 2200)
    ;(panel.current?.querySelector('[data-testid=copy-link]') as HTMLElement | null)?.focus({ preventScroll: true })
  }
  const share = async () => { try { await navigator.share({ title: 'ASTRA', text: 'A scroll through the universe, from Earth to the edge of what we can see.', url: buildLink() }) } catch { /* cancelled */ } }

  return (
    <div className="fixed inset-0 z-[44] flex items-center justify-center p-3" style={{ background: 'rgba(2,3,10,.62)' }} data-testid="journey-backdrop" onClick={onClose}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="journey-title" data-testid="journey-menu" onClick={(e) => e.stopPropagation()}
        className="glass flex max-h-[92svh] w-[min(560px,100%)] flex-col overflow-hidden rounded-xl" style={{ background: 'rgba(6,9,20,.88)' }}>
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 id="journey-title" style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '1.5rem', margin: 0 }}>The journey</h2>
          <button type="button" data-testid="journey-close" aria-label="Close the menu (Esc)" onClick={onClose} className="hud-chip glass rounded px-2 py-1">Close · Esc</button>
        </div>
        <ol className="m-0 min-h-0 flex-1 list-none overflow-y-auto px-3 pb-2" style={{ padding: '0 12px 8px' }}>
          {rows.flatMap((r, n) => {
            const cur = !inFall && r.index === zi
            const out = [(
              <li key={r.id}>
                <button type="button" data-zone={r.id} data-testid={`menu-${r.id}`} aria-current={cur ? 'step' : undefined} disabled={inFall} onClick={() => go(r.index)}
                  className="w-full rounded-lg px-3 py-2 text-left" style={{ background: cur ? 'rgba(127,178,255,.12)' : 'transparent', border: `1px solid ${cur ? 'var(--accent)' : 'transparent'}`, color: 'var(--ink)', cursor: inFall ? 'default' : 'pointer', opacity: inFall ? 0.55 : 1 }}>
                  <span className="flex items-baseline justify-between gap-3">
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>{n + 1}. {r.title}</span>
                  </span>
                </button>
              </li>
            )]
            return out
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-2 px-5 pb-4 pt-2" style={{ borderTop: '1px solid var(--line)' }}>
          <button type="button" data-testid="copy-link" onClick={copy} className="hud-chip glass rounded px-3 py-1.5">Copy link</button>
          {canShare && <button type="button" data-testid="share-link" onClick={share} className="hud-chip glass rounded px-3 py-1.5">Share…</button>}
          <span data-testid="copied" role="status" aria-live="polite" className="hud-chip" style={{ color: 'var(--accent)', textTransform: 'none' }}>{copied === 'ok' ? 'Copied' : copied === 'fail' ? 'Could not copy: select the address bar instead' : ''}</span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------- shareable link

export function LinkSync() {
  const phase = useStore((s) => s.phase)
  const last = useRef('')
  const applied = useRef(false)
  const initial = useRef<ReturnType<typeof parseNow> | undefined>(undefined)
  if (initial.current === undefined) initial.current = parseNow(location.hash) // read once, before anything rewrites the hash

  const goFocus = (id: string | null) => { if (id) setTimeout(() => { const s = st(); if (s.focusPhase === 'idle' && !s.gate) void focus(id).catch(() => {}) }, 900) }

  // open the link right after the preloader: placed under the loading screen's fade (a cross-fade from black), never a fly-through
  useEffect(() => {
    if (phase !== 'ready' || applied.current) return
    applied.current = true
    const tgt = initial.current
    const T = tgt ? tOfTarget(tgt) : null
    if (tgt && T !== null) { scrollToT(T, true); timeline.snap(T); goFocus(tgt.focus) }
  }, [phase])

  // the URL follows the position: replaceState only, only when the text changes, at most ~2 per second (Safari throttles more)
  useEffect(() => {
    const id = setInterval(() => {
      if (!applied.current) return
      const h = hashNow()
      if (!h || h === last.current) return
      last.current = h
      try { history.replaceState(null, '', `${location.pathname}${location.search}${h}`) } catch { /* sandboxed frame or throttled: skip this one */ }
    }, 450)
    return () => clearInterval(id)
  }, [])

  // someone pastes a different link into this tab: cross-fade there
  useEffect(() => {
    const onHash = () => {
      if (!applied.current || location.hash === last.current) return
      const tgt = parseNow(location.hash)
      const T = tgt ? tOfTarget(tgt) : null
      if (tgt && T !== null) { void jumpToT(T).then(() => goFocus(tgt.focus)) }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return null
}
