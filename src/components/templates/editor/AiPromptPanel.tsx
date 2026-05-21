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
  'Booking confirmation for a member who just reserved a spot at an event.',
  'Member welcome email — warm and personal — with next steps and a calendar link.',
  'Event reminder, 7 days out, with venue and dress code.',
  'Introduction email pairing two members, with a short personal note.',
]

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  blocksSnapshot?: EditorBlock[] | null
  subjectSnapshot?: string | null
  preheaderSnapshot?: string | null
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

  async function send() {
    const prompt = input.trim()
    if (!prompt && attachments.length === 0) return
    if (busy) return

    setBusy(true)
    const userMessage: ChatMessage = {
      id: `tmp_${Date.now()}_u`,
      role: 'user',
      content: prompt || '(attachment)',
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, userMessage])
    setInput('')

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
    <div className="flex flex-col h-full bg-white">
      {/* Header — category pill + history/new icons, IFG-style */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--color-gold)]" />
          <select
            value={category}
            onChange={(e) =>
              onCategoryChange?.(e.target.value as 'automation' | 'campaign' | 'transactional')
            }
            className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-text-muted)] bg-transparent border-none cursor-pointer focus:outline-none focus:ring-0 hover:text-[var(--color-text)]"
            aria-label="Template category"
          >
            <option value="campaign">CAMPAIGN</option>
            <option value="automation">AUTOMATION</option>
            <option value="transactional">TRANSACTIONAL</option>
          </select>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
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
            className="h-8 w-8"
            onClick={startNewChat}
            title="New chat"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* History overlay */}
      {historyOpen && (
        <div className="absolute inset-x-0 top-[57px] bottom-0 bg-white z-10 border-l border-[var(--color-border)] flex flex-col">
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
            <h4 className="text-sm font-medium">Chat history</h4>
            <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(false)}>
              Close
            </Button>
          </div>
          <ScrollArea className="flex-1">
            {chatsLoading ? (
              <div className="p-4 text-sm text-[var(--color-text-dim)]">Loading…</div>
            ) : chats.length === 0 ? (
              <div className="p-4 text-sm text-[var(--color-text-dim)]">No chats yet.</div>
            ) : (
              <div className="p-2">
                {chats.map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      'group flex items-center justify-between px-3 py-2 rounded-md hover:bg-[var(--color-surface-2)] cursor-pointer',
                      chatId === c.id && 'bg-[var(--color-surface-2)]',
                    )}
                    onClick={() => loadChat(c.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--color-text)] truncate">
                        {c.title || 'Untitled chat'}
                      </p>
                      <p className="text-xs text-[var(--color-text-dim)]">
                        {new Date(c.updated_at).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteChat(c.id)
                      }}
                      className="opacity-0 group-hover:opacity-100 text-[var(--color-text-dim)] hover:text-[var(--color-accent-warm)] ml-2"
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
            <div className="text-center mb-6">
              <div className="w-12 h-12 mx-auto rounded-full bg-[var(--color-gold-muted)] flex items-center justify-center mb-3">
                <Sparkles className="w-5 h-5 text-[var(--color-gold)]" />
              </div>
              <p className="text-base font-[family-name:var(--font-heading)] font-semibold text-[var(--color-text)]">
                What email do you want?
              </p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1.5 max-w-[260px] mx-auto leading-relaxed">
                I’ll write it using The Club’s merge tags + Sarah Restrick’s voice.
              </p>
            </div>
            <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--color-text-muted)] px-1 mb-2">
              Try one of these
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setInput(s)}
                  className="w-full text-left px-3 py-2.5 rounded-md border border-[var(--color-border)] bg-white hover:border-[var(--color-gold)] hover:bg-[var(--color-gold-muted)] transition-colors text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              'flex gap-2',
              m.role === 'user' ? 'justify-end' : 'justify-start',
            )}
          >
            <div
              className={cn(
                'max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap',
                m.role === 'user'
                  ? 'bg-[var(--color-gold)] text-white'
                  : 'bg-[var(--color-surface-2)] text-[var(--color-text)]',
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex gap-2 justify-start">
            <div className="px-3 py-2 rounded-lg text-sm bg-[var(--color-surface-2)] text-[var(--color-text-muted)]">
              <Loader2 className="inline w-3 h-3 animate-spin mr-1" /> Thinking…
            </div>
          </div>
        )}
      </div>

      {/* Attachment chips */}
      {attachments.length > 0 && (
        <div className="px-3 py-2 border-t border-[var(--color-border)] bg-[var(--color-surface-2)] flex flex-wrap gap-2">
          {attachments.map((a, i) => (
            <div
              key={i}
              className="inline-flex items-center gap-1.5 bg-white border border-[var(--color-border)] rounded-md px-2 py-1 text-xs"
            >
              {a.kind === 'image' ? (
                <ImageIcon className="w-3 h-3 text-[var(--color-text-muted)]" />
              ) : (
                <FileText className="w-3 h-3 text-[var(--color-text-muted)]" />
              )}
              <span className="font-mono text-[10px] uppercase text-[var(--color-text-dim)]">
                {chipBadge(a.name, a.kind === 'image' ? 'image' : 'text')}
              </span>
              <span className="max-w-[120px] truncate">{a.name}</span>
              <button
                onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                className="text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-[var(--color-border)] p-3">
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
            className="w-full resize-none rounded-md border border-[var(--color-border)] bg-white px-3 py-2 pr-20 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-gold-muted)] focus:border-[var(--color-gold)]"
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
              className="h-8 w-8"
              onClick={() => fileInputRef.current?.click()}
              disabled={attachments.length >= MAX_ATTACHMENTS}
              title="Attach file"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              className="h-8 w-8 bg-[var(--color-gold)] hover:bg-[var(--color-gold-dark)]"
              onClick={send}
              disabled={busy || (!input.trim() && attachments.length === 0)}
              title="Send"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
        <p className="text-[10px] text-[var(--color-text-dim)] mt-1 px-1">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  )
}
