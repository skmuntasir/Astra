import type { CSSProperties } from 'react'

/**
 * A text beat that fades/slides in over [inA, inB] and (optionally) out over [outA, outB] of a pinned
 * chapter's scroll progress. Pure CSS (`--p` is set by useSectionProgress), so scrolling causes no React renders.
 */
export function beat(inA: number, inB: number, outA?: number, outB?: number): CSSProperties {
  const up = `clamp(0, calc((var(--p) - ${inA}) * ${(1 / (inB - inA)).toFixed(3)}), 1)`
  const down =
    outA === undefined || outB === undefined ? '1' : `clamp(0, calc((${outB} - var(--p)) * ${(1 / (outB - outA)).toFixed(3)}), 1)`
  return {
    opacity: `min(${up}, ${down})`,
    transform: `translateY(calc((1 - ${up}) * 18px))`,
  }
}
