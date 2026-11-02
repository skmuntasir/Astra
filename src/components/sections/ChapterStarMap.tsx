import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import SectionShell from '@/components/layout/SectionShell'
import CanvasBoundary from '@/components/canvas/CanvasBoundary'
import { chapters } from '@/data/journey'
import { BY_ID, STARS } from '@/data/sky'
import {
  FIGURES_OF, FIGURE_BY_ID, HR_POINTS, describeObject, figureMembers, fmtDecFull, fmtFov, fmtRaFull, isFigureId, makeMapControl,
  search, type Figure, type MapControl,
} from '@/lib/starMap'
import { useRenderProfile } from '@/hooks/useRenderProfile'
import { useStageLifecycle } from '@/hooks/useStageLifecycle'

const StarMapScene = lazy(() => import('@/components/canvas/StarMapScene'))

const chapter = chapters.find((c) => c.id === 'star-map')!
const next = chapters[chapters.indexOf(chapter) + 1]
const number = String(chapters.indexOf(chapter) + 1).padStart(2, '0')

const btn =
  'label pointer-events-auto transition-colors hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-signal'
const glass = 'pointer-events-auto border border-hairline bg-void/65 backdrop-blur-md'

/** One "kind" word for the badge in the panel. */
const KIND: Record<string, string> = { star: 'Star', dso: 'Deep sky', centre: 'Galactic Centre' }

/**
 * Chapter 07 — Star Map. After a night spent looking at the sky from one place (Chapter 06), the same stars are laid out
 * as a chart of the whole sphere: a dense field, constellation figures, and 148 named stars you can select to read their
 * distance and luminosity. Not pinned: it is an instrument to use, so the page scrolls normally around it.
 */
