import { useMemo, useState } from 'react'
import { Note, SectionHead, Slider, Stat, focusRing, svgText } from '@/components/sections/life/ui'
import {
  BANDS, COMPOSITIONS, GAS_LIST, LAB_PLANETS, SINGLE_TRANSIT_NOISE_PPM, SPECTRUM_RANGE_UM,
  clamp, gaussian, modelPpm, mulberry32, scaleHeightKm, strongBandPpm, type Gas,
} from '@/lib/searchForLife'

const W = 800
const H = 340
const L = 60
const R = 784
const T = 22
const B = 290
const [UM0, UM1] = SPECTRUM_RANGE_UM
const lnSpan = Math.log(UM1) - Math.log(UM0)
const xOf = (um: number) => L + ((Math.log(um) - Math.log(UM0)) / lnSpan) * (R - L)
const X_TICKS = [1, 2, 3, 5, 10]
const N_BINS = 36
const NOISE_SEED = 20261010

/** Gases that living things produce on Earth. The others describe the environment. */
const LIFE_GASES: Gas[] = ['O2', 'O3', 'CH4', 'N2O']

function niceTicks(lo: number, hi: number): number[] {
  const span = hi - lo
  const raw = span / 5
  const pow = 10 ** Math.floor(Math.log10(raw))
  const f = raw / pow
  const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pow
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.abs(v) < step * 1e-6 ? 0 : v)
  return out
}
const fmtPpm = (v: number) => (v === 0 ? '0' : Math.abs(v) >= 10 ? Math.round(v).toString() : Math.abs(v) >= 1 ? v.toFixed(1) : v.toFixed(2))

/**
 * Spectrum lab. Band POSITIONS are real (where each gas absorbs). Band HEIGHTS are illustrative, but their overall scale is
 * computed from the planet’s radius, gravity, temperature and star size, so the reader sees how small the real signal is.
 * The data points are drawn with noise the reader controls, because that, not chemistry, is where most claims are decided.
 */
