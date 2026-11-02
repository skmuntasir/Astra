import { useState } from 'react'
import { Note, SectionHead, focusRing } from '@/components/sections/life/ui'
import { CASES, LADDER } from '@/lib/searchForLife'

/**
 * The evidence ladder. Hovering or focusing a past claim lights the rungs it reached. Nothing reaches the top.
 */
export default function EvidenceLadder() {
  const [active, setActive] = useState<number | null>(null)
  const reached = active === null ? 0 : CASES[active].rung

  return (
    <div className="mx-auto max-w-7xl px-6 py-24 md:px-10">
      <SectionHead
        kicker="09 — Search for Life · Evidence"
        title="What would count."
        lead={
          <>
            <p>
              No sign of life beyond Earth has been confirmed. A number of claims have been made, and each has either been refuted or remains
              unconfirmed. That is how the process is meant to work: a claim is a beginning.
            </p>
            <p>A rough ladder of what a convincing detection has to climb, and where five well-known claims stalled.</p>
          </>
        }
      />

      <div className="mt-14 grid gap-14 md:grid-cols-[1fr_1.1fr] md:gap-20">
        <ol className="relative">
          {LADDER.map((r, i) => {
            const lit = active !== null && i < reached
            return (
              <li key={r.title} className="grid grid-cols-[2.5rem_1fr] gap-x-4 border-t border-hairline py-5 last:border-b">
                <span className={`label pt-1 transition-colors duration-500 ${lit ? 'text-signal' : ''}`}>{String(i + 1).padStart(2, '0')}</span>
                <div className={`transition-opacity duration-500 ${active !== null && !lit ? 'opacity-40' : 'opacity-100'}`}>
                  <p className="font-display text-2xl leading-snug text-ink">{r.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-dim md:text-base">{r.text}</p>
                </div>
              </li>
            )
          })}
        </ol>

        <div>
          <p className="label">Claims that did not hold</p>
          <ul className="mt-5 divide-y divide-hairline border-y border-hairline">
            {CASES.map((c, i) => {
              const on = active === i
              return (
                <li key={c.title}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setActive(on ? null : i)}
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className={`block w-full py-5 text-left transition-colors ${focusRing} ${on ? 'bg-ink/[0.03]' : ''}`}
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="font-display text-xl text-ink md:text-2xl">{c.title}</span>
                      <span className="label shrink-0">{c.year}</span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-ink-dim">{c.claim}</p>
                    <p className="mt-2 text-sm leading-relaxed text-ink">{c.status}</p>
                    <div className="mt-3 flex items-center gap-1.5" aria-label={`Reached rung ${c.rung} of ${LADDER.length}`}>
                      {LADDER.map((_, k) => (
                        <span key={k} className={`h-1 w-6 ${k < c.rung ? 'bg-signal/70' : 'bg-ink/10'}`} />
                      ))}
                      <span className="label ml-3 text-[0.625rem]">Stalled near rung {c.rung}</span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>

      <Note className="mt-10 max-w-4xl">
        The ladder is a simplified summary in the spirit of NASA’s Confidence of Life Detection framework, not that scale itself. Where each claim
        “stalled” is this chapter’s reading of the published debate, not an official ranking, and several of these questions are still being actively
        studied. Results change; check the current literature.
      </Note>
    </div>
  )
}
