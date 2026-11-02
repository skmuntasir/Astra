import {
  EVENTS,
  LANDMARKS,
  MACHINES,
  PEOPLE,
  SEEN,
  TODAY,
  dotAngle,
  fmtDistance,
  radial,
  recordAt,
  type HumanityEvent,
} from '@/lib/humanity'

const R = 300
const halo = { paintOrder: 'stroke', stroke: '#03040a', strokeWidth: 3, strokeLinejoin: 'round' } as const
const txt = (k = 10) => ({ fontSize: `calc(var(--mk, 1) * ${k}px)` })

function polar(r: number, deg: number) {
  const a = (deg * Math.PI) / 180
  return { x: r * Math.cos(a), y: r * Math.sin(a) }
}

/**
 * The map: distance from Earth on a log scale, centre = home, edge = the edge of the visible universe.
 * Three circles grow with the records; every event leaves a dot at the distance it reached.
 */
export function ReachMap({ idx, label = true }: { idx: number; label?: boolean }) {
  const year = idx >= 0 ? Math.min(EVENTS[idx].year, TODAY.year) : -4000
  const seen = recordAt(SEEN, year)
  const machine = recordAt(MACHINES, year)
  const people = recordAt(PEOPLE, year)
  const active: HumanityEvent | null = idx >= 0 ? EVENTS[idx] : null
  const shown = label ? active : null

  const circle = (rec: { m: number } | null) => {
    const r = rec ? radial(rec.m) : 0
    return {
      transform: `scale(${Math.max(r * R, 0.001)})`,
      opacity: rec ? 1 : 0,
      transformBox: 'fill-box' as const,
      transformOrigin: 'center',
      transition: 'transform 1100ms cubic-bezier(.2,.7,.2,1), opacity 600ms',
    }
  }

  const ap = shown ? polar(R * (shown.at ? radial(shown.at) : 0), dotAngle(idx)) : null

  return (
    <div className="flex h-full w-full flex-col">
      <svg
        viewBox="-330 -330 660 660"
        className="min-h-0 w-full flex-1 overflow-visible [--mk:1] max-md:[--mk:2.6]"
        role="img"
        aria-label="A map of distance from Earth on a logarithmic scale, with circles showing how far humanity has seen, sent machines, and sent people."
      >
        {/* the distance of everything we have seen: a faint disc */}
        <circle r={1} cx={0} cy={0} fill="#8fb4ff" fillOpacity={0.045} stroke="#8fb4ff" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" style={circle(seen)} />

        {/* landmark rings and a ruler of labels up the vertical axis */}
        {LANDMARKS.map((l, i) => {
          const r = R * radial(l.m)
          const left = i % 2 === 0
          return (
            <g key={l.id}>
              <circle r={r} fill="none" stroke="#e8ecf4" strokeOpacity={0.13} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <line x1={-3} x2={3} y1={-r} y2={-r} stroke="#e8ecf4" strokeOpacity={0.5} />
              <text x={left ? -7 : 7} y={-r + 3} textAnchor={left ? 'end' : 'start'} fill="#e8ecf4" fillOpacity={0.55} className="font-mono uppercase tracking-[0.1em] max-md:hidden" style={{ ...txt(9), ...halo }}>
                {l.name}
              </text>
            </g>
          )
        })}

        {/* machines, then people, so people draw on top */}
        <circle r={1} cx={0} cy={0} fill="none" stroke="#e8ecf4" strokeOpacity={0.85} strokeWidth={1.3} vectorEffect="non-scaling-stroke" style={circle(machine)} />
        <circle r={1} cx={0} cy={0} fill="none" stroke="#8fb4ff" strokeWidth={2.4} vectorEffect="non-scaling-stroke" style={circle(people)} />

        {/* one dot per event, at the distance it reached */}
        {EVENTS.map((e, i) => {
          const shown = i <= idx
          const p = polar(R * (e.at ? radial(e.at) : 0), dotAngle(i))
          const future = e.status !== undefined
          const isActive = label && i === idx
          const color = e.kind === 'crew' ? '#8fb4ff' : '#e8ecf4'
          return (
            <g key={e.id} style={{ opacity: shown ? 1 : 0, transition: 'opacity 500ms' }}>
              <circle
                cx={p.x}
                cy={p.y}
                r={isActive ? 4.5 : 2.4}
                fill={future || e.kind === 'loss' ? 'none' : color}
                fillOpacity={isActive ? 1 : 0.6}
                stroke={color}
                strokeOpacity={isActive ? 1 : 0.7}
                strokeWidth={1}
                strokeDasharray={future ? '2 2' : undefined}
                vectorEffect="non-scaling-stroke"
              />
              {isActive && <circle cx={p.x} cy={p.y} r={10} fill="none" stroke={color} strokeOpacity={0.6} className="pulse-soft" vectorEffect="non-scaling-stroke" />}
            </g>
          )
        })}

        {/* home */}
        <circle r={2.6} fill="#8fb4ff" />
        <text y={26} textAnchor="middle" fill="#e8ecf4" fillOpacity={0.8} className="font-mono uppercase tracking-[0.14em] max-md:hidden" style={{ ...txt(9), ...halo }}>
          Earth · you are here
        </text>

        {/* label for the active event */}
        {shown && ap && (
          <g key={shown.id} className="hum-in">
            <text x={ap.x + (ap.x >= 0 ? 12 : -12)} y={ap.y - 4} textAnchor={ap.x >= 0 ? 'start' : 'end'} fill="#e8ecf4" className="font-display" style={{ ...txt(14), ...halo }}>
              {shown.short}
            </text>
            <text x={ap.x + (ap.x >= 0 ? 12 : -12)} y={ap.y + 10} textAnchor={ap.x >= 0 ? 'start' : 'end'} fill="#8fb4ff" className="font-mono uppercase tracking-[0.1em]" style={{ ...txt(9), ...halo }}>
              {shown.at ? fmtDistance(shown.at) : 'On Earth'}
            </text>
          </g>
        )}
      </svg>

      <dl className="mt-2 grid max-md:hidden grid-cols-3 gap-3 text-[0.7rem] md:text-xs">
        <Readout term="Seen" rec={seen} tone="text-ink" />
        <Readout term="Sent · machines" rec={machine} tone="text-ink" />
        <Readout term="Sent · people" rec={people} tone="text-signal" />
      </dl>
    </div>
  )
}

function Readout({ term, rec, tone }: { term: string; rec: { m: number; label: string } | null; tone: string }) {
  return (
    <div className="min-w-0 border-t border-hairline pt-2">
      <dt className="label !text-[0.6rem]">{term}</dt>
      <dd className={`mt-1 font-display text-base leading-tight md:text-xl ${tone}`}>{rec ? fmtDistance(rec.m) : '—'}</dd>
      <dd className="mt-0.5 truncate text-ink-faint">{rec ? rec.label : 'nothing yet'}</dd>
    </div>
  )
}
