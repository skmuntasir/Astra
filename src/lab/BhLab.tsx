import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ASSETS, makeTexture, urlFor } from '../engine/assets'
import { BlackHole, type BHPose } from '../lib/bh/BlackHole'
import type { BlackHoleRenderer, BHTier } from '../lib/bh/BlackHoleRenderer'
import { PRESETS, isco, horizon, photonOrbit, rgMetres, shadowDiameterMicroArcsec, type BHPreset } from '../lib/bh/kerr'

/**
 * /bh-lab (or ?bhlab): standalone page for the Kerr black-hole renderer. Own <Canvas>; the renderer itself (src/lib/bh) is the same module step 3
 * mounts inside the journey's persistent canvas. Everything drawn here is a SIMULATION computed in real time (geodesic ray tracing); no
 * observational image is used or implied.
 */
const Z_UP_TO_Y = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1)) // hole-local (z = spin axis) -> world (y up)

interface LabState {
  preset: BHPreset['id'] | 'custom'
  spin: number; incl: number; dist: number; massLog: number
  tmax: number; exposure: number; discOut: number
  tier: BHTier; scale: number; temporal: boolean; look: boolean
  jet: boolean; horizonMarker: boolean; disc: boolean; speed: number; autoZoom: boolean; fov: number
}
const DEFAULT: LabState = { preset: 'm87', spin: 0.9, incl: 17, dist: 800, massLog: Math.log10(6.5e9), tmax: 7000, exposure: 2.2, discOut: 40, tier: 'medium', scale: 0, temporal: true, look: true, jet: true, horizonMarker: false, disc: true, speed: 20, autoZoom: true, fov: 40 }
const presetState = (p: BHPreset): Partial<LabState> => ({
  preset: p.id, spin: p.spin, incl: p.inclinationDeg, massLog: Math.log10(p.massSun), tmax: p.discTmaxK, discOut: p.discOutRg, jet: p.jet, look: p.look > 0.5,
  dist: p.id === 'stellar' ? 60 : p.id === 'sgra' ? 400 : 800, exposure: p.id === 'stellar' ? 2.0 : 2.2,
})

const REAL_TEXT: Record<BHPreset['id'], string> = {
  m87: 'M87*: the Event Horizon Telescope (2019) imaged the shadow of a ~6.5 billion solar-mass black hole 16.8 Mpc away: a ring ~42 micro-arcseconds across, brighter on the south side, with the jet axis ~17° from our line of sight. The EHT image is a radio (1.3 mm) synchrotron picture of hot plasma; it does NOT show a thin visible-light disc. Spin is not measured.',
  sgra: 'Sagittarius A*: the EHT (2022) imaged a ring ~51.8 micro-arcseconds across around the ~4.3 million solar-mass hole at the Galactic centre, seen roughly face-on. Again radio emission; the plasma varies within minutes.',
  stellar: 'A 10 solar-mass black hole with a thin accretion disc is the textbook "X-ray binary" picture. No such hole has been imaged this way; this is an illustration of the physics, not of a specific object.',
}

function useLabTextures() {
  const [tex, setTex] = useState<{ sky: THREE.Texture; noise: THREE.Texture } | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const load = async (id: string) => {
          const a = ASSETS.find((x) => x.id === id)!
          const blob = await (await fetch(urlFor(a, 'lo'))).blob()
          const bmp = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
          return makeTexture(bmp, a, 4)
        }
        const [sky, noise] = await Promise.all([load('milkyway'), load('bh-disc-noise')])
        if (!dead) setTex({ sky, noise })
      } catch (e) { if (!dead) setErr(String(e)) }
    })()
    return () => { dead = true }
  }, [])
  return { tex, err }
}

function Rig({ s, onStats, rendRef }: { s: LabState; onStats: (t: string) => void; rendRef: React.MutableRefObject<BlackHoleRenderer | null> }) {
  const camera = useThree((st) => st.camera) as THREE.PerspectiveCamera
  const size = useThree((st) => st.size)
  const gl = useThree((st) => st.gl)
  const acc = useRef({ t: 0, n: 0, last: performance.now(), sim: 0 })
  useFrame((_, dt) => {
    const tanHalf = s.autoZoom ? Math.min(0.9, 17 / s.dist) : Math.tan(THREE.MathUtils.degToRad(s.fov / 2))
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanHalf))
    if (Math.abs(camera.fov - fov) > 1e-9 || camera.aspect !== size.width / size.height) { camera.fov = fov; camera.aspect = size.width / size.height; camera.updateProjectionMatrix() }
    acc.current.sim += dt * s.speed
    const a = acc.current; a.n++
    const now = performance.now()
    if (now - a.last > 700) {
      const r = rendRef.current
      onStats(`${(1000 * a.n / (now - a.last)).toFixed(0)} fps (this page, ${gl.getPixelRatio().toFixed(2)}x dpr)${r ? ` | trace ${Math.round(size.width * gl.getPixelRatio() * (s.scale || ({ high: 0.75, medium: 0.5, low: 0.33 })[s.tier]))} px wide` : ''}`)
      a.n = 0; a.last = now
    }
  })
  return null
}

