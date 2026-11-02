import { useState, type KeyboardEvent } from 'react'
import { Bullets, Note, SectionHead, focusRing, svgText } from '@/components/sections/life/ui'
import { fmtLy } from '@/lib/deepSpace'
import { EARTH_ROW, ROCKY_LIMIT_RE, SOLAR_REFS, WORLDS, WORLD_BY_ID, ZONE_LABEL, zoneFluxes, type World } from '@/lib/searchForLife'

// Plot geometry: starlight received (log, Earth = 1) against radius (Earth radii).
const W = 600
const H = 380
const L = 54
const R = 586
const T = 20
const B = 332
const FLUX_MIN = 0.1
const FLUX_MAX = 30
const R_MAX = 3
const lx = (f: number) => L + ((Math.log10(f) - Math.log10(FLUX_MIN)) / (Math.log10(FLUX_MAX) - Math.log10(FLUX_MIN))) * (R - L)
const ry = (r: number) => B - (r / R_MAX) * (B - T)
const X_TICKS = [0.1, 0.3, 1, 3, 10, 30]

const fmtFlux = (f: number) => (f >= 100 ? Math.round(f).toLocaleString('en-US') : f >= 10 ? f.toFixed(0) : f.toFixed(2))

const activate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    fn()
  }
}

/**
 * Earth is the only calibration we have. This section puts every candidate on Earth’s own axes (how much starlight,
 * how big) and then, in a table, on the axes that matter and are mostly unmeasured.
 */
