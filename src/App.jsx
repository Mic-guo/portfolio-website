import { useRef, useEffect } from 'react'
import BackgroundScene from './three/BackgroundScene'
import Hero from './sections/Hero'
import Experience from './sections/Experience'
import Projects from './sections/Projects'

export default function App() {
  const scrollProgressRef = useRef(0)

  useEffect(() => {
    const onScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight
      const t = maxScroll > 0 ? Math.min(window.scrollY / maxScroll, 1) : 0
      scrollProgressRef.current = t

      // Background: #080808 (dark) → #f5f0e8 (warm cream)
      const r = Math.round(8 + t * 237)
      const g = Math.round(8 + t * 232)
      const b = Math.round(8 + t * 224)
      document.body.style.backgroundColor = `rgb(${r},${g},${b})`

      // Primary text: #f0f0f0 → #1a1a1a
      const tv = Math.round(240 - t * 214)
      document.documentElement.style.setProperty('--c-text-color', `rgb(${tv},${tv},${tv})`)

      // Muted text: gray-500 → gray-600 (stays readable on both bgs)
      const mr = Math.round(107 - t * 32)
      const mg = Math.round(114 - t * 29)
      const mb = Math.round(128 - t * 29)
      document.documentElement.style.setProperty('--c-muted-color', `rgb(${mr},${mg},${mb})`)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <BackgroundScene scrollRef={scrollProgressRef} />
      <main style={{ position: 'relative', zIndex: 10 }}>
        <Hero />
        <Experience />
        <Projects />
      </main>
    </>
  )
}
