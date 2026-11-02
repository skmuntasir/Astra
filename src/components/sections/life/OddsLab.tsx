import { useState } from 'react'
import { Bullets, Note, SectionHead, Slider, Stat, focusRing, svgText } from '@/components/sections/life/ui'
import {
  breakEvenLog10, expectedLiving, fmtPow10, fmtSci, medianNearestLy, nullUpperLimit, pAtLeastOne,
} from '@/lib/searchForLife'

const W = 800
const H = 150
const L = 30
const R = 770
const LOG_MIN = -20
const LOG_MAX = 0
const xOf = (lf: number) => L + ((lf - LOG_MIN) / (LOG_MAX - LOG_MIN)) * (R - L)
const AXIS_Y = 92

const GALAXY_WIDTH_LY = 100_000

function fmtProb(p: number): string {
  if (p > 0.9999) return '> 99.99 %'
  if (p < 0.0001) return '< 0.01 %'
  return `${(p * 100).toPrecision(2)} %`
}
function fmtDistance(ly: number): string {
  if (!isFinite(ly) || ly > GALAXY_WIDTH_LY) return 'farther than the Galaxy is wide'
  if (ly < 100) return `${ly.toFixed(0)} ly`
  return `≈ ${(Math.round(ly / 10) * 10).toLocaleString('en-US')} ly`
}
const fmtPct = (x: number) => (x < 0.001 ? '< 0.1 %' : `${(x * 100).toPrecision(2)} %`)

/**
 * The honest arithmetic. Expected living worlds in the Galaxy = stars × habitable-zone rocky planets per star × P(life | such a
 * planet). The first two are measured, roughly. The third is unknown by many orders of magnitude, and nothing yet narrows it.
 */