export default function EarthComparison() {
  const [sel, setSel] = useState('trappist-1e')
  const w = WORLD_BY_ID[sel]
  const zf = zoneFluxes(w.teff)

  return (
    <div className="mx-auto max-w-7xl px-6 py-24 md:px-10">
      <SectionHead
        kicker="09 — Search for Life · Candidates"
        title="Measured against Earth."
        lead={
          <>
            <p>
              Earth is the only planet known to be inhabited, so every candidate is judged by how it compares: its size, the starlight it receives, and
              whether it sits in the zone of its own star. Select a world.
            </p>
            <p>These are candidates in the sense of <em>worth studying</em>. None is known to have an ocean, or an atmosphere like ours.</p>
          </>
        }
      />

      <div className="mt-14 flex flex-wrap gap-x-6 gap-y-3 border-y border-hairline py-4" role="tablist" aria-label="Candidate worlds">
        {WORLDS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === sel}
            onClick={() => setSel(c.id)}
            className={`label border-b pb-1 transition-colors hover:text-ink ${focusRing} ${c.id === sel ? 'border-signal text-ink' : 'border-transparent'}`}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="mt-10 grid gap-12 md:grid-cols-[minmax(0,34rem)_1fr] md:gap-16">
        <figure>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Candidate planets by radius and starlight received, compared with Earth, Venus, Mars and Mercury">
            {/* The zone for the SELECTED world's own star. */}
            <rect x={lx(zf.optOuter)} y={T} width={Math.max(1, lx(zf.optInner) - lx(zf.optOuter))} height={B - T} fill="#8fb4ff" opacity="0.09" />
            <rect x={lx(zf.conOuter)} y={T} width={Math.max(1, lx(zf.conInner) - lx(zf.conOuter))} height={B - T} fill="#8fb4ff" opacity="0.2" />
            <text x={(lx(zf.conOuter) + lx(zf.conInner)) / 2} y={T + 12} textAnchor="middle" fontSize="8.5" fill="#8fb4ff" {...svgText}>ITS STAR’S ZONE</text>

            {/* Axes. */}
            <line x1={L} x2={R} y1={B} y2={B} stroke="rgb(232 236 244 / 0.25)" />
            <line x1={L} x2={L} y1={T} y2={B} stroke="rgb(232 236 244 / 0.25)" />
            {X_TICKS.map((f) => (
              <g key={f}>
                <line x1={lx(f)} x2={lx(f)} y1={B} y2={B + 5} stroke="rgb(232 236 244 / 0.3)" />
                <text x={lx(f)} y={B + 18} textAnchor="middle" fontSize="9" fill="#5d667c" {...svgText}>{f}</text>
              </g>
            ))}
            {[0, 1, 2, 3].map((r) => (
              <g key={r}>
                <line x1={L - 5} x2={L} y1={ry(r)} y2={ry(r)} stroke="rgb(232 236 244 / 0.3)" />
                <text x={L - 9} y={ry(r) + 3} textAnchor="end" fontSize="9" fill="#5d667c" {...svgText}>{r}</text>
              </g>
            ))}
            <text x={(L + R) / 2} y={B + 40} textAnchor="middle" fontSize="9" fill="#5d667c" {...svgText}>STARLIGHT RECEIVED, EARTH = 1 (LOG)</text>
            <text transform={`translate(14 ${(T + B) / 2}) rotate(-90)`} textAnchor="middle" fontSize="9" fill="#5d667c" {...svgText}>RADIUS, EARTH = 1</text>

            {/* Where planets stop being mostly rocky. */}
            <line x1={L} x2={R} y1={ry(ROCKY_LIMIT_RE)} y2={ry(ROCKY_LIMIT_RE)} stroke="#e8ecf4" strokeOpacity="0.3" strokeDasharray="3 5" />
            <text x={R - 4} y={ry(ROCKY_LIMIT_RE) - 6} textAnchor="end" fontSize="8.5" fill="#9aa3b8" {...svgText}>≈ 1.6 R⊕ · ABOVE THIS, MOST PLANETS ARE NOT PURELY ROCKY</text>

            {/* Solar System references. */}
            {SOLAR_REFS.filter((p) => p.name !== 'Earth').map((p) => {
              const f = 1 / (p.au * p.au)
              return (
                <g key={p.name}>
                  <circle cx={lx(f)} cy={ry(p.radiusE)} r={3.2} fill="none" stroke="#9aa3b8" />
                  <text x={lx(f)} y={ry(p.radiusE) + 15} textAnchor="middle" fontSize="8.5" fill="#9aa3b8" {...svgText}>{p.name.toUpperCase()}</text>
                </g>
              )
            })}
            <circle cx={lx(1)} cy={ry(1)} r={6} fill="#8fb4ff" opacity="0.9" />
            <text x={lx(1) + 10} y={ry(1) - 8} fontSize="9" fill="#e8ecf4" {...svgText}>EARTH</text>

            {/* A planet with no measured radius is shown as a line at its starlight. */}
            {w.radiusE === null && (
              <g>
                <line x1={lx(w.flux)} x2={lx(w.flux)} y1={T + 18} y2={B} stroke="#e8ecf4" strokeDasharray="1 4" strokeOpacity="0.7" />
                <text x={lx(w.flux)} y={T + 30} textAnchor="middle" fontSize="8.5" fill="#e8ecf4" {...svgText}>{`${w.name.toUpperCase()}: RADIUS UNKNOWN`}</text>
              </g>
            )}

            {/* The candidates. */}
            {WORLDS.filter((c) => c.radiusE !== null).map((c) => {
              const off = c.flux > FLUX_MAX
              const x = off ? R - 6 : lx(c.flux)
              const y = ry(Math.min(R_MAX, c.radiusE as number))
              const on = c.id === sel
              const go = () => setSel(c.id)
              return (
                <g
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${c.name}: ${c.radiusE} Earth radii, ${fmtFlux(c.flux)} times Earth’s starlight`}
                  onClick={go}
                  onKeyDown={activate(go)}
                  className={`cursor-pointer ${focusRing}`}
                >
                  <title>{c.name}</title>
                  <circle cx={x} cy={y} r={14} fill="transparent" />
                  {on && <circle cx={x} cy={y} r={10} fill="none" stroke="#8fb4ff" strokeOpacity="0.8" />}
                  <circle cx={x} cy={y} r={on ? 5 : 3.6} fill={on ? '#8fb4ff' : '#e8ecf4'} opacity={on ? 1 : 0.8} />
                  {on && (
                    <text x={x} y={y - 16} textAnchor={off ? 'end' : 'middle'} fontSize="9.5" fill="#e8ecf4" {...svgText}>
                      {off ? `${c.name.toUpperCase()} → ${fmtFlux(c.flux)}×` : c.name.toUpperCase()}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
          <Note className="mt-3">
            The shaded band is the zone for the selected planet’s own star; it moves from star to star. Proxima b is drawn as a line because its radius is unknown.
            Starlight and zone edges are computed here from published periods, stellar masses and luminosities, and can differ from published values by up
            to about 20 %.
          </Note>
        </figure>

        <div key={w.id} className="fade-up">
          <p className="label text-signal">
            {w.hostType} · {w.host}
          </p>
          <h3 className="mt-3 font-display text-4xl leading-tight md:text-5xl">{w.name}</h3>
          <p className="mt-3 max-w-lg text-lg text-ink-dim">{w.headline}</p>

          <Comparison w={w} />

          <div className="mt-8 border-t border-hairline pt-6">
            <p className="label text-signal">The air, so far</p>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink md:text-base">{w.atmosphere}</p>
          </div>

          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            <div>
              <p className="label">What is measured</p>
              <div className="mt-4"><Bullets items={w.known} /></div>
            </div>
            <div>
              <p className="label">What is not</p>
              <div className="mt-4"><Bullets items={w.unknown} /></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ k, earth, planet, sub }: { k: string; earth: string; planet: string; sub?: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr_1fr] items-baseline gap-x-4 py-3.5 sm:grid-cols-[9rem_1fr_1fr]">
      <dt className="label text-[0.625rem]">{k}</dt>
      <dd className="font-display text-lg leading-snug text-ink-dim">{earth}</dd>
      <dd>
        <span className="font-display text-lg leading-snug text-ink">{planet}</span>
        {sub && <span className="mt-0.5 block text-xs leading-snug text-ink-faint">{sub}</span>}
      </dd>
    </div>
  )
}

function Comparison({ w }: { w: World }) {
  return (
    <div className="mt-8">
      <div className="grid grid-cols-[7.5rem_1fr_1fr] gap-x-4 border-b border-hairline pb-2 sm:grid-cols-[9rem_1fr_1fr]">
        <span />
        <span className="label text-[0.625rem]">Earth</span>
        <span className="label text-[0.625rem] text-signal">{w.name}</span>
      </div>
      <dl className="divide-y divide-hairline border-b border-hairline">
        <Row k="Radius" earth="1 R⊕" planet={w.radiusE === null ? 'Not measured' : `${w.radiusE.toFixed(2)} R⊕`} />
        <Row
          k="Mass"
          earth="1 M⊕"
          planet={w.massE === null ? 'Not measured' : `${w.massMinimum ? '≥ ' : ''}${w.massE.toFixed(w.massE < 10 ? 2 : 1)} M⊕`}
          sub={w.massMinimum ? 'A minimum: the orbit’s tilt is unknown' : undefined}
        />
        <Row k="Starlight" earth="1 ×" planet={`${fmtFlux(w.flux)} ×`} sub={ZONE_LABEL[w.status]} />
        <Row
          k="Temperature"
          earth="255 K"
          planet={`${Math.round(w.teq)} K`}
          sub="Equilibrium, with Earth’s reflectivity and no greenhouse effect. Earth’s real surface average is about 288 K."
        />
        <Row k="Year" earth={`${EARTH_ROW.period.toFixed(0)} days`} planet={`${w.period < 10 ? w.period.toFixed(2) : w.period.toFixed(1)} days`} sub={`${w.au.toFixed(3)} AU from its star`} />
        <Row k="Star" earth="G2 yellow dwarf" planet={w.hostType} sub={`${w.lyApprox ? '≈ ' : ''}${fmtLy(w.ly)} away`} />
      </dl>
    </div>
  )
}
