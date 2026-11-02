import { useRef, type CSSProperties } from 'react'
import SectionShell from '@/components/layout/SectionShell'
import EarthComparison from '@/components/sections/life/EarthComparison'
import EvidenceLadder from '@/components/sections/life/EvidenceLadder'
import HabitableZoneLab from '@/components/sections/life/HabitableZoneLab'
import OddsLab from '@/components/sections/life/OddsLab'
import SpectrumLab from '@/components/sections/life/SpectrumLab'
import { Note, focusRing, svgText } from '@/components/sections/life/ui'
import { chapters } from '@/data/journey'
import { useRenderProfile } from '@/hooks/useRenderProfile'
import { useSectionProgress } from '@/hooks/useSectionProgress'
import { beat } from '@/lib/beat'
import { TOTAL_CONFIRMED, fmtInt } from '@/lib/deepSpace'
import { NEXT_STEPS, zoneEdges } from '@/lib/searchForLife'

const chapter = chapters.find((c) => c.id === 'search-for-life')!
const next = chapters[chapters.indexOf(chapter) + 1]
const number = String(chapters.indexOf(chapter) + 1).padStart(2, '0')

// ---------------------------------------------------------------------------------------------------------------------
// The opening diagram: the Solar System's inner orbits, then the habitable zone laid over them. Everything is SVG driven by
// the scroll variable --p in CSS, so scrolling costs no React renders and the reduced-motion page gets the finished frame.
// ---------------------------------------------------------------------------------------------------------------------
const PX_PER_AU = 170
const SUN_ZONE = zoneEdges(1, 5772)
const ORBITS = [
  { name: 'Mercury', au: 0.387, angle: -52 },
  { name: 'Venus', au: 0.723, angle: 38 },
  { name: 'Earth', au: 1, angle: -128 },
  { name: 'Mars', au: 1.524, angle: 68 },
] as const

/** CSS-only ramp 0 → 1 over [a, b] of the chapter's scroll progress. */
const ramp = (a: number, b: number) => `clamp(0, calc((var(--p) - ${a}) * ${(1 / (b - a)).toFixed(3)}), 1)`
const fade = (a: number, b: number, max = 1): CSSProperties => ({ opacity: `calc(${ramp(a, b)} * ${max})` })
const at = (au: number, angle: number) => {
  const r = au * PX_PER_AU
  const t = (angle * Math.PI) / 180
  return { x: r * Math.cos(t), y: r * Math.sin(t) }
}

function OrbitDiagram() {
  const zoneMid = ((SUN_ZONE.conInner + SUN_ZONE.conOuter) / 2) * PX_PER_AU
  const zoneWidth = (SUN_ZONE.conOuter - SUN_ZONE.conInner) * PX_PER_AU
  const mars = at(1.524, 68)
  return (
    <svg viewBox="-330 -330 660 660" className="h-full w-full" role="img" aria-label="The inner Solar System: the orbits of Mercury, Venus, Earth and Mars, with the Sun’s habitable zone shaded between roughly Earth’s orbit and a little beyond Mars’s">
      <defs>
        <radialGradient id="sfl-sun">
          <stop offset="0" stopColor="#fff3da" stopOpacity="1" />
          <stop offset="0.3" stopColor="#ffd9a0" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffb677" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* The zone, drawn as a thick ring so it stays a true annulus. */}
      <circle r={zoneMid} fill="none" stroke="#8fb4ff" strokeWidth={zoneWidth} style={fade(0.42, 0.58, 0.13)} />
      <circle r={SUN_ZONE.conInner * PX_PER_AU} fill="none" stroke="#8fb4ff" strokeOpacity="0.55" style={fade(0.42, 0.58)} />
      <circle r={SUN_ZONE.conOuter * PX_PER_AU} fill="none" stroke="#8fb4ff" strokeOpacity="0.55" style={fade(0.42, 0.58)} />
      <text x={0} y={-SUN_ZONE.conOuter * PX_PER_AU - 10} textAnchor="middle" fontSize="10" fill="#8fb4ff" {...svgText} style={fade(0.46, 0.6)}>
        HABITABLE ZONE · 0.99 – 1.71 AU
      </text>

      {/* Orbits: Earth's draws itself first; the others arrive after. */}
      {ORBITS.map((o) => {
        const isEarth = o.name === 'Earth'
        return (
          <circle
            key={o.name}
            r={o.au * PX_PER_AU}
            fill="none"
            stroke={isEarth ? '#8fb4ff' : '#e8ecf4'}
            strokeOpacity={isEarth ? 0.8 : 0.22}
            pathLength={1}
            strokeDasharray={1}
            transform="rotate(-90)"
            style={{ strokeDashoffset: `calc(1 - ${isEarth ? ramp(0.02, 0.22) : ramp(0.28, 0.42)})` }}
          />
        )
      })}

      <circle r={46} fill="url(#sfl-sun)" />

      {ORBITS.map((o) => {
        const p = at(o.au, o.angle)
        const isEarth = o.name === 'Earth'
        return (
          <g key={o.name} style={isEarth ? fade(0.12, 0.26) : fade(0.34, 0.46)}>
            <circle cx={p.x} cy={p.y} r={isEarth ? 5 : 3.2} fill={isEarth ? '#8fb4ff' : '#e8ecf4'} />
            {isEarth && <circle cx={p.x} cy={p.y} r={11} fill="none" stroke="#8fb4ff" strokeOpacity="0.4" />}
            <text x={p.x} y={p.y + (p.y > 0 ? 20 : -14)} textAnchor="middle" fontSize="9.5" fill={isEarth ? '#e8ecf4' : '#9aa3b8'} {...svgText}>
              {o.name.toUpperCase()}
            </text>
          </g>
        )
      })}

      {/* Mars sits inside the zone: the point of the third beat. */}
      <g style={fade(0.62, 0.74)}>
        <circle cx={mars.x} cy={mars.y} r={12} fill="none" stroke="#e8ecf4" strokeOpacity="0.5" strokeDasharray="2 3" />
        <text x={mars.x} y={mars.y + 36} textAnchor="middle" fontSize="9" fill="#e8ecf4" {...svgText}>INSIDE THE ZONE.</text>
        <text x={mars.x} y={mars.y + 49} textAnchor="middle" fontSize="9" fill="#e8ecf4" {...svgText}>STILL A FROZEN DESERT.</text>
      </g>
    </svg>
  )
}

