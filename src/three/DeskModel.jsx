import { useGLTF } from '@react-three/drei'
import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

useGLTF.preload('/desk.glb')

// Desk sweep radius in world units (fixed regardless of camera position).
// The camera distance controls how large it appears on screen — moving the
// camera back makes the desk look smaller without touching this value.
const TARGET_SWEEP_RADIUS = 3.5

export default function DeskModel({ scrollRef }) {
  const { scene } = useGLTF('/desk.glb')
  const groupRef  = useRef()
  const smoothRef = useRef(0)

  const [centerOffset, scaleFactor] = useMemo(() => {
    scene.updateMatrixWorld(true)

    const box    = new THREE.Box3().setFromObject(scene)
    const center = box.getCenter(new THREE.Vector3())
    const size   = box.getSize(new THREE.Vector3())

    // Radius of the circle swept by the farthest corner during Y rotation
    const sweepRadius = Math.sqrt(size.x ** 2 + size.z ** 2) / 2
    const scale = TARGET_SWEEP_RADIUS / sweepRadius

    return [[-center.x, -center.y, -center.z], scale]
  }, [scene])

  useEffect(() => {
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow    = true
        obj.receiveShadow = true
      }
    })
  }, [scene])

  useFrame(() => {
    if (!groupRef.current) return
    smoothRef.current += (scrollRef.current - smoothRef.current) * 0.04
    groupRef.current.rotation.y = smoothRef.current * Math.PI * 2
  })

  return (
    <group ref={groupRef}>
      <group scale={scaleFactor}>
        <group position={centerOffset}>
          <primitive object={scene} />
        </group>
      </group>
    </group>
  )
}
