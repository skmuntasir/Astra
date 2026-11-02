import { lazy, Suspense, useEffect, useRef } from 'react'
import SectionShell from '@/components/layout/SectionShell'
import CanvasBoundary from '@/components/canvas/CanvasBoundary'
import { chapters } from '@/data/journey'
import { BEATS, LADDER, NOTES } from '@/lib/blackHole'
import { useRenderProfile } from '@/hooks/useRenderProfile'
import { useSectionProgress } from '@/hooks/useSectionProgress'
import { useStageLifecycle } from '@/hooks/useStageLifecycle'
import { beat } from '@/lib/beat'

const BlackHoleScene = lazy(() => import('@/components/canvas/BlackHoleScene'))

const chapter = chapters.find((c) => c.id === 'black-holes')!
const next = chapters[chapters.indexOf(chapter) + 1]
const number = String(chapters.indexOf(chapter) + 1).padStart(2, '0')

// Hand-off from Chapter 04: this stage pins as Chapter 04's unpins (`-mt-[100svh]`). The canvas fades in over the first ~7 %
// while Chapter 04 (see ChapterCosmicScale, `--bh-p`) fades out underneath: a dissolve through darkness to a single point.
const GATE_IN = 'clamp(0, calc(var(--p) * 14), 1)'
// Hand-off to Chapter 06 (Observatory): inert until that chapter publishes `--obs-p` / `--obs-ready`. Everything of this
// chapter fades over the first ~8 % of Chapter 06's progress, underneath its darkening canvas.
const HAND_OFF = 'calc(1 - var(--obs-ready, 0) * clamp(0, calc(var(--obs-p, 0) * 12), 1))'
const labelShadow = '[text-shadow:0_0_3px_#03040a,0_0_10px_#03040a,0_0_18px_#03040a]'

/**
 * Chapter 05 — Black Holes. Same skeleton as the other pinned chapters (tall track, sticky stage, `--p`). The canvas is one
 * ray-traced view of a 10-solar-mass black hole; scroll moves the camera from 3,000 rs to under 10 rs.
 *
 * Reduced motion: no pinning, no camera move, no disc rotation. One still frame above the same beats as a stacked list,
 * with the scale ladder shown in full.
 */
