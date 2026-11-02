import { useState } from 'react'
import { RUNGS } from '@/lib/humanity'
import { focusRing } from '@/components/sections/life/ui'

const rad = (size: number) => 14 + ((Math.log10(size) - 7) / 20) * 176

/** The address of Earth, one rung at a time, with a nested-rings diagram that highlights the chosen rung. */
export function Address() {
  const [sel, setSel] = useState(RUNGS.length - 1)
  const cur = RUNGS[sel]
  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_minmax(0,26rem)] lg:items-start">
      <div>
        <ol className="border-t border-hairline">
          {RUNGS.map((r, i) => {
            const open = i === sel
            return (
              <li key={r.id} className="border-b border-hairline">
                <button
                  type="button"
                  onClick={() => setSel(i)}
                  aria-expanded={open}
                  className={`flex w-full items-baseline justify-between gap-4 py-4 text-left transition-colors ${open ? 'text-ink' : 'text-ink-dim hover:text-ink'} ${focusRing}`}
                >
                  <span className="font-display text-2xl md:text-3xl">{r.name}</span>
                  <span className="label shrink-0 !text-[0.6rem]">{r.learned.split(' · ')[0]}</span>
                </button>
                {open && (
                  <div className="hum-in pb-6 pr-2">
                    <p className="font-display text-lg text-signal">{r.sizeText}</p>
                    <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <dt className="label">Learned</dt>
                        <dd className="mt-1 text-sm text-ink-dim">{r.learned}</dd>
                      </div>
                      <div>
                        <dt className="label">By</dt>
                        <dd className="mt-1 text-sm text-ink-dim">{r.who}</dd>
                      </div>
                    </dl>
                    <p className="mt-4 max-w-xl text-ink-dim">{r.how}</p>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      </div>

      <svg viewBox="-200 -200 400 400" className="mx-auto w-full max-w-md" role="img" aria-label={`Nested rings showing ${cur.name} highlighted among the places Earth belongs to, on a logarithmic scale.`}>
        {[...RUNGS].reverse().map((r) => {
          const i = RUNGS.indexOf(r)
          const on = i === sel
          return (
            <circle
              key={r.id}
              r={rad(r.size)}
              fill={on ? '#8fb4ff' : 'none'}
              fillOpacity={on ? 0.07 : 0}
              stroke={on ? '#8fb4ff' : '#e8ecf4'}
              strokeOpacity={on ? 1 : 0.2}
              strokeWidth={on ? 1.6 : 1}
              vectorEffect="non-scaling-stroke"
              style={{ transition: 'all 500ms' }}
            />
          )
        })}
        <circle r={2.4} fill="#8fb4ff" />
        <text y={rad(cur.size) < 40 ? -rad(cur.size) - 8 : -rad(cur.size) + 18} textAnchor="middle" fontSize={11} fill="#e8ecf4" className="font-mono uppercase tracking-[0.12em]" style={{ paintOrder: 'stroke', stroke: '#03040a', strokeWidth: 3 }}>
          {cur.name}
        </text>
        <text y={16} textAnchor="middle" fontSize={8.5} fill="#8fb4ff" className="font-mono uppercase tracking-[0.12em]" style={{ paintOrder: 'stroke', stroke: '#03040a', strokeWidth: 3 }}>
          you
        </text>
      </svg>
    </div>
  )
}
