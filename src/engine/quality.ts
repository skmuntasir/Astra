/**
 * Quality tiers. high / medium / low, auto-detected, with a manual override persisted in localStorage.
 * `tex` is the TEXTURE tier chosen at startup ('hi' = up to 4k, 'lo' = 2k max, always used on phones). Because textures are
 * all loaded before the journey starts, changing the texture tier needs a reload; everything else applies live.
 */
export type Tier = 'high' | 'medium' | 'low'
export type TierPref = 'auto' | Tier

export interface TierSettings {
  tier: Tier
  dprCap: number
  tex: 'hi' | 'lo'
  antialias: boolean
  segments: number // sphere segments
  starCount: number
  anisotropy: number
  atmosphere: boolean
}

const BASE: Record<Tier, Omit<TierSettings, 'tier' | 'tex'>> = {
  high: { dprCap: 2, antialias: true, segments: 128, starCount: 9000, anisotropy: 8, atmosphere: true },
  medium: { dprCap: 1.5, antialias: true, segments: 96, starCount: 6000, anisotropy: 4, atmosphere: true },
  low: { dprCap: 1, antialias: false, segments: 64, starCount: 3500, anisotropy: 2, atmosphere: false },
}

export const isMobile = () =>
  typeof navigator !== 'undefined' && typeof matchMedia !== 'undefined' && (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820))

let gpuName = ''
export function probeGpu(): string {
  if (gpuName) return gpuName
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') ?? c.getContext('webgl')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    gpuName = ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown'
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch { gpuName = 'unknown' }
  return gpuName
}

export function detectTier(): Tier {
  if (typeof document === 'undefined') return 'high' // node (tests)
  // the throw-away WebGL context is only needed on a computer (to spot software rendering); on a phone an extra context on the GPU is just a risk
  const gpu = isMobile() ? 'unknown' : probeGpu()
  if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) return 'low'
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8
  const cores = navigator.hardwareConcurrency ?? 4
  if (isMobile()) return mem >= 6 && cores >= 8 ? 'medium' : 'low'
  if (mem <= 2 || cores <= 2) return 'low'
  if (mem <= 4 || cores <= 4) return 'medium'
  return 'high'
}

const KEY = 'astra.quality'
export const getPref = (): TierPref => (typeof localStorage === 'undefined' ? 'auto' : (localStorage.getItem(KEY) as TierPref) || 'auto')
export const setPref = (p: TierPref) => { try { localStorage.setItem(KEY, p) } catch { /* private mode */ } }

export function resolveSettings(pref: TierPref = getPref()): TierSettings {
  const tier = pref === 'auto' ? detectTier() : pref
  const tex: 'hi' | 'lo' = isMobile() || tier === 'low' ? 'lo' : 'hi'
  return { tier, tex, ...BASE[tier] }
}
/** Settings with the texture tier pinned to what was actually loaded this session. */
export function liveSettings(pref: TierPref, loadedTex: 'hi' | 'lo'): TierSettings {
  const s = resolveSettings(pref)
  return { ...s, tex: loadedTex }
}
export const needsReload = (pref: TierPref, loadedTex: 'hi' | 'lo') => resolveSettings(pref).tex !== loadedTex
