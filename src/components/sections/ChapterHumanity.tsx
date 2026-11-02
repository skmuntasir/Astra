import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import SectionShell from '@/components/layout/SectionShell'
import { Address } from '@/components/sections/humanity/Address'
import { ReachChart } from '@/components/sections/humanity/ReachChart'
import { ReachMap } from '@/components/sections/humanity/ReachMap'
import { Minimap, StepButtons, TimeAxis } from '@/components/sections/humanity/TimeAxis'
import { Note, SectionHead, focusRing } from '@/components/sections/life/ui'
import { chapters } from '@/data/journey'
import { useRenderProfile } from '@/hooks/useRenderProfile'
import { beat } from '@/lib/beat'
import {
  ANSWERS,
  ERAS,
  EVENTS,
  KIND_LABEL,
  STATUS_LABEL,
  answerAt,
  bigYear,
  spaceAgeYears,
} from '@/lib/humanity'

const chapter = chapters.find((c) => c.id === 'humanity')!
const next = chapters[chapters.indexOf(chapter) + 1]
const number = String(chapters.indexOf(chapter) + 1).padStart(2, '0')

const N = EVENTS.length
const P0 = 0.075 // scroll progress at which the first event sits under the playhead
const P1 = 0.945 // …and the last
const TRACK_SVH = 1250
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Glow along the bottom of the stage, one per era; the current era's fades in. Warm for the naked-eye era, cool after. */
const GLOW = [
  'rgb(255 170 110 / 0.16)',
  'rgb(190 200 230 / 0.08)',
  'rgb(143 180 255 / 0.15)',
  'rgb(143 180 255 / 0.1)',
  'rgb(232 236 244 / 0.07)',
]

/** Opacity ramp for the event block: in over [0.055, 0.08], out over [0.935, 0.96]. */
const eventFade: CSSProperties = {
  opacity: 'min(clamp(0, calc((var(--p) - 0.055) * 40), 1), clamp(0, calc((0.96 - var(--p)) * 40), 1))',
}

function EventBlock({ i }: { i: number }) {
  const ev = EVENTS[i]
  const big = bigYear(ev)
  return (
    <div key={ev.id} className="hum-in">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="label !text-signal">{KIND_LABEL[ev.kind]}</span>
        {ev.status && <span className="label border border-signal/40 px-2 py-0.5 !text-signal">{STATUS_LABEL[ev.status]}</span>}
        <span className="label">{ev.when}</span>
      </div>
      <p className="mt-2 font-display leading-none tabular-nums text-ink" style={{ fontSize: 'clamp(3rem, min(9vw, 14svh), 7.5rem)' }}>
        {big.n}
        {big.suffix && <span className="ml-3 text-[0.3em] text-ink-dim">{big.suffix}</span>}
      </p>
      <h3 className="mt-3 font-display text-xl leading-snug md:text-3xl">{ev.title}</h3>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-dim max-md:line-clamp-5 md:text-base">{ev.text}</p>
      <p className="label mt-3 max-md:hidden">{ev.who}</p>
    </div>
  )
}

function AnswerBlock({ i }: { i: number }) {
  const a = ANSWERS[answerAt(i)]
  return (
    <div key={a.id} className="hum-in max-w-sm">
      <p className="label !text-signal">Where are we?</p>
      <p className="mt-2 font-display text-lg leading-snug text-ink md:mt-3 md:text-2xl">{a.say}</p>
      <p className="label mt-2 !text-[0.58rem] max-md:hidden">
        {a.since} · {a.by}
      </p>
    </div>
  )
}

