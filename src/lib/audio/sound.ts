import { createAmbient, MASTER_GAIN, SAMPLE_RATE, type Ambient } from './ambient'
import { mk, type Mood } from './moods'

/**
 * Sound controller (no React, no engine imports). One singleton.
 *
 *  - The AudioContext is NEVER created before a user gesture: `start()` runs only from a click / tap / key press handler.
 *  - Preference (localStorage 'astra.sound' = 'on' | 'off', in try/catch). No stored value: on, except under prefers-reduced-motion where
 *    the default is off (the person has to turn it on). 'off' = muted: the first gesture does NOT start anything.
 *  - Mute fades the master (no click) then suspends the context. A hidden tab suspends too and resumes on return (if wanted).
 *  - `feed()` is called a few times per second by the HUD; it only aims parameters (no allocation).
 */
export const SOUND_KEY = 'astra.sound'
type Listener = () => void
const listeners = new Set<Listener>()

export const sound = {
  /** the person wants sound (preference) */
  wanted: false,
  /** the AudioContext exists and is running (or about to) */
  playing: false,
  /** has a gesture created the context yet */
  started: false,
  ctx: null as AudioContext | null,
  amb: null as Ambient | null,
  /** last mood handed to feed(); re-applied when the context (re)starts */
  mood: mk() as Mood,
  haveMood: false,
}
const emit = () => listeners.forEach((l) => l())
export const subscribeSound = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l) } }
export const soundSnapshot = () => `${sound.wanted ? 1 : 0}${sound.playing ? 1 : 0}`

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
function readPref(): boolean {
  try { const v = localStorage.getItem(SOUND_KEY); if (v === 'on') return true; if (v === 'off') return false } catch { /* storage blocked */ }
  return !reduced()
}
function writePref(on: boolean) { try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off') } catch { /* storage blocked */ } }

let timer: ReturnType<typeof setTimeout> | null = null
function suspendSoon(ms: number) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; if (!sound.wanted || document.hidden) void sound.ctx?.suspend().catch(() => {}) }, ms)
}

async function start() {
  if (sound.started || typeof window === 'undefined') return
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  sound.started = true
  try {
    // 24 kHz is plenty (the sound is all below 5 kHz) and halves the work; a browser that refuses the option gets its default rate
    let ctx: AudioContext
    try { ctx = new AC({ latencyHint: 'playback', sampleRate: SAMPLE_RATE }) } catch { ctx = new AC({ latencyHint: 'playback' }) }
    sound.ctx = ctx
    sound.amb = createAmbient(ctx)
    if (sound.haveMood) sound.amb.set(sound.mood, ctx.currentTime, 0.05) // start already on the right mood (no glide from a default)
    await ctx.resume()
    sound.amb.fade(MASTER_GAIN, ctx.currentTime, 1.4) // slow fade-in from silence
    sound.playing = true
  } catch (e) {
    console.warn('sound: could not start', e)
    sound.started = false
  }
  emit()
}

function fadeOutAndSuspend() {
  const { ctx, amb } = sound
  if (!ctx || !amb) return
  amb.fade(0, ctx.currentTime, 0.18)
  sound.playing = false
  suspendSoon(1200)
  emit() // the button must show the paused state
}
async function resume() {
  const { ctx, amb } = sound
  if (!ctx || !amb) return
  if (timer) { clearTimeout(timer); timer = null }
  try { await ctx.resume() } catch { return }
  if (sound.haveMood) amb.set(sound.mood, ctx.currentTime, 0.6)
  amb.fade(MASTER_GAIN, ctx.currentTime, 0.6)
  sound.playing = true
  emit()
}

/** the Sound button, the M key and the first-gesture hook all end up here */
export function setSound(on: boolean, persist = true) {
  sound.wanted = on
  if (persist) writePref(on)
  if (on) { if (!sound.started) void start(); else if (!sound.playing) void resume() } else { fadeOutAndSuspend() }
  emit()
}
/** the button and the M key: audible -> mute; anything else (muted, or waiting for the first gesture) -> sound on */
export const toggleSound = () => setSound(!sound.playing)

/** Aim the graph at a mood (call a few times per second at most). Safe before the context exists. */
export function feedMood(m: Mood) {
  const s = sound
  if (m !== s.mood) { s.mood.root = m.root; for (let i = 0; i < 4; i++) { s.mood.ratio[i] = m.ratio[i]; s.mood.gain[i] = m.gain[i] }; s.mood.cutoff = m.cutoff; s.mood.noise = m.noise; s.mood.noiseFreq = m.noiseFreq; s.mood.flow = m.flow; s.mood.tension = m.tension; s.mood.space = m.space; s.mood.level = m.level }
  s.haveMood = true
  if (s.playing && s.ctx && s.amb && s.ctx.state === 'running') s.amb.set(s.mood, s.ctx.currentTime)
}

let lastBlip = 0
/** a soft bell when a body is focused (at most one per 1.5 s) */
export function blip() {
  const now = typeof performance !== 'undefined' ? performance.now() : 0
  if (!sound.playing || !sound.ctx || !sound.amb || now - lastBlip < 1500) return
  lastBlip = now
  sound.amb.blip(sound.ctx.currentTime)
}

let installed = false
/** Reads the preference and arms the first-gesture hook. Does NOT create an AudioContext. Returns a cleanup. */
export function installSound(): () => void {
  if (installed) return () => {}
  installed = true
  sound.wanted = readPref()
  emit()
  const onGesture = (e: Event) => {
    const t = e.target as HTMLElement | null
    if (t?.closest?.('[data-sound-button]')) return // the button handles its own click (it may be a mute)
    if (e instanceof KeyboardEvent && (e.key === 'm' || e.key === 'M' || e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta')) return
    if (sound.wanted && !sound.started) void start()
  }
  const gestures: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchend', 'click']
  for (const g of gestures) window.addEventListener(g, onGesture, true)
  const onVis = () => {
    if (document.hidden) { if (sound.playing) fadeOutAndSuspend() } else if (sound.wanted && sound.started && !sound.playing) void resume()
  }
  document.addEventListener('visibilitychange', onVis)
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'm' && e.key !== 'M') return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const t = e.target as HTMLElement | null
    if (t && (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable)) return
    e.preventDefault()
    toggleSound()
  }
  window.addEventListener('keydown', onKey)
  return () => {
    installed = false
    for (const g of gestures) window.removeEventListener(g, onGesture, true)
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('keydown', onKey)
  }
}
