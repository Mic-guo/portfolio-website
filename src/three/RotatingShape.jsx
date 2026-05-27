import { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export default function RotatingShape() {
  const groupRef = useRef()
  const scrollProgressRef = useRef(0)
  const smoothProgressRef = useRef(0)

  useEffect(() => {
    const onScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      scrollProgressRef.current = maxScroll > 0 ? window.scrollY / maxScroll : 0
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const geo = useMemo(() => new THREE.IcosahedronGeometry(2.4, 1), [])
  const edgesGeo = useMemo(() => new THREE.EdgesGeometry(geo), [geo])

  useFrame((state, delta) => {
    if (!groupRef.current) return

    // Smooth lerp toward scroll progress
    smoothProgressRef.current += (scrollProgressRef.current - smoothProgressRef.current) * 0.04

    const t = smoothProgressRef.current

    // Idle auto-spin + scroll-driven rotation
    groupRef.current.rotation.y = state.clock.elapsedTime * 0.12 + t * Math.PI * 4
    groupRef.current.rotation.x = t * Math.PI * 0.35
    groupRef.current.rotation.z = state.clock.elapsedTime * 0.03
  })

  return (
    <group ref={groupRef}>
      {/* Solid core */}
      <mesh geometry={geo}>
        <meshPhysicalMaterial
          color="#0c1525"
          metalness={0.5}
          roughness={0.4}
          reflectivity={0.6}
        />
      </mesh>

      {/* Edge wireframe overlay */}
      <lineSegments geometry={edgesGeo}>
        <lineBasicMaterial color="#3b82f6" transparent opacity={0.7} />
      </lineSegments>
    </group>
  )
}
