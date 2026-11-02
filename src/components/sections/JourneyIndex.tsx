import { chapters } from '@/data/journey'
import SectionShell from '@/components/layout/SectionShell'

/** Data-driven index of the full journey. Reads src/data/journey.ts. */
export default function JourneyIndex() {
  return (
    <SectionShell id="journey" eyebrow="The journey">
      <h2 className="max-w-3xl font-display text-4xl leading-tight md:text-6xl">
        Fourteen steps outward. Each one a change of scale.
      </h2>
      <ol className="mt-24 border-t border-hairline">
        {chapters.map((c, i) => (
          <li key={c.id} className="grid grid-cols-[3rem_1fr] items-baseline gap-x-6 gap-y-1 border-b border-hairline py-6 md:grid-cols-[4rem_1fr_16rem_8rem]">
            <span className="label">{String(i + 1).padStart(2, '0')}</span>
            <span className="font-display text-2xl md:text-3xl">
              {c.status === 'live' ? (
                <a href={`#${c.id}`} className="transition-colors hover:text-signal">
                  {c.title}
                </a>
              ) : (
                c.title
              )}
            </span>
            <span className="label col-start-2 md:col-start-auto">{c.scale}</span>
            <span className="label col-start-2 md:col-start-auto md:text-right">
              {c.status === 'live' ? 'Open' : 'In development'}
            </span>
          </li>
        ))}
      </ol>
    </SectionShell>
  )
}
