'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

// Thin gold loading bar pinned to the top of the viewport — the global
// "something is happening" signal. Triggered automatically on every route
// change and exposed via useProgress() for manual control (saves, deletes,
// long-running async actions).
//
// Usage:
//   const { start, done, track } = useProgress()
//   await track(myAsyncFunction())   // start + done bracketed around the promise
//   // or manually:
//   start()
//   await something()
//   done()
//
// Concurrent calls are reference-counted, so two parallel `start()`s need
// two `done()`s before the bar disappears.

interface ProgressApi {
  /** Begin showing the bar. Reference-counted with done(). */
  start: () => void
  /** Decrement the in-flight counter; bar hides at zero. */
  done: () => void
  /** Convenience: wraps a promise in start/done. Returns the resolved value. */
  track: <T>(promise: Promise<T>) => Promise<T>
}

const ProgressContext = createContext<ProgressApi | null>(null)

export function useProgress(): ProgressApi {
  const ctx = useContext(ProgressContext)
  if (!ctx) {
    throw new Error('useProgress must be used inside <ProgressProvider>')
  }
  return ctx
}

const TRICKLE_INTERVAL_MS = 220
const TRICKLE_MAX = 88
const DONE_FADE_MS = 240
const ROUTE_CHANGE_MIN_MS = 320

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const inFlight = useRef(0)
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopTrickle = useCallback(() => {
    if (trickleRef.current) {
      clearInterval(trickleRef.current)
      trickleRef.current = null
    }
  }, [])

  const startTrickle = useCallback(() => {
    stopTrickle()
    trickleRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= TRICKLE_MAX) return p
        // Diminishing increments so it eases as it nears the ceiling.
        const remaining = TRICKLE_MAX - p
        const step = Math.max(1.2, remaining * 0.15)
        return Math.min(TRICKLE_MAX, p + step)
      })
    }, TRICKLE_INTERVAL_MS)
  }, [stopTrickle])

  const start = useCallback(() => {
    if (fadeRef.current) {
      clearTimeout(fadeRef.current)
      fadeRef.current = null
    }
    inFlight.current += 1
    setVisible(true)
    setProgress((p) => (p === 0 ? 14 : p))
    startTrickle()
  }, [startTrickle])

  const done = useCallback(() => {
    inFlight.current = Math.max(0, inFlight.current - 1)
    if (inFlight.current > 0) return
    stopTrickle()
    setProgress(100)
    fadeRef.current = setTimeout(() => {
      setVisible(false)
      setProgress(0)
    }, DONE_FADE_MS)
  }, [stopTrickle])

  const track = useCallback(
    async <T,>(promise: Promise<T>): Promise<T> => {
      start()
      try {
        return await promise
      } finally {
        done()
      }
    },
    [start, done],
  )

  const api = useMemo<ProgressApi>(() => ({ start, done, track }), [start, done, track])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTrickle()
      if (fadeRef.current) clearTimeout(fadeRef.current)
    }
  }, [stopTrickle])

  return (
    <ProgressContext.Provider value={api}>
      <RouteChangeAutoTrigger start={start} done={done} />
      {children}
      <Bar visible={visible} progress={progress} />
    </ProgressContext.Provider>
  )
}

// Fires start/done around every pathname or searchParams change so admins
// see the bar move whenever they navigate between pages — even without
// the destination page calling useProgress() manually.
function RouteChangeAutoTrigger({ start, done }: { start: () => void; done: () => void }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const firstRun = useRef(true)

  useEffect(() => {
    // Skip the initial mount — we don't want a stray flash when the
    // provider first hydrates.
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    start()
    // Hold the bar for at least a few hundred ms even on instant
    // navigations so it's perceptible.
    const t = setTimeout(done, ROUTE_CHANGE_MIN_MS)
    return () => {
      clearTimeout(t)
      done()
    }
  }, [pathname, searchParams, start, done])

  return null
}

function Bar({ visible, progress }: { visible: boolean; progress: number }) {
  return (
    <div
      className="fixed top-0 left-0 right-0 z-[300] h-[2.5px] pointer-events-none"
      style={{
        opacity: visible ? 1 : 0,
        transition: visible
          ? 'opacity 0.1s ease-out'
          : `opacity ${DONE_FADE_MS}ms ease-out`,
      }}
      aria-hidden={!visible}
    >
      <div
        className="h-full bg-gradient-to-r from-[var(--color-gold)] via-[var(--color-gold-light)] to-[var(--color-gold)]"
        style={{
          width: `${progress}%`,
          transition:
            'width 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow:
            '0 0 10px rgba(184, 151, 90, 0.55), 0 0 4px rgba(184, 151, 90, 0.85)',
        }}
      />
    </div>
  )
}
