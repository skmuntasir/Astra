import { lazy, Suspense, useEffect, useRef } from 'react'
import SectionShell from '@/components/layout/SectionShell'
import CanvasBoundary from '@/components/canvas/CanvasBoundary'
import { chapters } from '@/data/journey'
import { PLANETS, SUN_RADIUS } from '@/lib/solarSystem'
import { useRenderProfile } from '@/hooks/useRenderProfile'
import { useSectionProgress } from '@/hooks/useSectionProgress'
import { useStageLifecycle } from '@/hooks/useStageLifecycle'
import { beat } from '@/lib/beat'

// Same three/R3F chunk as the star field and the other scenes; only this scene's code loads on demand.
const SolarScene = lazy(() => import('@/components/canvas/SolarScene'))

const chapter = chapters.find((c) => c.id === 'solar-system')!
const next = chapters[chapters.indexOf(chapter) + 1]
const number = String(chapters.indexOf(chapter) + 1).padStart(2, '0')

// Approximate figures (see PROJECT_STATUS.md §10): verify before treating as authoritative.
const facts = [
  { k: 'Sun, diameter', v: '1.39 million km' },
  { k: 'Sun, share of mass', v: '99.86 %' },
  { k: 'Planets', v: '8' },
  { k: 'Sunlight to Earth', v: '8 min 20 s' },
  { k: 'Neptune, orbit', v: '30.1 AU · 4.5 billion km' },
  { k: 'Age', v: '4.57 billion years' },
]

// Lunar surface markers carried over from Chapter 02: they fade out as the Moon pulls away (same positions, so seamless).
const markers = [
  { name: 'Tranquility Base', data: '0.67°N 23.47°E · Apollo 11', lat: 0.674, lon: 23.473 },
  { name: 'Mare Crisium', data: '17.0°N 59.1°E · Ø 555 km', lat: 17.0, lon: 59.1 },
]

/**
 * Body labels. `fade` = [in start, in end, out start, out end] in chapter progress (same timeline as SolarScene).
 * Planets appear in order from the Sun outward, once the camera has settled on the overview.
 */
interface BodyLabel {
  body: string
  name: string
  data: string
  fade: string
  /** Leader end relative to the body, px. */
  dx: number
  dy: number
  /** Hang the leader off the disc's limb (world radius) instead of its centre. */
  limb?: number
  ring?: boolean
}

// Leaders fan out in different directions so the crowded inner system stays legible.
const placement: Record<string, [number, number]> = {
  mercury: [18, 58],
  venus: [-52, 6],
  earth: [62, 22],
  mars: [46, -32],
  jupiter: [-46, -24],
  saturn: [44, -26],
  uranus: [44, -26],
  neptune: [-44, -30],
}
// On phones only these are labelled; the rest would collide in the narrow inner system.
const phoneLabels = new Set(['sun', 'earth', 'jupiter', 'saturn', 'neptune'])
const bodies: BodyLabel[] = [
  { body: 'moon', name: 'Moon', data: '384,400 km', fade: '0.2,0.26,0.36,0.46', dx: 40, dy: 0 },
  { body: 'earth', name: 'Earth', data: '12,742 km', fade: '0.2,0.26,0.36,0.46', dx: 46, dy: 30, limb: 1, ring: false },
  { body: 'sun', name: 'Sun', data: '1.39 million km', fade: '0.7,0.76', dx: -28, dy: -82, limb: SUN_RADIUS, ring: false },
  ...PLANETS.map((p, i) => ({
    body: p.id,
    name: p.name,
    data: p.auText,
    fade: `${(0.74 + i * 0.016).toFixed(3)},${(0.77 + i * 0.016).toFixed(3)}`,
    dx: placement[p.id][0],
    dy: placement[p.id][1],
  })),
]

