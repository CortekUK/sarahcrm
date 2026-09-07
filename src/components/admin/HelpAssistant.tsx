'use client'

// Floating Help Assistant for the admin dashboard.
//
// A launcher pinned bottom-RIGHT (the sidebar owns the left edge) that opens a
// chat panel backed by /api/admin/help/chat. The assistant answers "how do I…"
// questions about the platform from the curated knowledge base in
// docs/knowledge/, choosing which reference document to load per question.
//
// Mounted once in the admin layout, so the transcript survives navigation
// between dashboard pages. Styled with the admin theme tokens rather than the
// night palette the public ConciergeWidget forces, so it follows the day/night
// toggle like the rest of the dashboard.

import { useCallback, useEffect, useRef, useState, Fragment } from 'react'
import { LifeBuoy, ChevronDown, ArrowUp, RotateCcw, Archive } from 'lucide-react'
import { cn } from '@/lib/utils'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const GREETING =
  'Hello — I can help you use the platform. Ask me how to do something and I’ll walk you through it step by step.'

const STARTERS = [
  'How do I set up an introduction between two people?',
  'How do I approve a membership application?',
  'How do I create and publish an event?',
  'How do I send a marketing campaign?',
]

const MAX_INPUT_CHARS = 2000

// Soft threshold: warn before the server has to drop anything, so compacting is
// a choice rather than a recovery. The server replays at most 20 turns.
const LONG_CONVERSATION_MESSAGES = 16

// 'long'  — approaching the replay cap; earlier turns will start dropping.
// 'limit' — the model refused the prompt outright; compacting is required.
type Notice = 'none' | 'long' | 'limit'

// Minimal inline markdown: **bold** and `code`. The assistant is instructed to
// bold exact button labels, so rendering that is worth the few lines — but a
// full markdown parser would be overkill for what it emits.
function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={key} className="font-semibold text-[var(--color-gold)]">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={key}
          className="rounded bg-[var(--color-ivory)]/[0.07] px-1 py-0.5 text-[12px]"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    return <Fragment key={key}>{part}</Fragment>
  })
}

function MessageBody({ content }: { content: string }) {
  return (
    <>
      {content.split('\n').map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {renderInline(line, String(i))}
        </Fragment>
      ))}
    </>
  )
}

