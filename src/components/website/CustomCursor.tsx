'use client'

import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'

export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const isDesktop = window.matchMedia('(pointer: fine)').matches
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!isDesktop || prefersReducedMotion) return

    const dot = dotRef.current
    if (!dot) return

    document.documentElement.classList.add('custom-cursor-active')

    const onMouseMove = (e: MouseEvent) => {
      gsap.set(dot, { x: e.clientX - 4, y: e.clientY - 4 })
    }

    const onEnterInteractive = () => {
      gsap.to(dot, { scale: 2.5, opacity: 0.6, duration: 0.2, ease: 'power2.out' })
    }

    const onLeaveInteractive = () => {
      gsap.to(dot, { scale: 1, opacity: 1, duration: 0.2, ease: 'power2.out' })
    }

    const addListeners = () => {
      const interactives = document.querySelectorAll('a, button, [role="button"], input, textarea, select, label[for]')
      interactives.forEach((el) => {
        el.addEventListener('mouseenter', onEnterInteractive)
        el.addEventListener('mouseleave', onLeaveInteractive)
      })
      return interactives
    }

    window.addEventListener('mousemove', onMouseMove)
    let interactives = addListeners()

    const observer = new MutationObserver(() => {
      interactives.forEach((el) => {
        el.removeEventListener('mouseenter', onEnterInteractive)
        el.removeEventListener('mouseleave', onLeaveInteractive)
      })
      interactives = addListeners()
    })
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      document.documentElement.classList.remove('custom-cursor-active')
      interactives.forEach((el) => {
        el.removeEventListener('mouseenter', onEnterInteractive)
        el.removeEventListener('mouseleave', onLeaveInteractive)
      })
      observer.disconnect()
    }
  }, [])

  return (
    <div
      ref={dotRef}
      className="fixed top-0 left-0 w-[8px] h-[8px] rounded-full pointer-events-none z-[10000] hidden md:block"
      style={{ backgroundColor: '#B8975A', mixBlendMode: 'difference' }}
    />
  )
}
