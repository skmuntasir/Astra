import { useState } from 'react'
import { EDGE, LANDMARKS, LY, MACHINES, PEOPLE, SEEN, TODAY, fmtDistance, recordAt, type RecordPoint } from '@/lib/humanity'
import { Note, Slider, focusRing } from '@/components/sections/life/ui'

const W = 900
const H = 520
const ML = 128
const MR = 150
const MT = 22
const MB = 46
const PW = W - ML - MR
const PH = H - MT - MB
const X0 = 1600
const X1 = 2035
const BREAK = 1900

/** Piecewise time axis: 1600–1900 is squeezed into 22% of the width so the last 135 years have room. */
const fx = (year: number) => {
  const y = Math.min(X1, Math.max(X0, year))
  const f = y <= BREAK ? ((y - X0) / (BREAK - X0)) * 0.22 : 0.22 + ((y - BREAK) / (X1 - BREAK)) * 0.78
  return ML + f * PW
}
const fy = (m: number) => MT + ((27 - Math.log10(m)) / 22) * PH

function stepPath(s: RecordPoint[]): string {
  let d = ''
  s.forEach((p, i) => {
    const x = fx(p.year)
    const y = fy(p.m)
    d += i === 0 ? `M${fx(Math.max(p.year, X0))},${y}` : `H${x}V${y}`
  })
  return d + `H${fx(TODAY.year)}`
}

const SERIES = [
  { id: 'seen', name: 'Seen', data: SEEN, stroke: '#e8ecf4', width: 1.4, dash: '5 4', text: 'text-ink' },
  { id: 'machines', name: 'Sent · machines', data: MACHINES, stroke: '#e8ecf4', width: 1.8, dash: undefined, text: 'text-ink' },
  { id: 'people', name: 'Sent · people', data: PEOPLE, stroke: '#8fb4ff', width: 2.6, dash: undefined, text: 'text-signal' },
] as const

const NOTES: { year: number; m: number; text: string; dx: number; dy: number; end?: boolean }[] = [
  { year: 1924, m: 2.5e6 * LY, text: '1924 · Andromeda is a galaxy', dx: -8, dy: -9, end: true },
  { year: 1965, m: EDGE, text: '1965 · the whole visible universe', dx: -8, dy: 17, end: true },
  { year: 2012.65, m: 121 * 1.496e11, text: '2012 · interstellar space', dx: -8, dy: -9, end: true },
  { year: 1970.28, m: 4.00171e8, text: '1969–72 · Apollo', dx: -8, dy: -9, end: true },
]