export default function SpectrumLab() {
  const [planetId, setPlanetId] = useState('trappist-1e')
  const [compId, setCompId] = useState('earth')
  const comp = COMPOSITIONS.find((c) => c.id === compId)!
  const [gases, setGases] = useState<Partial<Record<Gas, number>>>({ ...comp.gases })
  const [cloud, setCloud] = useState(0)
  const [logN, setLogN] = useState(0.7)

  const planet = LAB_PLANETS.find((p) => p.id === planetId)!
  const nTransits = Math.max(1, Math.round(10 ** logN))
  const sigma = SINGLE_TRANSIT_NOISE_PPM / Math.sqrt(nTransits)

  const pickComp = (id: string) => {
    setCompId(id)
    setGases({ ...COMPOSITIONS.find((c) => c.id === id)!.gases })
  }
  const toggle = (g: Gas) =>
    setGases((prev) => {
      const next = { ...prev }
      if (next[g]) delete next[g]
      else next[g] = comp.gases[g] ?? 0.5
      return next
    })

  const strong = strongBandPpm(planet, comp.mu)
  const peak = strong * comp.reach
  const heightKm = scaleHeightKm(planet, comp.mu)
  const hasAir = comp.mu > 0

  // Curve + binned "observations".
  const { samples, bins, peakSeen } = useMemo(() => {
    const pts: [number, number][] = []
    const n = 240
    for (let i = 0; i <= n; i++) {
      const um = Math.exp(Math.log(UM0) + (lnSpan * i) / n)
      pts.push([um, modelPpm(um, gases, strong, comp.reach, cloud)])
    }
    const rand = mulberry32(NOISE_SEED)
    const edges = Array.from({ length: N_BINS + 1 }, (_, i) => Math.exp(Math.log(UM0) + (lnSpan * i) / N_BINS))
    const out: { um: number; y: number; z: number }[] = []
    let mx = 0
    for (let i = 0; i < N_BINS; i++) {
      // Real data are bin averages, which dilute narrow bands such as oxygen’s 0.76 µm line.
      let acc = 0
      const sub = 10
      for (let k = 0; k < sub; k++) {
        const um = Math.exp(Math.log(edges[i]) + ((Math.log(edges[i + 1]) - Math.log(edges[i])) * (k + 0.5)) / sub)
        acc += modelPpm(um, gases, strong, comp.reach, cloud)
      }
      const y = acc / sub
      mx = Math.max(mx, y)
      out.push({ um: Math.sqrt(edges[i] * edges[i + 1]), y, z: gaussian(rand) })
    }
    return { samples: pts, bins: out, peakSeen: mx }
  }, [gases, strong, comp.reach, cloud])

  // y range: fits the signal, grows (within limits) to show the noise.
  const S = Math.max(peak * 1.15, hasAir ? 0.5 : 5)
  const noiseSpan = Math.min(2.4 * sigma, 4 * S)
  const yMax = Math.max(S * 1.2, noiseSpan)
  const yMin = -Math.max(S * 0.5, noiseSpan)
  const yOf = (v: number) => B - ((v - yMin) / (yMax - yMin)) * (B - T)
  const curve = samples.map(([um, v], i) => `${i === 0 ? 'M' : 'L'}${xOf(um).toFixed(1)} ${yOf(v).toFixed(1)}`).join(' ')

  // Gas labels at each active gas’s strongest in-range band.
  const labels = useMemo(() => {
    const out: { gas: Gas; label: string; um: number }[] = []
    for (const g of GAS_LIST) {
      const s = gases[g.id]
      if (!s || !hasAir) continue
      const best = BANDS.filter((b) => b.gas === g.id && b.um >= UM0 && b.um <= UM1).sort((a, b) => b.a - a.a)[0]
      if (best) out.push({ gas: g.id, label: `${g.label} ${best.um}`, um: best.um })
    }
    return out.sort((a, b) => a.um - b.um)
  }, [gases, hasAir])

  const sn = sigma > 0 ? peakSeen / sigma : 0
  const has = (g: Gas) => (gases[g] ?? 0) > 0
  const hasO = has('O2') || has('O3')
  const notes: string[] = []
  if (!hasAir) {
    notes.push('There is no atmosphere to read. Nothing absorbs the starlight, so the line is flat: the same thing a thick, high cloud deck would produce.')
  } else {
    if (hasO && has('CH4')) {
      notes.push('Oxygen or ozone together with methane is the classic disequilibrium pair: each destroys the other, so finding both means something keeps resupplying them. On Earth that is life. It is a strong clue, not proof: the abiotic routes to each gas have to be ruled out on this planet.')
    } else if (hasO) {
      notes.push('Oxygen without methane. Oxygen can also come from lifeless chemistry, for example water split by ultraviolet light on a planet around a red dwarf. Other gases in the same spectrum are needed to tell the two apart.')
    } else if (has('CH4')) {
      notes.push('Methane alone is made by volcanoes and by water reacting with rock, as well as by microbes. Without oxygen there is no disequilibrium pair to point to.')
    }
    if (has('N2O')) notes.push('Nitrous oxide is made mostly by microbes on Earth, but it is faint, and its non-biological sources on other worlds are poorly known.')
    if (!hasO && !has('CH4') && !has('N2O')) notes.push('Water and carbon dioxide describe the environment. They show that there is an atmosphere thick enough to study; they say nothing about life.')
    if (cloud > 0.5) notes.push('High cloud clips the bands. A flat or muted spectrum is a non-detection, not evidence of a lifeless planet.')
    if (sn < 3) notes.push('At this noise level no single feature stands out from the scatter. Detections are decided by how many transits are stacked, not by the chemistry alone.')
  }

  const clipY = (v: number) => clamp(yOf(v), T, B)

  return (
    <div className="mx-auto max-w-7xl px-6 py-24 md:px-10">
      <SectionHead
        kicker="09 — Search for Life · Biosignatures"
        title="What the air might say."
        lead={
          <>
            <p>
              When a planet crosses its star, a sliver of the starlight passes through the planet’s atmosphere on the way to us. Each gas absorbs particular
              colours, so the dip in brightness, measured colour by colour, is a chemical fingerprint.
            </p>
            <p>
              A <em>biosignature</em> is a gas or pattern that life could produce. It counts only if there is no good non-biological way to make it. The
              spectrum below is a model: change the planet, the air, the clouds and the number of transits, and see what could be read.
            </p>
          </>
        }
      />

      <div className="mt-14 grid gap-x-12 gap-y-6 border-y border-hairline py-6 md:grid-cols-2">
        <div>
          <p className="label">Planet</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2" role="group" aria-label="Planet">
            {LAB_PLANETS.map((p) => (
              <button key={p.id} type="button" aria-pressed={p.id === planetId} onClick={() => setPlanetId(p.id)}
                className={`label border-b pb-1 transition-colors hover:text-ink ${focusRing} ${p.id === planetId ? 'border-signal text-ink' : 'border-transparent'}`}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="label">Atmosphere</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2" role="group" aria-label="Atmosphere">
            {COMPOSITIONS.map((c) => (
              <button key={c.id} type="button" aria-pressed={c.id === compId} onClick={() => pickComp(c.id)}
                className={`label border-b pb-1 transition-colors hover:text-ink ${focusRing} ${c.id === compId ? 'border-signal text-ink' : 'border-transparent'}`}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <figure className="mt-8">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Model transmission spectrum of ${planet.name} with the ${comp.name} atmosphere, with simulated measurements`}>
          {niceTicks(yMin, yMax).map((v) => (
            <g key={v}>
              <line x1={L} x2={R} y1={yOf(v)} y2={yOf(v)} stroke="rgb(232 236 244 / 0.07)" />
              <text x={L - 8} y={yOf(v) + 3} textAnchor="end" fontSize="9" fill="#5d667c" {...svgText}>{fmtPpm(v)}</text>
            </g>
          ))}
          <line x1={L} x2={R} y1={yOf(0)} y2={yOf(0)} stroke="rgb(232 236 244 / 0.3)" />
          {X_TICKS.map((u) => (
            <g key={u}>
              <line x1={xOf(u)} x2={xOf(u)} y1={B} y2={B + 5} stroke="rgb(232 236 244 / 0.3)" />
              <text x={xOf(u)} y={B + 18} textAnchor="middle" fontSize="9" fill="#5d667c" {...svgText}>{u}</text>
            </g>
          ))}
          <text x={(L + R) / 2} y={B + 40} textAnchor="middle" fontSize="9" fill="#5d667c" {...svgText}>WAVELENGTH, MICROMETRES (LOG)</text>
          <text transform={`translate(14 ${(T + B) / 2}) rotate(-90)`} textAnchor="middle" fontSize="9" fill="#5d667c" {...svgText}>EXTRA DIP IN STARLIGHT, PPM</text>

          {/* Simulated measurements. Hollow = off the plotted range. */}
          {bins.map((b, i) => {
            const v = b.y + b.z * sigma
            const cx = xOf(b.um)
            const off = yOf(v) < T || yOf(v) > B
            return (
              <g key={i}>
                <line x1={cx} x2={cx} y1={clipY(b.y + b.z * sigma - sigma)} y2={clipY(b.y + b.z * sigma + sigma)} stroke="#9aa3b8" strokeOpacity="0.45" />
                <circle cx={cx} cy={clipY(v)} r={2.6} fill={off ? 'none' : '#9aa3b8'} stroke="#9aa3b8" strokeOpacity={off ? 0.6 : 0} />
              </g>
            )
          })}

          {/* The model. */}
          <path d={curve} fill="none" stroke="#8fb4ff" strokeWidth="1.5" strokeLinejoin="round" />

          {labels.map((l, i) => {
            const x = xOf(l.um)
            const prev = labels[i - 1]
            const stagger = prev && x - xOf(prev.um) < 46 ? 12 : 0
            return (
              <text key={l.gas} x={x} y={T - 6 + stagger} textAnchor="middle" fontSize="9" fill={LIFE_GASES.includes(l.gas) ? '#8fb4ff' : '#9aa3b8'} {...svgText}>
                {l.label}
              </text>
            )
          })}
        </svg>
        <figcaption className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1">
          <span className="label text-[0.625rem]"><span className="text-signal">Blue label</span> · a gas life can make</span>
          <span className="label text-[0.625rem]"><span className="text-ink-dim">Grey label</span> · environment, not biology</span>
          <span className="label text-[0.625rem]">Dots · simulated data, bars ± 1σ</span>
        </figcaption>
      </figure>

      <div className="mt-8 grid gap-x-12 gap-y-8 md:grid-cols-3">
        <div>
          <p className="label">Gases present</p>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Gases">
            {GAS_LIST.map((g) => {
              const on = has(g.id)
              return (
                <button key={g.id} type="button" aria-pressed={on} onClick={() => toggle(g.id)} title={g.role}
                  className={`border px-3 py-1.5 font-mono text-xs tracking-wide transition-colors ${focusRing} ${on ? 'border-signal/70 text-ink' : 'border-hairline text-ink-faint hover:text-ink'}`}>
                  {g.label}
                </button>
              )
            })}
          </div>
          <Note className="mt-3">Hover a gas for its role. Presets set typical amounts; the chips switch each gas on or off.</Note>
        </div>
        <Slider
          id="sp-cloud"
          label="High cloud or haze"
          value={cloud}
          min={0}
          max={1}
          step={0.01}
          onChange={setCloud}
          display={cloud < 0.05 ? 'clear' : `${Math.round(cloud * 100)} %`}
          valueText={`cloud ${Math.round(cloud * 100)} percent`}
        />
        <Slider
          id="sp-transits"
          label="Transits stacked"
          value={logN}
          min={0}
          max={2.6}
          step={0.05}
          onChange={setLogN}
          display={`${nTransits} · noise ${sigma.toFixed(sigma < 10 ? 1 : 0)} ppm / bin`}
          valueText={`${nTransits} transits`}
        />
      </div>

      <div className="mt-12 grid gap-12 md:grid-cols-[1fr_1.2fr] md:gap-20">
        <div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-6">
            <Stat k="Scale height" v={hasAir ? `${heightKm.toFixed(heightKm < 10 ? 1 : 0)} km` : '—'} sub="How far up the air thins by a factor e" />
            <Stat k="Strong-band signal" v={hasAir ? `${fmtPpm(peak)} ppm` : '—'} sub="Extra dip at the strongest absorption" />
            <Stat k="Signal ÷ noise" v={hasAir ? sn.toFixed(sn < 10 ? 1 : 0) : '—'} sub="Strongest binned feature. Around 5 or more is a common rule of thumb for a detection" />
            <Stat k="Atmosphere" v={comp.name} sub={`mean molecular mass ${comp.mu || '—'}`} />
          </dl>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-ink-dim">{planet.note}</p>
        </div>
        <div>
          <p className="label text-signal">How to read it</p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-dim md:text-base">{comp.blurb}</p>
          <ul className="mt-6 space-y-4">
            {notes.map((n) => (
              <li key={n} className="flex gap-4 text-sm leading-relaxed text-ink md:text-base">
                <span className="mt-[0.7em] h-px w-5 shrink-0 bg-signal/60" />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <Note className="mt-12 max-w-4xl">
        Schematic. The wavelengths of the absorption bands are real; their heights are illustrative and are not a retrieval from any observation. The overall
        scale is the size of a strong band, 2·Rp·5H/Rs², with the scale height H from the planet’s radius, mass and equilibrium temperature (Earth-like
        reflectivity) and about five scale heights spanned (a rule of thumb; clouds and hazes reduce it). Noise is assumed: {SINGLE_TRANSIT_NOISE_PPM} ppm per spectral bin
        for one transit, falling as 1/√N; real values depend on the star’s brightness and the instrument. An Earth–Sun transit leaves about one part per
        million, which is why the search starts with small stars. Spots and flares on the host star can imitate or hide atmospheric features.
      </Note>
    </div>
  )
}
