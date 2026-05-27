import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import DeskModel from './DeskModel'
import SceneLights from './SceneLights'

export default function BackgroundScene({ scrollRef }) {
  return (
    <Canvas
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
      }}
      gl={{ alpha: true, antialias: true }}
      shadows
      camera={{ position: [4, 7, 9], fov: 50 }}
    >
      <SceneLights scrollRef={scrollRef} />
      <Suspense fallback={null}>
        <DeskModel scrollRef={scrollRef} />
      </Suspense>
    </Canvas>
  )
}
