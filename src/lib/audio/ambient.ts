import type { Mood } from './moods'

/**
 * The one ambient graph (v3, "lean and tonal"). Everything is synthesized: sine oscillators, one looped PINK-noise buffer built in code (used
 * only by the black hole and the fall), four tiny feedback delays for space. No audio files exist in this project. It runs on any
 * BaseAudioContext, so tests/audio_levels.py renders it offline and measures peak, RMS, low / high-frequency energy and crest factor per zone.
 *
 * History of the two complaints and what changed:
 *   v1 "pressure / sparks": sub-bass, sawtooth voices, white noise through a Q = 6 band-pass, a compressor  ->  removed (v2).
 *   v2 "TV without signal" in the Sun / Solar System, and "the website is slow":
 *      - a continuous noise bed reads as hiss on small speakers  ->  the noise bed now exists ONLY in the black hole and the fall (mood.noise = 0
 *        everywhere else), is darker (two low-pass stages, <= 600 Hz in the fall) and quieter. Other zones are pure tones; their "motion" is a slow
 *        chorus (detune LFO) and slow amplitude LFOs, not noise.
 *      - the 4 s ConvolverNode (the heaviest node) is gone: space = 4 feedback delays (a soft bloom) -> a few hundred operations per block instead of a convolution;
 *      - 2 noise sources instead of 3; parameters are written only when they changed noticeably (a steady zone costs ZERO parameter writes);
 *      - the context runs at 24 kHz (everything here is below 5 kHz), half the work of 48 kHz; see sound.ts.
 *
 *   4 sine partials x (2 sines a few cents apart, panned) --> slow amplitude LFOs + slow detune chorus --> pad low-pass --\
 *   flow bed (black hole / fall only): 2 pink-noise sources --> HP 110 --> LP --> LP --> swell -----------------------------> mix --> dry + 4 delays --> HP 70 --> LP 5k --> master --> safety compressor
 *   fall voice: 2 soft sines that climb in pitch ---------------------------------------------------------------------------/
 */
export const MASTER_GAIN = 0.09 // calibrated with tests/audio_levels.py: quiet overall, peak at or below about -18 dBFS
export const SAMPLE_RATE = 24000
const TAU = 2.4 // seconds: how fast the sound follows a new mood (exponential approach: a far jump glides over ~7 s)

