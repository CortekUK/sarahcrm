'use client'

// ─────────────────────────────────────────────────────────────────────
// AI Website Concierge — the floating luxury chat widget on the PUBLIC
// site. A discreet launcher pinned bottom-LEFT (JoinBadge owns the right
// edge, so they never collide). Opening it reveals an ink/ivory/bronze
// chat panel that talks to /api/concierge/chat, gently qualifies the
// visitor and — once it has name + email + goal — hands them to the team
// (an enquiry is created server-side).
//
// Abuse protection lives on the server; the widget contributes the
// honeypot field, a stable per-visit session token (localStorage), and a
// calm degraded UX on 429 / errors.
//
// Styling mirrors the ui/chat primitives (MessageScroller / Message /
// Bubble) but RESTYLED to the night palette — those originals are
// gold/admin-tinted, so we inline slim equivalents here rather than
// importing them.
// ─────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { MessageCircle, X, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'

// Hide on the same flows JoinBadge hides on, plus the authenticated app.
const HIDDEN_ON: string[] = [
  '/membership-application',
  '/login',
  '/portal',
  '/dashboard',
]

const SESSION_KEY = 'club_concierge_session'
const GREETING =
  'Good evening — welcome to The Club by Sarah Restrick. I look after enquiries here. May I ask what draws you to us this evening?'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

function getSessionToken(): string {
  try {
    const existing = localStorage.getItem(SESSION_KEY)
    if (existing) return existing
    const token = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, token)
    return token
  } catch {
    // localStorage blocked (private mode) — ephemeral token for this mount.
    return crypto.randomUUID()
  }
}

export function ConciergeWidget() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: GREETING },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [honeypot, setHoneypot] = useState('')

  const sessionRef = useRef<string>('')
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    sessionRef.current = getSessionToken()
  }, [])

  // Keep the latest message in view.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending])

  // Focus the input when the panel opens.
  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 60)
      return () => window.clearTimeout(t)
    }
  }, [open])

  // Close on Escape.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || sending || done) return

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setSending(true)

    try {
      const res = await fetch('/api/concierge/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: sessionRef.current || getSessionToken(),
          message: text.slice(0, 1000),
          company_url: honeypot,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        reply?: string
        qualified?: boolean
        done?: boolean
      }
      const reply =
        json.reply ||
        "I'm just catching my breath — do try our enquiry form and the team will be in touch."
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
      if (json.done || json.qualified) setDone(true)
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            "I'm just catching my breath — do try our enquiry form and the team will be in touch.",
        },
      ])
    } finally {
      setSending(false)
      window.setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [input, sending, done, honeypot])

  if (HIDDEN_ON.some((p) => pathname === p || pathname?.startsWith(p + '/'))) {
    return null
  }

  return (
    <>
      {/* ── Launcher — bottom-LEFT (JoinBadge owns the right edge) ─── */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open the Club concierge chat"
          className="always-night group fixed bottom-5 left-5 z-40 flex items-center gap-3 rounded-full border border-bronze/45 bg-graphite/85 backdrop-blur-md pl-4 pr-5 py-3 shadow-[var(--shadow-lg)] transition-[background-color,border-color] duration-500 hover:bg-graphite hover:border-bronze/70 motion-safe:hover:-translate-y-0.5 motion-safe:transition-transform"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bronze/15 border border-bronze/40">
            <MessageCircle size={16} strokeWidth={1.5} className="text-bronze-light" />
          </span>
          <span className="font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.28em] text-ivory-soft group-hover:text-ivory transition-colors duration-500">
            Concierge
          </span>
        </button>
      )}

      {/* ── Chat panel ────────────────────────────────────────────── */}
      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="The Club concierge"
          className="always-night fixed z-40 flex flex-col bg-ink border border-bronze/30 shadow-[var(--shadow-lg)] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300
            inset-0 sm:inset-auto sm:bottom-5 sm:left-5 sm:h-[560px] sm:max-h-[calc(100vh-2.5rem)] sm:w-[380px] sm:rounded-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-graphite-line/70 bg-graphite/40">
            <div>
              <p className="font-[family-name:var(--font-meta)] text-[9px] uppercase tracking-[0.4em] text-bronze-light">
                The Club
              </p>
              <p className="font-[family-name:var(--font-display)] text-[16px] text-ivory mt-0.5">
                Concierge
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close concierge chat"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-graphite-line/70 text-ivory-soft hover:text-ivory hover:border-bronze/50 transition-colors duration-300"
            >
              <X size={15} strokeWidth={1.5} />
            </button>
          </div>

          {/* Messages — data-lenis-prevent stops the site-wide Lenis smooth-scroll
              from hijacking wheel/touch events so this panel scrolls on its own. */}
          <div
            ref={scrollRef}
            data-lenis-prevent
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-5"
          >
            <div className="flex flex-col gap-2.5">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn('flex w-full', m.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words',
                      'font-[family-name:var(--font-sans)]',
                      m.role === 'user'
                        ? 'bg-bronze/15 text-ivory border border-bronze/30 rounded-br-sm'
                        : 'bg-graphite/60 text-ivory-soft border border-graphite-line/70 rounded-bl-sm',
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex w-full justify-start">
                  <div className="rounded-2xl rounded-bl-sm bg-graphite/60 border border-graphite-line/70 px-4 py-3">
                    <span className="flex gap-1" aria-label="Concierge is typing">
                      <Dot /> <Dot delay="0.15s" /> <Dot delay="0.3s" />
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Composer */}
          <div className="border-t border-graphite-line/70 bg-graphite/30 px-3 py-3">
            {done ? (
              <p className="px-2 py-2 text-center font-[family-name:var(--font-editorial)] italic text-[13.5px] text-ivory-soft leading-relaxed">
                I&apos;ve passed this to the team — they&apos;ll be in touch personally.
              </p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void send()
                }}
                className="flex items-end gap-2"
              >
                {/* Honeypot — visually hidden; real users never fill it. */}
                <input
                  type="text"
                  name="company_url"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="absolute h-0 w-0 opacity-0 pointer-events-none"
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  maxLength={1000}
                  disabled={sending}
                  placeholder="Type your message…"
                  aria-label="Message the concierge"
                  className="flex-1 rounded-full bg-ink border border-graphite-line/80 px-4 py-2.5 text-[13.5px] text-ivory placeholder:text-slate-dim focus:border-bronze focus:outline-none transition-colors disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  aria-label="Send message"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bronze text-ink transition-opacity duration-300 disabled:opacity-40 hover:bg-bronze-light"
                >
                  <ArrowUp size={17} strokeWidth={2} />
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function Dot({ delay = '0s' }: { delay?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full bg-bronze-light/70 motion-safe:animate-bounce"
      style={{ animationDelay: delay, animationDuration: '1s' }}
    />
  )
}
