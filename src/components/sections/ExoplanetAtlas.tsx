import { useEffect, useId, useMemo, useRef, useState } from 'react'
import SectionShell from '@/components/layout/SectionShell'
import { chapters } from '@/data/journey'
import { useRenderProfile } from '@/hooks/useRenderProfile'
import {
  EXOPLANETS, EXOPLANET_BY_ID, METHOD_COUNTS, MILESTONES, TOTAL_CONFIRMED, fmtInt, fmtLy, lightLeft, orbitAU, transitDepth, transitHours,
  type Exoplanet, type Look,
} from '@/lib/deepSpace'

const next = chapters[chapters.findIndex((c) => c.id === 'deep-space') + 1]
const btn =
  'label transition-colors hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-signal'
const THIS_YEAR = new Date().getFullYear()

/**
 * The second half of Chapter 08: how other worlds are found, and eight of them. Everything here is DOM/SVG: a distance
 * map of the host stars, a timeline of discoveries, a detection scope driven by each planet's real numbers, and the
 * planets themselves as artist's impressions (no exoplanet has been photographed as anything more than a point of light).
 */
export default function ExoplanetAtlas() {
  const [sel, setSel] = useState('kepler-186f')
  const planet = EXOPLANET_BY_ID[sel]
  const maxMethod = METHOD_COUNTS[0].n

  return (
    <SectionShell id="exoplanets" bleed>
      <div className="mx-auto max-w-7xl px-6 pb-8 pt-32 md:px-10">
        <p className="label">08 — Deep Space · Discovery</p>
        <h2 className="mt-6 max-w-3xl font-display text-4xl leading-tight md:text-6xl">Worlds around other suns.</h2>
        <p className="mt-6 max-w-2xl text-ink-dim md:text-lg">
          No exoplanet has been photographed as more than a point of light. Almost all are found indirectly: by the dimming of a star as a
          planet crosses it, or by the tiny wobble of a star pulled by its planets. Before 1992 none were known. The
          NASA Exoplanet Archive now lists more than {fmtInt(Math.floor(TOTAL_CONFIRMED / 100) * 100)} confirmed planets.
        </p>

        <div className="mt-16 grid gap-14 md:grid-cols-[1.1fr_1fr] md:gap-20">
          <div>
            <p className="label">Three decades</p>
            <ol className="mt-5 divide-y divide-hairline border-y border-hairline">
              {MILESTONES.map((m) => (
                <li key={m.year} className="grid grid-cols-[3.5rem_1fr] gap-x-5 gap-y-1 py-3.5">
                  <span className="label pt-0.5 text-signal">{m.year}</span>
                  <div>
                    <p className="font-display text-xl leading-snug text-ink">{m.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-dim">{m.line}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <p className="label">How they were found</p>
            <ul className="mt-5 space-y-5">
              {METHOD_COUNTS.map((m) => (
                <li key={m.name}>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-ink">{m.name}</span>
                    <span className="label text-ink-dim">{fmtInt(m.n)}</span>
                  </div>
                  <div className="mt-2 h-px bg-ink/10">
                    <div className="h-px bg-signal/70" style={{ width: `${Math.max(1.5, (m.n / maxMethod) * 100)}%` }} />
                  </div>
                  <p className="mt-2 text-sm text-ink-dim">{m.note}</p>
                </li>
              ))}
            </ul>
            <p className="label mt-6 text-[0.625rem] normal-case leading-relaxed tracking-wide">
              Counts from the NASA Exoplanet Archive’s published tally (rounded; the archive updates continually, and a few planets are
              credited to more than one method). Total {fmtInt(TOTAL_CONFIRMED)}.
            </p>
          </div>
        </div>
      </div>

      {/* Atlas */}
      <div className="mx-auto max-w-7xl px-6 py-16 md:px-10">
        <p className="label">Eight worlds</p>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 border-y border-hairline py-4" role="tablist" aria-label="Exoplanets">
          {EXOPLANETS.map((e) => (
            <button
              key={e.id}
              type="button"
              role="tab"
              aria-selected={e.id === sel}
              onClick={() => setSel(e.id)}
              className={`${btn} ${e.id === sel ? 'text-ink' : ''} border-b pb-1 ${e.id === sel ? 'border-signal' : 'border-transparent'}`}
            >
              {e.name}
            </button>
          ))}
        </div>

        <div className="mt-10 grid gap-12 md:grid-cols-[minmax(0,26rem)_1fr] md:gap-16">
          <div className="flex flex-col gap-10">
            <DistanceMap sel={sel} onSelect={setSel} />
            <div className="grid grid-cols-[auto_1fr] items-center gap-8">
              <PlanetSphere e={planet} />
              <SizeCompare e={planet} />
            </div>
            <p className="label text-[0.625rem] normal-case leading-relaxed tracking-wide">
              Artist’s impression, built from the measured size, temperature and type. Real exoplanets have not been resolved: nothing about
              their surfaces is observed directly.
            </p>
          </div>

          <div key={planet.id} className="fade-up">
            <p className="label text-signal">
              {planet.hostType} · {planet.host}
            </p>
            <h3 className="mt-3 font-display text-4xl leading-tight md:text-5xl">{planet.name}</h3>
            <p className="mt-3 max-w-lg text-lg text-ink-dim">{planet.headline}</p>

            <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-5 border-y border-hairline py-6 sm:grid-cols-3">
              <Stat k="Distance" v={fmtLy(planet.ly)} sub={`${planet.lyApprox ? '≈ ' : ''}light left ${lightLeftText(planet)}`} />
              <Stat k="Discovered" v={String(planet.year)} sub={planet.method} />
              <Stat k="Orbit" v={`${planet.period < 10 ? planet.period.toFixed(2) : planet.period.toFixed(1)} days`} sub={`${orbitAU(planet).toFixed(3)} AU from its star`} />
              <Stat k="Radius" v={planet.radiusLabel} />
              <Stat k="Mass" v={planet.massLabel} />
              <Stat k="Temperature" v={planet.temp} />
            </dl>

            <ul className="mt-8 space-y-4">
              {planet.facts.map((f) => (
                <li key={f} className="flex gap-4 text-sm leading-relaxed text-ink-dim md:text-base">
                  <span className="mt-[0.7em] h-px w-5 shrink-0 bg-ink/30" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <p className="label mt-6 text-[0.625rem] normal-case tracking-wide">Found by {planet.by}.</p>

            <DetectionScope key={planet.id} e={planet} />
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 pb-24 md:flex-row md:items-start md:justify-between md:px-10">
        <p className="label max-w-3xl text-[0.625rem] normal-case leading-relaxed tracking-wide">
          Real: the positions, distances, discovery years, orbital periods, radii and masses above (rounded; several distances were revised
          between papers and are marked ≈), the nebulae’s positions and sizes, the catalogue stars in the flight. Generated: the faint star
          field, the sky glow, the nebula textures and the background galaxies (which are also drawn far larger than life). The nebulae sit at their true positions but are drawn about twice their true angular size. Orbital radii in the Kepler-186 system are computed from the
          periods and the star’s mass; the habitable zone is approximate. In the flight, distances are true; it is the time that is compressed.
        </p>
        {next && (
          <a
            href={next.status === 'live' ? `#${next.id}` : '#journey'}
            className="group/n inline-flex shrink-0 items-center gap-4 text-ink-dim transition-colors hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-signal"
          >
            <span className="h-px w-8 bg-ink/30 transition-all duration-500 group-hover/n:w-14 group-hover/n:bg-signal" />
            <span className="label text-current">
              Next · {next.title} · {next.scale} ↓
            </span>
          </a>
        )}
      </div>
    </SectionShell>
  )
}

const lightLeftText = (e: Exoplanet) => (e.ly < 1 ? 'recently' : `in ${Math.max(0, lightLeft(e.ly, THIS_YEAR))}`)

function Stat({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div>
      <dt className="label text-[0.625rem]">{k}</dt>
      <dd className="mt-1.5 font-display text-xl leading-snug text-ink">{v}</dd>
      {sub && <p className="mt-1 text-xs leading-snug text-ink-faint">{sub}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// Distance map: every host star at its right ascension (angle) and log distance from the Sun (radius).
// ---------------------------------------------------------------------------------------------------------------------
function DistanceMap({ sel, onSelect }: { sel: string; onSelect: (id: string) => void }) {
  const C = 200
  const R = 168
  const rOf = (ly: number) => R * Math.min(1, Math.max(0, (Math.log10(ly) + 0.1) / 3.1))
  const at = (e: Exoplanet) => {
    const r = rOf(e.ly)
    const t = (e.ra * Math.PI) / 180
    return { x: C + r * Math.sin(t), y: C - r * Math.cos(t) }
  }
  const rings: [number, string][] = [[10, '10 ly'], [100, '100 ly'], [1000, '1,000 ly']]
  const cur = EXOPLANET_BY_ID[sel]
  const cp = at(cur)
  const flip = cp.x > C + 40
  return (
    <figure>
      <svg viewBox="0 0 400 400" className="w-full" role="img" aria-label="Map of the eight host stars around the Sun by direction and distance">
        {rings.map(([ly, t]) => (
          <g key={ly}>
            <circle cx={C} cy={C} r={rOf(ly)} fill="none" stroke="rgb(232 236 244 / 0.1)" />
            <text x={C + 4} y={C - rOf(ly) - 3} fontSize="8" fill="#5d667c" fontFamily="ui-monospace, Menlo, monospace" letterSpacing="1">{t.toUpperCase()}</text>
          </g>
        ))}
        {[0, 90, 180, 270].map((a) => (
          <line key={a} x1={C} y1={C} x2={C + R * Math.sin((a * Math.PI) / 180)} y2={C - R * Math.cos((a * Math.PI) / 180)} stroke="rgb(232 236 244 / 0.06)" />
        ))}
        {(['0h', '6h', '12h', '18h'] as const).map((t, i) => {
          const a = (i * 90 * Math.PI) / 180
          return (
            <text key={t} x={C + (R + 14) * Math.sin(a)} y={C - (R + 14) * Math.cos(a) + 3} textAnchor="middle" fontSize="8" fill="#5d667c" fontFamily="ui-monospace, Menlo, monospace">{t}</text>
          )
        })}
        <circle cx={C} cy={C} r="3" fill="#e8ecf4" />
        <text x={C + 7} y={C + 12} fontSize="8" fill="#9aa3b8" fontFamily="ui-monospace, Menlo, monospace" letterSpacing="1">SUN</text>
        {EXOPLANETS.map((e) => {
          const p = at(e)
          const on = e.id === sel
          return (
            <g key={e.id} onClick={() => onSelect(e.id)} style={{ cursor: 'pointer' }}>
              <circle cx={p.x} cy={p.y} r="9" fill="transparent" />
              <circle cx={p.x} cy={p.y} r={on ? 3.6 : 2.4} fill={on ? '#8fb4ff' : 'rgb(232 236 244 / 0.7)'} />
              {on && <circle cx={p.x} cy={p.y} r="9" fill="none" stroke="#8fb4ff" strokeWidth="1" />}
              <title>{`${e.host} · ${fmtLy(e.ly)}`}</title>
            </g>
          )
        })}
        <text
          x={cp.x + (flip ? -14 : 14)}
          y={cp.y - 12}
          textAnchor={flip ? 'end' : 'start'}
          fontSize="9"
          fill="#e8ecf4"
          fontFamily="ui-monospace, Menlo, monospace"
          letterSpacing="1"
        >
          {cur.host.toUpperCase()} · {fmtLy(cur.ly).toUpperCase()}
        </text>
      </svg>
      <figcaption className="label mt-2 text-[0.625rem] normal-case leading-relaxed tracking-wide">
        The Sun at the centre. Angle is right ascension; distance is logarithmic, so each ring is ten times farther than the last. Declination is dropped.
      </figcaption>
    </figure>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// Artist's impressions
// ---------------------------------------------------------------------------------------------------------------------
const PALETTE: Record<Look, { a: string; b: string; c: string; bands?: boolean; glow?: string }> = {
  'hot-giant': { a: '#e7c9a0', b: '#9a6b4a', c: '#3a2418', bands: true, glow: '#ff9a66' },
  'blue-giant': { a: '#7fa5ff', b: '#27449b', c: '#0a1233', bands: true, glow: '#8fb4ff' },
  lava: { a: '#7a3b22', b: '#2b1710', c: '#0b0706', glow: '#ff6a2a' },
  rocky: { a: '#a8a39a', b: '#5a564f', c: '#14130f' },
  temperate: { a: '#8fa5b8', b: '#3d5260', c: '#0c1218', glow: '#8fb4ff' },
  'sub-neptune': { a: '#b9d6dc', b: '#5f8795', c: '#0f1a20', bands: true, glow: '#b9d6dc' },
}

function PlanetSphere({ e }: { e: Exoplanet }) {
  const uid = useId().replace(/:/g, '')
  const pal = PALETTE[e.look]
  const R = 62
  const bands = useMemo(() => {
    if (!pal.bands) return []
    const out: { y: number; h: number; o: number }[] = []
    let y = -R
    let i = 0
    while (y < R) {
      const h = 5 + ((i * 7) % 9)
      out.push({ y, h, o: 0.1 + ((i * 5) % 7) * 0.035 })
      y += h
      i++
    }
    return out
  }, [pal.bands])
  return (
    <svg viewBox="-80 -80 160 160" className="w-36 shrink-0 md:w-44" role="img" aria-label={`Artist’s impression of ${e.name}`}>
      <defs>
        <radialGradient id={`s${uid}`} cx="0.32" cy="0.3" r="0.9">
          <stop offset="0" stopColor={pal.a} />
          <stop offset="0.55" stopColor={pal.b} />
          <stop offset="1" stopColor={pal.c} />
        </radialGradient>
        <radialGradient id={`t${uid}`} cx="0.3" cy="0.28" r="0.95">
          <stop offset="0.5" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.82" />
        </radialGradient>
        <radialGradient id={`h${uid}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.82" stopColor={pal.glow ?? '#8fb4ff'} stopOpacity="0.28" />
          <stop offset="1" stopColor={pal.glow ?? '#8fb4ff'} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`c${uid}`}>
          <circle r={R} />
        </clipPath>
      </defs>
      {pal.glow && <circle r={R * 1.22} fill={`url(#h${uid})`} />}
      <g clipPath={`url(#c${uid})`}>
        <circle r={R} fill={`url(#s${uid})`} />
        {bands.map((b, i) => (
          <rect key={i} x={-R} y={b.y} width={R * 2} height={b.h} fill={i % 2 ? '#fff' : '#000'} opacity={b.o} />
        ))}
        {e.look === 'lava' && (
          <g stroke={pal.glow} strokeWidth="1.3" fill="none" opacity="0.85" strokeLinecap="round">
            <path d="M-40 -10 Q-22 -26 -4 -14 T 22 -22 T 44 -6" />
            <path d="M-34 18 Q-12 6 6 22 T 40 14" />
            <path d="M-10 -40 Q 2 -28 -6 -12" />
            <path d="M14 30 Q 26 44 40 34" />
          </g>
        )}
        {(e.look === 'temperate' || e.look === 'rocky') && (
          <g fill="#fff" opacity="0.12">
            <ellipse cx="-18" cy="-24" rx="26" ry="5" />
            <ellipse cx="12" cy="-4" rx="30" ry="4" />
            <ellipse cx="-24" cy="20" rx="22" ry="4.5" />
          </g>
        )}
        <circle r={R} fill={`url(#t${uid})`} />
      </g>
    </svg>
  )
}

function SizeCompare({ e }: { e: Exoplanet }) {
  if (e.radiusE === null) {
    return (
      <div>
        <p className="label text-[0.625rem]">Size</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          Radius not measured: {e.name} does not cross its star as seen from Earth, so only a minimum mass is known ({e.massLabel.replace('≥ ', '')} at least).
        </p>
      </div>
    )
  }
  const scale = Math.min(7, 62 / e.radiusE)
  const rp = Math.max(3, e.radiusE * scale)
  const re = Math.max(2, scale)
  const W = 170
  const H = Math.max(rp * 2, 20) + 8
  return (
    <div>
      <p className="label text-[0.625rem]">Size next to Earth</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full max-w-[11rem]" role="img" aria-label={`${e.name} is ${e.radiusE} times the radius of Earth`}>
        <circle cx={rp + 2} cy={H / 2} r={rp} fill="none" stroke="#8fb4ff" strokeWidth="1" />
        <circle cx={rp * 2 + 18 + re} cy={H / 2} r={re} fill="#e8ecf4" opacity="0.85" />
      </svg>
      <p className="mt-1 text-xs text-ink-faint">{e.radiusE >= 10 ? `${(e.radiusE / 11.21).toFixed(2)} Jupiter radii` : `${e.radiusE} Earth radii`}; Earth shown right.</p>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// Detection scope: the signal that revealed the planet, built from its own numbers.
// ---------------------------------------------------------------------------------------------------------------------
function DetectionScope({ e }: { e: Exoplanet }) {
  const { animate } = useRenderProfile()
  const depth = transitDepth(e)
  const hours = transitHours(e)
  const canTransit = depth !== null && hours !== null
  const canWobble = e.rvK !== undefined
  const [mode, setMode] = useState<'transit' | 'wobble'>(canTransit ? 'transit' : 'wobble')
  const [t, setT] = useState(0.5)
  const [playing, setPlaying] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  // Plays only while on screen, and only when the person has not asked for reduced motion.
  useEffect(() => {
    if (!playing || !animate) return
    const el = root.current
    let raf = 0
    let last = performance.now()
    let on = true
    const io = new IntersectionObserver(([en]) => (on = en.isIntersecting))
    if (el) io.observe(el)
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (on) setT((v) => (v + dt / 9) % 1)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
    }
  }, [playing, animate])

  if (!canTransit && !canWobble) return null
  const W = 460
  const H = 170
  const m = mode === 'transit' && canTransit ? 'transit' : 'wobble'

  return (
    <div ref={root} className="mt-12 border-t border-hairline pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <p className="label">The signal</p>
        <div className="flex gap-5" role="group" aria-label="Detection method">
          {canTransit && (
            <button type="button" onClick={() => setMode('transit')} aria-pressed={m === 'transit'} className={`${btn} ${m === 'transit' ? 'text-ink' : ''}`}>
              Transit
            </button>
          )}
          {canWobble && (
            <button type="button" onClick={() => setMode('wobble')} aria-pressed={m === 'wobble'} className={`${btn} ${m === 'wobble' ? 'text-ink' : ''}`}>
              Wobble
            </button>
          )}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" aria-label={m === 'transit' ? `Light curve of a transit of ${e.name}` : `Radial velocity curve of ${e.host}`}>
        {m === 'transit' && canTransit ? <TransitPlot e={e} depth={depth} hours={hours} t={t} W={W} H={H} /> : <WobblePlot k={e.rvK ?? 0} t={t} W={W} H={H} />}
      </svg>

      <div className="mt-3 flex items-center gap-4">
        {animate && (
          <button type="button" onClick={() => setPlaying((v) => !v)} className={`${btn} shrink-0`} aria-pressed={playing}>
            {playing ? 'Pause' : 'Play'}
          </button>
        )}
        <label className="sr-only" htmlFor={`scrub-${e.id}`}>Scrub through the signal</label>
        <input
          id={`scrub-${e.id}`}
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={t}
          onChange={(ev) => {
            setPlaying(false)
            setT(Number(ev.target.value))
          }}
          className="h-px w-full cursor-pointer appearance-none bg-ink/25 accent-[#8fb4ff] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-8 focus-visible:outline-signal"
        />
      </div>

      <p className="mt-4 text-sm leading-relaxed text-ink-dim">
        {m === 'transit' && canTransit
          ? `The planet blocks ${(depth * 100).toFixed(depth < 0.001 ? 3 : 2)} % of the starlight for about ${hours < 1 ? `${Math.round(hours * 60)} minutes` : `${hours.toFixed(1)} hours`} every ${e.period < 10 ? e.period.toFixed(2) : e.period.toFixed(1)} days. Depth is the square of the radius ratio. For comparison, Earth crossing the Sun blocks about 0.008 %.`
          : `${e.host} is pulled back and forth at up to ${e.rvK} m/s as ${e.name} orbits. For comparison, Jupiter moves the Sun at about 12.5 m/s and Earth at about 0.09 m/s. The curve shows one full orbit.`}
      </p>
    </div>
  )
}

function TransitPlot({ e, depth, hours, t, W, H }: { e: Exoplanet; depth: number; hours: number; t: number; W: number; H: number }) {
  const px = { l: 46, r: 10, top: 62, b: 24 }
  const plotW = W - px.l - px.r
  const plotH = H - px.top - px.b
  // Time window: ±1.6 transit durations around mid-transit. Ingress/egress shaped by the planet-to-star size ratio.
  const span = 3.2
  const ratio = Math.sqrt(depth)
  const ing = Math.min(0.5, ratio / (1 + ratio))
  const flux = (u: number) => {
    // u in transit durations from mid-transit, ±0.5 = first/last contact
    const a = Math.abs(u)
    if (a >= 0.5) return 1
    const edge = 0.5 - a
    const k = Math.min(1, edge / ing)
    return 1 - depth * (k * k * (3 - 2 * k))
  }
  const ymin = 1 - depth * 1.8
  const X = (u: number) => px.l + ((u + span / 2) / span) * plotW
  const Y = (f: number) => px.top + ((1 - f) / (1 - ymin)) * plotH * 0.95 + 4
  const pts: string[] = []
  for (let i = 0; i <= 120; i++) {
    const u = -span / 2 + (i / 120) * span
    pts.push(`${X(u).toFixed(1)},${Y(flux(u)).toFixed(1)}`)
  }
  const u = -span / 2 + t * span
  const cx = X(u)
  const cy = Y(flux(u))
  // Star + planet on top
  const sr = 24
  const sx = W / 2
  const sy = 28
  const pr = Math.max(1.2, ratio * sr)
  const pxs = sx + (u / 0.5) * (sr + pr)
  const inFrame = Math.abs(u) < 0.5 + pr / sr
  return (
    <>
      <circle cx={sx} cy={sy} r={sr} fill="#ffd9b0" opacity="0.9" />
      {inFrame && <circle cx={pxs} cy={sy} r={pr} fill="#03040a" />}
      <circle cx={sx} cy={sy} r={sr} fill="none" stroke="rgb(232 236 244 / 0.15)" />
      <line x1={px.l} x2={W - px.r} y1={Y(1)} y2={Y(1)} stroke="rgb(232 236 244 / 0.1)" strokeDasharray="2 4" />
      <polyline points={pts.join(' ')} fill="none" stroke="#e8ecf4" strokeOpacity="0.8" strokeWidth="1.2" />
      <line x1={cx} x2={cx} y1={px.top} y2={H - px.b} stroke="#8fb4ff" strokeOpacity="0.5" />
      <circle cx={cx} cy={cy} r="3" fill="#8fb4ff" />
      <text x={px.l - 6} y={Y(1) + 3} textAnchor="end" fontSize="8" fill="#5d667c" fontFamily="ui-monospace, Menlo, monospace">100%</text>
      <text x={px.l - 6} y={Y(1 - depth) + 3} textAnchor="end" fontSize="8" fill="#9aa3b8" fontFamily="ui-monospace, Menlo, monospace">{(100 - depth * 100).toFixed(depth < 0.001 ? 3 : 1)}%</text>
      <text x={W - px.r} y={H - 8} textAnchor="end" fontSize="8" fill="#5d667c" fontFamily="ui-monospace, Menlo, monospace" letterSpacing="1">{`TIME → ${(hours * span).toFixed(1)} H WINDOW · ${e.host.toUpperCase()}`}</text>
    </>
  )
}

function WobblePlot({ k, t, W, H }: { k: number; t: number; W: number; H: number }) {
  const px = { l: 46, r: 10, top: 62, b: 24 }
  const plotW = W - px.l - px.r
  const plotH = H - px.top - px.b
  const X = (u: number) => px.l + u * plotW
  const Y = (v: number) => px.top + plotH / 2 - v * (plotH / 2) * 0.92
  const pts: string[] = []
  for (let i = 0; i <= 120; i++) {
    const u = i / 120
    pts.push(`${X(u).toFixed(1)},${Y(Math.sin(u * Math.PI * 2)).toFixed(1)}`)
  }
  const v = Math.sin(t * Math.PI * 2)
  const sx = W / 2 + v * 70
  return (
    <>
      <line x1={W / 2 - 78} x2={W / 2 + 78} y1={28} y2={28} stroke="rgb(232 236 244 / 0.1)" />
      <circle cx={sx} cy={28} r="14" fill="#ffd9b0" opacity="0.9" />
      <line x1={px.l} x2={W - px.r} y1={Y(0)} y2={Y(0)} stroke="rgb(232 236 244 / 0.1)" strokeDasharray="2 4" />
      <polyline points={pts.join(' ')} fill="none" stroke="#e8ecf4" strokeOpacity="0.8" strokeWidth="1.2" />
      <line x1={X(t)} x2={X(t)} y1={px.top} y2={H - px.b} stroke="#8fb4ff" strokeOpacity="0.5" />
      <circle cx={X(t)} cy={Y(v)} r="3" fill="#8fb4ff" />
      <text x={px.l - 6} y={Y(1) + 3} textAnchor="end" fontSize="8" fill="#9aa3b8" fontFamily="ui-monospace, Menlo, monospace">{`+${k}`}</text>
      <text x={px.l - 6} y={Y(-1) + 3} textAnchor="end" fontSize="8" fill="#9aa3b8" fontFamily="ui-monospace, Menlo, monospace">{`−${k}`}</text>
      <text x={W - px.r} y={H - 8} textAnchor="end" fontSize="8" fill="#5d667c" fontFamily="ui-monospace, Menlo, monospace" letterSpacing="1">STAR’S VELOCITY ALONG THE LINE OF SIGHT, M/S · ONE ORBIT</text>
    </>
  )
}
