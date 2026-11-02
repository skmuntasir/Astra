import { EVENTS, ERAS, ERA_FIRST, FIRST_FUTURE, MAP_END, MAP_START, SPACE_AGE_SHARE, TODAY, trueX, yearText } from '@/lib/humanity'
import { focusRing } from '@/components/sections/life/ui'

const N = EVENTS.length
const LINE_Y = 36 // px from the top of the axis strip

function Glyph({ kind, future, active }: { kind: string; future: boolean; active: boolean }) {
  const base = 'absolute left-1/2 -translate-x-1/2 -translate-y-1/2 transition-transform duration-500'
  const scale = active ? 'scale-[1.6]' : 'scale-100'
  const dash = future ? 'border-dashed' : ''
  const style = { top: LINE_Y }
  if (kind === 'crew') return <span style={style} className={`${base} ${scale} h-2.5 w-2.5 rounded-full border border-signal ${future ? '' : 'bg-signal'} ${dash}`} />
  if (kind === 'send') return <span style={style} className={`${base} ${scale} h-2 w-2 rotate-45 border border-ink ${future ? '' : 'bg-ink/80'} ${dash}`} />
  if (kind === 'loss') return <span style={style} className={`${base} ${scale} h-3 w-px bg-ink-dim`} />
  return <span style={style} className={`${base} ${scale} h-2.5 w-2.5 rounded-full border border-ink-dim bg-void ${dash}`} />
}

/** The sliding axis. Position is driven by the `--k` CSS variable (continuous event index) set on an ancestor. */
export function TimeAxis({ idx, onJump }: { idx: number; onJump: (i: number) => void }) {
  return (
    <div className="relative h-[6.75rem] overflow-hidden" style={{ maskImage: 'linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent)' }}>
      <div
        className="absolute inset-y-0 left-0 will-change-transform"
        style={{ width: `calc(var(--ph) + ${N - 1} * var(--gap) + 100vw)`, transform: 'translateX(calc(var(--k, 0) * var(--gap) * -1))' }}
      >
        <div className="absolute left-0 right-0 h-px bg-hairline" style={{ top: LINE_Y }} />
        <div className="absolute left-0 h-px bg-signal/60" style={{ top: LINE_Y, width: 'calc(var(--ph) + var(--k, 0) * var(--gap))' }} />

        {ERAS.map((era, e) => {
          const first = ERA_FIRST[e]
          const today = e === ERAS.length - 1
          return (
            <div key={era.id} className="absolute top-0" style={{ left: `calc(var(--ph) + ${first - 0.5} * var(--gap))` }}>
              <span className={`absolute top-2 h-14 w-px ${today ? 'bg-signal/50' : 'bg-hairline'}`} />
              <span className={`label absolute left-2 top-1.5 whitespace-nowrap !text-[0.58rem] ${today ? '!text-signal' : ''}`}>
                {today ? `Today · ${TODAY.label} · ` : ''}
                {era.roman} · {era.name}
              </span>
            </div>
          )
        })}

        {EVENTS.map((e, i) => {
          const active = i === idx
          const future = i >= FIRST_FUTURE
          const tone = active ? 'text-ink' : i < idx ? 'text-ink-dim' : 'text-ink-faint'
          return (
            <button
              key={e.id}
              type="button"
              tabIndex={-1}
              onClick={() => onJump(i)}
              aria-label={`${e.short}, ${e.when}`}
              aria-current={active ? 'true' : undefined}
              className={`absolute top-0 h-full -translate-x-1/2 cursor-pointer text-center ${tone} transition-colors duration-500 hover:text-ink`}
              style={{ left: `calc(var(--ph) + ${i} * var(--gap))`, width: 'var(--gap)' }}
            >
              <Glyph kind={e.kind} future={future} active={active} />
              <span className="absolute inset-x-1 font-mono text-[0.62rem] uppercase tracking-[0.12em]" style={{ top: LINE_Y + 12 }}>
                {e.year < 0 ? yearText(e.year) : e.big ?? yearText(e.year)}
              </span>
              <span className="absolute inset-x-1.5 text-[0.7rem] leading-tight md:text-xs" style={{ top: LINE_Y + 28 }}>
                {e.short}
              </span>
            </button>
          )
        })}
      </div>
      {/* the playhead */}
      <div className="pointer-events-none absolute inset-y-0 w-px bg-signal/40" style={{ left: 'var(--ph)' }} />
    </div>
  )
}

/** True-scale minimap: one straight line of time. Everything after Sputnik is a sliver at the right-hand end. */
export function Minimap({ idx, onJump }: { idx: number; onJump: (i: number) => void }) {
  const pick = (ev: React.MouseEvent<HTMLDivElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    const y = MAP_START + ((ev.clientX - r.left) / r.width) * (MAP_END - MAP_START)
    let best = 0
    EVENTS.forEach((e, i) => {
      if (e.year <= MAP_END && Math.abs(e.year - y) < Math.abs(EVENTS[best].year - y)) best = i
    })
    onJump(best)
  }
  const cur = idx >= 0 ? trueX(EVENTS[idx].year) : 0
  return (
    <div>
      <div className="relative h-5 cursor-pointer" onClick={pick} aria-hidden="true">
        <div className="absolute inset-x-0 top-1/2 h-px bg-hairline" />
        <div className="absolute left-0 top-1/2 h-px bg-signal/60" style={{ width: `${cur * 100}%` }} />
        {EVENTS.map((e, i) => (
          <span key={e.id} className={`absolute top-1/2 h-2 w-px -translate-y-1/2 ${i === idx ? 'h-4 bg-signal' : i <= idx ? 'bg-ink/60' : 'bg-ink/20'}`} style={{ left: `${trueX(e.year) * 100}%` }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[0.58rem] uppercase tracking-[0.12em] text-ink-faint">
        <span>3200 BCE</span>
        <span className="hidden sm:inline">True scale. After Sputnik: {SPACE_AGE_SHARE.toFixed(1)}% of this line</span>
        <span>2050</span>
      </div>
    </div>
  )
}

export function StepButtons({ idx, onJump }: { idx: number; onJump: (i: number) => void }) {
  const btn = `label px-2 py-1 transition-colors hover:text-ink disabled:opacity-30 disabled:hover:text-ink-faint ${focusRing}`
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Step through the timeline">
      <button type="button" className={btn} onClick={() => onJump(Math.max(0, idx - 1))} disabled={idx <= 0} aria-label="Previous event">‹ Prev</button>
      <span className="label tabular-nums !text-ink-dim">{Math.max(idx + 1, 0)} / {N}</span>
      <button type="button" className={btn} onClick={() => onJump(Math.min(N - 1, idx + 1))} disabled={idx >= N - 1} aria-label="Next event">Next ›</button>
    </div>
  )
}
