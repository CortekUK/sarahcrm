'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

// Floating bronze particles for hero atmosphere. Canvas-driven so we
// can run 40+ particles without DOM thrash. Inspired by Aceternity's
// SparklesCore but hand-written to stay native (no extra deps) and to
// use the bronze palette out of the box.
//
// Density tip: 35–50 for hero, 12–20 for accent moments behind text.

interface SparklesProps {
  /** Particle count. Default 40. */
  count?: number
  /** Min/max particle radius in CSS px. Default 0.5–1.8. */
  minSize?: number
  maxSize?: number
  /** Particle drift speed multiplier. 1 = slow drift. */
  speed?: number
  /** CSS colour for the particles. Default bronze-light. */
  color?: string
  className?: string
}

interface Particle {
  x: number
  y: number
  r: number
  vx: number
  vy: number
  twinkleSpeed: number
  twinkleOffset: number
}

export function Sparkles({
  count = 40,
  minSize = 0.5,
  maxSize = 1.8,
  speed = 1,
  color = '#C09870',
  className,
}: SparklesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0
    let h = 0

    function resize() {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      w = rect.width
      h = rect.height
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx?.scale(dpr, dpr)
    }

    function seed() {
      particlesRef.current = Array.from({ length: count }).map(() => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: minSize + Math.random() * (maxSize - minSize),
        vx: (Math.random() - 0.5) * 0.12 * speed,
        vy: (Math.random() - 0.5) * 0.12 * speed,
        twinkleSpeed: 0.4 + Math.random() * 1.2,
        twinkleOffset: Math.random() * Math.PI * 2,
      }))
    }

    resize()
    seed()
    const onResize = () => {
      resize()
      seed()
    }
    window.addEventListener('resize', onResize)

    const start = performance.now()
    let lastFrame = 0
    const targetFps = 30
    const frameInterval = 1000 / targetFps

    function draw(now: number) {
      // Cap to ~30fps — sparkles don't need 60fps, saves battery
      if (now - lastFrame < frameInterval) {
        rafRef.current = requestAnimationFrame(draw)
        return
      }
      lastFrame = now
      if (!ctx) return
      ctx.clearRect(0, 0, w, h)
      const t = (now - start) / 1000
      for (const p of particlesRef.current) {
        p.x += p.vx
        p.y += p.vy
        // Wrap horizontally + vertically so the field is seamless
        if (p.x < -2) p.x = w + 2
        if (p.x > w + 2) p.x = -2
        if (p.y < -2) p.y = h + 2
        if (p.y > h + 2) p.y = -2
        // Twinkle alpha — 0.2–1.0 sinusoidal
        const a = 0.2 + 0.8 * (Math.sin(t * p.twinkleSpeed + p.twinkleOffset) * 0.5 + 0.5)
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.globalAlpha = a
        ctx.fill()
      }
      ctx.globalAlpha = 1
      rafRef.current = requestAnimationFrame(draw)
    }

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      rafRef.current = requestAnimationFrame(draw)
    } else {
      // Reduced motion — draw once and stop
      if (!ctx) return
      ctx.clearRect(0, 0, w, h)
      for (const p of particlesRef.current) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.globalAlpha = 0.5
        ctx.fill()
      }
    }

    return () => {
      window.removeEventListener('resize', onResize)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [count, minSize, maxSize, speed, color])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn('absolute inset-0 w-full h-full pointer-events-none', className)}
    />
  )
}
