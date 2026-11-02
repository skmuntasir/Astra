import { lazy, Suspense, useRef } from 'react'
import SectionShell from '@/components/layout/SectionShell'
import CanvasBoundary from '@/components/canvas/CanvasBoundary'
import { chapters } from '@/data/journey'
import { useRenderProfile } from '@/hooks/useRenderProfile'
import { useSectionProgress } from '@/hooks/useSectionProgress'
import { useStageLifecycle } from '@/hooks/useStageLifecycle'
import { beat } from '@/lib/beat'

// Same three/R3F chunk as the star field; only this scene's code and textures load on demand.
const EarthScene = lazy(() => import('@/components/canvas/EarthScene'))

const chapter = chapters.find((c) => c.id === 'earth')!
const next = chapters[chapters.indexOf(chapter) + 1]
const number = String(chapters.indexOf(chapter) + 1).padStart(2, '0')

// Approximate figures (see PROJECT_STATUS.md §10): verify before treating as authoritative.
const facts = [
  { k: 'Mean diameter', v: chapter.scale },
  { k: 'Day (sidereal)', v: '23 h 56 min' },
  { k: 'Orbital speed', v: '29.8 km/s' },
  { k: 'Distance to the Sun', v: '149.6 million km' },
  { k: 'Age', v: '4.54 billion years' },
]

/**
 * Chapter 01 — Earth. Layers (back → front): global StarField (-z-10) → Earth canvas → left-side scrim → text.
 * A tall track pins a full-viewport stage; scroll progress through it drives the camera, the sun and the text.
 * With reduced motion there is no pinning or camera move: one still, finished composition with all text visible.
 */
export default function ChapterEarth() {
  const { animate } = useRenderProfile()
  const track = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const progress = useSectionProgress(track, stage, animate)

  const { near, visible, ready, onReady } = useStageLifecycle(track)

  const pinned = animate
  const b1 = pinned ? beat(0.02, 0.1, 0.3, 0.4) : undefined
  const b2 = pinned ? beat(0.42, 0.5, 0.68, 0.76) : undefined
  const b3 = pinned ? beat(0.78, 0.88) : undefined
  const layer = pinned ? 'col-start-1 row-start-1 self-end' : ''

  return (
    <SectionShell id="earth" bleed>
      <div ref={track} className="relative" style={pinned ? { height: '340svh' } : undefined}>
        <div ref={stage} className={pinned ? 'sticky top-0 h-svh overflow-hidden' : 'relative overflow-hidden pt-16'}>
          {/* Reduced motion: the still globe gets its own block above the text instead of sitting behind it. */}
          <div
            aria-hidden="true"
            className={`pointer-events-none transition-opacity duration-[1800ms] ease-out ${pinned ? 'absolute inset-0' : 'relative h-[75svh]'}`}
            style={{ opacity: ready ? 1 : 0 }}
          >
            {near && (
              <CanvasBoundary>
                <Suspense fallback={null}>
                  <EarthScene progress={progress} active={visible} onReady={onReady} />
                </Suspense>
              </CanvasBoundary>
            )}
          </div>

          {/* Keeps the type legible where it crosses the planet's lit side. */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 ${pinned ? '' : 'hidden'}`}
            style={{ background: 'linear-gradient(90deg, rgb(3 4 10 / 0.7) 0%, rgb(3 4 10 / 0.35) 34%, transparent 58%)' }}
          />

          <div className={`relative mx-auto flex w-full max-w-7xl flex-col px-6 md:px-10 ${pinned ? 'h-full' : ''}`}>
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
            </div>

            <div className={`pb-20 md:pb-24 ${pinned ? 'mt-auto grid' : 'mt-16 flex flex-col gap-20'}`}>
              <div className={layer} style={b1}>
                <h2 className="font-display text-[clamp(3.5rem,12vw,10rem)] font-normal uppercase leading-[0.9] tracking-[-0.01em] text-ink">
                  {chapter.title}
                </h2>
                <p className="mt-8 max-w-md text-lg leading-relaxed text-ink-dim md:text-xl">{chapter.summary}</p>
              </div>

              <p className={`${layer} max-w-xl font-display text-2xl leading-snug text-ink md:text-4xl`} style={b2}>
                Seventy-one percent ocean, wrapped in a film of air so thin that nearly all of it lies within thirty
                kilometres of the ground.
              </p>

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
