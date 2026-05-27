import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const entries = [
  {
    period: '2024 – Present',
    role: 'Founder',
    org: 'OrangeSlice AI',
    description: 'Building AI-powered tools. Leading product, engineering, and design from zero to launch.',
    tags: ['AI', 'TypeScript', 'React'],
  },
  {
    period: '2022 – Present',
    role: 'B.S. Computer Science',
    org: 'University of Michigan',
    description: 'Studying CS with a focus on systems, algorithms, and human-computer interaction.',
    tags: ['Ann Arbor', "Dean's List"],
  },
  {
    period: '2023',
    role: 'Software Engineer Intern',
    org: 'Company Name',
    description: 'Placeholder — add your internship here. Focus on impact, not just tasks.',
    tags: ['React', 'Node.js', 'AWS'],
  },
]

export default function Experience() {
  const sectionRef = useRef()

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.utils.toArray('.exp-item').forEach((el) => {
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: 'top 82%' },
          y: 36,
          opacity: 0,
          duration: 0.75,
          ease: 'power3.out',
        })
      })
    }, sectionRef)
    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} className="relative py-32 px-6">
      <div className="max-w-4xl mx-auto mb-20">
        <p className="text-xs tracking-[0.3em] text-blue-500 uppercase font-medium mb-3">Experience</p>
        <h2 className="c-text text-5xl font-bold">Where I've been.</h2>
      </div>

      <div className="relative max-w-4xl mx-auto">
        <div className="timeline-line" />
        <div className="flex flex-col gap-16">
          {entries.map((entry, i) => {
            const isLeft = i % 2 === 0
            return (
              <div
                key={i}
                className={`exp-item relative flex items-start gap-8 ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}
              >
                <div className={`w-[calc(50%-2rem)] ${isLeft ? 'text-right pr-8' : 'text-left pl-8'}`}>
                  <p className="text-xs text-blue-500 tracking-widest uppercase mb-2 font-medium">
                    {entry.period}
                  </p>
                  <h3 className="c-text text-xl font-bold mb-1">{entry.role}</h3>
                  <p className="text-blue-400 text-sm font-medium mb-3">{entry.org}</p>
                  <p className="c-muted text-sm leading-relaxed mb-4">{entry.description}</p>
                  <div className={`flex flex-wrap gap-2 ${isLeft ? 'justify-end' : 'justify-start'}`}>
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-1 rounded border border-blue-900/60 text-blue-400 bg-blue-950/20"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Center dot */}
                <div className="absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-blue-500 border-2 border-blue-300 z-10 mt-1" />

                <div className="w-[calc(50%-2rem)]" />
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