export default function ChapterStarMap() {
  const { animate, tier, maxDpr } = useRenderProfile()
  const stage = useRef<HTMLDivElement>(null)
  const { near, visible, ready, onReady } = useStageLifecycle(stage)
  const [ctrl] = useState<MapControl>(makeMapControl)

  // The opening flight starts when the instrument is well in view, not when its first pixel scrolls in.
  const [engaged, setEngaged] = useState(false)
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setEngaged(true), { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const [selected, setSelected] = useState<string | null>(null)
  const [figures, setFigures] = useState(true)
  const [names, setNames] = useState(true)
  const [grid, setGrid] = useState(true)
  const [ecliptic, setEcliptic] = useState(false)
  const [query, setQuery] = useState('')

  const ra = useRef<HTMLSpanElement>(null)
  const dec = useRef<HTMLSpanElement>(null)
  const fov = useRef<HTMLSpanElement>(null)

  useEffect(() => { ctrl.figures = figures; ctrl.poke?.() }, [ctrl, figures])
  useEffect(() => { ctrl.names = names; ctrl.poke?.() }, [ctrl, names])
  useEffect(() => { ctrl.grid = grid; ctrl.poke?.() }, [ctrl, grid])
  useEffect(() => { ctrl.ecliptic = ecliptic; ctrl.poke?.() }, [ctrl, ecliptic])
  useEffect(() => {
    ctrl.onSelect = (id) => setSelected(id)
    // Written straight to the DOM: the view changes every frame and must not cause React renders.
    ctrl.onView = (v) => {
      if (ra.current) ra.current.textContent = fmtRaFull(v.ra)
      if (dec.current) dec.current.textContent = fmtDecFull(v.dec)
      if (fov.current) fov.current.textContent = fmtFov(v.fov)
    }
    return () => {
      ctrl.onSelect = null
      ctrl.onView = null
    }
  }, [ctrl])

  const choose = useCallback(
    (id: string | null) => {
      ctrl.selected = id
      setSelected(id)
      if (id) ctrl.focusOn?.(id)
      ctrl.poke?.()
    },
    [ctrl],
  )

  const hits = useMemo(() => search(query), [query])
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && hits[0]) {
      choose(hits[0].id)
      setQuery('')
    } else if (e.key === 'Escape') setQuery('')
  }

  const year = useMemo(() => new Date().getFullYear(), [])
  const info = useMemo(() => (selected && !isFigureId(selected) ? describeObject(selected, year) : null), [selected, year])
  const figure: Figure | undefined = selected && isFigureId(selected) ? FIGURE_BY_ID[selected.slice(4)] : undefined
  const homeFigure = info && selected ? FIGURES_OF[selected]?.map((id) => FIGURE_BY_ID[id]).find((f) => !f.asterism) : undefined

  const toggles: [string, boolean, (v: boolean) => void][] = [
    ['Figures', figures, setFigures],
    ['Names', names, setNames],
    ['Grid', grid, setGrid],
    ['Ecliptic', ecliptic, setEcliptic],
  ]

  return (
    <SectionShell id={chapter.id} bleed>
      <div className="mx-auto max-w-7xl px-6 pb-12 pt-32 md:px-10">
        <p className="label">{number} — {chapter.title}</p>
        <h2 className="mt-6 max-w-3xl font-display text-4xl leading-tight md:text-6xl">Every star has an address.</h2>
        <p className="mt-6 max-w-2xl text-ink-dim md:text-lg">
          Flatten the night into a chart and the sky becomes a coordinate system: right ascension and declination, fixed to the
          stars rather than to any one place. Drag to travel, zoom to reveal fainter stars, select one to read how far it is and
          how brightly it really burns.
        </p>
      </div>

      <div ref={stage} className="relative h-[88svh] min-h-[600px] w-full overflow-hidden border-y border-hairline bg-void">
        <div className="absolute inset-0 transition-opacity duration-[1400ms]" style={{ opacity: ready ? 1 : 0 }}>
          {near && (
            <CanvasBoundary>
              <Suspense fallback={null}>
                <StarMapScene ctrl={ctrl} animate={animate} fieldCount={tier === 'low' ? 9000 : 22000} deepCount={tier === 'low' ? 30000 : 110000} maxDpr={maxDpr} active={visible && engaged} onReady={onReady} />
              </Suspense>
            </CanvasBoundary>
          )}
        </div>

        {/* Top bar: search and layers */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-3 p-4 md:p-6">
          <div className="relative w-[min(19rem,100%)]">
            <label className="sr-only" htmlFor="starmap-search">Find a star or constellation</label>
            <input
              id="starmap-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder="Find a star or constellation"
              autoComplete="off"
              spellCheck={false}
              className={`${glass} w-full px-4 py-2.5 font-mono text-xs tracking-[0.08em] text-ink placeholder:text-ink-faint focus-visible:outline focus-visible:outline-1 focus-visible:outline-signal`}
            />
            {hits.length > 0 && (
              <ul className={`${glass} absolute inset-x-0 top-full mt-1 max-h-72 overflow-auto py-1`} role="listbox" aria-label="Search results">
                {hits.map((h) => (
                  <li key={h.id} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onClick={() => {
                        choose(h.id)
                        setQuery('')
                      }}
                      className="flex w-full items-baseline justify-between gap-4 px-4 py-2 text-left transition-colors hover:bg-ink/5 focus-visible:bg-ink/5 focus-visible:outline-none"
                    >
                      <span className="text-sm text-ink">{h.name}</span>
                      <span className="label truncate text-[0.625rem]">{h.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={`${glass} flex items-center gap-5 px-4 py-2.5`} role="group" aria-label="Map layers">
            {toggles.map(([label, on, set]) => (
              <button key={label} type="button" onClick={() => set(!on)} aria-pressed={on} className={`${btn} ${on ? 'text-ink' : ''}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Zoom */}
        <div className={`${glass} absolute left-4 top-1/2 z-10 flex -translate-y-1/2 flex-col md:left-6`} role="group" aria-label="Zoom">
          <button type="button" onClick={() => ctrl.zoomBy?.(0.62)} className={`${btn} px-3 py-2.5 text-base`} aria-label="Zoom in">+</button>
          <span className="mx-2 h-px bg-hairline" />
          <button type="button" onClick={() => ctrl.zoomBy?.(1.6)} className={`${btn} px-3 py-2.5 text-base`} aria-label="Zoom out">−</button>
          <span className="mx-2 h-px bg-hairline" />
          <button type="button" onClick={() => ctrl.reset?.()} className={`${btn} px-3 py-2.5`} aria-label="Return to Orion and Taurus">⌂</button>
        </div>

        {/* Readout */}
        <div className="pointer-events-none absolute bottom-4 left-4 z-10 hidden gap-5 md:bottom-6 md:left-6 md:flex" aria-hidden>
          <span className="label">RA <span ref={ra} className="text-ink-dim">—</span></span>
          <span className="label">Dec <span ref={dec} className="text-ink-dim">—</span></span>
          <span className="label">Field <span ref={fov} className="text-ink-dim">—</span></span>
        </div>
        <p className="label pointer-events-none absolute bottom-4 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap text-[0.625rem] md:bottom-6 md:block">
          Drag to pan · Click the map, then scroll to zoom · Click a star
        </p>

        {/* Information panel */}
        {(info || figure) && (
          <aside
            aria-live="polite"
            className={`${glass} absolute inset-x-3 bottom-3 z-30 max-h-[52%] overflow-y-auto p-5 md:inset-x-auto md:bottom-6 md:right-6 md:top-[4.75rem] md:max-h-none md:w-[22.5rem]`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="label text-signal">{info ? KIND[info.kind] ?? 'Object' : figure?.asterism ? 'Asterism' : 'Constellation'}</p>
                <h3 className="mt-2 font-display text-3xl leading-tight">{info?.name ?? figure?.name}</h3>
                {info && <p className="label mt-2 normal-case tracking-wide">{info.subtitle}</p>}
              </div>
              <button type="button" onClick={() => choose(null)} className={`${btn} -mr-2 -mt-1 p-2 text-base`} aria-label="Close panel">×</button>
            </div>

            {info && <ObjectPanel id={info.id} rows={info.rows} note={info.note} onFigure={homeFigure ? () => choose(`con:${homeFigure.id}`) : undefined} figureName={homeFigure?.name} />}
            {figure && <FigurePanel figure={figure} onPick={choose} />}
          </aside>
        )}
      </div>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 md:flex-row md:items-start md:justify-between md:px-10">
        <p className="label max-w-3xl text-[0.625rem] normal-case leading-relaxed tracking-wide">
          Named stars: real J2000 positions, magnitudes, colours and rounded distances (several are uncertain by 10 % or more).
          The dense faint field, and the fainter stars revealed when you zoom in, are generated for texture and are not a catalogue. Constellation figures are simplified stick figures,
          not IAU boundaries. Luminosity is visual, not bolometric, so very hot and very cool stars are understated.
        </p>
        {next && (
          <a
            href={next.status === 'live' ? `#${next.id}` : '#journey'}
            className="group/n inline-flex shrink-0 items-center gap-4 text-ink-dim transition-colors hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-signal"
          >
            <span className="h-px w-8 bg-ink/30 transition-all duration-500 group-hover/n:w-14 group-hover/n:bg-signal" />
            <span className="label text-current">Next · {next.title} · {next.scale} ↓</span>
          </a>
        )}
      </div>
    </SectionShell>
  )
}

// ---------------------------------------------------------------------------------------------------------------------

function ObjectPanel({ id, rows, note, onFigure, figureName }: { id: string; rows: { k: string; v: string }[]; note: string; onFigure?: () => void; figureName?: string }) {
  const o = BY_ID[id]
  const lead = rows.filter((r) => r.k === 'Distance' || r.k === 'Luminosity')
  const rest = rows.filter((r) => !lead.includes(r))
  return (
    <>
      {lead.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-4 border-y border-hairline py-4">
          {lead.map((r) => (
            <div key={r.k}>
              <p className="label text-[0.625rem]">{r.k}</p>
              <p className="mt-1 font-display text-lg leading-snug text-ink">{r.v.replace(' (visual)', '')}</p>
            </div>
          ))}
        </div>
      )}
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm">
        {rest.map((r) => (
          <div key={r.k} className="contents">
            <dt className="label self-baseline text-[0.625rem]">{r.k}</dt>
            <dd className="self-baseline text-right text-ink-dim">{r.v}</dd>
          </div>
        ))}
      </dl>
      {o?.kind === 'star' && o.ly && o.bv !== undefined && <HrDiagram id={id} />}
      {note && <p className="mt-5 text-sm leading-relaxed text-ink-dim">{note}</p>}
      {onFigure && (
        <button type="button" onClick={onFigure} className={`${btn} mt-5 inline-flex items-center gap-3 text-ink-dim`}>
          <span className="h-px w-6 bg-ink/30" />
          {figureName} · see the figure
        </button>
      )}
    </>
  )
}

const lyText = (ly: number) => (ly < 100 ? `${ly}` : `${Math.round(ly).toLocaleString('en-US')}`)

function FigurePanel({ figure, onPick }: { figure: Figure; onPick: (id: string) => void }) {
  const members = useMemo(() => figureMembers(figure), [figure])
  const known = members.filter((m) => m.ly !== null)
  const nearest = known[0]
  const farthest = known[known.length - 1]
  const max = Math.max(1, ...known.map((m) => m.ly as number))
  return (
    <>
      <p className="mt-5 text-sm leading-relaxed text-ink-dim">
        {nearest && farthest && nearest !== farthest
          ? `The lines join stars that only look close together. ${nearest.name} is about ${lyText(nearest.ly as number)} light-years away; ${farthest.name} about ${lyText(farthest.ly as number)}. The figure is a pattern in projection, not a place in space.`
          : 'A pattern drawn on the sky: the stars it joins are at very different distances.'}
      </p>
      <p className="label mt-6 text-[0.625rem]">Stars, nearest first</p>
      <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
        {members.map((m) => (
          <li key={m.id}>
            <button type="button" onClick={() => onPick(m.id)} className="group/m grid w-full grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 py-2.5 text-left focus-visible:outline-none">
              <span className="text-sm text-ink transition-colors group-hover/m:text-signal group-focus-visible/m:text-signal">{m.name}</span>
              <span className="label text-[0.625rem]">{m.ly === null ? '—' : m.ly < 100 ? `${m.ly} ly` : `≈ ${lyText(m.ly)} ly`}</span>
              {m.ly !== null && (
                <span className="col-span-2 h-px bg-ink/10">
                  <span className="block h-px bg-signal/70" style={{ width: `${Math.max(2, (Math.log10(m.ly + 1) / Math.log10(max + 1)) * 100)}%` }} />
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <p className="label mt-3 text-[0.625rem] normal-case tracking-wide">Bars use a logarithmic distance scale.</p>
    </>
  )
}

/** Hertzsprung–Russell diagram: temperature (hot to the left) against visual luminosity, for every catalogue star that has both. */
function HrDiagram({ id }: { id: string }) {
  const W = 232
  const H = 128
  const pad = { l: 30, r: 8, t: 8, b: 22 }
  const x = (logT: number) => pad.l + (1 - (logT - 3.4) / (4.65 - 3.4)) * (W - pad.l - pad.r)
  const y = (logL: number) => pad.t + (1 - (logL + 1) / 7.5) * (H - pad.t - pad.b)
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
  const me = HR_POINTS.find((p) => p.id === id)
  const xt: [number, string][] = [[Math.log10(30000), '30 000'], [Math.log10(10000), '10 000'], [Math.log10(5000), '5 000'], [Math.log10(3000), '3 000']]
  const yt: [number, string][] = [[0, '1'], [2, '10²'], [4, '10⁴'], [6, '10⁶']]
  return (
    <figure className="mt-5">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Hertzsprung–Russell diagram with this star highlighted">
        {yt.map(([v, t]) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="rgb(232 236 244 / 0.08)" />
            <text x={pad.l - 5} y={y(v) + 3} textAnchor="end" fontSize="8" fill="#5d667c" fontFamily="ui-monospace, Menlo, monospace">{t}</text>
          </g>
        ))}
        {xt.map(([v, t]) => (
          <g key={t}>
            <line x1={x(v)} x2={x(v)} y1={pad.t} y2={H - pad.b} stroke="rgb(232 236 244 / 0.08)" />
            <text x={x(v)} y={H - pad.b + 11} textAnchor="middle" fontSize="8" fill="#5d667c" fontFamily="ui-monospace, Menlo, monospace">{t}</text>
          </g>
        ))}
        {HR_POINTS.map((p) => (
          <circle key={p.id} cx={x(p.logT)} cy={clamp(y(p.logL), pad.t, H - pad.b)} r="1.5" fill="rgb(232 236 244 / 0.4)" />
        ))}
        {me && (
          <>
            <circle cx={x(me.logT)} cy={clamp(y(me.logL), pad.t, H - pad.b)} r="7" fill="none" stroke="#8fb4ff" strokeWidth="1" />
            <circle cx={x(me.logT)} cy={clamp(y(me.logL), pad.t, H - pad.b)} r="2.6" fill="#8fb4ff" />
          </>
        )}
        <text x={W - pad.r} y={H - 2} textAnchor="end" fontSize="8" fill="#5d667c" fontFamily="ui-monospace, Menlo, monospace">SURFACE TEMPERATURE, K →</text>
      </svg>
      <figcaption className="label mt-1 text-[0.625rem] normal-case tracking-wide">
        Luminosity (Suns) against temperature, {HR_POINTS.length} of {STARS.length} catalogue stars. Hot is to the left.
      </figcaption>
    </figure>
  )
}
