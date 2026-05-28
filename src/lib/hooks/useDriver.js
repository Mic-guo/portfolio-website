import { useRef } from 'react'
import { scrollDriver } from '../drivers/scrollDriver'

// Normalizes any driver input to a stable MutableRefObject<number> (0..1).
//   'scroll'              → shared window scroll singleton
//   MutableRefObject      → passed through as-is
//   number                → wrapped in a stable ref (static value)
//   undefined / null      → zero ref (no animation)
export function useDriver(driver) {
  const fallbackRef = useRef(typeof driver === 'number' ? driver : 0)

  if (driver === 'scroll') return scrollDriver()
  if (driver && typeof driver === 'object' && 'current' in driver) return driver
  if (typeof driver === 'number') {
    fallbackRef.current = driver
    return fallbackRef
  }
  return fallbackRef
}
