import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import SectionShell from '@/components/layout/SectionShell'
import CanvasBoundary from '@/components/canvas/CanvasBoundary'
import { chapters } from '@/data/journey'
import { CONSTELLATIONS, DEEP_SKY, STARS } from '@/data/sky'
import { SITES, fmtLat, fmtLon, tonight, type Night, type Site } from '@/lib/astro'
import { describe, snapshot, where, type Snapshot } from '@/lib/skyInfo'
import { makeControl, pxPerDegree, type SkyControl } from '@/lib/skyView'
import { useRenderProfile } from '@/hooks/useRenderProfile'
import { useSectionProgress } from '@/hooks/useSectionProgress'
import { useStageLifecycle } from '@/hooks/useStageLifecycle'
import { beat } from '@/lib/beat'

const SkyScene = lazy(() => import('@/components/canvas/SkyScene'))

const chapter = chapters.find((c) => c.id === 'observatory')!
const next = chapters[chapters.indexOf(chapter) + 1]
const number = String(chapters.indexOf(chapter) + 1).padStart(2, '0')

// Hand-off from Chapter 05: this stage pins as Chapter 05's unpins (`-mt-[100svh]`). Its canvas gates in over the first ~7 %
// while Chapter 05 (see ChapterBlackHoles, `--obs-p`) fades out underneath: the light of the black hole goes out, and the
// stars come on one by one as the eyes adjust.
const GATE_IN = 'clamp(0, calc(var(--p) * 14), 1)'
const EXPLORE = 'clamp(0, calc((var(--p) - 0.66) * 14), 1)'
const shadow = '[text-shadow:0_0_3px_#03040a,0_0_10px_#03040a,0_0_18px_#03040a]'

const BEATS = [
  { label: 'Observatory · Here, tonight', title: 'Everything so far was measured from here.', line: 'Every distance in this journey was worked out from light that reached a place like this: one point on Earth, one night, looking up.', w: [0.05, 0.11, 0.2, 0.25] },
  { label: 'Dark adaptation', title: 'Let your eyes adjust.', line: 'Rod cells take about half an hour in the dark to reach full sensitivity. Each minute, fainter stars appear.', w: [0.22, 0.28, 0.38, 0.43] },
  { label: 'Sagittarius · 26,700 light-years', title: 'The black hole is up there.', line: 'Toward Sagittarius sits Sagittarius A*, 4.3 million Suns in mass. Dust hides it from the eye, but the direction is marked.', w: [0.42, 0.48, 0.58, 0.63] },
] as const

// One label element per object the scene can name. Rendered once; the scene moves them.
const LABELLED = [
  ...STARS.filter((s) => s.label >= 2).map((s) => ({ id: s.id, name: s.name, kind: s.kind })),
  ...DEEP_SKY.map((s) => ({ id: s.id, name: s.name, kind: s.kind })),
  ...['mercury', 'venus', 'mars', 'jupiter', 'saturn'].map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1), kind: 'planet' as const })),
  { id: 'moon', name: 'Moon', kind: 'moon' as const },
]
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

const btn = 'label pointer-events-auto transition-colors hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-signal'

/**
 * Chapter 06 — Observatory. The journey ends its outward leg and turns back to where every measurement was made: a
 * night sky, computed for a real place and time (Sun, Moon, planets and ~150 named stars, locally, no network).
 *
 * Scroll (1000svh): the black hole's light goes out, the stars come on in order of brightness (dark adaptation), the view
 * drops from the zenith to the horizon, and the Galactic Centre is marked. From ~66 % the controls appear and the
 * person can look around, scrub the night, and select objects. Reduced motion: no pinning, no intro; the finished sky.
 */
