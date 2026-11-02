import { useId, useState } from 'react'
import { Note, SectionHead, Slider, Stat, focusRing, svgText } from '@/components/sections/life/ui'
import { SOLAR_REFS, STAR_PRESETS, WORLD_BY_ID, starAt, zoneEdges, HZ_FIT_RANGE } from '@/lib/searchForLife'

// Chart geometry: distance from the star in AU, log scale, 0.01 → 10 AU.
const W = 800
const H = 250
const X0 = 40
const X1 = 780
const AXIS_Y = 170
const xOf = (au: number) => X0 + ((Math.log10(au) + 2) / 3) * (X1 - X0)
const TICKS: [number, string][] = [[0.01, '0.01'], [0.1, '0.1'], [1, '1'], [10, '10']]

const STOPS: [number, [number, number, number]][] = [
  [2500, [255, 138, 92]],
  [3500, [255, 166, 107]],
  [4500, [255, 200, 144]],
  [5800, [255, 241, 214]],
  [6600, [238, 242, 255]],
]
/** Blackbody-ish tint for the star glyph (canvas-free: this is SVG, so the values live here). */
function starColor(teff: number): string {
  if (teff <= STOPS[0][0]) return `rgb(${STOPS[0][1].join(',')})`
  for (let i = 1; i < STOPS.length; i++) {
    if (teff <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1]
      const [t1, c1] = STOPS[i]
      const f = (teff - t0) / (t1 - t0)
      return `rgb(${c0.map((v, k) => Math.round(v + (c1[k] - v) * f)).join(',')})`
    }
  }
  return `rgb(${STOPS[STOPS.length - 1][1].join(',')})`
}

const fmtAU = (x: number) => (x < 0.1 ? x.toFixed(3) : x.toFixed(2))
const fmtLum = (l: number) => (l < 0.01 ? l.toPrecision(2) : l < 1 ? l.toFixed(3).replace(/0+$/, '') : l.toFixed(1))
/** How much of Earth’s sunlight a planet at 1 AU would get. */
const fmtSunlight = (l: number) => (l < 0.1 ? `${(l * 100).toPrecision(2)} %` : `${l.toPrecision(2)} ×`)

interface Marker {
  name: string
  au: number
}
/** Real planets drawn when the slider is snapped to the star that hosts them. */
const REAL: Record<string, Marker[]> = {
  'trappist-1': [{ name: 'TRAPPIST-1 e', au: WORLD_BY_ID['trappist-1e'].au }],
  proxima: [{ name: 'Proxima b', au: WORLD_BY_ID['proxima-b'].au }],
  'kepler-186': [{ name: 'Kepler-186 f', au: WORLD_BY_ID['kepler-186f'].au }],
  sun: SOLAR_REFS.map((p) => ({ name: p.name, au: p.au })),
}

/**
 * Habitable-zone explorer. The star is a slider; the zone is recomputed with the Kopparapu et al. (2013) fit.
 * It deliberately draws Earth’s own 1 AU orbit all the time: the most useful thing it shows is how far from
 * "Earth’s place" the zone of a different star lies.
 */
