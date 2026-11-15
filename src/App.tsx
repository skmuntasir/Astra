import { useEffect } from 'react'
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

const TEST = new URLSearchParams(location.search).get('test')

export function App() {
  const phase = useStore((s) => s.phase)
  useEffect(() => { document.documentElement.classList.add('astra-intro'); initScroll(); installDebug() }, [])
  return (
    <>
      <Engine extra={TEST === 'scale' ? <ScaleTestObjects /> : TEST === 'planets' ? <PlanetsTest /> : null} />
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
    </>
  )
}