// Hand-off to Chapter 04 (Cosmic Scale): its stage pins as this one unpins; it publishes `--cosmic-p` / `--cosmic-ready`
// on <html>, and this chapter's canvas, labels, scrim and text dissolve under it over its first ~10 % of progress.
// Without those vars (reduced motion, or Chapter 04's WebGL failing) nothing changes.
const COSMIC_AWAY = 'calc(1 - var(--cosmic-ready, 0) * clamp(0, calc(var(--cosmic-p, 0) * 10), 1))'

const labelShadow = '[text-shadow:0_0_3px_#03040a,0_0_10px_#03040a,0_0_18px_#03040a]'

/**
 * Chapter 03 — Solar System (opening). Same structure as Chapters 01 and 02: a tall track pins a full-viewport stage and
 * scroll progress drives the camera, labels and text. The difference is the seam with the chapter before it:
 *
 *  - the track is pulled up by one viewport (`-100svh`), so this stage pins at the very moment Chapter 02's unpins;
 *  - this scene's first frame is Chapter 02's last frame, so the canvases swap invisibly (Chapter 02 hides its canvas via
 *    `--solar-p` / `--solar-ready`, which this chapter publishes) while Chapter 02's text simply lifts away and fades.
 *
 * With reduced motion there is no pinning, hand-off or camera move: one still overview above the stacked text.
 */