export default function HabitableZoneLab() {
  const [t, setT] = useState(4) // the Sun
  const uid = useId().replace(/:/g, '')
  const star = starAt(t)
  const e = zoneEdges(star.lum, star.teff)
  const snapped = Math.abs(t - star.nearestIndex) < 0.12
  const preset = star.nearest
  const markers = snapped ? REAL[preset.id] ?? [] : []
  const color = starColor(star.teff)
  const outOfFit = star.teff < HZ_FIT_RANGE[0] || star.teff > HZ_FIT_RANGE[1]
  const nearNote = Math.abs(t - star.nearestIndex) < 0.35

  return (
    <div className="mx-auto max-w-7xl px-6 py-24 md:px-10">
      <SectionHead
        kicker="09 — Search for Life · The habitable zone"
        title="Where water could stay liquid."
        lead={
          <>
            <p>
              Life as we know it needs liquid water. Whether a planet can keep an ocean on its surface depends, first of all, on how much starlight
              arrives. Too much and the oceans boil away; too little and they freeze. The range of distances in between is the habitable zone.
            </p>
            <p>It is a statement about starlight, not about life. Move the star and watch where the zone goes.</p>
          </>
        }
      />

      <div className="mt-14 border-y border-hairline py-8">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Habitable zone around ${preset.name}-like star: conservative zone ${fmtAU(e.conInner)} to ${fmtAU(e.conOuter)} astronomical units`}>
          <defs>
            <radialGradient id={`g${uid}`}>
              <stop offset="0" stopColor={color} stopOpacity="1" />
              <stop offset="0.35" stopColor={color} stopOpacity="0.55" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* The zone: optimistic edges (lighter), conservative edges (stronger). */}
          <rect x={xOf(e.optInner)} y={52} width={Math.max(1, xOf(e.optOuter) - xOf(e.optInner))} height={AXIS_Y - 52} fill="#8fb4ff" opacity="0.1" />
          <rect x={xOf(e.conInner)} y={52} width={Math.max(1, xOf(e.conOuter) - xOf(e.conInner))} height={AXIS_Y - 52} fill="#8fb4ff" opacity="0.22" />
          {[e.conInner, e.conOuter].map((a, i) => (
            <line key={i} x1={xOf(a)} x2={xOf(a)} y1={52} y2={AXIS_Y} stroke="#8fb4ff" strokeOpacity="0.7" />
          ))}
          <text x={(xOf(e.conInner) + xOf(e.conOuter)) / 2} y={38} textAnchor="middle" fontSize="9.5" fill="#8fb4ff" {...svgText}>
            {`HABITABLE ZONE · ${fmtAU(e.conInner)} – ${fmtAU(e.conOuter)} AU`}
          </text>

          {/* Axis. */}
          <line x1={X0} x2={X1} y1={AXIS_Y} y2={AXIS_Y} stroke="rgb(232 236 244 / 0.25)" />
          {TICKS.map(([au, label]) => (
            <g key={au}>
              <line x1={xOf(au)} x2={xOf(au)} y1={AXIS_Y} y2={AXIS_Y + 5} stroke="rgb(232 236 244 / 0.3)" />
              <text x={xOf(au)} y={AXIS_Y + 18} textAnchor="middle" fontSize="9" fill="#5d667c" {...svgText}>{label}</text>
            </g>
          ))}
          <text x={X1} y={AXIS_Y + 34} textAnchor="end" fontSize="9" fill="#5d667c" {...svgText}>DISTANCE FROM THE STAR, ASTRONOMICAL UNITS (LOG)</text>

          {/* Earth's own orbit, always: the reference. */}
          <line x1={xOf(1)} x2={xOf(1)} y1={52} y2={AXIS_Y + 8} stroke="#e8ecf4" strokeOpacity="0.35" strokeDasharray="2 4" />
          <text x={xOf(1) + 5} y={AXIS_Y + 62} fontSize="9" fill="#9aa3b8" {...svgText}>1 AU · EARTH’S ORBIT</text>

          {/* The star. */}
          <circle cx={16} cy={AXIS_Y} r={16} fill={`url(#g${uid})`} />

          {/* Real planets, when the slider sits on their star. */}
          {markers.map((m, i) => (
            <g key={m.name}>
              <circle cx={xOf(m.au)} cy={AXIS_Y} r={m.name === 'Earth' ? 4.5 : 3.5} fill={m.name === 'Earth' ? '#8fb4ff' : '#e8ecf4'} />
              <text x={xOf(m.au)} y={AXIS_Y - 12 - (i % 2) * 13} textAnchor="middle" fontSize="9" fill="#e8ecf4" {...svgText}>{m.name.toUpperCase()}</text>
            </g>
          ))}
        </svg>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3" role="group" aria-label="Choose a star">
          {STAR_PRESETS.map((s, i) => {
            const on = snapped && star.nearestIndex === i
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                onClick={() => setT(i)}
                className={`label border-b pb-1 transition-colors hover:text-ink ${focusRing} ${on ? 'border-signal text-ink' : 'border-transparent'}`}
              >
                {s.name}
              </button>
            )
          })}
        </div>

        <div className="mt-6 max-w-xl">
          <Slider
            id="hz-star"
            label="Star, dimmest → brightest"
            value={t}
            min={0}
            max={STAR_PRESETS.length - 1}
            step={0.01}
            onChange={setT}
            display={
              <>
                {fmtLum(star.lum)} L☉ · {Math.round(star.teff / 10) * 10} K
              </>
            }
            valueText={`${star.nearest.name}, luminosity ${fmtLum(star.lum)} solar`}
          />
        </div>
      </div>

      <div className="mt-10 grid gap-12 md:grid-cols-[1.1fr_1fr] md:gap-20">
        <div key={nearNote ? preset.id : 'between'} className="fade-up">
          <p className="label text-signal">{nearNote ? `${preset.type} · ${preset.name}` : 'Between two kinds of star'}</p>
          <p className="mt-4 max-w-lg font-display text-2xl leading-snug text-ink md:text-3xl">
            {nearNote
              ? preset.note
              : 'The zone moves in proportion to the square root of the star’s luminosity: four times the light, twice the distance.'}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-6">
          <Stat k="Conservative zone" v={`${fmtAU(e.conInner)} – ${fmtAU(e.conOuter)} AU`} sub="Water-loss to maximum-greenhouse limits" />
          <Stat k="Optimistic zone" v={`${fmtAU(e.optInner)} – ${fmtAU(e.optOuter)} AU`} sub="Recent-Venus to early-Mars limits" />
          <Stat k="Earth at 1 AU would get" v={fmtSunlight(star.lum)} sub="of the sunlight it receives now" />
          <Stat
            k="Width of the zone"
            v={`${((e.conOuter - e.conInner) / e.conInner * 100).toFixed(0)} % of its inner edge`}
            sub="The outer edge is always roughly 1.7 to 2 times farther out than the inner"
          />
        </dl>
      </div>

      <div className="mt-16 grid gap-10 border-t border-hairline pt-10 md:grid-cols-3 md:gap-12">
        <div>
          <p className="label text-signal">A zone is not a verdict</p>
          <p className="mt-3 text-sm leading-relaxed text-ink-dim md:text-base">
            The calculation assumes a planet with Earth’s mass and an Earth-like blanket of nitrogen, carbon dioxide and water. Mars lies inside the Sun’s
            zone and is a frozen desert, because it is small and lost most of its air.
          </p>
        </div>
        <div>
          <p className="label text-signal">The edges are models</p>
          <p className="mt-3 text-sm leading-relaxed text-ink-dim md:text-base">
            Clouds, planet mass, rotation and the exact mix of gases move the boundaries, which is why two zones are drawn. Different groups publish
            different edges for the same star.
          </p>
        </div>
        <div>
          <p className="label text-signal">Red dwarfs are different</p>
          <p className="mt-3 text-sm leading-relaxed text-ink-dim md:text-base">
            Their zones lie so close in that planets there are tugged into locked rotation and exposed to stellar flares. Whether they can hold atmospheres
            is one of the central open questions.
          </p>
        </div>
      </div>

      <Note className="mt-10 max-w-4xl">
        Model: Kopparapu et al. (2013) boundaries for a 1 Earth-mass planet, as a function of luminosity and effective temperature, valid for 2,600–7,200 K
        {outOfFit ? '; this star is outside that range, so the nearest valid edge is used and the zone is only indicative' : ''}. TRAPPIST-1 (2,566 K) is just
        below it. Luminosities and temperatures of the named stars are rounded. Planet distances are computed from their orbital periods and the host-star
        masses used in this app. A planet inside the zone is a candidate for liquid water at the surface, and nothing more.
      </Note>
    </div>
  )
}
