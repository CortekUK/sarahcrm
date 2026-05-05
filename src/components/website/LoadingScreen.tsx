'use client'

import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

export function LoadingScreen() {
  const [show, setShow] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)
  const logoRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    // Only show once per session
    if (sessionStorage.getItem('club-loaded')) return

    // Respect reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) {
      sessionStorage.setItem('club-loaded', '1')
      return
    }

    setShow(true)
    // Prevent scroll during loading
    document.body.style.overflow = 'hidden'

    const tl = gsap.timeline({
      onComplete: () => {
        setShow(false)
        document.body.style.overflow = ''
        sessionStorage.setItem('club-loaded', '1')
      },
    })

    tl.fromTo(logoRef.current, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'power2.out' })
      .to(logoRef.current, { duration: 0.2 }) // hold
      .to(overlayRef.current, { y: '-100%', duration: 0.6, ease: 'power4.inOut' })
  }, [])

  if (!show) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-[#1A1714]"
      style={{ willChange: 'transform' }}
    >
      {/* Diamond logo */}
      <svg
        ref={logoRef}
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        style={{ opacity: 0 }}
      >
        <path
          d="M24 2L46 24L24 46L2 24L24 2Z"
          stroke="#B8975A"
          strokeWidth="1.5"
          fill="none"
        />
        <path
          d="M24 10L38 24L24 38L10 24L24 10Z"
          stroke="#B8975A"
          strokeWidth="1"
          opacity="0.4"
          fill="none"
        />
      </svg>
    </div>
  )
}