/** The whole timeline as a plain list: for scanning, printing, assistive tech and reduced motion. */
function EventList({ open }: { open: boolean }) {
  return (
    <details open={open} className="group border-t border-hairline">
      <summary className={`label mx-auto flex max-w-7xl cursor-pointer items-center justify-between px-6 py-5 md:px-10 ${focusRing}`}>
        <span>Read the whole timeline as a list · {N} events</span>
        <span aria-hidden="true" className="transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="mx-auto max-w-7xl px-6 pb-16 md:px-10">
        {ERAS.map((era, e) => (
          <div key={era.id} className="mt-10 first:mt-2">
            <h3 className="label !text-ink-dim">
              {era.roman} · {era.name} · {era.span}
            </h3>
            <ol className="mt-4 divide-y divide-hairline border-y border-hairline">
              {EVENTS.filter((ev) => ev.era === e).map((ev) => (
                <li key={ev.id} className="grid gap-x-8 gap-y-1 py-5 md:grid-cols-[11rem_1fr]">
                  <p className="label">{ev.when}</p>
                  <div>
                    <p className="font-display text-xl text-ink">
                      {ev.title}
                      {ev.status && <span className="label ml-3 align-middle !text-signal">{STATUS_LABEL[ev.status]}</span>}
                    </p>
                    <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-dim">{ev.text}</p>
                    <p className="label mt-2 !text-[0.58rem]">{KIND_LABEL[ev.kind]} · {ev.who}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    </details>
  )
}

/**
 * Chapter 10 — Humanity.
 * One pinned stage where scroll moves through time: a sliding axis under a fixed playhead, a log-scale map of distance from
 * Earth whose three circles (seen / sent machines / sent people) grow with the records, and the current answer to "where are
 * we?". Then a scrubbable records chart and the address of Earth. DOM/SVG only (no canvas). Scroll writes `--p` and `--k` as
 * CSS variables; React re-renders only when the active event changes. Reduced motion: no pinning, finished map + open list.
 */
export default function ChapterHumanity() {
  const { animate } = useRenderProfile()
  const track = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(-1)
  const idx = animate ? active : N - 1

  useEffect(() => {
    const t = track.current
    const s = stage.current
    if (!animate || !t || !s) return
    const update = () => {
      const range = Math.max(1, t.offsetHeight - s.offsetHeight)
      const p = clamp01(-t.getBoundingClientRect().top / range)
      t.style.setProperty('--p', p.toFixed(4))
      const k = clamp01((p - P0) / (P1 - P0)) * (N - 1)
      t.style.setProperty('--k', k.toFixed(3))
      const nextIdx = p < P0 - 0.012 ? -1 : Math.round(k)
      setActive((prev) => (prev === nextIdx ? prev : nextIdx))
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [animate])

  const goTo = useCallback((i: number) => {
    const t = track.current
    const s = stage.current
    if (!t || !s) return
    const range = Math.max(1, t.offsetHeight - s.offsetHeight)
    const f = P0 + (Math.min(N - 1, Math.max(0, i)) / (N - 1)) * (P1 - P0)
    window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY + f * range, behavior: 'smooth' })
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!animate) return
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      goTo(idx + 1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      goTo(idx - 1)
    }
  }

  const pinned = animate
  const era = idx >= 0 ? EVENTS[idx].era : 0
  const years = spaceAgeYears()

  return (
    <SectionShell id="humanity" bleed>
      <div
        ref={track}
        className="relative [--gap:7.5rem] [--ph:20vw] md:[--gap:11rem] md:[--ph:34vw] xl:[--gap:13rem]"
        style={pinned ? { height: `${TRACK_SVH}svh` } : undefined}
      >
        <div ref={stage} onKeyDown={onKeyDown} className={pinned ? 'sticky top-0 h-svh overflow-hidden' : 'relative flex flex-col overflow-hidden pt-16'}>
          {pinned &&
            GLOW.map((g, e) => (
              <div
                key={e}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 transition-opacity duration-[1500ms]"
                style={{ background: `radial-gradient(130% 55% at 50% 118%, ${g}, transparent 70%)`, opacity: era === e ? 1 : 0 }}
              />
            ))}

          {/* the map */}
          <div
            className={`pointer-events-none ${
              pinned
                ? 'absolute right-0 w-full px-3 max-md:top-[13.5rem] max-md:h-[27svh] md:bottom-[11.5rem] md:top-32 md:w-[62%] md:px-8'
                : 'relative order-2 mx-auto h-[80svh] w-full max-w-3xl px-6'
            }`}
          >
            <ReachMap idx={idx} label={pinned} />
          </div>
          {pinned && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 max-md:hidden"
              style={{ background: 'linear-gradient(90deg, rgb(3 4 10 / 0.8) 0%, rgb(3 4 10 / 0.35) 34%, transparent 52%)' }}
            />
          )}

          <div className={`relative mx-auto flex w-full max-w-7xl flex-col px-6 md:px-10 ${pinned ? 'h-full' : 'order-1'}`}>
            <div className={pinned ? 'pt-24' : 'pt-8'}>
              <div className="flex items-baseline justify-between">
                <p className="label">{number} — {chapter.title}</p>
                <p className="label max-md:hidden">{chapter.scale}</p>
              </div>
              <div className="mt-4 h-px w-full bg-hairline">
                <div className="h-full origin-left bg-signal/60" style={{ transform: pinned ? 'scaleX(var(--p))' : 'scaleX(1)' }} />
              </div>
            </div>

            {pinned ? (
              <>
                <div className="pointer-events-none mt-5 md:mt-10" style={eventFade}>
                  {idx >= 0 && <AnswerBlock i={idx} />}
                </div>

                <div className="mt-auto grid pb-[11.5rem]">
                  <div className="col-start-1 row-start-1 self-end" style={beat(-0.03, 0, 0.04, 0.07)}>
                    <h2 className="font-display text-[clamp(2.75rem,7vw,6.5rem)] font-normal uppercase leading-[0.9] tracking-[-0.01em] text-ink">{chapter.title}</h2>
                    <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-dim md:text-xl">{chapter.summary}</p>
                    <p className="label mt-6">Scroll to move through time ↓</p>
                  </div>
                  <div className="pointer-events-none col-start-1 row-start-1 self-end" style={eventFade}>
                    {idx >= 0 && <EventBlock i={idx} />}
                  </div>
                  <div className="col-start-1 row-start-1 self-end" style={beat(0.955, 0.985)}>
                    <p className="font-display text-3xl leading-tight text-ink md:text-5xl">{years} years.</p>
                    <p className="mt-4 max-w-md text-ink-dim md:text-lg">
                      For almost all of the last five thousand years, the answer to “where are we?” came from looking up. Since Sputnik we have also been able to
                      go, and to look back.
                    </p>
                    <a href="#hum-reach" className={`pointer-events-auto group mt-8 inline-flex items-center gap-5 text-ink-dim transition-colors hover:text-ink ${focusRing}`}>
                      <span className="h-px w-12 bg-ink/30 transition-all duration-500 group-hover:w-20 group-hover:bg-signal" />
                      <span className="label text-[0.8125rem] text-current">
                        How far we have reached <span aria-hidden="true">↓</span>
                      </span>
                    </a>
                  </div>
                </div>
              </>
            ) : (
              <div className="mt-12 max-w-xl pb-8">
                <h2 className="font-display text-5xl uppercase leading-[0.9] text-ink">{chapter.title}</h2>
                <p className="mt-6 text-lg text-ink-dim">{chapter.summary}</p>
                <div className="mt-10">
                  <AnswerBlock i={N - 1} />
                </div>
              </div>
            )}
          </div>

          {pinned && (
            <div className="absolute inset-x-0 bottom-0 pb-4 md:pb-5">
              <div className="mx-auto flex max-w-7xl items-end gap-6 px-6 pb-2 md:px-10">
                <div className="min-w-0 flex-1">
                  <Minimap idx={idx} onJump={goTo} />
                </div>
                <StepButtons idx={idx} onJump={goTo} />
              </div>
              <TimeAxis idx={idx} onJump={goTo} />
            </div>
          )}
        </div>
      </div>

      <EventList open={!pinned} />

      <div id="hum-reach" className="border-t border-hairline">
        <div className="mx-auto max-w-7xl px-6 py-24 md:px-10">
          <SectionHead
            kicker={`${number}.1 — How far`}
            title="We learned to see far faster than we learned to go."
            lead={
              <>
                <p>
                  Three records, one scale. By 1965 the farthest thing humanity had seen was the edge of the visible universe. The farthest we had sent a person
                  was the Moon, and in 2026 it is still the Moon.
                </p>
                <p>Drag the year to see what each of the three had reached.</p>
              </>
            }
          />
          <div className="mt-14"><ReachChart /></div>
        </div>
      </div>

      <div id="hum-address" className="border-t border-hairline">
        <div className="mx-auto max-w-7xl px-6 py-24 md:px-10">
          <SectionHead
            kicker={`${number}.2 — The address`}
            title="Seven answers to “where are we?”"
            lead={
              <p>
                Every rung below was a discovery. Some took a measurement, some a new instrument, one a photograph. Choose a rung to see when we learned it and how.
              </p>
            }
          />
          <div className="mt-14"><Address /></div>
        </div>
      </div>

      <div className="border-t border-hairline">
        <div className="mx-auto max-w-7xl px-6 py-24 md:px-10">
          <p className="label">{number} — {chapter.title} · Next</p>
          <h2 className="mt-6 max-w-4xl font-display text-4xl leading-tight md:text-6xl">Each answer made the address longer, and the reach shorter by comparison.</h2>
          <p className="mt-6 max-w-2xl text-ink-dim md:text-lg">
            The Earth is a place with a position, in a galaxy, in a universe with no centre. The same species that worked that out has stood on one other world
            and sent a few machines past the edge of the Sun’s wind. The rest of this journey goes back out to look at what we have been looking at.
          </p>
          <div className="mt-16 flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <Note className="max-w-3xl">
              Real: the events, dates and people (checked October 2026; dates in the future are plans and carry a status), the record distances (rounded), and the seven
              rungs of the address. Simplified: each dot on the map sits at one representative distance, planets at their orbital distance from
              the Sun unless a better Earth-distance is known, and the true-scale line runs to 2050 with the last event pinned to its edge. Not verified: the current
              state of Starship and Mars plans, so crewed Mars is shown as proposed, with no date.
            </Note>
            {next && (
              <a href={next.status === 'live' ? `#${next.id}` : '#journey'} className={`group/n inline-flex shrink-0 items-center gap-4 text-ink-dim transition-colors hover:text-ink ${focusRing}`}>
                <span className="h-px w-8 bg-ink/30 transition-all duration-500 group-hover/n:w-14 group-hover/n:bg-signal" />
                <span className="label text-current">Next · {next.title} · {next.scale} ↓</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </SectionShell>
  )
}