export default function OddsLab() {
  const [starsB, setStarsB] = useState(200) // billions of stars
  const [eta, setEta] = useState(0.3)
  const [logF, setLogF] = useState(-10.8)
  const [logSurvey, setLogSurvey] = useState(1.4)
  const [eff, setEff] = useState(0.5)

  const stars = starsB * 1e9
  const n = expectedLiving(stars, eta, logF)
  const p = pAtLeastOne(n)
  const near = medianNearestLy(eta, logF)
  const breakEven = breakEvenLog10(stars, eta)
  const survey = Math.round(10 ** logSurvey)
  const limit = nullUpperLimit(survey, eff)
  const planets = stars * eta

  return (
    <div className="mx-auto max-w-7xl px-6 py-24 md:px-10">
      <SectionHead
        kicker="09 — Search for Life · Odds"
        title="How likely? Nobody knows."
        lead={
          <>
            <p>
              We can count how many Earth-sized planets sit in habitable zones; that part is measured, roughly. What nobody can say is the chance that life
              begins on one of them. We have exactly one example, and we could only ever have found ourselves on a planet where it happened.
            </p>
            <p>
              So the arithmetic reduces to one unknown number, and the answer to “are we alone?” depends entirely on a guess for it. Move it and see.
            </p>
          </>
        }
      />

      <div className="mt-14 grid gap-12 md:grid-cols-[1fr_1.3fr] md:gap-16">
        <div className="space-y-8">
          <Slider id="odds-stars" label="Stars in the Milky Way" value={starsB} min={100} max={400} step={10} onChange={setStarsB} display={`${starsB} billion`} />
          <Slider
            id="odds-eta" label="Habitable-zone rocky planets per star" value={eta} min={0.05} max={1} step={0.01} onChange={setEta}
            display={eta.toFixed(2)}
          />
          <Note>
            Published estimates of the second figure range from roughly 0.1 to 0.9, depending on the type of star and on how the zone and “rocky” are defined.
            That gives about {fmtSci(planets)} such planets in the Galaxy.
          </Note>
          <Slider
            id="odds-f"
            label="Chance that life arises on one such planet"
            value={logF}
            min={LOG_MIN}
            max={LOG_MAX}
            step={0.1}
            onChange={setLogF}
            display={fmtSci(10 ** logF)}
            valueText={`one in ${fmtSci(10 ** -logF)}`}
          />
          <div className="flex flex-wrap gap-x-6 gap-y-3" role="group" aria-label="Example assumptions">
            {[
              { label: 'Rare accident', v: -15 },
              { label: 'Break-even', v: Math.round(breakEven * 10) / 10 },
              { label: 'Easy, once conditions allow', v: -2 },
            ].map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => setLogF(c.v)}
                aria-pressed={Math.abs(logF - c.v) < 0.05}
                className={`label border-b pb-1 transition-colors hover:text-ink ${focusRing} ${Math.abs(logF - c.v) < 0.05 ? 'border-signal text-ink' : 'border-transparent'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <Note>These are assumptions to explore, not predictions. Nothing measured favours one of them over another.</Note>
        </div>

        <div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="A logarithmic scale of the chance that life arises, from one in 10 to the 20 to certainty, with the break-even point marked">
            <rect x={L} y={34} width={Math.max(0, xOf(breakEven) - L)} height={AXIS_Y - 34} fill="#e8ecf4" opacity="0.05" />
            <rect x={xOf(breakEven)} y={34} width={Math.max(0, R - xOf(breakEven))} height={AXIS_Y - 34} fill="#8fb4ff" opacity="0.1" />
            <text x={(L + xOf(breakEven)) / 2} y={52} textAnchor="middle" fontSize="9" fill="#9aa3b8" {...svgText}>FEWER THAN ONE EXPECTED</text>
            <text x={(xOf(breakEven) + R) / 2} y={52} textAnchor="middle" fontSize="9" fill="#8fb4ff" {...svgText}>OTHERS EXPECTED</text>
            <line x1={xOf(breakEven)} x2={xOf(breakEven)} y1={34} y2={AXIS_Y + 6} stroke="#8fb4ff" strokeOpacity="0.8" />
            <text x={xOf(breakEven)} y={26} textAnchor="middle" fontSize="9" fill="#8fb4ff" {...svgText}>{`BREAK-EVEN ≈ ${fmtPow10(breakEven)}`}</text>

            <line x1={L} x2={R} y1={AXIS_Y} y2={AXIS_Y} stroke="rgb(232 236 244 / 0.3)" />
            {[-20, -15, -10, -5, 0].map((e) => (
              <g key={e}>
                <line x1={xOf(e)} x2={xOf(e)} y1={AXIS_Y} y2={AXIS_Y + 5} stroke="rgb(232 236 244 / 0.3)" />
                <text x={xOf(e)} y={AXIS_Y + 19} textAnchor={e === -20 ? 'start' : e === 0 ? 'end' : 'middle'} fontSize="9" fill="#5d667c" {...svgText}>{fmtPow10(e)}</text>
              </g>
            ))}
            <path d={`M${xOf(logF)} ${AXIS_Y - 2} l-6 -10 l12 0 z`} fill="#e8ecf4" />
            <text x={xOf(logF)} y={AXIS_Y + 38} textAnchor={logF < -17 ? 'start' : logF > -3 ? 'end' : 'middle'} fontSize="9" fill="#e8ecf4" {...svgText}>YOUR ASSUMPTION</text>
            <text x={R} y={H - 2} textAnchor="end" fontSize="8.5" fill="#5d667c" {...svgText}>EARTH SHOWS ONLY THAT THIS NUMBER IS NOT ZERO</text>
          </svg>

          <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-6 border-y border-hairline py-6 sm:grid-cols-3">
            <Stat k="Living worlds expected" v={fmtSci(n)} sub="in the whole Galaxy, today" />
            <Stat k="Chance of at least one other" v={fmtProb(p)} sub="if they arose independently" />
            <Stat k="Typical distance to the nearest" v={fmtDistance(near)} sub="if spread like the stars near the Sun" />
          </dl>
          <p className="mt-6 max-w-xl text-sm leading-relaxed text-ink-dim md:text-base">
            Another living world is expected in the Galaxy if the chance of life arising on a habitable planet exceeds about one in{' '}
            {fmtSci(10 ** -breakEven)}. Below that, we could be alone in the Milky Way. Both sides of that line are consistent with everything we have seen.
          </p>
        </div>
      </div>

      <div className="mt-20 grid gap-12 border-t border-hairline pt-12 md:grid-cols-[1fr_1.3fr] md:gap-16">
        <div>
          <p className="label text-signal">What a null result would say</p>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-dim md:text-base">
            Suppose telescopes examine many habitable-zone planets and find no biosignature on any of them. That is information, but only about the high end of
            the line above.
          </p>
          <div className="mt-8 space-y-8">
            <Slider id="null-n" label="Planets surveyed" value={logSurvey} min={0.3} max={3} step={0.05} onChange={setLogSurvey} display={survey.toLocaleString('en-US')} />
            <Slider id="null-e" label="Chance a real biosphere would show" value={eff} min={0.1} max={1} step={0.05} onChange={setEff} display={`${Math.round(eff * 100)} %`} />
          </div>
        </div>
        <div>
          <p className="font-display text-2xl leading-snug text-ink md:text-3xl">
            With none found among {survey.toLocaleString('en-US')} worlds, fewer than about {fmtPct(limit)} of such planets host a detectable biosphere, at
            95 % confidence.
          </p>
          <p className="mt-6 max-w-xl text-sm leading-relaxed text-ink-dim md:text-base">
            To rule out a chance as small as one in {fmtSci(10 ** -breakEven)} would take surveying about {fmtSci(3 / 10 ** breakEven / Math.max(eff, 0.01))} planets, more
            than exist in the whole Galaxy. A survey can exclude “life is common”. It cannot, by finding nothing, show that we are alone. A single convincing
            detection would change the answer at once, which is why the ladder above matters so much.
          </p>
        </div>
      </div>

      <div className="mt-20 border-t border-hairline pt-12">
        <p className="label">What Earth does and does not tell us</p>
        <div className="mt-6 max-w-3xl">
          <Bullets
            items={[
              'Life appears in Earth’s record within roughly a billion years of the planet forming (the oldest widely accepted traces are about 3.5 billion years old; some claims reach back further). That is one case, and early arrival alone does not show that life is easy.',
              'Observers can only ever find themselves on a planet where life arose. So our own existence, by itself, cannot say how likely that was.',
              'A second, independent origin, in our own Solar System or on a distant planet, would change the picture more than any calculation: it would show the number is not tiny.',
            ]}
          />
        </div>
      </div>

      <Note className="mt-12 max-w-4xl">
        Model: expected living worlds N = stars × (habitable-zone rocky planets per star) × P(life | such a planet), with life treated as an independent
        event on each planet (Poisson), the Galaxy’s stars at 100–400 billion, and a local star density of about 0.004 per cubic light-year for the distance
        estimate (the real Galaxy is not uniform). The survey limit is the binomial bound 1 − 0.05^(1/N) divided by the detection efficiency, which assumes
        every detectable biosphere would be seen and that no non-biological signal is mistaken for one. This is arithmetic on assumptions, not a forecast.
      </Note>
    </div>
  )
}
