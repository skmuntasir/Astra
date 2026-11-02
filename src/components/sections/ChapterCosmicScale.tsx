import { lazy, Suspense, useEffect, useRef } from 'react'
import SectionShell from '@/components/layout/SectionShell'
import CanvasBoundary from '@/components/canvas/CanvasBoundary'
import { chapters } from '@/data/journey'
import { MILESTONES, NOTES, milestoneWindow } from '@/lib/cosmicScale'
import { useRenderProfile } from '@/hooks/useRenderProfile'
import { useSectionProgress } from '@/hooks/useSectionProgress'
import { useStageLifecycle } from '@/hooks/useStageLifecycle'
import { beat } from '@/lib/beat'

// Same three/R3F chunk as everything else; only this scene's code loads on demand. No new assets: the Earth textures are
// the ones Chapters 01–03 already use (same URLs, one download).
const CosmicScene = lazy(() => import('@/components/canvas/CosmicScene'))

const chapter = chapters.find((c) => c.id === 'cosmic-scale')!
const next = chapters[chapters.indexOf(chapter) + 1]
const number = String(chapters.indexOf(chapter) + 1).padStart(2, '0')

// Beat windows in scroll progress, derived from the scale each beat belongs to (lib/cosmicScale.ts), so retiming the
// journey there moves the text with it.
const windows = MILESTONES.map(milestoneWindow)

// Hand-off from Chapter 03: this stage pins as Chapter 03's unpins (`-mt-[100svh]`). The canvas ramps in over the first ~7 %
// of progress while Chapter 03 (see ChapterSolarSystem, `--cosmic-p`) fades out underneath: a dissolve through the star
// field, because the two scenes deliberately do NOT share a frame (the person shrinks to 1.7 m again).
const GATE_IN = 'clamp(0, calc(var(--p) * 14), 1)'
// Hand-off to Chapter 05 (Black Holes): inert until that chapter publishes `--bh-p` / `--bh-ready` the same way Chapter 03
// does for Chapter 02. Until then nothing changes.
const HAND_OFF = 'calc(1 - var(--bh-ready, 0) * clamp(0, calc(var(--bh-p, 0) * 12), 1))'

const labelShadow = '[text-shadow:0_0_3px_#03040a,0_0_10px_#03040a,0_0_18px_#03040a]'

/**
 * Chapter 04 — Cosmic Scale. Same structure as the other pinned chapters (tall track, sticky stage, `--p`), but the camera
 * is a zoom: scroll progress → scale (lib/cosmicScale.ts) → one canvas that redraws the world at that scale every frame.
 *
 * Text is sparse on purpose: eleven short beats, each tied to a scale, no cards. The only chrome is a live readout of the
 * frame's height, a scale bar (md+), and the annotations the scene pins to real positions.
 *
 * Reduced motion: no pinning, no zoom. One still of the Milky Way with its annotations, then the same beats as a plain list.
 */
