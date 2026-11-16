import { create } from 'zustand'
import { resolveSettings, getPref, type TierPref, type TierSettings } from './quality'

export interface GateOption {
  id: string
  label: string
  /** Enter this branch timeline when chosen. */
  branch?: string
  /** Or jump the main timeline to this t (0..1) instead. */
  gotoT?: number
}
export interface GateSpec {
  id: string
  title: string
  prompt: string
  options: GateOption[]
  /** Shown small under the prompt, e.g. "Speculative". */
  note?: string
}

interface State {
  phase: 'loading' | 'ready' | 'error'
  progress: number
  progressLabel: string
  error: string | null
  assetsReady: boolean
  /** loading is finished but the browser still blocks sound: the loading screen asks for one tap (that tap starts the sound) */
  awaitEnter: boolean
  settings: TierSettings
  pref: TierPref
  motion: 'full' | 'reduced'
  timelineId: string
  zoneId: string
  zoneTitle: string
  zoneScale: string
  zoneIndex: number
  focusId: string | null
  focusPhase: 'idle' | 'flying-in' | 'focused' | 'flying-out'
  gate: GateSpec | null
  curtain: number // 0..1 black cross-fade for far jumps
  set: (p: Partial<Omit<State, 'set'>>) => void
}

export const useStore = create<State>((set) => ({
  phase: 'loading',
  progress: 0,
  progressLabel: 'Starting',
  error: null,
  assetsReady: false,
  awaitEnter: false,
  settings: resolveSettings(),
  pref: getPref(),
  motion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full',
  timelineId: 'main',
  zoneId: '',
  zoneTitle: '',
  zoneScale: '',
  zoneIndex: 0,
  focusId: null,
  focusPhase: 'idle',
  gate: null,
  curtain: 0,
  set: (p) => set(p),
}))
export const st = () => useStore.getState()