/** mulberry32: a deterministic PRNG, so the noise (and the level test) are reproducible */
function rng(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** `seconds` of PINK noise (Kellet filter), normalised to RMS 0.25, whose loop seam is an equal-power cross-fade: out[N-1] is followed by out[0] = the sample that followed it in the unwrapped noise. */
export function makeLoopNoise(sampleRate: number, seconds: number, seed: number): Float32Array {
  const n = Math.round(sampleRate * seconds), f = Math.round(sampleRate * 1.5)
  const r = rng(seed)
  const w = new Float32Array(n + f)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
  for (let i = 0; i < w.length; i++) {
    const x = r() * 2 - 1
    b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852
    b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898
    w[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362; b6 = x * 0.115926
  }
  let s = 0; for (let i = 0; i < w.length; i++) s += w[i] * w[i]
  const g = 0.25 / Math.sqrt(s / w.length)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    if (i < f) { const a = (Math.PI / 2) * (i / f); out[i] = (w[i] * Math.sin(a) + w[n + i] * Math.cos(a)) * g } else out[i] = w[i] * g
  }
  return out
}

export interface Ambient {
  master: GainNode
  /** aim every parameter at mood `m`, starting at `when` (default now). Writes only what changed noticeably. */
  set(m: Mood, when?: number, tau?: number): void
  /** fade the master to `v` (0 = muted) */
  fade(v: number, when?: number, tau?: number): void
  /** a soft bell for focusing an object (optional feedback; rate-limited by the caller) */
  blip(when?: number): void
  dispose(): void
}

const aim = (p: AudioParam, v: number, when: number, tau: number) => { p.cancelScheduledValues(when); p.setTargetAtTime(v, when, tau) }
const NPARAM = 32

export function createAmbient(ctx: BaseAudioContext, start = 0): Ambient {
  const srcs: AudioScheduledSourceNode[] = []
  const osc = (f: number, detune = 0) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = detune; srcs.push(o); return o }
  const gain = (v: number) => { const g = ctx.createGain(); g.gain.value = v; return g }
  const filt = (type: BiquadFilterType, f: number, q = 0.5) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b }
  const pan = (v: number) => { const p = ctx.createStereoPanner(); p.pan.value = v; return p }

  // ---- master chain: high-pass 70 Hz -> low-pass 5 kHz -> master -> safety compressor (never engaged at these levels)
  const master = gain(0) // starts silent: no click when the context starts
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -10; comp.knee.value = 20; comp.ratio.value = 2; comp.attack.value = 0.05; comp.release.value = 0.6
  const hp = filt('highpass', 70, 0.707), lp = filt('lowpass', 5000, 0.5)
  const out = gain(1)
  out.connect(hp); hp.connect(lp); lp.connect(master); master.connect(comp); comp.connect(ctx.destination)

  // ---- space: dry + four feedback delays (a soft bloom; ~1-3 s decay), each with its own dark low-pass in the loop, spread across the stereo field
  const mix = gain(1)
  const wet = gain(0.2)
  mix.connect(out); wet.connect(out)
  ;[[0.097, -0.7], [0.131, -0.25], [0.173, 0.25], [0.229, 0.7]].forEach(([d, p]) => {
    const dl = ctx.createDelay(0.5); dl.delayTime.value = d
    const damp = filt('lowpass', 1300, 0.5), fb = gain(0.56), pp = pan(p)
    mix.connect(dl); dl.connect(damp); damp.connect(fb); fb.connect(dl)
    damp.connect(pp); pp.connect(wet)
  })
  wet.gain.value = 0.2

  // ---- pad: 4 sine partials, each a detuned pair, slow amplitude LFOs, plus one shared slow "chorus" LFO on the detune (the motion of the tone zones)
  const padLP = filt('lowpass', 900, 0.5)
  padLP.connect(mix)
  const LFO_HZ = [0.037, 0.053, 0.071, 0.113]
  const chorus = osc(0.041), chorusUp = gain(6), chorusDown = gain(-6) // +-6 cents, opposite directions in the pair: a slow shimmer
  chorus.connect(chorusUp); chorus.connect(chorusDown)
  const partial = [0, 1, 2, 3].map((i) => {
    const a = osc(110, 3 + i), b = osc(110, -3 - i)
    chorusUp.connect(a.detune); chorusDown.connect(b.detune)
    const base = gain(0), amp = gain(0.7)
    const pa = pan(-0.4 + i * 0.05), pb = pan(0.4 - i * 0.05)
    a.connect(pa); b.connect(pb); pa.connect(base); pb.connect(base); base.connect(amp); amp.connect(padLP)
    const lfo = osc(LFO_HZ[i]), depth = gain(0.3) // amp.gain = 0.7 +- 0.3, always positive
    lfo.connect(depth); depth.connect(amp.gain)
    return { a, b, base }
  })

  // ---- flow bed (black hole + fall only): pink noise, 2 sources, two low-pass stages (steeper = darker), a drifting cut-off and a slow swell
  const nb = ctx.createBuffer(1, Math.round(ctx.sampleRate * 12), ctx.sampleRate)
  nb.getChannelData(0).set(makeLoopNoise(ctx.sampleRate, 12, 424242))
  const noiseSrc = (rate: number, offset: number) => { const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true; s.playbackRate.value = rate; srcs.push(s); s.start(start, offset); return s }
  const flowHP = filt('highpass', 110, 0.707), flowLP = filt('lowpass', 260, 0.55), flowLP2 = filt('lowpass', 520, 0.55), flowBase = gain(0), flowAmp = gain(0.7)
  const nl = pan(-0.5), nr = pan(0.5)
  noiseSrc(1, 0).connect(nl); noiseSrc(0.93, 5.3).connect(nr)
  nl.connect(flowHP); nr.connect(flowHP)
  flowHP.connect(flowLP); flowLP.connect(flowLP2); flowLP2.connect(flowBase); flowBase.connect(flowAmp); flowAmp.connect(mix)
  const cl1 = osc(0.047), cl1d = gain(0), cl2 = osc(0.109), cl2d = gain(0) // the current: two slow LFOs on the cut-off
  cl1.connect(cl1d); cl2.connect(cl2d); cl1d.connect(flowLP.frequency); cl2d.connect(flowLP.frequency)
  const sw = osc(0.061), swd = gain(0.3); sw.connect(swd); swd.connect(flowAmp.gain) // the swell: 0.7 +- 0.3

  // ---- the fall's voice: two soft sines a few cents apart that climb in pitch, with a gentle tremolo
  const tA = osc(196, 5), tB = osc(196, -5)
  const tAmp = gain(0.8), tG = gain(0)
  const tLfo = osc(0.3), tLfoD = gain(0.2)
  tA.connect(tAmp); tB.connect(tAmp); tAmp.connect(tG); tG.connect(mix)
  tLfo.connect(tLfoD); tLfoD.connect(tAmp.gain)

  for (const s of srcs) if (!(s instanceof AudioBufferSourceNode)) s.start(start)

  let lastRoot = 110
  const prev = new Float64Array(NPARAM).fill(NaN) // last value written per slot: a steady zone writes nothing
  const w = (slot: number, p: AudioParam, v: number, when: number, tau: number, rel = 0.004, abs = 1e-4) => {
    const o = prev[slot]
    if (o === o && Math.abs(v - o) <= Math.max(abs, Math.abs(o) * rel)) return
    prev[slot] = v; aim(p, v, when, tau)
  }
  return {
    master,
    set(m, when = ctx.currentTime, tau = TAU) {
      lastRoot = m.root
      for (let i = 0; i < 4; i++) {
        const f = m.root * m.ratio[i]
        w(i * 3, partial[i].a.frequency, f, when, tau * 1.4); w(i * 3 + 1, partial[i].b.frequency, f, when, tau * 1.4)
        w(i * 3 + 2, partial[i].base.gain, m.gain[i] * m.level, when, tau)
      }
      w(12, padLP.frequency, m.cutoff, when, tau)
      w(13, flowBase.gain, m.noise * 0.55 * m.level, when, tau)
      w(14, flowLP.frequency, m.noiseFreq * 0.5, when, tau); w(15, flowLP2.frequency, m.noiseFreq, when, tau)
      w(16, cl1d.gain, m.noiseFreq * 0.2 * m.flow, when, tau); w(17, cl2d.gain, m.noiseFreq * 0.12 * m.flow, when, tau)
      w(18, wet.gain, m.space * 0.5, when, tau)
      const t = m.tension, f = 196 * Math.pow(2, t * 1.2) // 196 Hz -> 450 Hz at full tension
      w(19, tA.frequency, f, when, tau); w(20, tB.frequency, f, when, tau)
      w(21, tLfo.frequency, 0.3 + 1.0 * t, when, tau)
      w(22, tG.gain, 0.065 * Math.pow(t, 1.3) * m.level, when, tau)
    },
    fade(v, when = ctx.currentTime, tau = 0.5) { aim(master.gain, v, when, tau) },
    blip(when = ctx.currentTime) {
      const o = osc(lastRoot * 4), o2 = osc(lastRoot * 6, 3), e = gain(0), g2 = gain(0.4)
      o.connect(e); o2.connect(g2); g2.connect(e); e.connect(mix)
      e.gain.setValueAtTime(0, when)
      e.gain.linearRampToValueAtTime(0.03, when + 0.08)
      e.gain.exponentialRampToValueAtTime(0.0001, when + 1.8)
      o.start(when); o2.start(when); o.stop(when + 1.9); o2.stop(when + 1.9)
    },
    dispose() { for (const s of srcs) { try { s.stop() } catch { /* already stopped */ } } },
  }
}
