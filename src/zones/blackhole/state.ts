import { create } from 'zustand'

/** UI state of the black-hole zone (the per-frame numbers live in `live`, a plain object read by the HUD with rAF, never React state). */
export const useBh = create<{ endCard: boolean; returning: boolean; set: (p: Partial<{ endCard: boolean; returning: boolean }>) => void }>((set) => ({ endCard: false, returning: false, set: (p) => set(p) }))

export const live = {
  /** radius, gravitational radii (observer) */
  r: 0,
  /** speed relative to the local static observer (outside) */
  beta: 0,
  /** infall stats */
  inInfall: false,
  alpha: 0,
}

/** what the renderer reports (tests read it through window.__astra.bh) */
export const bhStats = {
  framesDrawn: 0,
  framesBeforeReady: 0,
  lastMs: 0,
  scale: 0,
  stepScale: 1,
  guardChanges: 0,
  lastR: 0,
  mounted: false,
}

/** Cross-dissolve at the seam with the galaxy dive: M87's nucleus glow, stars and jet (zones/galactic/M87.tsx) are multiplied by this; written by BHBody every frame. */
export const bhFade = { m87: 1 }