export default function ChapterCosmicScale() {
  const { animate } = useRenderProfile()
  const track = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const progress = useSectionProgress(track, stage, animate, '--cosmic-p')
  const { near, visible, ready, onReady } = useStageLifecycle(track)

  // Tell Chapter 03 it may fade its own canvas (only once this one is on the GPU and the hand-off is real).
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--cosmic-ready', ready && animate ? '1' : '0')
    return () => {
      root.style.removeProperty('--cosmic-ready')
    }
  }, [ready, animate])

  const pinned = animate
  const head = pinned ? beat(0.04, 0.09) : undefined
  const layer = pinned ? 'col-start-1 row-start-1 self-end' : ''
  const last = MILESTONES.length - 1

  return (
    <SectionShell id="cosmic-scale" bleed className={pinned ? '-mt-[100svh]' : ''}>
      <div ref={track} className="relative" style={pinned ? { height: '1000svh' } : undefined}>
        <div ref={stage} className={pinned ? 'sticky top-0 h-svh overflow-hidden' : 'relative overflow-hidden pt-16'}>
          <div
            className={pinned ? 'pointer-events-none absolute inset-0' : 'contents'}
            style={pinned ? { opacity: `min(${GATE_IN}, ${HAND_OFF})` } : undefined}
          >
            <div
              className={`pointer-events-none transition-opacity duration-[1800ms] ease-out ${pinned ? 'absolute inset-0' : 'relative h-[80svh]'}`}
              style={{ opacity: ready ? 1 : 0 }}
            >
              {/* The sky thickens and changes colour with scale; the scene drives its opacity and --tint. */}
              <div
                data-veil
                aria-hidden="true"
                className="absolute inset-0"
                style={{ opacity: 0, background: 'radial-gradient(ellipse 80% 75% at 60% 50%, var(--tint, #080c18) 0%, #03040a 85%)' }}
              />
              <div aria-hidden="true" className="absolute inset-0">
                {near && (
                  <CanvasBoundary>
                    <Suspense fallback={null}>
                      <CosmicScene progress={progress} active={visible} stage={stage} onReady={onReady} />
                    </Suspense>
                  </CanvasBoundary>
                )}
              </div>

              {/* Annotations. The scene moves and fades these every frame; they hold the real text. */}
              <div className="absolute inset-0 overflow-hidden">
                {NOTES.map((n) => (
                  <div
                    key={n.id}
                    data-note={n.id}
                    className={`absolute left-0 top-0 will-change-transform ${n.phone ? '' : 'hidden md:block'}`}
                    style={{ opacity: 0 }}
                  >
                    {n.ring && (
                      <span className="absolute -left-[6px] -top-[6px] h-[11px] w-[11px] rounded-full border border-ink/60 shadow-[0_0_6px_2px_#03040a]" />
                    )}
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
                        left: n.dx + (n.dx < 0 ? -8 : 8),
                        top: n.dy,
                        transform: n.dx < 0 ? 'translate(-100%, -50%)' : 'translateY(-50%)',
                        textAlign: n.dx < 0 ? 'right' : 'left',
                      }}
                    >
                      {n.name}
                      <span className="mt-1 hidden text-ink/70 md:block">{n.data}</span>
                    </p>
                  </div>
                ))}

                {/* You are here: appears as the person becomes too small to see, and stays to the edge of the universe. */}
                <div data-note="you" className="absolute left-0 top-0 will-change-transform" style={{ opacity: 0 }}>
                  <span className="pulse-soft absolute -left-[8px] -top-[8px] h-[15px] w-[15px] rounded-full border border-signal shadow-[0_0_8px_2px_#03040a]" />
                  <span className="absolute left-0 top-0 h-px w-9 origin-left bg-signal/50" style={{ transform: 'rotate(132deg)' }} />
                  <p className={`label absolute whitespace-nowrap text-signal ${labelShadow}`} style={{ left: -32, top: 27, transform: 'translate(-100%, -50%)', textAlign: 'right' }}>
                    You are here
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Keeps the type legible where it crosses bright planets, the Sun's glow or the galaxy. */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 ${pinned ? '' : 'hidden'}`}
            style={{
              background: 'radial-gradient(ellipse 62% 58% at 0% 100%, rgb(3 4 10 / 0.78) 0%, rgb(3 4 10 / 0.45) 45%, transparent 100%)',
              opacity: `min(${GATE_IN}, ${HAND_OFF})`,
            }}
          />

          {/* Scale bar: a true length on screen right now. */}
          <div className="pointer-events-none absolute bottom-24 right-6 hidden text-right md:block md:right-10" style={pinned ? { opacity: 'clamp(0, calc(var(--p) * 12), 1)' } : undefined}>
            <p data-hud="bar-text" className="label mb-2 min-h-[1em] text-ink-dim" />
            <div data-hud="bar-line" className="ml-auto h-[7px] border-x border-b border-ink/50" style={{ width: 140 }} />
          </div>

          <div
            className={`pointer-events-none relative mx-auto flex w-full max-w-7xl flex-col px-6 md:px-10 ${pinned ? 'h-full' : ''}`}
            style={pinned ? { opacity: 'calc(1 - var(--bh-ready, 0) * clamp(0, calc(var(--bh-p, 0) * 12), 1))' } : undefined}
          >
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
                <span>True scale · every step ×10</span>
                <span>
                  Frame height <span data-hud="frame" className="text-ink-dim" />
                </span>
              </p>
            </div>

            <div className={`pb-20 md:pb-24 ${pinned ? 'mt-auto grid' : 'mt-16 flex flex-col gap-16'}`}>
              {MILESTONES.map((m, i) => {
                const w = windows[i]
                const style = pinned ? beat(w[0], w[1], w[2], w[3]) : undefined
                return (
                  <div key={m.title} className={layer} style={style}>
                    <p className="label">{m.scale}</p>
                    <h2
                      className={`mt-3 max-w-2xl font-display font-normal leading-[1.05] text-ink ${
                        i === last ? 'text-[clamp(2.25rem,5.5vw,4.75rem)] uppercase tracking-[-0.01em]' : 'text-3xl md:text-5xl'
                      }`}
                    >
                      {m.title}
                    </h2>
                    <p className="mt-5 max-w-md text-base leading-relaxed text-ink-dim md:text-lg">{m.line}</p>
                    {i === last && next && (
                      <div style={pinned ? beat(0.975, 0.992) : undefined}>
                        <a
                          href={next.status === 'live' ? `#${next.id}` : '#journey'}
                          className="pointer-events-auto group mt-10 inline-flex items-center gap-5 text-ink-dim transition-colors hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-8 focus-visible:outline-signal"
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
