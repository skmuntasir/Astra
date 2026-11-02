import { lazy, Suspense, useRef } from 'react'
import SectionShell from '@/components/layout/SectionShell'
import CanvasBoundary from '@/components/canvas/CanvasBoundary'
import { chapters } from '@/data/journey'
import { useRenderProfile } from '@/hooks/useRenderProfile'
import { useSectionProgress } from '@/hooks/useSectionProgress'
import { useStageLifecycle } from '@/hooks/useStageLifecycle'
import { beat } from '@/lib/beat'

// Same three/R3F chunk as the star field and Earth; only this scene's code and texture load on demand.
const MoonScene = lazy(() => import('@/components/canvas/MoonScene'))

const chapter = chapters.find((c) => c.id === 'moon')!
const next = chapters[chapters.indexOf(chapter) + 1]
const number = String(chapters.indexOf(chapter) + 1).padStart(2, '0')

// Approximate figures (see PROJECT_STATUS.md §10): verify before treating as authoritative.
const facts = [
  { k: 'Mean diameter', v: '3,474 km' },
  { k: 'Surface gravity', v: '1.62 m/s²' },
  { k: 'Orbital period', v: '27.3 days' },
  { k: 'Surface temperature', v: '−173 to 127 °C' },
  { k: 'Age', v: '4.5 billion years' },
]

// Selenographic coordinates, positive N / E. The scene projects these onto the disc each frame.
// Hand-off to Chapter 03 (see ChapterSolarSystem): once that chapter's identical canvas has taken over, this one drops out
// (a step, not a fade: the two frames match). Both vars are published on <html>; without them nothing changes.
const HAND_OFF = 'calc(1 - var(--solar-ready, 0) * clamp(0, calc(var(--solar-p, 0) * 3000), 1))'
// This chapter's text lifts away with the stage as it unpins; it also fades, so it has cleared before Chapter 03's header arrives.
const TEXT_AWAY = 'calc(1 - clamp(0, calc(var(--solar-p, 0) * 12), 1))'

const markers = [
  { name: 'Tranquility Base', data: '0.67°N 23.47°E · Apollo 11', lat: 0.674, lon: 23.473, className: 'hidden md:block' },
  { name: 'Mare Crisium', data: '17.0°N 59.1°E · Ø 555 km', lat: 17.0, lon: 59.1, className: 'hidden md:block' },
]

/**
 * Chapter 02 — Moon. Same structure as Chapter 01: a tall track pins a full-viewport stage; scroll progress drives the
 * camera and the text. Layers (back → front): global StarField (-z-10) → Earth + Moon canvas → surface markers →
 * left-side scrim → text. The first frame is Chapter 01's last frame; the camera then leaves Earth for the Moon.
 * With reduced motion there is no pinning or camera move: one still, finished composition (the Moon) above the text.
 */