export default function ChapterBlackHoles() {
  const { animate } = useRenderProfile()
  const track = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const progress = useSectionProgress(track, stage, animate, '--bh-p')
  const { near, visible, ready, onReady } = useStageLifecycle(track)

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--bh-ready', ready && animate ? '1' : '0')
    return () => {
      root.style.removeProperty('--bh-ready')
    }
  }, [ready, animate])

  const pinned = animate
  const head = pinned ? beat(0.05, 0.1) : undefined
  const layer = pinned ? 'col-start-1 row-start-1 self-end' : ''
  const last = BEATS.length - 1

  return (
    <SectionShell id="black-holes" bleed className={pinned ? '-mt-[100svh]' : ''}>
      <div ref={track} className="relative" style={pinned ? { height: '1100svh' } : undefined}>
        <div ref={stage} className={pinned ? 'sticky top-0 h-svh overflow-hidden' : 'relative overflow-hidden pt-16'}>
          <div
            className={`pointer-events-none ${pinned ? 'absolute inset-0' : 'relative h-[80svh] bg-void'}`}
            style={pinned ? { opacity: `min(${GATE_IN}, ${HAND_OFF})` } : undefined}
          >
            <div
              className="absolute inset-0 bg-void transition-opacity duration-[1800ms] ease-out"
              style={{ opacity: 1 }}
            />
            <div aria-hidden="true" className={`absolute inset-0 transition-opacity duration-[1800ms] ease-out`} style={{ opacity: ready || !animate ? 1 : 0 }}>
              {near && (
                <CanvasBoundary>
                  <Suspense fallback={null}>
                    <BlackHoleScene progress={progress} active={visible} stage={stage} onReady={onReady} />
                  </Suspense>
                </CanvasBoundary>
              )}
            </div>

            <div className="absolute inset-0 overflow-hidden">
              <div
                data-bh-horizon
                aria-hidden="true"
                className="absolute left-0 top-0 rounded-full border border-dashed border-ink/55"
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              {NOTES.map((n) => (
                <div
                  key={n.id}
                  data-bh-note={n.id}
                  className={`absolute left-0 top-0 will-change-transform ${n.phone ? '' : 'hidden md:block'}`}
                  style={{ opacity: 0 }}
                >
                  <span className="absolute -left-[3px] -top-[3px] h-[7px] w-[7px] rounded-full bg-ink/80 shadow-[0_0_6px_2px_#03040a]" />
                  <span
                    className="absolute left-0 top-0 h-px bg-ink/35"
                    style={{
                      width: Math.hypot(n.dx, n.dy),
                      transformOrigin: '0 50%',
                      transform: `rotate(${(Math.atan2(n.dy, n.dx) * 180) / Math.PI}deg)`,
                    }}
                  />
                  <p
                    className={`label absolute whitespace-nowrap text-ink ${labelShadow}`}
                    style={{
                      left: n.dx + (n.dx < 0 ? -8 : n.dx === 0 ? 0 : 8),
                      top: n.dy,
                      transform: n.dx < 0 ? 'translate(-100%, -50%)' : n.dx === 0 ? 'translate(-50%, -50%)' : 'translateY(-50%)',
                      textAlign: n.dx < 0 ? 'right' : n.dx === 0 ? 'center' : 'left',
                    }}
                  >
                    {n.name}
                    <span className="mt-1 hidden text-ink/70 md:block">{n.data}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Keeps the type legible where it crosses the disc's glow. */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 ${pinned ? '' : 'hidden'}`}
            style={{
              background: 'radial-gradient(ellipse 60% 55% at 0% 100%, rgb(3 4 10 / 0.8) 0%, rgb(3 4 10 / 0.45) 45%, transparent 100%)',
              opacity: `min(${GATE_IN}, ${HAND_OFF})`,
            }}
          />

          <div className="pointer-events-none absolute bottom-24 right-6 hidden text-right md:block md:right-10" style={pinned ? { opacity: `min(clamp(0, calc((var(--p) - 0.08) * 12), 1), ${HAND_OFF})` } : undefined}>
            <p data-hud="bar-text" className="label mb-2 min-h-[1em] text-ink-dim" />
            <div data-hud="bar-line" className="ml-auto h-[7px] border-x border-b border-ink/50" style={{ width: 140 }} />
          </div>

          <div className={`pointer-events-none relative mx-auto flex w-full max-w-7xl flex-col px-6 md:px-10 ${pinned ? 'h-full' : ''}`} style={pinned ? { opacity: HAND_OFF } : undefined}>
            <div className={pinned ? 'pt-24' : 'pt-8'} style={head}>
              <div className="flex items-baseline justify-between">
                <p className="label">
                  {number} — {chapter.title}
                </p>
                <p className="label">{chapter.scale}</p>
              </div>
              <div className="mt-4 h-px w-full bg-hairline">
                <div className="h-full origin-left bg-signal/60" style={{ transform: pinned ? 'scaleX(var(--p))' : 'scaleX(1)' }} />
              </div>
              <p className="label mt-3 flex flex-wrap justify-between gap-x-8">
                <span>10 M☉ · Non-spinning · 1 rs = 29.5 km</span>
                <span>
                  Distance <span data-hud="dist" className="text-ink-dim" />
                </span>
              </p>
            </div>

            <div className={`pb-20 md:pb-24 ${pinned ? 'mt-auto grid' : 'mt-16 flex flex-col gap-16'}`}>
              {BEATS.map((b, i) => {
                const style = pinned ? beat(b.w[0], b.w[1], b.w[2], b.w[3]) : undefined
                return (
                  <div key={b.title} className={layer} style={style}>
                    <p className="label">{b.label}</p>
                    <h2 className="mt-3 max-w-2xl font-display text-3xl font-normal leading-[1.05] text-ink md:text-5xl">{b.title}</h2>
                    <p className="mt-5 max-w-md text-base leading-relaxed text-ink-dim md:text-lg">{b.line}</p>
                    {i === last && (
                      <>
                        <dl className="mt-6 grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm text-ink-dim">
                          {LADDER.map((l) => (
                            <div key={l.name} className="contents">
                              <dt className={l.name === 'This black hole' ? 'text-ink' : ''}>
                                {l.name} <span className="label ml-1">{l.mass}</span>
                              </dt>
                              <dd className={`text-right ${l.name === 'This black hole' ? 'text-ink' : ''}`}>{l.radius}</dd>
                            </div>
                          ))}
                        </dl>
                        <p className="label mt-3">Horizon radius for each mass</p>
                        {next && (
                          <div style={pinned ? beat(0.975, 0.99) : undefined}>
                            <a
                              href={next.status === 'live' ? `#${next.id}` : '#journey'}
                              className="pointer-events-auto group mt-8 inline-flex items-center gap-5 text-ink-dim transition-colors hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-8 focus-visible:outline-signal"
                            >
                              <span className="h-px w-12 bg-ink/30 transition-all duration-500 group-hover:w-20 group-hover:bg-signal" />
                              <span className="label text-[0.8125rem] text-current">
                                Next · {next.title} · {next.scale}{' '}
                                <span aria-hidden="true" className="inline-block transition-transform duration-500 group-hover:translate-y-1">
                                  ↓
                                </span>
                              </span>
                            </a>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </SectionShell>
  )
}
