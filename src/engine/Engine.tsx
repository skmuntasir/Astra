import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { Scene } from './Scene'
import { useStore } from './store'

/** The ONE Canvas. Mounted once by <App/>, never unmounted. */
export function Engine({ extra }: { extra?: React.ReactNode }) {
  const dprCap = useStore((s) => s.settings.dprCap)
  const aa = useStore.getState().settings.antialias
  return (
    <div className="fixed inset-0 engine-fixed" style={{ background: '#02030a' }} aria-hidden="true">
      <Canvas
        dpr={[1, dprCap]}
        frameloop="always"
        camera={{ fov: 35, near: 0.01, far: 1e11, position: [0, 0, 10] }}
        gl={{ antialias: aa, logarithmicDepthBuffer: true, powerPreference: 'high-performance', alpha: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NoToneMapping
          gl.outputColorSpace = THREE.SRGBColorSpace
          ;(window as unknown as { __gl: THREE.WebGLRenderer }).__gl = gl
        }}
      >
        <Scene extra={extra} />
      </Canvas>
    </div>
  )
}
