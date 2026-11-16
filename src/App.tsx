import { Component, Suspense, useEffect, type ReactNode } from 'react'
import { Engine } from './engine/Engine'
import { initScroll } from './engine/scroll'
import { useStore } from './engine/store'
import { LoadingScreen, Title, Rail, Beats, Controls, FocusPanel, GateOverlay, Curtain, IntroVeil } from './hud/Hud'
import { installDebug } from './test/debug'
import { ScaleTestObjects } from './test/ScaleTest'
import { PlanetsTest } from './test/Planets'
import { BlackHoleHud } from './zones/blackhole/Hud'
import { UniverseHud } from './zones/universe/Hud'
import { ExperienceTop, SoundFeed, ScrollHint, PlanetHint, LinkSync } from './hud/Experience'
import { resolveSettings, setPref } from './engine/quality'

const TEST = new URLSearchParams(location.search).get('test')

const RETRY_KEY = 'astra.retry'
const describe = (e: unknown) => {
  try {
    const x = e as { name?: string; message?: string; stack?: string } | null
    return [`${Object.prototype.toString.call(e)} ${x?.name ?? ''}: ${x?.message ?? String(e)}`, ...String(x?.stack ?? '').split('\n').slice(0, 5)].join('\n')
  } catch { return 'unknown error' }
}

/** Last line of defence: if anything in the app throws while starting, show WHAT (never a blank page) and, once, retry at the lowest quality. */
class StartGuard extends Component<{ children: ReactNode }, { err: unknown }> {
  state = { err: null as unknown }
  static getDerivedStateFromError(err: unknown) { return { err: err ?? new Error('unknown error') } }
  componentDidCatch(err: unknown) {
    console.error(err)
    try {
      if (resolveSettings().tier !== 'low' && !sessionStorage.getItem(RETRY_KEY)) { sessionStorage.setItem(RETRY_KEY, '1'); setPref('low'); location.reload() }
    } catch { /* storage blocked: just show the message */ }
  }
  render() {
    if (this.state.err === null) return this.props.children
    return (
      <div role="alert" data-testid="start-error" style={{ position: 'fixed', inset: 0, zIndex: 99998, background: '#02030a', color: '#ffb4b4', padding: 16, font: '12px/1.5 ui-monospace,Menlo,monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'auto' }}>
        {'ASTRA could not start\n' + describe(this.state.err) + '\n' + navigator.userAgent}
      </div>
    )
  }
}

export function App() {
  const phase = useStore((s) => s.phase)
  useEffect(() => { document.documentElement.classList.add('astra-intro'); initScroll(); installDebug() }, [])
  return (
    <StartGuard>
      <Suspense fallback={null}>
      <Engine extra={TEST === 'scale' ? <ScaleTestObjects /> : TEST === 'planets' ? <PlanetsTest /> : null} />
      </Suspense>
      <IntroVeil />
      <Title />
      <Beats />
      <Rail />
      <Controls />
      <FocusPanel />
      <BlackHoleHud />
      <UniverseHud />
      <GateOverlay />
      <Curtain />
      <ExperienceTop />
      <ScrollHint />
      <PlanetHint />
      <SoundFeed />
      <LinkSync />
      <LoadingScreen />
      <div className="sr-only" role="status" aria-live="polite">{phase === 'ready' ? 'Journey ready. Scroll to travel.' : ''}</div>
    </StartGuard>
  )
}
