/**
 * Hero — "WE ARE HERE."
 * Layers (back → front): fixed StarField canvas (-z-10) → horizon + vignette (-z-[5]) → content.
 * The horizon is a single oversized circle whose top rim peeks above the fold: Earth's limb seen
 * from orbit, kept very faint so the type stays the subject. Nothing here depends on JS or WebGL.
 */
export default function Hero() {
  return (
    <section id="top" className="relative flex min-h-svh flex-col justify-end overflow-hidden px-6 pb-20 md:px-10 md:pb-24">
      {/* Planetary limb: dark disc + a thin lit atmosphere rim. Purely decorative. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -z-[5] aspect-square rounded-full"
        style={{
          left: '74%',
          bottom: 0,
          width: '200vw',
          transform: 'translate(-50%, calc(100% - 15vh))',
          background:
            'radial-gradient(ellipse 50% 6% at 50% 0%, rgb(143 180 255 / 0.12), transparent), var(--color-void)',
          boxShadow: 'inset 0 1px 0 rgb(143 180 255 / 0.28), 0 -24px 90px rgb(143 180 255 / 0.07)',
        }}
      />
      {/* Vignette: pulls the eye to the lower-left where the type sits. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-[5]"
        style={{ background: 'radial-gradient(ellipse at 28% 62%, transparent 35%, rgb(3 4 10 / 0.65) 100%)' }}
      />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-14 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="label fade-up mb-8" style={{ animationDelay: '0.3s' }}>
            Digital observatory
          </p>

          <h1 className="font-display text-[clamp(3.5rem,13vw,11.5rem)] font-normal uppercase leading-[0.9] tracking-[-0.01em] text-ink">
            <span className="fade-up block" style={{ animationDelay: '0.6s' }}>
              We are
            </span>{' '}
            <span className="fade-up block" style={{ animationDelay: '1s' }}>
              here<span className="pulse-soft text-signal">.</span>
            </span>
          </h1>

          <p
            className="fade-up mt-10 max-w-md text-lg leading-relaxed text-ink-dim md:text-xl"
            style={{ animationDelay: '1.6s' }}
          >
            Somewhere on a small planet, orbiting an ordinary star, inside one ordinary galaxy.
          </p>

          <a
            href="#earth"
            className="group fade-up mt-14 inline-flex items-center gap-5 text-ink-dim transition-colors hover:text-ink focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-8 focus-visible:outline-signal"
            style={{ animationDelay: '2.1s' }}
          >
            <span className="h-px w-12 bg-ink/30 transition-all duration-500 group-hover:w-20 group-hover:bg-signal" />
            <span className="label text-[0.8125rem] text-current">
              Explore the universe{' '}
              <span aria-hidden="true" className="inline-block transition-transform duration-500 group-hover:translate-y-1">
                ↓
              </span>
            </span>
          </a>
        </div>

        {/* Where "here" is. Approximate figures — see PROJECT_STATUS.md §10. */}
        <dl className="fade-up hidden text-right md:block" style={{ animationDelay: '2.4s' }}>
          <dt className="label">Position</dt>
          <dd className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-ink-dim">Orion Spur · Milky Way</dd>
          <dt className="label mt-6">Galactic centre</dt>
          <dd className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-ink-dim">≈ 26,000 light-years</dd>
        </dl>
      </div>
    </section>
  )
}
