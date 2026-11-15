import { createRoot } from 'react-dom/client'
import './styles/index.css'
import './zones'
import { App } from './App'
import { startPrefetch } from './engine/preload'
import { st } from './engine/store'

// /bh-lab (or ?bhlab) = the standalone black-hole lab (own canvas, lazy-loaded; the journey is untouched).
const isLab = /\/bh-lab\/?$/.test(location.pathname) || new URLSearchParams(location.search).has('bhlab')
const root = createRoot(document.getElementById('root')!)
if (isLab) import('./lab/BhLab').then((m) => root.render(<m.BhLab />))
else {
  // start downloading + decoding every texture NOW (before React mounts and WebGL starts); the preloader picks the work up where it is
  startPrefetch(st().settings.tex)
  root.render(<App />)
}
