import { lazy, Suspense, useRef } from 'react'
import SectionShell from '@/components/layout/SectionShell'
import CanvasBoundary from '@/components/canvas/CanvasBoundary'
import ExoplanetAtlas from '@/components/sections/ExoplanetAtlas'
import { chapters } from '@/data/journey'
import { BEATS, SCENE_LABELS, SYSTEM_PLANETS, TARGET_NAME } from '@/lib/deepSpace'
import { useRenderProfile } from '@/hooks/useRenderProfile'
import { useSectionProgress } from '@/hooks/useSectionProgress'
import { useStageLifecycle } from '@/hooks/useStageLifecycle'
import { beat } from '@/lib/beat'

const DeepSpaceScene = lazy(() => import('@/components/canvas/DeepSpaceScene'))

const chapter = chapters.find((c) => c.id === 'deep-space')!
const number = String(chapters.indexOf(chapter) + 1).padStart(2, '0')
const labelShadow = '[text-shadow:0_0_3px_#03040a,0_0_10px_#03040a,0_0_18px_#03040a]'

/**
 * Chapter 08 — Deep Space. A pinned flight from the Sun to Kepler-186 (580 light-years), then the exoplanet atlas.
 * Same skeleton as the other pinned chapters: a tall track, a sticky stage, `--p` driving the text in CSS.
 *
 * Reduced motion: no pinning, no flight, no orbital motion. One still of the finished view (the Kepler-186 system) above
 * the same beats as a stacked list.
 */
export default function ChapterDeepSpace() {
  const { animate } = useRenderProfile()
  const track = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const progress = useSectionProgress(track, stage, animate)
  const { near, visible, ready, onReady } = useStageLifecycle(track)

  const pinned = animate
  const head = pinned ? beat(0.02, 0.06) : undefined
  const layer = pinned ? 'col-start-1 row-start-1 self-end' : ''
  const last = BEATS.length - 1

  return (
    <>
      <SectionShell id={chapter.id} bleed>
        <div ref={track} className="relative" style={pinned ? { height: '1200svh' } : undefined}>
          <div ref={stage} className={pinned ? 'sticky top-0 h-svh overflow-hidden bg-void' : 'relative overflow-hidden bg-void pt-16'}>
            <div className={`pointer-events-none ${pinned ? 'absolute inset-0' : 'relative h-[80svh]'}`}>
              <div aria-hidden="true" className="absolute inset-0 transition-opacity duration-[1800ms] ease-out" style={{ opacity: ready || !animate ? 1 : 0 }}>
                {near && (
                  <CanvasBoundary>
                    <Suspense fallback={null}>
                      <DeepSpaceScene progress={progress} active={visible} stage={stage} onReady={onReady} />
                    </Suspense>
                  </CanvasBoundary>
                )}
              </div>

              {/* Labels, positioned by the scene every frame from the exact camera. */}
              <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
                {SCENE_LABELS.map((l) => {
                  const target = l.kind === 'target'
                  return (
                    <div
                      key={l.id}
                      data-ds-label={l.id}
                      className={`absolute left-0 top-0 will-change-transform ${target ? '' : 'hidden md:block'}`}
                      style={{ opacity: 0, transform: 'translate3d(-9999px, 0, 0)' }}
                    >
                      <span
                        className={`absolute rounded-full border ${target ? '-left-[14px] -top-[14px] h-[28px] w-[28px] border-signal/80' : '-left-[5px] -top-[5px] h-[10px] w-[10px] border-ink/60'}`}
                      />
                      <p
                        className={`label absolute whitespace-nowrap text-ink ${labelShadow}`}
                        style={{
                          left: l.side * (target ? 24 : 14),
                          top: 0,
                          transform: l.side < 0 ? 'translate(-100%, -50%)' : 'translateY(-50%)',
                          textAlign: l.side < 0 ? 'right' : 'left',
                        }}
                      >
                        {l.name}
                        <span className="mt-1 block text-ink/65">{l.sub}</span>
                      </p>
                    </div>
                  )
                })}
                {SYSTEM_PLANETS.map((p) => (
                  <div
                    key={p.id}
                    data-ds-planet={p.id}
                    className={`absolute left-0 top-0 will-change-transform ${p.id === 'f' ? '' : 'hidden md:block'}`}
                    style={{ opacity: 0, transform: 'translate3d(-9999px, 0, 0)' }}
                  >
                    <p
                      className={`label absolute whitespace-nowrap ${p.id === 'f' ? 'text-signal' : 'text-ink/80'} ${labelShadow}`}
                      style={{ left: 10, top: -2, transform: 'translateY(-100%)' }}
                    >
                      {p.id === 'f' ? `${TARGET_NAME} f · ${Math.round(p.period)} d` : p.id}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Keeps the type legible over the star field. */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 ${pinned ? '' : 'hidden'}`}
              style={{ background: 'radial-gradient(ellipse 62% 58% at 0% 100%, rgb(3 4 10 / 0.82) 0%, rgb(3 4 10 / 0.45) 48%, transparent 100%)' }}
            />

            <div className="pointer-events-none relative mx-auto flex h-full w-full max-w-7xl flex-col px-6 md:px-10">
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
                  <span>
                    From the Sun <span data-hud="sun" className="text-ink-dim" />
                  </span>
                  <span>
                    To {TARGET_NAME} <span data-hud="target" className="text-ink-dim" />
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
                        <div style={pinned ? beat(0.96, 0.985) : undefined}>
                          <a
                            href="#exoplanets"
                            className="pointer-events-auto group mt-8 inline-flex items-center gap-5 text-ink-dim transition-colors hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-8 focus-visible:outline-signal"
                          >
                            <span className="h-px w-12 bg-ink/30 transition-all duration-500 group-hover:w-20 group-hover:bg-signal" />
                            <span className="label text-[0.8125rem] text-current">
                              Continue · Worlds around other suns{' '}
                              <span aria-hidden="true" className="inline-block transition-transform duration-500 group-hover:translate-y-1">
                                ↓
                              </span>
                            </span>
                          </a>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </SectionShell>
      <ExoplanetAtlas />
    </>
  )
}
