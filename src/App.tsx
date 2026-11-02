import { lazy, Suspense } from 'react'
import Navigation from '@/components/layout/Navigation'
import Hero from '@/components/sections/Hero'
import ChapterEarth from '@/components/sections/ChapterEarth'
import ChapterMoon from '@/components/sections/ChapterMoon'
import ChapterSolarSystem from '@/components/sections/ChapterSolarSystem'
import ChapterCosmicScale from '@/components/sections/ChapterCosmicScale'
import ChapterBlackHoles from '@/components/sections/ChapterBlackHoles'
import ChapterObservatory from '@/components/sections/ChapterObservatory'
import ChapterStarMap from '@/components/sections/ChapterStarMap'
import ChapterDeepSpace from '@/components/sections/ChapterDeepSpace'
import ChapterSearchForLife from '@/components/sections/ChapterSearchForLife'
import ChapterHumanity from '@/components/sections/ChapterHumanity'
import JourneyIndex from '@/components/sections/JourneyIndex'

// 3D stack is code-split so the page text paints before Three.js loads.
const StarField = lazy(() => import('@/components/canvas/StarField'))

export default function App() {
  return (
    <>
      <Suspense fallback={null}>
        <StarField />
      </Suspense>
      <Navigation />
      <main>
        <Hero />
        <ChapterEarth />
        <ChapterMoon />
        <ChapterSolarSystem />
        <ChapterCosmicScale />
        <ChapterBlackHoles />
        <ChapterObservatory />
        <ChapterStarMap />
        <ChapterDeepSpace />
        <ChapterSearchForLife />
        <ChapterHumanity />
        <JourneyIndex />
      </main>
      <footer className="border-t border-hairline px-6 py-10 md:px-10">
        <p className="label mx-auto max-w-7xl">ASTRA — Observation in progress</p>
      </footer>
    </>
  )
}