export default function ChapterMoon() {
  const { animate } = useRenderProfile()
  const track = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const readout = useRef<HTMLSpanElement>(null)
  const markerLayer = useRef<HTMLDivElement>(null)
  const progress = useSectionProgress(track, stage, animate)

  const { near, visible, ready, onReady } = useStageLifecycle(track)

  const pinned = animate
  const b1 = pinned ? beat(0.03, 0.1, 0.3, 0.38) : undefined
  const b2 = pinned ? beat(0.5, 0.6, 0.74, 0.8) : undefined
  const b3 = pinned ? beat(0.82, 0.9) : undefined
  const layer = pinned ? 'col-start-1 row-start-1 self-end' : ''

  return (
    <SectionShell id="moon" bleed>
      <div ref={track} className="relative" style={pinned ? { height: '420svh' } : undefined}>
        <div ref={stage} className={pinned ? 'sticky top-0 h-svh overflow-hidden' : 'relative overflow-hidden pt-16'}>
          {/* Reduced motion: the still Moon gets its own block above the text instead of sitting behind it. */}
          <div className={pinned ? 'absolute inset-0' : 'contents'} style={pinned ? { opacity: HAND_OFF } : undefined}>
          <div
            className={`pointer-events-none transition-opacity duration-[1800ms] ease-out ${pinned ? 'absolute inset-0' : 'relative h-[75svh]'}`}
            style={{ opacity: ready ? 1 : 0 }}
          >
            <div aria-hidden="true" className="absolute inset-0">
              {near && (
                <CanvasBoundary>
                  <Suspense fallback={null}>
                    <MoonScene progress={progress} active={visible} readout={readout} markerLayer={markerLayer} onReady={onReady} />
                  </Suspense>
                </CanvasBoundary>
              )}
            </div>

            {/* Surface annotations. The scene moves and fades these every frame; they hold the real text. */}
            <div ref={markerLayer} className="absolute inset-0 overflow-hidden">
              {markers.map((m) => (
                <div
                  key={m.name}
                  data-lat={m.lat}
                  data-lon={m.lon}
                  className={`absolute left-0 top-0 will-change-transform ${m.className}`}
                  style={{ opacity: 0 }}
                >
                  <span className="absolute -left-[5px] -top-[5px] h-[9px] w-[9px] rounded-full border border-ink/80 shadow-[0_0_6px_2px_#03040a]" />
                  <span className="absolute left-1 top-0 h-px w-12 bg-ink/40" />
                  <p className="label absolute left-[3.75rem] -top-[0.55rem] whitespace-nowrap text-ink [text-shadow:0_0_3px_#03040a,0_0_10px_#03040a,0_0_18px_#03040a]">
                    {m.name}
                    <span className="mt-1 block text-ink/75">{m.data}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
          </div>

          {/* Keeps the type legible where it crosses the Earth or the Moon's lit side. */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 ${pinned ? '' : 'hidden'}`}
            style={{ background: 'linear-gradient(90deg, rgb(3 4 10 / 0.7) 0%, rgb(3 4 10 / 0.35) 34%, transparent 58%)' }}
          />

          <div
            className={`relative mx-auto flex w-full max-w-7xl flex-col px-6 md:px-10 ${pinned ? 'h-full' : ''}`}
            style={pinned ? { opacity: TEXT_AWAY } : undefined}
          >
            <div className={pinned ? 'pt-24' : 'pt-8'}>
              <div className="flex items-baseline justify-between">
                <p className="label">{number} — {chapter.title}</p>
                <p className="label">{chapter.scale}</p>
              </div>
              <div className="mt-4 h-px w-full bg-hairline">
                <div
                  className="h-full origin-left bg-signal/60"
                  style={{ transform: pinned ? 'scaleX(var(--p))' : 'scaleX(1)' }}
                />
              </div>
              <p className="label mt-3 flex flex-wrap gap-x-8">
                <span>
                  Distance from Earth <span ref={readout}>{pinned ? '0' : '384,400'}</span> km
                </span>
                <span className="hidden sm:inline">Sizes true · distance compressed</span>
              </p>
            </div>

            <div className={`pb-20 md:pb-24 ${pinned ? 'mt-auto grid' : 'mt-16 flex flex-col gap-20'}`}>
              <p className={`${layer} max-w-xl font-display text-2xl leading-snug text-ink md:text-4xl`} style={b1}>
                Light crosses the gap in 1.3 seconds. The Apollo crews needed three days.
              </p>

              <div className={layer} style={b2}>
                <h2 className="font-display text-[clamp(3.5rem,12vw,10rem)] font-normal uppercase leading-[0.9] tracking-[-0.01em] text-ink">
                  {chapter.title}
                </h2>
                <p className="mt-8 max-w-md text-lg leading-relaxed text-ink-dim md:text-xl">{chapter.summary}</p>
              </div>

              <div className={layer} style={b3}>
                <dl className="grid max-w-xl grid-cols-2 gap-x-10 gap-y-6">
                  {facts.map((f) => (
                    <div key={f.k}>
                      <dt className="label">{f.k}</dt>
                      <dd className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-ink-dim">{f.v}</dd>
                    </div>
                  ))}
                </dl>
                {next && (
                  <a
                    href={next.status === 'live' ? `#${next.id}` : '#journey'}
                    className="pointer-events-auto group mt-12 inline-flex items-center gap-5 text-ink-dim transition-colors hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-8 focus-visible:outline-signal"
                  >
                    <span className="h-px w-12 bg-ink/30 transition-all duration-500 group-hover:w-20 group-hover:bg-signal" />
                    <span className="label text-[0.8125rem] text-current">
                      Next · {next.title} · {next.scale}{' '}
                      <span aria-hidden="true" className="inline-block transition-transform duration-500 group-hover:translate-y-1">
                        ↓
                      </span>
                    </span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionShell>
  )
}
