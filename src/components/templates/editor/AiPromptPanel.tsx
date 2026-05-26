'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Sparkles,
  Send,
  Loader2,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  History,
  Plus,
  Trash2,
  Calendar,
  Check,
  MapPin,
} from 'lucide-react'
import { Button } from '@/components/ui-shadcn/button'
import { ScrollArea } from '@/components/ui-shadcn/scroll-area'
import { cn } from '@/lib/utils'
import {
  ACCEPT_ATTRIBUTE,
  MAX_ATTACHMENTS,
  readAttachment,
  chipBadge,
} from '@/lib/ai/attachments'
import type { AiAttachment } from '@/lib/ai/attachments'
import { toast } from '@/lib/hooks/use-toast'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import type { EditorBlock, TemplateSettings, TemplateTheme } from '@/lib/templates/editor-types'

interface AiPromptPanelProps {
  category: 'automation' | 'campaign' | 'transactional'
  blocks: EditorBlock[]
  subject: string
  theme?: TemplateTheme | null
  templateId?: string
  // The editor's replaceBlocks accepts (blocks, partialSettings, opts).
  onApply: (
    blocks: EditorBlock[],
    settings?: Partial<TemplateSettings>,
    opts?: { commit?: boolean },
  ) => void
  onUpdateTheme?: (themeUpdates: Partial<TemplateTheme>) => void
  onCategoryChange?: (category: 'automation' | 'campaign' | 'transactional') => void
}

// Suggestion prompts shown when the AI chat is empty. Tailored to The Club's
// typical use cases — events, introductions, member onboarding — so the
// user has a single-click way in.
const SUGGESTIONS = [
  'What upcoming events do we have? Show me which ones I could include in an email.',
  'Booking confirmation for a member who just reserved a spot at an event.',
  'Member welcome email — warm and personal — with next steps and a calendar link.',
  'Event reminder, 7 days out, with venue and dress code.',
  'Introduction email pairing two members, with a short personal note.',
]

interface EventPick {
  id: string
  title: string
  date_label: string
  venue: string
  event_type: string | null
  description: string | null
  cover_image_url: string | null
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  blocksSnapshot?: EditorBlock[] | null
  subjectSnapshot?: string | null
  preheaderSnapshot?: string | null
  eventPicks?: EventPick[] | null
}

interface ChatListEntry {
  id: string
  title: string
  updated_at: string
  template_id?: string | null
}

