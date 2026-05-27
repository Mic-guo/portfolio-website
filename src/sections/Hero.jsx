import { useState, useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import SocialLinks from '../components/SocialLinks'

const TITLES = ['Software Engineer', 'Web Developer', 'Photographer']

function useTypingEffect() {
  const [displayText, setDisplayText] = useState('')
  const [titleIndex, setTitleIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    const current = TITLES[titleIndex]

    if (!isDeleting && displayText === current) {
      const t = setTimeout(() => setIsDeleting(true), 2200)
      return () => clearTimeout(t)
    }
    if (isDeleting && displayText === '') {
      setIsDeleting(false)
      setTitleIndex((i) => (i + 1) % TITLES.length)
      return
    }

    const delay = isDeleting ? 45 : 75
    const t = setTimeout(() => {
      setDisplayText(
        isDeleting
          ? current.slice(0, displayText.length - 1)
          : current.slice(0, displayText.length + 1)
      )
    }, delay)
    return () => clearTimeout(t)
  }, [displayText, isDeleting, titleIndex])

  return displayText
}

export default function Hero() {
  const containerRef = useRef()
  const displayText = useTypingEffect()

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.hero-item', {
        y: 24,
        opacity: 0,
        duration: 0.9,
        stagger: 0.15,
        ease: 'power3.out',
        delay: 0.2,
      })
    }, containerRef)
    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={containerRef}
      className="relative flex flex-col justify-center items-center h-screen text-center px-6"
    >
      <p className="hero-item text-xs tracking-[0.3em] text-blue-500 uppercase mb-6 font-medium">
        Portfolio
      </p>

      <h1 className="hero-item c-text text-7xl md:text-8xl font-bold leading-none mb-4">
        Michael Guo
      </h1>

      <div className="hero-item flex items-center justify-center h-12 mb-8">
        <span className="c-muted text-2xl md:text-3xl font-light">
          {displayText}
        </span>
        <span className="typing-cursor ml-1" />
      </div>

      <p className="hero-item c-muted text-base max-w-sm mb-10 leading-relaxed">
        Building things at the intersection of code, design, and craft.
      </p>

      <div className="hero-item">
        <SocialLinks />
      </div>

      <div className="absolute bottom-10 left-1/2 scroll-indicator flex flex-col items-center gap-2">
        <span className="c-muted text-xs tracking-widest uppercase">Scroll</span>
        <svg width="16" height="24" viewBox="0 0 16 24" fill="none" className="c-muted">
          <path d="M8 4v16M2 14l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </section>
  )
}
