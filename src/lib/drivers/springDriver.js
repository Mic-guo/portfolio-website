import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

// Wraps any driver ref with exponential smoothing.
// Returns a new ref whose value lags behind the source by the given smoothing factor.
export function useSpringDriver(sourceRef, smoothing = 0.05) {
  const smoothedRef = useRef(sourceRef?.current ?? 0)
  useFrame(() => {
    smoothedRef.current += (sourceRef.current - smoothedRef.current) * smoothing
  })
  return smoothedRef
}
