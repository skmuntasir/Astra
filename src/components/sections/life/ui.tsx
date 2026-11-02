import type { ReactNode } from 'react'

/** Shared building blocks for Chapter 09's sections. Same visual language as the rest of ASTRA: hairlines, serif display, mono labels. */

export const focusRing = 'focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-signal'
export const tabBtn = `label transition-colors hover:text-ink ${focusRing}`

export function SectionHead({ kicker, title, lead }: { kicker: string; title: string; lead: ReactNode }) {
  return (
    <header>
      <p className="label">{kicker}</p>
      <h2 className="mt-6 max-w-3xl font-display text-4xl leading-tight md:text-6xl">{title}</h2>
      <div className="mt-6 max-w-2xl space-y-4 text-ink-dim md:text-lg">{lead}</div>
    </header>
  )
}

/** Small-print footnote: the honesty layer of every instrument. */
export function Note({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`label text-[0.625rem] normal-case leading-relaxed tracking-wide ${className}`}>{children}</p>
}

export function Stat({ k, v, sub }: { k: string; v: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <dt className="label text-[0.625rem]">{k}</dt>
      <dd className="mt-1.5 font-display text-xl leading-snug text-ink">{v}</dd>
      {sub && <p className="mt-1 text-xs leading-snug text-ink-faint">{sub}</p>}
    </div>
  )
}

interface SliderProps {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  /** Text shown beside the label. */
  display: ReactNode
  valueText?: string
}
export function Slider({ id, label, value, min, max, step, onChange, display, valueText }: SliderProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="label">{label}</label>
        <span className="font-mono text-xs tracking-wide text-ink-dim">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={valueText}
        className={`mt-3 h-6 w-full cursor-pointer accent-signal ${focusRing}`}
      />
    </div>
  )
}

export function Bullets({ items, tone = 'dim' }: { items: string[]; tone?: 'dim' | 'ink' }) {
  return (
    <ul className="space-y-3">
      {items.map((t) => (
        <li key={t} className={`flex gap-4 text-sm leading-relaxed md:text-base ${tone === 'ink' ? 'text-ink' : 'text-ink-dim'}`}>
          <span className="mt-[0.7em] h-px w-5 shrink-0 bg-ink/30" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  )
}

/** Mono, uppercase colour for the SVG text used in every chart (SVG can't read Tailwind classes). */
export const svgText = {
  fontFamily: 'ui-monospace, Menlo, monospace',
  letterSpacing: 1,
} as const