export default function ChapterObservatory() {
  const { animate } = useRenderProfile()
  const track = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const layer = useRef<HTMLDivElement>(null)
  const progress = useSectionProgress(track, stage, animate, '--obs-p')
  const { near, visible, ready, onReady } = useStageLifecycle(track)

  const [sites, setSites] = useState<Site[]>(SITES)
  const [site, setSite] = useState<Site>(SITES[0])
  const nightRef = useRef<Night>(null as unknown as Night)
  const ctrlRef = useRef<SkyControl>(null as unknown as SkyControl)
  if (!ctrlRef.current) {
    nightRef.current = tonight(SITES[0], Date.now())
    ctrlRef.current = makeControl(SITES[0], nightRef.current.at, nightRef.current.start, nightRef.current.end)
  }
  const ctrl = ctrlRef.current

  const [selected, setSelected] = useState<string | null>(null)
  const [play, setPlay] = useState(false)
  const [lines, setLines] = useState(true)
  const [names, setNames] = useState(true)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [geoNote, setGeoNote] = useState('')

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--obs-ready', ready && animate ? '1' : '0')
    return () => {
      root.style.removeProperty('--obs-ready')
    }
  }, [ready, animate])

  // Reflect React state into the shared control object.
  useEffect(() => { ctrl.selected = selected; ctrl.poke?.() }, [ctrl, selected])
  useEffect(() => { ctrl.play = play && animate; ctrl.poke?.() }, [ctrl, play, animate])
  useEffect(() => { ctrl.lines = lines; ctrl.poke?.() }, [ctrl, lines])
  useEffect(() => { ctrl.names = names; ctrl.poke?.() }, [ctrl, names])
  useEffect(() => {
    ctrl.onPlayEnd = () => setPlay(false)
    return () => { ctrl.onPlayEnd = null }
  }, [ctrl])

  // Sky Tonight: recomputed about once a second, and only re-rendered when the content changes.
  useEffect(() => {
    let lastT = Number.NaN
    let lastSite = ''
    const tick = () => {
      if (ctrl.t === lastT && ctrl.site.id === lastSite) return
      lastT = ctrl.t
      lastSite = ctrl.site.id
      const s = snapshot(ctrl.t, ctrl.site)
      setSnap((prev) => (prev && prev.key === s.key ? prev : s))
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [ctrl])

  const info = useMemo(() => (selected ? describe(selected, ctrl.t, site, nightRef.current) : null), [selected, site, ctrl, snap?.key])

  const changeSite = useCallback(
    (s: Site) => {
      const n = tonight(s, Date.now())
      nightRef.current = n
      ctrl.site = s
      ctrl.t = n.at
      ctrl.tMin = n.start
      ctrl.tMax = n.end
      ctrl.az = s.lat >= 0 ? 180 : 0
      ctrl.alt = 30
      ctrl.vAz = ctrl.vAlt = 0
      setSite(s)
      setSelected(null)
      setPlay(false)
      ctrl.poke?.()
    },
    [ctrl],
  )

  const onSite = (id: string) => {
    if (id === 'here') {
      if (!('geolocation' in navigator)) return setGeoNote('Location unavailable')
      setGeoNote('Locating…')
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const here: Site = { id: 'here', name: 'Your location', region: '', lat: pos.coords.latitude, lon: pos.coords.longitude, elevM: 0 }
          setSites([...SITES, here])
          setGeoNote('')
          changeSite(here)
        },
        () => setGeoNote('Location not shared'),
        { timeout: 8000, maximumAge: 600_000 },
      )
      return
    }
    const s = sites.find((x) => x.id === id)
    if (s) changeSite(s)
  }

  // ---- input
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({ moved: 0, pinch: 0, lastT: 0 })
  const active = () => (progress.current ?? 0) >= 0.12
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!active()) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    gesture.current = { moved: 0, pinch: pointers.current.size === 2 ? pinchDist() : 0, lastT: performance.now() }
    ctrl.vAz = ctrl.vAlt = 0
  }
  const pinchDist = () => {
    const [a, b] = [...pointers.current.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const h = e.currentTarget.clientHeight
    const dx = e.clientX - prev.x
    const dy = e.clientY - prev.y
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    gesture.current.moved += Math.abs(dx) + Math.abs(dy)
    if (pointers.current.size === 2) {
      const d = pinchDist()
      if (gesture.current.pinch > 0) ctrl.fov *= gesture.current.pinch / d
      gesture.current.pinch = d
      ctrl.touched = true
      ctrl.poke?.()
      return
    }
    if (gesture.current.moved < 4) return
    const deg = 1 / pxPerDegree(h, ctrl.fov)
    const now = performance.now()
    const dt = Math.max(1, now - gesture.current.lastT) / 1000
    gesture.current.lastT = now
    ctrl.az -= dx * deg
    ctrl.vAz = -(dx * deg) / dt
    if (e.pointerType !== 'touch') {
      ctrl.alt += dy * deg
      ctrl.vAlt = (dy * deg) / dt
    }
    ctrl.touched = true
    ctrl.poke?.()
  }
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.delete(e.pointerId)
    if (gesture.current.moved < 5 && pointers.current.size === 0) {
      const r = e.currentTarget.getBoundingClientRect()
      const id = ctrl.pickAt?.(e.clientX - r.left, e.clientY - r.top) ?? null
      setSelected(id)
    }
    if (performance.now() - gesture.current.lastT > 90) ctrl.vAz = ctrl.vAlt = 0
  }
  const onCancel = (e: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = Math.max(3, ctrl.fov / 12)
    const k = e.key
    if (k === 'ArrowLeft') ctrl.az -= step
    else if (k === 'ArrowRight') ctrl.az += step
    else if (k === 'ArrowUp') ctrl.alt += step
    else if (k === 'ArrowDown') ctrl.alt -= step
    else if (k === '+' || k === '=') ctrl.fov /= 1.15
    else if (k === '-' || k === '_') ctrl.fov *= 1.15
    else if (k === 'Escape') setSelected(null)
    else return
    e.preventDefault()
    ctrl.touched = true
    ctrl.poke?.()
  }
  // Ctrl/⌘ + wheel zooms. A plain wheel always scrolls the page.
  useEffect(() => {
    const el = layer.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !active()) return
      e.preventDefault()
      ctrl.fov *= Math.exp(e.deltaY * 0.002)
      ctrl.touched = true
      ctrl.poke?.()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctrl])

  // Controls become clickable once the opening is over (CSS can't branch on --p).
  useEffect(() => {
    const el = stage.current
    if (!el || !animate) return
    const upd = () => {
      const on = (progress.current ?? 0) >= 0.68
      if ((el.dataset.explore === 'true') !== on) el.dataset.explore = on ? 'true' : 'false'
    }
    upd()
    window.addEventListener('scroll', upd, { passive: true })
    return () => window.removeEventListener('scroll', upd)
  }, [animate, progress])

  const pinned = animate
  const head = pinned ? beat(0.05, 0.1) : undefined
  const explore = pinned ? { opacity: EXPLORE } : undefined
  const acts = 'pointer-events-none group-data-[explore=true]:pointer-events-auto'

  const beatsEl = BEATS.map((b, i) => (
    <div key={b.title} className={pinned ? 'col-start-1 row-start-1 self-end' : ''} style={pinned ? beat(b.w[0], b.w[1], b.w[2], b.w[3]) : undefined}>
      <p className="label">{b.label}</p>
      <h2 className="mt-3 max-w-2xl font-display text-3xl font-normal leading-[1.05] text-ink md:text-5xl">{b.title}</h2>
      <p className="mt-5 max-w-md text-base leading-relaxed text-ink-dim md:text-lg">{b.line}</p>
      {i === 2 && <p data-sky="sgra" className="label mt-4 text-ink-dim" />}
    </div>
  ))

  return (
    <SectionShell id="observatory" bleed className={pinned ? '-mt-[100svh]' : ''}>
      <div ref={track} className="relative" style={pinned ? { height: '1000svh' } : undefined}>
        <div
          ref={stage}
          data-explore={pinned ? undefined : 'true'}
          className={`group ${pinned ? 'sticky top-0 h-svh overflow-hidden' : 'relative h-[100svh] min-h-[560px] overflow-hidden'}`}
        >
          {/* Canvas */}
          <div className="absolute inset-0 bg-void" style={pinned ? { opacity: GATE_IN } : undefined}>
            <div aria-hidden="true" className="absolute inset-0 transition-opacity duration-[1800ms] ease-out" style={{ opacity: ready || !animate ? 1 : 0 }}>
              {near && (
                <CanvasBoundary>
                  <Suspense fallback={null}>
                    <SkyScene progress={progress} active={visible} stage={stage} ctrl={ctrl} onReady={onReady} />
                  </Suspense>
                </CanvasBoundary>
              )}
            </div>

            {/* Labels, moved by the scene every frame. */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
              {CONSTELLATIONS.map((c) => (
                <div key={c.id} data-sky-con={c.id} data-sky-name={c.name} className="absolute left-0 top-0 will-change-transform" style={{ opacity: 0 }}>
                  <p className={`label -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[0.625rem] text-ink-dim/80 ${shadow}`}>{c.name}</p>
                </div>
              ))}
              {COMPASS.map((c) => (
                <div key={c} data-sky-compass={c} className="absolute left-0 top-0 will-change-transform" style={{ opacity: 0 }}>
                  <p className={`label -translate-x-1/2 -translate-y-1/2 ${c.length === 1 ? 'text-ink-dim' : 'text-[0.625rem]'}`}>{c}</p>
                </div>
              ))}
              {LABELLED.map((o) => (
                <div key={o.id} data-sky-label={o.id} data-sky-name={o.name} className="group absolute left-0 top-0 will-change-transform" style={{ opacity: 0 }}>
                  {(o.kind === 'dso' || o.kind === 'centre') && (
                    <span className={`absolute -left-[7px] -top-[7px] h-[14px] w-[14px] ${o.kind === 'centre' ? 'rotate-45 border border-ink/70' : 'rounded-full border border-ink/50'}`} />
                  )}
                  <p
                    className={`label absolute whitespace-nowrap text-ink transition-opacity group-data-[sky-text='0']:opacity-0 ${shadow}`}
                    style={{ left: o.kind === 'moon' ? 14 : o.kind === 'planet' || o.kind === 'dso' || o.kind === 'centre' ? 12 : 8, top: -9 }}
                  >
                    {o.name}
                  </p>
                </div>
              ))}
              <div data-sky-ring className="absolute left-0 top-0 -ml-[17px] -mt-[17px] h-[34px] w-[34px] rounded-full border border-signal/80 transition-opacity duration-500" style={{ opacity: 0 }} />
            </div>

            {/* Look-around surface. Horizontal drag turns; vertical swipes still scroll the page on touch. */}
            <div
              ref={layer}
              role="application"
              tabIndex={0}
              aria-label="Night sky. Drag or use the arrow keys to look around, plus and minus to zoom, Escape to deselect."
              className={`absolute inset-0 cursor-grab touch-pan-y outline-none active:cursor-grabbing focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-signal/40 ${pinned ? 'pointer-events-auto' : 'pointer-events-auto'}`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onCancel}
              onKeyDown={onKey}
            />
          </div>

          {/* Keeps type legible at the lower left and under the controls. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background: 'linear-gradient(to top, rgb(3 4 10 / 0.7) 0%, rgb(3 4 10 / 0) 28%), radial-gradient(ellipse 55% 50% at 0% 100%, rgb(3 4 10 / 0.55) 0%, transparent 100%)',
              opacity: GATE_IN,
            }}
          />

          <div className="pointer-events-none relative mx-auto flex h-full w-full max-w-7xl flex-col px-6 md:px-10">
            {/* Header */}
            <div className={pinned ? 'pt-24' : 'pt-24'} style={head}>
              <div className="flex items-baseline justify-between">
                <p className="label">{number} — {chapter.title}</p>
                <p className="label">{chapter.scale}</p>
              </div>
              <div className="mt-4 h-px w-full bg-hairline">
                <div className="h-full origin-left bg-signal/60" style={{ transform: pinned ? 'scaleX(var(--p))' : 'scaleX(1)' }} />
              </div>
              <p className="label mt-3 flex flex-wrap justify-between gap-x-8">
                <span>
                  {site.name}{site.region ? `, ${site.region}` : ''} · {fmtLat(site.lat)} {fmtLon(site.lon)} · <span data-sky="date" /> · <span data-sky="time" className="text-ink-dim" /> local mean time
                </span>
                <span>
                  Facing <span data-sky="facing" className="text-ink-dim" />
                </span>
              </p>
              <p className="label mt-1.5 text-ink-dim">Sky tonight · {snap ? snap.summary : '…'}</p>
            </div>

            {/* Opening text */}
            {pinned && <div className="mt-auto grid pb-24 md:pb-28">{beatsEl}</div>}

            {/* Sky Tonight list (md+) */}
            <div className={`absolute left-6 top-48 hidden w-64 md:left-10 md:block ${acts}`} style={explore}>
              <p className="label mb-3">Sky tonight</p>
              <ul className="space-y-0.5">
                {(snap?.entries ?? []).slice(0, 6).map((en) => (
                  <li key={en.id}>
                    <button
                      type="button"
                      onClick={() => { setSelected(en.id); ctrl.focusOn?.(en.id) }}
                      className={`group/row pointer-events-auto grid w-full grid-cols-[1fr_auto] items-baseline gap-x-3 border-l py-1.5 pl-3 text-left transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-signal ${selected === en.id ? 'border-signal text-ink' : 'border-hairline text-ink-dim hover:border-ink/40 hover:text-ink'} ${shadow}`}
                    >
                      <span className="text-sm">{en.name}</span>
                      <span className="label text-[0.625rem]">{en.alt >= 0 ? `${Math.round(en.alt)}° ${where(en.alt, en.az).split('· ')[1]?.split(' ')[0] ?? ''}` : ''}</span>
                      <span className="label col-span-2 text-[0.625rem] normal-case tracking-wide">{en.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Object information */}
            {info && (
              <aside
                className={`absolute right-6 top-48 w-[min(19rem,calc(100%-3rem))] border-l border-hairline bg-void/60 py-3 pl-5 pr-3 backdrop-blur-sm md:right-10 ${acts}`}
                style={explore}
                aria-live="polite"
              >
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-display text-2xl leading-tight text-ink">{info.name}</h3>
                  <button type="button" onClick={() => setSelected(null)} className={`${btn} -mr-1 p-1`} aria-label="Close object information">×</button>
                </div>
                <p className="label mt-1">{info.subtitle}</p>
                <p data-sky="sel-pos" className="label mt-3 text-signal" />
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-sm">
                  {info.rows.map((r) => (
                    <div key={r.k} className="contents">
                      <dt className="label self-baseline">{r.k}</dt>
                      <dd className="text-right text-ink-dim">{r.v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 text-sm leading-relaxed text-ink-dim">{info.note}</p>
              </aside>
            )}

            {/* Controls */}
            <div className={`${pinned ? 'absolute inset-x-6 bottom-6 md:inset-x-10' : 'absolute inset-x-6 bottom-6 md:inset-x-10'} ${acts}`} style={explore}>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-hairline pt-4">
                <label className="flex items-center gap-2">
                  <span className="label">Site</span>
                  <select
                    value={site.id}
                    onChange={(e) => onSite(e.target.value)}
                    className="pointer-events-auto cursor-pointer border-b border-hairline bg-transparent py-0.5 font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-dim outline-none transition-colors hover:text-ink focus-visible:border-signal"
                    aria-label="Observing site"
                  >
                    {sites.map((s) => (
                      <option key={s.id} value={s.id} className="bg-deep text-ink">{s.name}</option>
                    ))}
                    <option value="here" className="bg-deep text-ink">My location…</option>
                  </select>
                  {geoNote && <span className="label text-[0.625rem] normal-case">{geoNote}</span>}
                </label>

                <div className="flex min-w-[12rem] flex-1 items-center gap-3">
                  {animate && (
                    <button type="button" onClick={() => setPlay((v) => !v)} className={btn} aria-pressed={play} aria-label={play ? 'Pause time-lapse' : 'Play time-lapse of the night'}>
                      {play ? 'Pause' : 'Play'}
                    </button>
                  )}
                  <input
                    data-sky="scrub"
                    type="range"
                    min={0}
                    max={1000}
                    defaultValue={Math.round(((ctrl.t - ctrl.tMin) / Math.max(1, ctrl.tMax - ctrl.tMin)) * 1000)}
                    onInput={(e) => {
                      ctrl.t = ctrl.tMin + (Number(e.currentTarget.value) / 1000) * (ctrl.tMax - ctrl.tMin)
                      ctrl.touched = true
                      ctrl.poke?.()
                    }}
                    aria-label="Time of night, dusk to dawn"
                    className="pointer-events-auto h-4 min-w-0 flex-1 cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-ink [&::-moz-range-track]:h-px [&::-moz-range-track]:bg-ink/25 [&::-webkit-slider-runnable-track]:h-px [&::-webkit-slider-runnable-track]:bg-ink/25 [&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-signal"
                  />
                </div>

                <div className="flex items-center gap-5">
                  <button type="button" onClick={() => setLines((v) => !v)} className={`${btn} ${lines ? 'text-ink-dim' : ''}`} aria-pressed={lines}>Figures</button>
                  <button type="button" onClick={() => setNames((v) => !v)} className={`${btn} ${names ? 'text-ink-dim' : ''}`} aria-pressed={names}>Names</button>
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={() => { ctrl.fov *= 1.2; ctrl.touched = true; ctrl.poke?.() }} className={`${btn} px-1`} aria-label="Zoom out">−</button>
                    <button type="button" onClick={() => { ctrl.fov /= 1.2; ctrl.touched = true; ctrl.poke?.() }} className={`${btn} px-1`} aria-label="Zoom in">+</button>
                  </span>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-6">
              {next && (
                <a
                  href={next.status === 'live' ? `#${next.id}` : '#journey'}
                  className="pointer-events-auto group/n inline-flex items-center gap-4 text-ink-dim transition-colors hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-signal"
                >
                  <span className="h-px w-8 bg-ink/30 transition-all duration-500 group-hover/n:w-14 group-hover/n:bg-signal" />
                  <span className="label text-current">Next · {next.title} · {next.scale} ↓</span>
                </a>
              )}
              <p className="label hidden text-[0.625rem] normal-case tracking-wide md:block">Computed locally. Named stars: real J2000 positions. Faint field: generated.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!pinned && <div className="mx-auto flex max-w-7xl flex-col gap-16 px-6 py-24 md:px-10">{beatsEl}</div>}
    </SectionShell>
  )
}
