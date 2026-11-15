/**
 * Performance guard: keeps the black-hole renderer inside a frame-time budget by lowering its RESOLUTION SCALE (and step budget), never the frame rate
 * of the journey. Pure logic (no three): feed it the frame time every frame the black hole is drawn.
 *   - if the smoothed frame time stays above `hiMs` for `holdDown` seconds: scale *= 0.85 (min `minScale`), then the step budget shrinks too;
 *   - if it stays below `loMs` for `holdUp` seconds: scale *= 1.08 back up to the tier's own scale.
 * Hitches (dt > ignoreMs, e.g. tab switches) are ignored.
 */
export interface GuardState { scale: number; stepScale: number; ema: number; changes: number; lowered: boolean }
export class FrameGuard {
  scale: number
  stepScale = 1
  ema = 16
  changes = 0
  private above = 0
  private below = 0
  constructor(public maxScale: number, public minScale = 0.16, public hiMs = 22, public loMs = 13, public holdDown = 0.6, public holdUp = 4, public ignoreMs = 1000) { this.scale = maxScale }
  /** returns true when scale or stepScale changed */
  update(dtMs: number): boolean {
    if (!(dtMs > 0) || dtMs > this.ignoreMs) return false
    const dt = dtMs / 1000
    this.ema += (dtMs - this.ema) * Math.min(1, dt * 4)
    if (this.ema > this.hiMs) { this.above += dt; this.below = 0 } else if (this.ema < this.loMs) { this.below += dt; this.above = 0 } else { this.above = 0; this.below = 0 }
    if (this.above > this.holdDown) {
      this.above = 0
      if (this.scale > this.minScale + 1e-6) { this.scale = Math.max(this.minScale, this.scale * 0.85); this.changes++; return true }
      if (this.stepScale > 0.55) { this.stepScale = Math.max(0.55, this.stepScale * 0.85); this.changes++; return true }
    }
    if (this.below > this.holdUp) {
      this.below = 0
      if (this.stepScale < 1) { this.stepScale = Math.min(1, this.stepScale * 1.12); this.changes++; return true }
      if (this.scale < this.maxScale - 1e-6) { this.scale = Math.min(this.maxScale, this.scale * 1.08); this.changes++; return true }
    }
    return false
  }
  get state(): GuardState { return { scale: this.scale, stepScale: this.stepScale, ema: this.ema, changes: this.changes, lowered: this.scale < this.maxScale - 1e-6 || this.stepScale < 1 } }
}