export function HelpAssistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: GREETING },
  ])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<Notice>('none')
  const [compacting, setCompacting] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Keep the latest message in view.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending])

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 60)
      return () => window.clearTimeout(t)
    }
  }, [open])

  // Escape closes; Cmd/Ctrl+/ toggles from anywhere in the dashboard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) {
        setOpen(false)
        return
      }
      if (e.key === '/' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim()
      if (!text || sending) return

      const next: ChatMessage[] = [...messages, { role: 'user', content: text }]
      setMessages(next)
      setInput('')
      setSending(true)

      try {
        const res = await fetch('/api/admin/help/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // The greeting is local scaffolding, not part of the conversation.
          body: JSON.stringify({ messages: next.slice(1) }),
        })
        const data = await res.json().catch(() => null)
        const reply =
          (data && typeof data.reply === 'string' && data.reply) ||
          (data && typeof data.error === 'string' && data.error) ||
          "Sorry — I couldn't reach the assistant just then. Please try again."
        setMessages((m) => [...m, { role: 'assistant', content: reply }])

        if (data?.limit === 'context') setNotice('limit')
        else if (data?.truncated) setNotice('long')
        else if (next.length + 1 >= LONG_CONVERSATION_MESSAGES) setNotice('long')
      } catch {
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content:
              "Sorry — I couldn't reach the assistant just then. Please check your connection and try again.",
          },
        ])
      } finally {
        setSending(false)
        inputRef.current?.focus()
      }
    },
    [input, messages, sending],
  )

  function reset() {
    setMessages([{ role: 'assistant', content: GREETING }])
    setInput('')
    setNotice('none')
    inputRef.current?.focus()
  }

  // Swaps the transcript for a short recap so a long session can carry on.
  // Failure is non-destructive — the original conversation is left intact.
  const compact = useCallback(async () => {
    if (compacting || messages.length < 2) return
    setCompacting(true)
    try {
      const res = await fetch('/api/admin/help/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'compact', messages: messages.slice(1) }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || typeof data?.summary !== 'string') {
        throw new Error('compaction failed')
      }
      setMessages([
        { role: 'assistant', content: GREETING },
        {
          role: 'assistant',
          content: `**Recap so far**\n\n${data.summary}`,
        },
      ])
      setNotice('none')
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content:
            "Sorry — I couldn't summarise the conversation. You can carry on, or start over with the ↺ button.",
        },
      ])
    } finally {
      setCompacting(false)
      inputRef.current?.focus()
    }
  }, [compacting, messages])

  const showStarters = messages.length === 1 && !sending

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open the help assistant"
          title="Help (⌘/)"
          className="group fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full border border-[var(--color-bronze)]/45 bg-[var(--color-graphite)]/90 backdrop-blur-md pl-3.5 pr-4 py-2.5 shadow-[var(--shadow-lg)] transition-colors hover:border-[var(--color-bronze)]/70 hover:bg-[var(--color-graphite)]"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-bronze)]/40 bg-[var(--color-bronze)]/15">
            <LifeBuoy size={15} strokeWidth={1.6} className="text-[var(--color-gold)]" />
          </span>
          <span className="font-[family-name:var(--font-label)] text-[10px] font-medium uppercase tracking-[0.24em] text-[var(--color-ivory-soft)] group-hover:text-[var(--color-ivory)] transition-colors">
            Help
          </span>
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Help assistant"
          className="fixed z-40 flex flex-col overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg)] shadow-[var(--shadow-lg)]
            inset-0 sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[600px] sm:max-h-[calc(100vh-2.5rem)] sm:w-[420px] sm:rounded-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border)]/70 bg-[var(--color-graphite)]/40 px-5 py-3.5">
            <div className="min-w-0">
              <p className="font-[family-name:var(--font-label)] text-[8.5px] font-medium uppercase tracking-[0.28em] text-[var(--color-bronze-light)]">
                The Club
              </p>
              <p className="mt-0.5 font-[family-name:var(--font-display)] text-[16px] leading-none text-[var(--color-ivory)]">
                Help Assistant
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={reset}
                aria-label="Start a new conversation"
                title="Start a new conversation — clears this one"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)]/70 text-[var(--color-ivory-soft)] transition-colors hover:border-[var(--color-bronze)]/50 hover:text-[var(--color-ivory)]"
              >
                <RotateCcw size={14} strokeWidth={1.6} />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Minimise the help assistant"
                title="Minimise — your conversation is kept"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--color-border)]/70 text-[var(--color-ivory-soft)] transition-colors hover:border-[var(--color-bronze)]/50 hover:text-[var(--color-ivory)]"
              >
                <ChevronDown size={17} strokeWidth={1.8} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-5"
          >
            <div className="flex flex-col gap-2.5">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex w-full',
                    m.role === 'user' ? 'justify-end' : 'justify-start',
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[86%] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed break-words',
                      'font-[family-name:var(--font-body)]',
                      m.role === 'user'
                        ? 'rounded-br-sm border border-[var(--color-bronze)]/30 bg-[var(--color-bronze)]/15 text-[var(--color-ivory)]'
                        : 'rounded-bl-sm border border-[var(--color-border)]/70 bg-[var(--color-graphite)]/50 text-[var(--color-ivory-soft)]',
                    )}
                  >
                    <MessageBody content={m.content} />
                  </div>
                </div>
              ))}

              {sending && (
                <div className="flex w-full justify-start">
                  <div className="rounded-2xl rounded-bl-sm border border-[var(--color-border)]/70 bg-[var(--color-graphite)]/50 px-4 py-3">
                    <span className="flex gap-1" aria-label="Thinking">
                      <Dot />
                      <Dot delay="0.15s" />
                      <Dot delay="0.3s" />
                    </span>
                  </div>
                </div>
              )}

              {showStarters && (
                <div className="mt-2 flex flex-col gap-1.5">
                  <p className="px-1 font-[family-name:var(--font-label)] text-[8.5px] font-medium uppercase tracking-[0.24em] text-[var(--color-text-dim)]">
                    Try asking
                  </p>
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(s)}
                      className="rounded-[var(--radius-md)] border border-[var(--color-border)]/60 px-3 py-2 text-left text-[12.5px] text-[var(--color-ivory-soft)] transition-colors hover:border-[var(--color-bronze)]/45 hover:bg-[var(--color-ivory)]/[0.04] hover:text-[var(--color-ivory)]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Long-conversation notice — offers compaction before (or after) the
              history cap starts dropping earlier turns. */}
          {notice !== 'none' && !sending && (
            <div className="border-t border-[var(--color-gold)]/25 bg-[var(--color-gold)]/[0.06] px-4 py-3">
              <p className="text-[12px] leading-snug text-[var(--color-ivory-soft)]">
                {notice === 'limit'
                  ? 'This conversation is too long for me to hold all at once.'
                  : 'This conversation is getting long — I may start forgetting the earliest messages.'}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void compact()}
                  disabled={compacting}
                  className="flex items-center gap-1.5 rounded-full border border-[var(--color-bronze)]/45 bg-[var(--color-bronze)]/15 px-3 py-1.5 text-[11.5px] text-[var(--color-ivory)] transition-colors hover:border-[var(--color-bronze)]/70 disabled:opacity-50"
                >
                  <Archive size={12} strokeWidth={1.8} />
                  {compacting ? 'Summarising…' : 'Compact to a recap'}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  disabled={compacting}
                  className="rounded-full border border-[var(--color-border)]/70 px-3 py-1.5 text-[11.5px] text-[var(--color-ivory-soft)] transition-colors hover:border-[var(--color-bronze)]/50 hover:text-[var(--color-ivory)] disabled:opacity-50"
                >
                  Start over
                </button>
                {notice === 'long' && (
                  <button
                    type="button"
                    onClick={() => setNotice('none')}
                    className="ml-auto text-[11.5px] text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-ivory-soft)]"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Composer */}
          <div className="border-t border-[var(--color-border)]/70 bg-[var(--color-graphite)]/30 px-3 py-3">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void send()
              }}
              className="flex items-end gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={MAX_INPUT_CHARS}
                disabled={sending || compacting}
                placeholder="Ask how to do something…"
                aria-label="Ask the help assistant"
                className="flex-1 rounded-full border border-[var(--color-border)]/80 bg-[var(--color-bg)] px-4 py-2.5 text-[13.5px] text-[var(--color-ivory)] placeholder:text-[var(--color-text-dim)] transition-colors focus:border-[var(--color-bronze)] focus:outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={sending || compacting || !input.trim()}
                aria-label="Send"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-bronze)] text-[var(--color-graphite)] transition-opacity hover:bg-[var(--color-bronze-light)] disabled:opacity-40"
              >
                <ArrowUp size={17} strokeWidth={2} />
              </button>
            </form>
            <p className="mt-2 px-1 text-center text-[10.5px] text-[var(--color-text-dim)]">
              Answers come from the platform guide — double-check anything critical.
            </p>
          </div>
        </div>
      )}
    </>
  )
}

function Dot({ delay = '0s' }: { delay?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-bronze-light)]/70 motion-safe:animate-bounce"
      style={{ animationDelay: delay, animationDuration: '1s' }}
    />
  )
}
