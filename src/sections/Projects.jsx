import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { FaGithub, FaExternalLinkAlt } from 'react-icons/fa'

gsap.registerPlugin(ScrollTrigger)

const projects = [
  {
    title: 'Portfolio Website',
    description: 'A 3D interactive portfolio built with React Three Fiber. Scroll-driven desk rotation, GSAP animations, and a dark→light theme transition.',
    tags: ['React', 'Three.js', 'GSAP', 'Tailwind'],
    github: 'https://github.com/Mic-Guo',
    live: null,
  },
  {
    title: 'OrangeSlice AI',
    description: "AI-powered productivity tooling. Placeholder — describe what you're building here.",
    tags: ['AI', 'TypeScript', 'Next.js'],
    github: 'https://github.com/Mic-Guo',
    live: null,
  },
  {
    title: 'Project Three',
    description: 'Placeholder — add a real project. Include what problem it solves and the interesting technical challenge.',
    tags: ['Python', 'TensorFlow'],
    github: 'https://github.com/Mic-Guo',
    live: null,
  },
]

function ProjectCard({ project }) {
  return (
    <div className="project-card border border-white/5 rounded-2xl p-6 flex flex-col gap-4 bg-white/[0.02]">
      <div className="flex items-start justify-between gap-4">
        <h3 className="c-text text-lg font-bold">{project.title}</h3>
        <div className="flex gap-3 flex-shrink-0">
          {project.github && (
            <a href={project.github} target="_blank" rel="noopener noreferrer"
               className="c-muted hover:text-blue-400 transition-colors">
              <FaGithub size={16} />
            </a>
          )}
          {project.live && (
            <a href={project.live} target="_blank" rel="noopener noreferrer"
               className="c-muted hover:text-blue-400 transition-colors">
              <FaExternalLinkAlt size={14} />
            </a>
          )}
        </div>
      </div>
      <p className="c-muted text-sm leading-relaxed flex-1">{project.description}</p>
      <div className="flex flex-wrap gap-2">
        {project.tags.map((tag) => (
          <span key={tag} className="c-muted text-xs px-2 py-1 rounded border border-white/5">{tag}</span>
        ))}
      </div>
    </div>
  )
}

export default function Projects() {
  const sectionRef = useRef()

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.utils.toArray('.proj-item').forEach((el, i) => {
        gsap.from(el, {
          scrollTrigger: { trigger: el, start: 'top 85%' },
          y: 32,
          opacity: 0,
          duration: 0.7,
          delay: i * 0.08,
          ease: 'power3.out',
        })
      })
    }, sectionRef)
    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} className="relative py-32 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-16">
          <p className="text-xs tracking-[0.3em] text-blue-500 uppercase font-medium mb-3">Projects</p>
          <h2 className="c-text text-5xl font-bold">What I've built.</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((project, i) => (
            <div key={project.title} className="proj-item">
              <ProjectCard project={project} />
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto mt-24 pt-8 border-t border-white/5 flex items-center justify-between">
        <p className="c-muted text-xs tracking-wide">© 2026 Michael Guo</p>
        <p className="c-muted text-xs">Built with React & Three.js</p>
      </div>
    </section>
  )
}
