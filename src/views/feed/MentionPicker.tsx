'use client'

// @mention picker for the feed's textareas (post composer, edit dialog,
// comments, replies). Typing `@` opens a small list of people the viewer may
// tag (GET /feed/mentionable, debounced): avatar, name, role · company.
// ↑/↓ moves, Enter/Tab picks, Esc closes, tap picks. On sm+ it's anchored at
// the caret; on phones it sits as a full-width list just above the input (the
// keyboard covers what's below). The textarea keeps showing `@Name`; picks
// are remembered so `toBody()` can turn them into stored tokens.

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { ChatAvatar } from '@/components/ui/chat'
import { useChat } from '@/lib/chat/ChatProvider'
import type { ChatPerson, MentionablePage } from '@/lib/chat/contract'
import { chatClient } from '@/lib/http/chat-client'
import { activeQuery, caretPosition, cleanMentionName, fromTokens, toTokens, type MentionPick } from '@/lib/feed/mentions'
import { cn } from '@/lib/utils'
import { personLine } from './format'

const POPOVER_W = 288

export interface MentionInput {
  picks: MentionPick[]
  /** call from the textarea's onKeyDown first; returns true when it handled the key */
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean
  /** call on click / keyup / select so caret moves re-evaluate the @query */
  refresh: () => void
  /** stored body for submit */
  toBody: (text: string) => string
  /** start from a stored body (edit) — returns the display text */
  load: (body: string) => string
  reset: () => void
  popover: React.ReactNode
}

export function useMentionInput({
  taRef,
  text,
  setText,
  postId,
  groupId,
}: {
  taRef: RefObject<HTMLTextAreaElement | null>
  text: string
  setText: (next: string) => void
  /** comments / replies / edits: the post (enables thread suggestions) */
  postId?: string | null
  /** new posts: the feed (null = Club feed) */
  groupId?: string | null
}): MentionInput {
  const { ready } = useChat()
  const [picks, setPicks] = useState<MentionPick[]>([])
  const [active, setActive] = useState<{ start: number; query: string; left: number; top: number } | null>(null)
  const [index, setIndex] = useState(0)
  const [debounced, setDebounced] = useState('')
  const textRef = useRef(text)
  textRef.current = text

  useEffect(() => {
    const t = setTimeout(() => setDebounced(active?.query ?? ''), 150)
    return () => clearTimeout(t)
  }, [active?.query])

  const usablePost = postId && !postId.startsWith('local:') ? postId : null
  const open = !!active
  const results = useQuery({
    queryKey: ['feed', 'mentionable', usablePost ?? '', groupId ?? '', debounced],
    enabled: ready && open && (debounced.length > 0 || !!usablePost),
    staleTime: 30_000,
    queryFn: async ({ signal }) =>
      (
        await chatClient.get<MentionablePage>('/feed/mentionable', {
          signal,
          params: { postId: usablePost ?? undefined, groupId: usablePost ? undefined : (groupId ?? undefined), q: debounced || undefined, limit: 8 },
        })
      ).data.people,
  })
  const people: ChatPerson[] = open ? (results.data ?? []) : []

  const refresh = useCallback(() => {
    const ta = taRef.current
    if (!ta || ta.selectionStart !== ta.selectionEnd) return setActive(null)
    const q = activeQuery(ta.value, ta.selectionStart)
    if (!q) return setActive(null)
    const caret = caretPosition(ta, q.start)
    setActive((prev) => {
      if (prev?.start !== q.start) setIndex(0)
      return {
        start: q.start,
        query: q.query,
        left: ta.offsetLeft + caret.left,
        top: ta.offsetTop + caret.top + caret.height + 4,
      }
    })
  }, [taRef])

  // Re-evaluate after every text change (the caret has moved by then).
  useEffect(() => {
    refresh()
  }, [text, refresh])

  useEffect(() => {
    if (index >= people.length && people.length) setIndex(0)
  }, [people.length, index])

  const pick = useCallback(
    (person: ChatPerson) => {
      const ta = taRef.current
      if (!ta || !active) return
      const name = cleanMentionName(person.name)
      const caret = ta.selectionStart
      const current = textRef.current
      const insert = `@${name} `
      const next = current.slice(0, active.start) + insert + current.slice(caret)
      setPicks((prev) => (prev.some((p) => p.id === person.id) ? prev : [...prev, { id: person.id, name }]))
      setText(next)
      setActive(null)
      const at = active.start + insert.length
      requestAnimationFrame(() => {
        ta.focus()
        ta.setSelectionRange(at, at)
      })
    },
    [active, setText, taRef],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!active) return false
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setActive(null)
        return true
      }
      if (!people.length) return false
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setIndex((i) => (e.key === 'ArrowDown' ? (i + 1) % people.length : (i - 1 + people.length) % people.length))
        return true
      }
      if ((e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) || e.key === 'Tab') {
        e.preventDefault()
        pick(people[Math.min(index, people.length - 1)])
        return true
      }
      return false
    },
    [active, people, index, pick],
  )

  const toBody = useCallback((t: string) => toTokens(t, picks), [picks])
  const load = useCallback((body: string) => {
    const { text: display, picks: loaded } = fromTokens(body)
    setPicks(loaded)
    return display
  }, [])
  const reset = useCallback(() => {
    setPicks([])
    setActive(null)
  }, [])

  const showList = open && (people.length > 0 || results.isFetching || (debounced.length > 0 && results.isSuccess))
  const containerW = taRef.current?.offsetParent instanceof HTMLElement ? taRef.current.offsetParent.clientWidth : 0
  const left = active ? Math.max(0, Math.min(active.left, Math.max(0, containerW - POPOVER_W))) : 0

  const popover = showList ? (
    <div
      role="listbox"
      aria-label="Mention someone"
      className={cn(
        'absolute z-40 max-h-72 overflow-y-auto rounded-[var(--radius-lg)] border border-border py-1 shadow-[var(--shadow-lg)]',
        // phones: full-width list above the input; sm+: at the caret
        'max-sm:!left-0 max-sm:!right-0 max-sm:!top-auto max-sm:bottom-full max-sm:mb-1.5 sm:w-72',
      )}
      style={{ left, top: active?.top ?? 0, backgroundColor: 'var(--color-surface)' }}
      // keep focus in the textarea while tapping a row
      onMouseDown={(e) => e.preventDefault()}
    >
      {people.length === 0 ? (
        <div className="flex min-h-10 items-center gap-2 px-3 text-xs text-text-dim">
          {results.isFetching ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Searching…
            </>
          ) : (
            'No one you can mention by that name'
          )}
        </div>
      ) : (
        people.map((p, i) => (
          <button
            key={p.id}
            type="button"
            role="option"
            aria-selected={i === index}
            onMouseEnter={() => setIndex(i)}
            onClick={() => pick(p)}
            className={cn('flex min-h-11 w-full min-w-0 items-center gap-2.5 px-3 py-1.5 text-left', i === index ? 'bg-surface-2' : 'hover:bg-surface-2')}
          >
            <ChatAvatar name={p.name} src={p.avatarUrl} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-text">{p.name}</span>
              {personLine(p) && <span className="block truncate text-[11px] text-text-dim">{personLine(p)}</span>}
            </span>
          </button>
        ))
      )}
    </div>
  ) : null

  return { picks, onKeyDown, refresh, toBody, load, reset, popover }
}
