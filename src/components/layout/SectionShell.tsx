import type { ReactNode } from 'react'

interface Props {
  id: string
  /** Scientific label shown above the content, e.g. "02 — Moon". Ignored when `bleed`. */
  eyebrow?: string
  className?: string
  /**
   * Full-bleed stage: no max-width, padding or eyebrow. For chapters that pin a full-viewport scene
   * (sticky canvas + scroll-driven text) and place their own content width inside it.
   * The anchor id still lives here, so `#id` links work the same for every section.
   */
  bleed?: boolean
  children: ReactNode
}

/** Consistent frame for every journey section: anchor id, width, spacing. */
export default function SectionShell({ id, eyebrow, className = '', bleed = false, children }: Props) {
  if (bleed) {
    return (
      <section id={id} className={`relative w-full ${className}`}>
        {children}
      </section>
    )
  }
  return (
    <section id={id} className={`relative mx-auto w-full max-w-7xl px-6 py-32 md:px-10 ${className}`}>
      {eyebrow && <p className="label mb-10">{eyebrow}</p>}
      {children}
    </section>
  )
}