export function AiPromptPanel({
  category,
  blocks,
  subject,
  theme,
  templateId,
  onApply,
  onUpdateTheme,
  onCategoryChange,
}: AiPromptPanelProps) {
  const confirm = useConfirm()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatId, setChatId] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<AiAttachment[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [chats, setChats] = useState<ChatListEntry[]>([])
  const [chatsLoading, setChatsLoading] = useState(false)
  // Per-message picker selection: { [messageId]: Set<eventId> }
  const [selectedByMessage, setSelectedByMessage] = useState<Record<string, Set<string>>>({})

  function toggleEventPick(messageId: string, eventId: string) {
    setSelectedByMessage((prev) => {
      const current = new Set(prev[messageId] ?? [])
      if (current.has(eventId)) current.delete(eventId)
      else current.add(eventId)
      return { ...prev, [messageId]: current }
    })
  }
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // On mount with a templateId, auto-resume the most recent chat for that template.
  useEffect(() => {
    if (!templateId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/templates/ai-chats?template_id=${templateId}`)
        if (!res.ok) return
        const json = await res.json()
        const list = (json.chats || []) as ChatListEntry[]
        if (cancelled) return
        if (list.length > 0) {
          await loadChat(list[0].id)
        }
      } catch (err) {
        console.warn('[AiPromptPanel] resume failed', err)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId])

  const refreshChats = useCallback(async () => {
    setChatsLoading(true)
    try {
      const res = await fetch('/api/templates/ai-chats')
      if (!res.ok) return
      const json = await res.json()
      setChats((json.chats || []) as ChatListEntry[])
    } finally {
      setChatsLoading(false)
    }
  }, [])

  async function loadChat(id: string) {
    try {
      const res = await fetch(`/api/templates/ai-chats/${id}`)
      if (!res.ok) {
        toast({ title: 'Failed to load chat', variant: 'destructive' })
        return
      }
      const json = await res.json()
      const msgs = (json.messages || []) as Array<{
        id: string
        role: 'user' | 'assistant'
        content: string
        blocks_snapshot?: EditorBlock[] | null
        subject_snapshot?: string | null
        preheader_snapshot?: string | null
        created_at: string
      }>
      setChatId(id)
      setMessages(
        msgs.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: new Date(m.created_at).getTime(),
          blocksSnapshot: m.blocks_snapshot ?? null,
          subjectSnapshot: m.subject_snapshot ?? null,
          preheaderSnapshot: m.preheader_snapshot ?? null,
        })),
      )
      // Restore the latest canvas snapshot.
      const lastWithSnapshot = [...msgs].reverse().find((m) => m.blocks_snapshot && m.blocks_snapshot.length)
      if (lastWithSnapshot && lastWithSnapshot.blocks_snapshot) {
        onApply(
          lastWithSnapshot.blocks_snapshot,
          {
            subject: lastWithSnapshot.subject_snapshot ?? undefined,
            preheader: lastWithSnapshot.preheader_snapshot ?? undefined,
          },
          { commit: true },
        )
      }
      setHistoryOpen(false)
    } catch (err) {
      console.error(err)
      toast({ title: 'Failed to load chat', variant: 'destructive' })
    }
  }

  async function deleteChat(id: string) {
    const chat = chats.find((c) => c.id === id)
    const ok = await confirm({
      title: 'Delete chat?',
      description: chat?.title
        ? `"${chat.title}" and every turn in it will be removed. This cannot be undone.`
        : 'This chat and every turn in it will be removed. This cannot be undone.',
      confirmLabel: 'Delete chat',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await fetch(`/api/templates/ai-chats/${id}`, { method: 'DELETE' })
      setChats((prev) => prev.filter((c) => c.id !== id))
      if (chatId === id) {
        startNewChat()
      }
    } catch (err) {
      console.error(err)
    }
  }

  function startNewChat() {
    setChatId(null)
    setMessages([])
    setInput('')
    setAttachments([])
  }

  async function pickFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const available = MAX_ATTACHMENTS - attachments.length
    if (available <= 0) {
      toast({
        title: 'Too many attachments',
        description: `Maximum ${MAX_ATTACHMENTS} attachments per message.`,
        variant: 'destructive',
      })
      return
    }
    const incoming = Array.from(files).slice(0, available)
    for (const file of incoming) {
      try {
        const attachment = await readAttachment(file)
        setAttachments((prev) => [...prev, attachment])
      } catch (err) {
        const msg = typeof err === 'string' ? err : 'Failed to read file'
        toast({
          title: 'Could not attach file',
          description: msg,
          variant: 'destructive',
        })
      }
    }
  }

  async function send(opts?: { overridePrompt?: string; displayLabel?: string }) {
    const prompt = (opts?.overridePrompt ?? input).trim()
    if (!prompt && attachments.length === 0) return
    if (busy) return

    setBusy(true)
    const userMessage: ChatMessage = {
      id: `tmp_${Date.now()}_u`,
      role: 'user',
      content: opts?.displayLabel ?? prompt ?? '(attachment)',
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, userMessage])
    if (!opts?.overridePrompt) setInput('')

    try {
      const mode = blocks.length > 0 ? 'enhance' : 'create'
      const res = await fetch('/api/templates/ai-generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt,
          mode,
          category,
          existingBlocks: blocks,
          existingSubject: subject,
          existingTheme: theme ?? null,
          chat_id: chatId,
          attachments,
          template_id: templateId ?? null,
        }),
      })

      const json = await res.json()

      if (!res.ok) {
        const errMsg = json?.error || `Request failed (${res.status})`
        setMessages((prev) => [
          ...prev,
          {
            id: `tmp_${Date.now()}_e`,
            role: 'assistant',
            content: `Sorry — ${errMsg}`,
            timestamp: Date.now(),
          },
        ])
        toast({ title: 'AI request failed', description: errMsg, variant: 'destructive' })
        return
      }

      const replyText = String(json.reply || '')
      const intent = json.intent as 'answer' | 'create' | 'enhance'
      const newBlocks = (json.blocks || []) as EditorBlock[]
      const newSubject = String(json.subject || '')
      const newPreheader = String(json.preheader || '')
      const newChatId = json.chat_id as string | null
      const themeUpdates = (json.theme || null) as Partial<TemplateTheme> | null
      const eventPicks = Array.isArray(json.event_picks) ? (json.event_picks as EventPick[]) : null

      if (newChatId) setChatId(newChatId)

      setMessages((prev) => [
        ...prev,
        {
          id: `tmp_${Date.now()}_a`,
          role: 'assistant',
          content: replyText,
          timestamp: Date.now(),
          blocksSnapshot: intent === 'answer' ? null : newBlocks,
          subjectSnapshot: intent === 'answer' ? null : newSubject,
          preheaderSnapshot: intent === 'answer' ? null : newPreheader,
          eventPicks: eventPicks && eventPicks.length > 0 ? eventPicks : null,
        },
      ])

      if (intent !== 'answer' && newBlocks.length > 0) {
        onApply(
          newBlocks,
          { subject: newSubject, preheader: newPreheader },
          { commit: true },
        )
      }

      if (themeUpdates && onUpdateTheme) {
        onUpdateTheme(themeUpdates)
      }

      setAttachments([])
    } catch (err) {
      console.error('[AiPromptPanel] send failed', err)
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setMessages((prev) => [
        ...prev,
        {
          id: `tmp_${Date.now()}_e`,
          role: 'assistant',
          content: `Network error: ${msg}`,
          timestamp: Date.now(),
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="relative flex flex-col h-full bg-graphite">
      {/* Header — category pill + history/new icons */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-graphite-line/50">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-bronze-light" />
          <select
            value={category}
            onChange={(e) =>
              onCategoryChange?.(e.target.value as 'automation' | 'campaign' | 'transactional')
            }
            className="font-[family-name:var(--font-meta)] text-[10.5px] font-medium uppercase tracking-[0.28em] text-bronze-light bg-transparent border-none cursor-pointer focus:outline-none focus:ring-0 hover:text-ivory"
            aria-label="Template category"
          >
            <option value="campaign" className="bg-graphite text-ivory">CAMPAIGN</option>
            <option value="automation" className="bg-graphite text-ivory">AUTOMATION</option>
            <option value="transactional" className="bg-graphite text-ivory">TRANSACTIONAL</option>
          </select>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-ivory-soft hover:text-bronze-light hover:bg-bronze/[0.08]"
            onClick={() => {
              setHistoryOpen((v) => !v)
              if (!historyOpen) refreshChats()
            }}
            title="Chat history"
          >
            <History className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-ivory-soft hover:text-bronze-light hover:bg-bronze/[0.08]"
            onClick={startNewChat}
            title="New chat"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* History overlay */}
      {historyOpen && (
        <div className="absolute inset-x-0 top-[57px] bottom-0 bg-graphite z-10 border-l border-graphite-line/50 flex flex-col">
          <div className="px-4 py-3 border-b border-graphite-line/50 flex items-center justify-between">
            <h4 className="font-[family-name:var(--font-meta)] text-[10.5px] font-medium uppercase tracking-[0.28em] text-ivory">
              Chat history
            </h4>
            <Button
              variant="ghost"
              size="sm"
              className="text-ivory-soft hover:text-bronze-light hover:bg-bronze/[0.08]"
              onClick={() => setHistoryOpen(false)}
            >
              Close
            </Button>
          </div>
          <ScrollArea className="flex-1">
            {chatsLoading ? (
              <div className="p-4 text-sm text-slate-haze">Loading…</div>
            ) : chats.length === 0 ? (
              <div className="p-4 font-[family-name:var(--font-editorial)] italic text-sm text-ivory-soft/80">
                No chats yet.
              </div>
            ) : (
              <div className="p-2">
                {chats.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      'group flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors',
                      chatId === c.id
                        ? 'bg-bronze/[0.08]'
                        : 'hover:bg-bronze/[0.05]',
                    )}
                    onClick={() => loadChat(c.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ivory truncate">
                        {c.title || 'Untitled chat'}
                      </p>
                      <p className="text-xs text-slate-haze">
                        {new Date(c.updated_at).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteChat(c.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 text-slate-haze hover:text-rose-300 ml-2 transition-colors"
                      aria-label="Delete chat"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="pt-4">
            <div className="text-center mb-7">
              <div className="w-12 h-12 mx-auto rounded-full border border-bronze/40 bg-bronze/10 flex items-center justify-center mb-4">
                <Sparkles className="w-5 h-5 text-bronze-light" />
              </div>
              <p className="font-[family-name:var(--font-display)] text-[18px] text-ivory leading-tight">
                What email do you want?
              </p>
              <p className="mt-3 font-[family-name:var(--font-editorial)] italic text-[13px] text-ivory-soft/85 max-w-[280px] mx-auto leading-[1.65]">
                I&rsquo;ll write it using The Club&rsquo;s merge tags + Sarah Restrick&rsquo;s voice.
              </p>
            </div>
            <p className="font-[family-name:var(--font-meta)] text-[9.5px] font-medium uppercase tracking-[0.28em] text-bronze-light/85 px-1 mb-3">
              Try one of these
            </p>
            <div className="space-y-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setInput(s)}
                  className="w-full text-left px-3.5 py-3 rounded-md border border-graphite-line/55 bg-ink/40 hover:border-bronze/55 hover:bg-bronze/[0.06] transition-colors text-[13px] text-ivory-soft hover:text-ivory leading-[1.55]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => {
          const picks = m.eventPicks ?? null
          const selected = selectedByMessage[m.id] ?? new Set<string>()
          return (
            <div
              key={m.id}
              className={cn(
                'flex gap-2',
                m.role === 'user' ? 'justify-end' : 'justify-start',
              )}
            >
              <div
                className={cn(
                  'max-w-[85%] flex flex-col gap-2.5',
                  m.role === 'user' ? 'items-end' : 'items-start',
                )}
              >
                <div
                  className={cn(
                    'px-3.5 py-2.5 rounded-lg text-[13.5px] whitespace-pre-wrap leading-[1.55]',
                    m.role === 'user'
                      ? 'bg-bronze text-ink'
                      : 'bg-ink/50 border border-graphite-line/45 text-ivory',
                  )}
                >
                  {m.content}
                </div>

                {picks && picks.length > 0 && (
                  <div className="w-full flex flex-col gap-1.5">
                    {picks.map((ev) => {
                      const isSelected = selected.has(ev.id)
                      return (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => toggleEventPick(m.id, ev.id)}
                          className={cn(
                            'group w-full text-left rounded-lg border overflow-hidden transition-all',
                            isSelected
                              ? 'border-bronze bg-bronze/[0.12] shadow-[0_0_0_1px_var(--bronze)]'
                              : 'border-graphite-line/55 bg-ink/40 hover:border-bronze/60 hover:bg-bronze/[0.06]',
                          )}
                        >
                          <div className="flex items-stretch gap-0">
                            {ev.cover_image_url ? (
                              <div className="relative w-[88px] h-[88px] flex-shrink-0 bg-ink overflow-hidden">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={ev.cover_image_url}
                                  alt=""
                                  className="absolute inset-0 w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = 'none'
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="w-[88px] h-[88px] flex-shrink-0 bg-ink/60 border-r border-graphite-line/40 flex items-center justify-center">
                                <ImageIcon className="w-5 h-5 text-slate-haze/50" />
                              </div>
                            )}
                            <div className="flex items-start gap-2 px-3 py-2.5 min-w-0 flex-1">
                              <div
                                className={cn(
                                  'mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
                                  isSelected
                                    ? 'bg-bronze border-bronze'
                                    : 'border-slate-haze/60 group-hover:border-bronze/60',
                                )}
                              >
                                {isSelected && <Check className="w-3 h-3 text-ink" strokeWidth={3} />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <p className="text-[13px] font-medium text-ivory leading-tight">
                                    {ev.title}
                                  </p>
                                  {ev.event_type && (
                                    <span className="font-[family-name:var(--font-meta)] text-[8.5px] uppercase tracking-[0.18em] text-bronze-light/85 border border-bronze/30 rounded px-1.5 py-0.5">
                                      {ev.event_type.replace(/_/g, ' ')}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 flex items-center gap-1 text-[11.5px] text-ivory-soft/85">
                                  <Calendar className="w-3 h-3 text-bronze-light/70 flex-shrink-0" />
                                  <span>{ev.date_label}</span>
                                </div>
                                <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-ivory-soft/75">
                                  <MapPin className="w-3 h-3 text-bronze-light/70 flex-shrink-0" />
                                  <span className="truncate">{ev.venue}</span>
                                </div>
                                {ev.description && (
                                  <p className="mt-1.5 text-[11.5px] italic text-ivory-soft/65 leading-snug line-clamp-2">
                                    {ev.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })}

                    <div className="flex items-center justify-between gap-2 mt-1">
                      <p className="text-[11px] text-slate-haze">
                        {selected.size === 0
                          ? 'Tap events to select.'
                          : `${selected.size} selected`}
                      </p>
                      <Button
                        size="sm"
                        className="h-8 bg-bronze text-ink hover:bg-bronze-light disabled:opacity-40 disabled:hover:bg-bronze text-[12px] px-3"
                        disabled={selected.size === 0 || busy}
                        onClick={() => {
                          const chosen = picks.filter((p) => selected.has(p.id))
                          if (chosen.length === 0) return
                          const idsLine = chosen.map((c) => `id=${c.id}`).join(', ')
                          const summary = chosen.map((c) => `"${c.title}"`).join(', ')
                          const withImages = chosen.filter((c) => c.cover_image_url)
                          const imageHint =
                            withImages.length > 0
                              ? ` Include each event's cover image as an image block above its title — use these exact URLs: ${withImages
                                  .map((c) => `${c.title}: ${c.cover_image_url}`)
                                  .join(' | ')}.`
                              : ''
                          send({
                            overridePrompt: `Include these events in the email: ${idsLine}. Use their real titles, dates and venues directly in the copy (not merge tags).${imageHint}`,
                            displayLabel: `Include ${chosen.length === 1 ? 'event' : 'events'}: ${summary}`,
                          })
                        }}
                      >
                        Include in email
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
        {busy && (
          <div className="flex gap-2 justify-start">
            <div className="px-3.5 py-2.5 rounded-lg text-[13px] bg-ink/50 border border-graphite-line/45 text-ivory-soft">
              <Loader2 className="inline w-3 h-3 animate-spin mr-1.5 text-bronze-light" />
              Thinking…
            </div>
          </div>
        )}
      </div>

      {/* Attachment chips */}
      {attachments.length > 0 && (
        <div className="px-3 py-2 border-t border-graphite-line/50 bg-ink/40 flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <div
              key={i}
              className="inline-flex items-center gap-1.5 bg-graphite border border-graphite-line/55 rounded-md px-2 py-1 text-xs text-ivory"
            >
              {a.kind === 'image' ? (
                <ImageIcon className="w-3 h-3 text-bronze-light/85" />
              ) : (
                <FileText className="w-3 h-3 text-bronze-light/85" />
              )}
              <span className="font-mono text-[10px] uppercase text-slate-haze">
                {chipBadge(a.name, a.kind === 'image' ? 'image' : 'text')}
              </span>
              <span className="max-w-[120px] truncate">{a.name}</span>
              <button
                onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                className="text-slate-haze hover:text-bronze-light transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-graphite-line/50 p-3 bg-ink/30">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              blocks.length === 0
                ? 'Describe the email you want…'
                : 'Tell me how to tweak it…'
            }
            rows={3}
            className="w-full resize-none rounded-md border border-graphite-line/60 bg-ink/50 text-ivory placeholder:text-slate-haze px-3 py-2.5 pr-20 text-sm focus:outline-none focus:ring-1 focus:ring-bronze/40 focus:border-bronze/60 transition-colors"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            multiple
            className="hidden"
            onChange={(e) => {
              pickFiles(e.target.files)
              if (fileInputRef.current) fileInputRef.current.value = ''
            }}
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-ivory-soft hover:text-bronze-light hover:bg-bronze/[0.08] disabled:opacity-40"
              onClick={() => fileInputRef.current?.click()}
              disabled={attachments.length >= MAX_ATTACHMENTS}
              title="Attach file"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              className="h-8 w-8 bg-bronze text-ink hover:bg-bronze-light disabled:opacity-40 disabled:hover:bg-bronze"
              onClick={() => send()}
              disabled={busy || (!input.trim() && attachments.length === 0)}
              title="Send"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
        <p className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.22em] text-slate-haze mt-2 px-1">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  )
}