export function ReachChart() {
  const [year, setYear] = useState(2026)
  const [on, setOn] = useState({ seen: true, machines: true, people: true })
  const at = { seen: recordAt(SEEN, year), machines: recordAt(MACHINES, year), people: recordAt(PEOPLE, year) }
  const ticks = [1600, 1700, 1800, 1900, 1920, 1940, 1960, 1980, 2000, 2020]

  return (
    <div>
      <div className="flex flex-wrap gap-x-6 gap-y-2" role="group" aria-label="Show or hide a series">
        {SERIES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={on[s.id]}
            onClick={() => setOn((o) => ({ ...o, [s.id]: !o[s.id] }))}
            className={`label flex items-center gap-2 transition-colors ${on[s.id] ? '!text-ink' : ''} ${focusRing}`}
          >
            <span className="inline-block h-0.5 w-6" style={{ background: s.stroke, opacity: on[s.id] ? 1 : 0.25, borderTop: s.dash ? `2px dashed ${s.stroke}` : undefined, height: s.dash ? 0 : 2 }} />
            {s.name}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[760px] w-full" role="img" aria-label="Chart of the farthest distance humanity had seen, sent machines, and sent people, from 1600 to today, on a logarithmic scale.">
          {LANDMARKS.map((l) => (
            <g key={l.id}>
              <line x1={ML} x2={ML + PW} y1={fy(l.m)} y2={fy(l.m)} stroke="#e8ecf4" strokeOpacity={0.09} />
              <text x={ML - 8} y={fy(l.m) + 3} textAnchor="end" fontSize={9} fill="#5d667c" className="font-mono uppercase tracking-[0.08em]">
                {l.name.split(' · ')[0].replace('Edge of the visible', 'Visible edge').replace('Edge of the Sun’s wind', 'Heliopause')}
              </text>
            </g>
          ))}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={fx(t)} x2={fx(t)} y1={MT + PH} y2={MT + PH + 5} stroke="#e8ecf4" strokeOpacity={0.3} />
              <text x={fx(t)} y={MT + PH + 19} textAnchor="middle" fontSize={9.5} fill="#5d667c" className="font-mono">{t}</text>
            </g>
          ))}
          <line x1={fx(BREAK)} x2={fx(BREAK)} y1={MT} y2={MT + PH} stroke="#8fb4ff" strokeOpacity={0.25} strokeDasharray="2 4" />
          <text x={fx(BREAK) + 5} y={MT + 10} fontSize={9} fill="#8fb4ff" fillOpacity={0.8} className="font-mono uppercase tracking-[0.08em]">Time axis stretches here</text>
          <text x={ML + PW / 2} y={H - 4} textAnchor="middle" fontSize={9} fill="#5d667c" className="font-mono uppercase tracking-[0.12em]">Distance from Earth, log scale</text>

          {SERIES.map((s) => (
            <g key={s.id} style={{ opacity: on[s.id] ? 1 : 0.08, transition: 'opacity 400ms' }}>
              <path d={stepPath(s.data)} fill="none" stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash} strokeLinejoin="round" />
              {s.data.filter((p) => p.year >= X0).map((p) => (
                <circle key={p.label} cx={fx(p.year)} cy={fy(p.m)} r={s.id === 'people' ? 3.4 : 2.4} fill={s.id === 'seen' ? '#03040a' : s.stroke} stroke={s.stroke} strokeWidth={1} />
              ))}
              {(() => {
                const last = s.data[s.data.length - 1]
                return (
                  <g>
                    <text x={fx(TODAY.year) + 10} y={fy(last.m) - 2} fontSize={11} fill={s.stroke} className="font-mono uppercase tracking-[0.1em]">{s.name}</text>
                    <text x={fx(TODAY.year) + 10} y={fy(last.m) + 12} fontSize={11} fill={s.stroke} fillOpacity={0.7}>{fmtDistance(last.m)}</text>
                  </g>
                )
              })()}
            </g>
          ))}

          {NOTES.map((n) => (
            <text key={n.text} x={fx(n.year) + n.dx} y={fy(n.m) + n.dy} textAnchor={n.end ? 'end' : 'start'} fontSize={10.5} fill="#e8ecf4" fillOpacity={0.75} style={{ paintOrder: 'stroke', stroke: '#03040a', strokeWidth: 3 }}>
              {n.text}
            </text>
          ))}
          <text x={fx(2018)} y={fy(4.0e8) + 20} textAnchor="end" fontSize={10.5} fill="#8fb4ff" style={{ paintOrder: 'stroke', stroke: '#03040a', strokeWidth: 3 }}>
            1970 → 2026: farthest people only 1.6% farther
          </text>

          {/* scrubber */}
          <line x1={fx(year)} x2={fx(year)} y1={MT} y2={MT + PH} stroke="#8fb4ff" strokeOpacity={0.7} />
          {SERIES.map((s) => {
            const r = at[s.id]
            return r && on[s.id] ? <circle key={s.id} cx={fx(year)} cy={fy(r.m)} r={5} fill="none" stroke="#8fb4ff" strokeWidth={1.5} /> : null
          })}
        </svg>
      </div>

      <div className="mt-6 max-w-xl">
        <Slider id="reach-year" label="Year" value={year} min={1600} max={2026} step={1} onChange={setYear} display={year} valueText={`The year ${year}`} />
      </div>

      <dl className="mt-6 grid gap-6 border-t border-hairline pt-6 sm:grid-cols-3" aria-live="polite">
        {SERIES.map((s) => {
          const r = at[s.id]
          return (
            <div key={s.id}>
              <dt className="label">{s.name} · by {year}</dt>
              <dd className={`mt-2 font-display text-2xl leading-tight ${s.text}`}>{r ? fmtDistance(r.m) : 'Not yet'}</dd>
              <dd className="mt-1 text-sm text-ink-dim">{r ? r.label : s.id === 'seen' ? 'Before 240 BCE, no distance beyond the sky’s turning' : 'No one had tried yet'}</dd>
            </div>
          )
        })}
      </dl>

      <Note className="mt-8 max-w-3xl">
        Distances are rounded. “Seen” is the farthest thing whose distance had been measured or whose light had been detected; for galaxies it is light-travel
        distance, and for the microwave background the comoving radius of the visible universe (about 46 billion light-years). For machines, values before 1976
        are the distance from Earth at the encounter (a lower bound for how far the spacecraft went); from 1976 on, distance from the Sun. People are measured
        from Earth. Artemis II’s distance is NASA’s reported record.
      </Note>
    </div>
  )
}