export default function ChapterSolarSystem() {
  const { animate } = useRenderProfile()
  const track = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const labelLayer = useRef<HTMLDivElement>(null)
  const progress = useSectionProgress(track, stage, animate, '--solar-p')
  const { near, visible, ready, onReady } = useStageLifecycle(track)

  // Tell Chapter 02 it may drop its own canvas (only once this one is on the GPU and the hand-off is real).
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--solar-ready', ready && animate ? '1' : '0')
    return () => {
      root.style.removeProperty('--solar-ready')
    }
  }, [ready, animate])

  const pinned = animate
  const b1 = pinned ? beat(0.12, 0.18, 0.3, 0.36) : undefined
  const b2 = pinned ? beat(0.55, 0.61, 0.7, 0.75) : undefined
  const b3 = pinned ? beat(0.76, 0.82, 0.89, 0.93) : undefined
  const b4 = pinned ? beat(0.92, 0.97) : undefined
  const head = pinned ? beat(0.085, 0.12) : undefined
  const layer = pinned ? 'col-start-1 row-start-1 self-end' : ''

  return (
    <SectionShell id="solar-system" bleed className={pinned ? '-mt-[100svh]' : ''}>
      <div ref={track} className="relative" style={pinned ? { height: '600svh' } : undefined}>
        <div ref={stage} className={pinned ? 'sticky top-0 h-svh overflow-hidden' : 'relative overflow-hidden pt-16'}>
          {/* Hand-off gate: invisible until the stage has pinned, so the stage sliding in over Chapter 02 shows nothing. */}
          <div
            className={pinned ? 'pointer-events-none absolute inset-0' : 'contents'}
            style={pinned ? { opacity: `min(clamp(0, calc(var(--p) * 3000), 1), ${COSMIC_AWAY})` } : undefined}
          >
            <div
              className={`pointer-events-none transition-opacity duration-[1800ms] ease-out ${pinned ? 'absolute inset-0' : 'relative h-[80svh]'}`}
              style={{ opacity: ready ? 1 : 0 }}
            >
              <div aria-hidden="true" className="absolute inset-0">
                {near && (
                  <CanvasBoundary>
                    <Suspense fallback={null}>
                      <SolarScene progress={progress} active={visible} labelLayer={labelLayer} onReady={onReady} />
                    </Suspense>
                  </CanvasBoundary>
                )}
              </div>

              {/* Annotations. The scene moves and fades these every frame; they hold the real text. */}
              <div ref={labelLayer} className="absolute inset-0 overflow-hidden">
                {pinned &&
                  markers.map((m) => (
                    <div
                      key={m.name}
                      data-body="marker"
                      data-fade="-1,0,0.05,0.11"
                      data-lat={m.lat}
                      data-lon={m.lon}
                      className="absolute left-0 top-0 hidden will-change-transform md:block"
                      style={{ opacity: 0 }}
                    >
                      <span className="absolute -left-[5px] -top-[5px] h-[9px] w-[9px] rounded-full border border-ink/80 shadow-[0_0_6px_2px_#03040a]" />
                      <span className="absolute left-1 top-0 h-px w-12 bg-ink/40" />
                      <p className={`label absolute left-[3.75rem] -top-[0.55rem] whitespace-nowrap text-ink ${labelShadow}`}>
                        {m.name}
                        <span className="mt-1 block text-ink/75">{m.data}</span>
                      </p>
                    </div>
                  ))}
                {bodies.map((b) => (
                  <div
                    key={`${b.body}-${b.fade}`}
                    data-body={b.body}
                    data-limb={b.limb}
                    data-fade={pinned ? b.fade : b.limb === 1 || b.body === 'moon' ? '2,3' : '-1,0'}
                    className={`absolute left-0 top-0 will-change-transform ${phoneLabels.has(b.body) ? '' : 'hidden md:block'}`}
                    style={{ opacity: 0 }}
                  >
                    {b.ring !== false && (
                      <span className="absolute -left-[6px] -top-[6px] h-[11px] w-[11px] rounded-full border border-ink/60 shadow-[0_0_6px_2px_#03040a]" />
                    )}
                    <span
                      className="absolute left-0 top-0 h-px bg-ink/35"
                      style={{
                        width: Math.hypot(b.dx, b.dy),
                        transformOrigin: '0 50%',
                        transform: `rotate(${(Math.atan2(b.dy, b.dx) * 180) / Math.PI}deg)`,
                      }}
                    />
                    <p
                      className={`label absolute whitespace-nowrap text-ink ${labelShadow}`}
                      style={{
                        left: b.dx + (b.dx < 0 ? -8 : 8),
                        top: b.dy,
                        transform: b.dx < 0 ? 'translate(-100%, -50%)' : 'translateY(-50%)',
                        textAlign: b.dx < 0 ? 'right' : 'left',
                      }}
                    >
                      {b.name}
                      <span className="mt-1 hidden text-ink/70 md:block">{b.data}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Keeps the type legible where it crosses the Sun's glow or the inner system. Arrives with the chapter. */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 ${pinned ? '' : 'hidden'}`}
            style={{
              background: 'radial-gradient(ellipse 62% 58% at 0% 100%, rgb(3 4 10 / 0.78) 0%, rgb(3 4 10 / 0.45) 45%, transparent 100%)',
              opacity: `min(clamp(0, calc(var(--p) * 16), 1), ${COSMIC_AWAY})`,
            }}
          />

          <div
            className={`pointer-events-none relative mx-auto flex w-full max-w-7xl flex-col px-6 md:px-10 ${pinned ? 'h-full' : ''}`}
            style={pinned ? { opacity: COSMIC_AWAY } : undefined}
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
              <p className="label mt-3">Order true · scale compressed</p>
            </div>

            <div className={`pb-20 md:pb-24 ${pinned ? 'mt-auto grid' : 'mt-16 flex flex-col gap-20'}`}>
              <p className={`${layer} max-w-xl font-display text-2xl leading-snug text-ink md:text-4xl`} style={b1}>
                The Sun is 389 times farther away than the Moon.
              </p>

              <p className={`${layer} max-w-xl font-display text-2xl leading-snug text-ink md:text-4xl`} style={b2}>
                Of everything in the solar system, 99.86 % is the Sun.
              </p>

              <div className={layer} style={b3}>
                <h2 className="font-display text-[clamp(2.5rem,6.5vw,5.75rem)] font-normal uppercase leading-[0.9] tracking-[-0.01em] text-ink">
                  {chapter.title}
                </h2>
                <p className="mt-8 max-w-md text-lg leading-relaxed text-ink-dim md:text-xl">{chapter.summary}</p>
              </div>

              <div className={layer} style={b4}>
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
