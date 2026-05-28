// Zero React / R3F imports — works at module scope or in tests.
// Returns a singleton { current: 0..1 } ref that tracks window scroll progress.

let _ref = null

export function scrollDriver() {
  if (_ref) return _ref
  _ref = { current: 0 }

  if (typeof window === 'undefined') return _ref

  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    _ref.current = max > 0 ? Math.min(window.scrollY / max, 1) : 0
  }

  window.addEventListener('scroll', update, { passive: true })
  return _ref
}