/**
 * Chapter 09 — Search for Life.
 * A pinned, restrained opening (one diagram, four beats), then five interactive instruments built as DOM/SVG (no canvas, so no
 * GPU cost): the habitable zone, candidates against Earth, atmospheres and biosignatures, the ladder of evidence, and the odds.
 * Reduced motion: no pinning; the finished opening diagram above stacked text.
 */
export default function ChapterSearchForLife() {
  const { animate } = useRenderProfile()
  const track = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  useSectionProgress(track, stage, animate)

  const pinned = animate
  const b1 = pinned ? beat(0.02, 0.1, 0.26, 0.34) : undefined
  const b2 = pinned ? beat(0.36, 0.44, 0.55, 0.62) : undefined
  const b3 = pinned ? beat(0.64, 0.72, 0.84, 0.9) : undefined
  const b4 = pinned ? beat(0.92, 0.98) : undefined
  const layer = pinned ? 'col-start-1 row-start-1 self-end' : ''

  return (
    <SectionShell id="search-for-life" bleed>
      <div ref={track} className="relative" style={pinned ? { height: '420svh' } : undefined}>
        <div ref={stage} className={pinned ? 'sticky top-0 h-svh overflow-hidden' : 'relative overflow-hidden pt-16'}>
          <div
            aria-hidden={false}
            className={`pointer-events-none ${pinned ? 'absolute bottom-0 right-0 top-32 w-full opacity-60 md:w-[64%] md:opacity-100' : 'relative mx-auto h-[70svh] max-w-3xl'}`}
          >
            <OrbitDiagram />
          </div>

          {/* Keeps type legible where it crosses the diagram on narrow screens. */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 ${pinned ? '' : 'hidden'}`}
            style={{ background: 'linear-gradient(90deg, rgb(3 4 10 / 0.75) 0%, rgb(3 4 10 / 0.4) 36%, transparent 62%)' }}
          />

          <div className={`relative mx-auto flex w-full max-w-7xl flex-col px-6 md:px-10 ${pinned ? 'h-full' : ''}`}>
            <div className={pinned ? 'pt-24' : 'pt-8'}>
              <div className="flex items-baseline justify-between">
                <p className="label">{number} — {chapter.title}</p>
                <p className="label">{chapter.scale}</p>
              </div>
              <div className="mt-4 h-px w-full bg-hairline">
                <div className="h-full origin-left bg-signal/60" style={{ transform: pinned ? 'scaleX(var(--p))' : 'scaleX(1)' }} />
              </div>
            </div>

            <div className={`pb-20 md:pb-24 ${pinned ? 'mt-auto grid' : 'mt-16 flex flex-col gap-20'}`}>
              <div className={layer} style={b1}>
                <h2 className="font-display text-[clamp(2.75rem,7vw,6.5rem)] font-normal uppercase leading-[0.9] tracking-[-0.01em] text-ink">
                  {chapter.title}
                </h2>
                <p className="mt-8 max-w-md text-lg leading-relaxed text-ink-dim md:text-xl">{chapter.summary}</p>
                <p className="label mt-6">No life beyond Earth has been detected.</p>
              </div>

              <p className={`${layer} max-w-xl font-display text-2xl leading-snug text-ink md:text-4xl`} style={b2}>
                Of every world we know, one is known to be alive. All the rest of this chapter starts from that single example.
              </p>

              <p className={`${layer} max-w-xl font-display text-2xl leading-snug text-ink md:text-4xl`} style={b3}>
                Life as we know it needs liquid water, and starlight decides where a planet can keep it. But a place being possible is not the
                same as a place being inhabited.
              </p>

              <div className={layer} style={b4}>
                <dl className="grid max-w-xl grid-cols-3 gap-x-8 gap-y-6">
                  <div>
                    <dt className="label">Confirmed planets</dt>
                    <dd className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-ink-dim">{fmtInt(Math.floor(TOTAL_CONFIRMED / 100) * 100)}+</dd>
                  </div>
                  <div>
                    <dt className="label">Known to host life</dt>
                    <dd className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-ink-dim">1</dd>
                  </div>
                  <div>
                    <dt className="label">Biosignatures confirmed elsewhere</dt>
                    <dd className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-ink-dim">0</dd>
                  </div>
                </dl>
                <a
                  href="#sfl-zone"
                  className={`pointer-events-auto group mt-12 inline-flex items-center gap-5 text-ink-dim transition-colors hover:text-ink ${focusRing}`}
                >
                  <span className="h-px w-12 bg-ink/30 transition-all duration-500 group-hover:w-20 group-hover:bg-signal" />
                  <span className="label text-[0.8125rem] text-current">
                    Begin · The habitable zone{' '}
                    <span aria-hidden="true" className="inline-block transition-transform duration-500 group-hover:translate-y-1">↓</span>
                  </span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="sfl-zone"><HabitableZoneLab /></div>
      <div className="border-t border-hairline"><EarthComparison /></div>
      <div className="border-t border-hairline"><SpectrumLab /></div>
      <div className="border-t border-hairline"><EvidenceLadder /></div>
      <div className="border-t border-hairline"><OddsLab /></div>

      {/* Closing: where the search goes next. */}
      <div className="border-t border-hairline">
        <div className="mx-auto max-w-7xl px-6 py-24 md:px-10">
          <p className="label">09 — Search for Life · Next</p>
          <h2 className="mt-6 max-w-4xl font-display text-4xl leading-tight md:text-6xl">
            Nothing has been found. That is the starting position.
          </h2>
          <p className="mt-6 max-w-2xl text-ink-dim md:text-lg">
            A question that could take a generation does not become less interesting for being unanswered. The instruments below are how it will be tested, in
            order of how soon they can say something.
          </p>

          <ul className="mt-14 divide-y divide-hairline border-y border-hairline">
            {NEXT_STEPS.map((s) => (
              <li key={s.name} className="grid gap-x-10 gap-y-2 py-6 md:grid-cols-[16rem_14rem_1fr]">
                <span className="font-display text-2xl text-ink">{s.name}</span>
                <span className="label self-center">
                  {s.who} · {s.when}
                </span>
                <span className="text-sm leading-relaxed text-ink-dim md:text-base">{s.text}</span>
              </li>
            ))}
          </ul>

          <div className="mt-16 flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <Note className="max-w-3xl">
              Real: planet radii, masses, periods and distances (rounded; several are revised between papers), the published habitable-zone fit, the band
              wavelengths, the history of the claims. Modelled or assumed: the spectrum heights and noise, the effective temperatures with Earth-like reflectivity,
              and every number in the odds section. Mission schedules and the status of disputed claims were checked in October 2026 and will change. No result
              shown in this chapter is evidence of life beyond Earth.
            </Note>
            {next && (
              <a
                href={next.status === 'live' ? `#${next.id}` : '#journey'}
                className={`group/n inline-flex shrink-0 items-center gap-4 text-ink-dim transition-colors hover:text-ink ${focusRing}`}
              >
                <span className="h-px w-8 bg-ink/30 transition-all duration-500 group-hover/n:w-14 group-hover/n:bg-signal" />
                <span className="label text-current">
                  Next · {next.title} · {next.scale} ↓
                </span>
              </a>
            )}
          </div>
        </div>
      </div>
    </SectionShell>
  )
}
