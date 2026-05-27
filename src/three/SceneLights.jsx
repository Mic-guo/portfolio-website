import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const NIGHT_AMBIENT = new THREE.Color('#0a0a1a')   // nearly black — spotlight must dominate
const MOON_COLOR    = new THREE.Color('#c8d8ff')   // cold blue-white moonlight
const DAY_AMBIENT   = new THREE.Color('#fff5e0')   // warm cream
const SUN_COLOR     = new THREE.Color('#FFD080')   // warm golden sunlight

export default function SceneLights({ scrollRef }) {
  const { scene: threeScene } = useThree()
  const ambientRef  = useRef()
  const moonRef     = useRef()
  const sunRef      = useRef()
  const smoothRef   = useRef(0)

  useEffect(() => {
    // SpotLight.target must be in the Three.js scene for the cone direction to work.
    // R3F does not add it automatically.
    const moon = moonRef.current
    const sun  = sunRef.current
    if (moon) {
      moon.target.position.set(0, 0, 0)   // aim at desk center
      threeScene.add(moon.target)
      moon.target.updateMatrixWorld()
    }
    if (sun) {
      sun.target.position.set(0, 0, 0)
      threeScene.add(sun.target)
      sun.target.updateMatrixWorld()
    }
    return () => {
      if (moon) threeScene.remove(moon.target)
      if (sun)  threeScene.remove(sun.target)
    }
  }, [threeScene])

  useFrame(() => {
    smoothRef.current += (scrollRef.current - smoothRef.current) * 0.03
    const t = smoothRef.current

    // Ambient: near-black at night (let spotlight do the work) → warm day
    if (ambientRef.current) {
      ambientRef.current.color.lerpColors(NIGHT_AMBIENT, DAY_AMBIENT, t)
      ambientRef.current.intensity = 0.08 + t * 1.2   // 0.08 → 1.28
    }

    // Moon spotlight: bright at night, fades out completely by day
    if (moonRef.current) {
      moonRef.current.intensity = 25 * (1 - t)         // 25 → 0
    }

    // Sun directional: absent at night, bright by day
    if (sunRef.current) {
      sunRef.current.intensity = 5 * t                  // 0 → 5
    }
  })

  return (
    <>
      {/* Ambient — nearly off at night so the spotlight cone is dramatic */}
      <ambientLight ref={ambientRef} intensity={0.08} color="#0a0a1a" />

      {/*
        Moon spotlight from upper-left-back, mimicking moonlight through a window.
        High intensity (25) against near-zero ambient = hard, theatrical pool of light.
        Wide enough cone to cover the full desk + chair across all rotation angles.
      */}
      <spotLight
        ref={moonRef}
        position={[-6, 14, -5]}
        angle={Math.PI / 5}
        penumbra={0.6}
        intensity={25}
        color="#c8d8ff"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.001}
      />

      {/*
        Sun — warm directional from upper-right, matching website2.0 DaytimeScene.
        Starts at zero so the moonlight transition is clean.
      */}
      <directionalLight
        ref={sunRef}
        position={[8, 14, 6]}
        intensity={0}
        color="#FFD080"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
    </>
  )
}