export function BhLab() {
  const { tex, err } = useLabTextures()
  const [s, setS] = useState<LabState>({ ...DEFAULT })
  const [stats, setStats] = useState('')
  const rendRef = useRef<BlackHoleRenderer | null>(null)
  const upd = (p: Partial<LabState>) => setS((o) => ({ ...o, ...p, preset: p.preset ?? 'custom' }))
  const simT = useRef(0)
  const sRef = useRef(s); sRef.current = s
  const clock = useRef(performance.now())
  const getPose = useMemo(() => (): BHPose => {
    const st = sRef.current
    const now = performance.now(); simT.current += ((now - clock.current) / 1000) * st.speed; clock.current = now
    const th = THREE.MathUtils.degToRad(Math.min(89.999, Math.max(0.001, st.incl)))
    const P = new THREE.Vector3(Math.sin(th) * st.dist, 0, Math.cos(th) * st.dist) // camera at phi = 0, polar angle = inclination
    const up = new THREE.Vector3(0, 0, 1)
    const zc = P.clone().normalize(), xc = new THREE.Vector3().crossVectors(up, zc).normalize(), yc = new THREE.Vector3().crossVectors(zc, xc)
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xc, yc, zc))
    return { posRg: [P.x, P.y, P.z], camToHole: q, holeToWorld: Z_UP_TO_Y, time: simT.current }
  }, [])
  const mass = Math.pow(10, s.massLog)
  const rg = rgMetres(mass)
  const real = s.preset !== 'custom' ? PRESETS[s.preset] : null
  const rIsco = isco(s.spin), rh = horizon(s.spin)
  const shadowReal = real ? shadowDiameterMicroArcsec(real.massSun, real.distanceM) : null
  const fmt = (x: number) => (x >= 1e6 ? x.toExponential(2) : x.toFixed(x < 10 ? 3 : 0))
  const slider = (label: string, key: keyof LabState, min: number, max: number, step: number, show?: (v: number) => string) => (
    <label style={{ display: 'block', margin: '6px 0' }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}><span>{label}</span><b>{show ? show(s[key] as number) : (s[key] as number)}</b></span>
      <input type="range" min={min} max={max} step={step} value={s[key] as number} onChange={(e) => upd({ [key]: parseFloat(e.target.value) } as Partial<LabState>)} style={{ width: '100%' }} />
    </label>
  )
  const chk = (label: string, key: 'jet' | 'horizonMarker' | 'disc' | 'temporal' | 'autoZoom' | 'look') => (
    <label style={{ display: 'inline-block', marginRight: 12 }}><input type="checkbox" checked={s[key]} onChange={(e) => upd({ [key]: e.target.checked } as Partial<LabState>)} /> {label}</label>
  )
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', color: '#cfd8e6', font: '13px/1.45 system-ui, sans-serif' }}>
      {tex && (
        <Canvas dpr={[1, 1.5]} gl={{ antialias: false, powerPreference: 'high-performance' }} camera={{ fov: 40, near: 0.1, far: 10 }} style={{ position: 'absolute', inset: 0 }}>
          <Rig s={s} onStats={setStats} rendRef={rendRef} />
          <BlackHole
            sky={tex.sky} noise={tex.noise} tier={s.tier} scale={s.scale} getPose={getPose} onReady={(r) => { rendRef.current = r; r.temporal = true }}
            params={{ spin: s.spin, discOutRg: s.discOut, discTmaxK: s.tmax, disc: s.disc, jet: s.jet, horizonMarker: s.horizonMarker ? 1 : 0, exposure: s.exposure, look: s.look ? 1 : 0 }}
          />
        </Canvas>
      )}
      {!tex && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{err || 'Loading the sky panorama and disc texture…'}</div>}
      <div style={{ position: 'absolute', top: 10, left: 10, width: 330, maxHeight: 'calc(100% - 20px)', overflow: 'auto', background: 'rgba(8,12,20,.82)', border: '1px solid #243', borderRadius: 8, padding: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Black-hole lab <span style={{ color: '#f7b267', fontWeight: 600 }}>SIMULATION</span></div>
        <div style={{ opacity: 0.75, marginBottom: 6 }}>Kerr geodesic ray tracing, computed live. Not a photograph, not an EHT image.</div>
        <div style={{ margin: '6px 0' }}>
          {(Object.values(PRESETS) as BHPreset[]).map((p) => (
            <button key={p.id} onClick={() => setS((o) => ({ ...o, ...presetState(p) }))} style={{ marginRight: 6, padding: '3px 8px', background: s.preset === p.id ? '#2b5c8a' : '#1a2230', color: '#fff', border: '1px solid #345', borderRadius: 5, cursor: 'pointer' }}>{p.name}</button>
          ))}
        </div>
        {slider('Spin a*', 'spin', 0, 0.998, 0.002, (v) => v.toFixed(3))}
        {slider('Inclination (from spin axis)', 'incl', 0, 90, 0.5, (v) => v.toFixed(1) + '°')}
        {slider('Distance (r_g)', 'dist', 8, 3000, 1, (v) => v.toFixed(0) + ' r_g')}
        {slider('Mass (log10 M☉)', 'massLog', 0, 10.2, 0.01, (v) => fmt(Math.pow(10, v)) + ' M☉')}
        {slider('Disc peak temperature', 'tmax', 2000, 30000, 100, (v) => v + ' K')}
        {slider('Disc outer radius', 'discOut', 10, 80, 1, (v) => v + ' r_g')}
        {slider('Exposure', 'exposure', 0.3, 8, 0.05, (v) => v.toFixed(2))}
        {slider('Pattern speed', 'speed', 0, 200, 1, (v) => v + ' r_g/c per s')}
        <div style={{ margin: '6px 0' }}>{chk('Disc', 'disc')}{chk('Jet', 'jet')}{chk('Horizon grid', 'horizonMarker')}{chk('EHT-style orange', 'look')}</div>
        <div style={{ margin: '6px 0' }}>{chk('Temporal upsampling', 'temporal')}{chk('Auto zoom', 'autoZoom')}</div>
        {!s.autoZoom && slider('Field of view', 'fov', 0.2, 120, 0.1, (v) => v.toFixed(1) + '°')}
        <div style={{ margin: '6px 0' }}>Quality:{' '}
          {(['high', 'medium', 'low'] as BHTier[]).map((t) => (<button key={t} onClick={() => upd({ tier: t, scale: 0 })} style={{ marginLeft: 4, padding: '2px 8px', background: s.tier === t && !s.scale ? '#2b5c8a' : '#1a2230', color: '#fff', border: '1px solid #345', borderRadius: 5, cursor: 'pointer' }}>{t}</button>))}
          <label style={{ marginLeft: 8 }}>res.<select value={s.scale} onChange={(e) => upd({ scale: parseFloat(e.target.value) })} style={{ marginLeft: 4 }}><option value={0}>tier</option><option value={0.25}>0.25</option><option value={0.5}>0.5</option><option value={1}>1.0</option></select></label>
        </div>
        <div style={{ fontVariantNumeric: 'tabular-nums', background: '#0b111b', padding: 8, borderRadius: 6, margin: '8px 0' }}>
          r_g = GM/c² = {(rg / 1000).toExponential(3)} km<br />
          horizon r₊ = {rh.toFixed(3)} r_g | ISCO = {rIsco.toFixed(3)} r_g | photon orbit = {photonOrbit(s.spin).toFixed(3)} r_g<br />
          shadow (a=0) = {(2 * 3 * Math.sqrt(3)).toFixed(2)} r_g across{shadowReal ? <> | from Earth: <b>{shadowReal.toFixed(1)} µas</b> (Schwarzschild; EHT ring: {real!.id === 'm87' ? '42 ± 3' : real!.id === 'sgra' ? '51.8 ± 2.3' : 'n/a'} µas)</> : null}<br />
          {stats}
        </div>
        {real ? <div style={{ opacity: 0.9 }}>{REAL_TEXT[real.id]}<div style={{ opacity: 0.65, marginTop: 4 }}>Source: {real.source}</div></div> : null}
        <div style={{ opacity: 0.65, marginTop: 8 }}>
          Colours: the disc is drawn as a thin Novikov&ndash;Thorne disc; its brightness includes Doppler beaming and gravitational redshift. With \u201cEHT-style orange\u201d on (M87* and Sgr A* presets) the brightness is shown in a red-to-amber false-colour ramp like the EHT releases (a display choice, not true colour); with it off the colour is an illustrative black-body mapping; real M87*/Sgr A* radiation is radio synchrotron. The jet is schematic. Distance here is in r_g (the real EHT views are ~10¹¹ r_g away, far outside the slider). Not modelled: polarisation, turbulence physics (MHD), thick discs, disc self-lighting. See docs/BLACKHOLE.md.
        </div>
      </div>
    </div>
  )
}
