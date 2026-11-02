import { useEffect, useState } from 'react'

const links = [{ href: '#journey', label: 'Journey' }]

/** Minimal bar: invisible over the hero, restrained glass once the page has scrolled. */
export default function Navigation() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-500 ${
        scrolled ? 'border-hairline bg-void/50 backdrop-blur-md' : 'border-transparent bg-transparent'
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 md:px-10" aria-label="Primary">
        <a href="#top" className="font-mono text-sm tracking-[0.4em] text-ink">ASTRA</a>
        <ul className="flex gap-8">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="label transition-colors hover:text-ink">{l.label}</a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
