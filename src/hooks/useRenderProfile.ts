import { useMemo } from 'react'

export interface RenderProfile {
  tier: 'low' | 'high'
  starCount: number
  maxDpr: number
  /** false when the user prefers reduced motion — render still, no continuous animation. */
  animate: boolean
  /** Pointer-driven star parallax. Only for fine pointers (mouse/trackpad) and when motion is allowed. */
  cursorParallax: boolean
}

/**
 * Single place that decides how heavy 3D/effects should be.
 * Every canvas component should read this instead of sniffing devices itself.
 */
export function getRenderProfile(): RenderProfile {
  const small = window.matchMedia('(max-width: 768px)').matches
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const weak = (navigator.hardwareConcurrency ?? 4) <= 4
  const low = small || weak
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches
  return {
    tier: low ? 'low' : 'high',
    starCount: low ? 3500 : 9000,
    maxDpr: low ? 1.5 : 2,
    animate: !reduced,
    cursorParallax: !reduced && finePointer,
  }
}

export function useRenderProfile(): RenderProfile {
  return useMemo(getRenderProfile, [])
}
