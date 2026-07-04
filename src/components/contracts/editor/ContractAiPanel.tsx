'use client'

// AI drafting panel for the contract builder — the contract counterpart of the
// email AiPromptPanel. A chat thread that drafts / edits the contract on the
// canvas. History is stored in contract_ai_chats / contract_ai_messages and
// resumed via the browser client (admin RLS).

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui-shadcn/button'
import { toast } from '@/lib/hooks/use-toast'
import { Sparkles, Send, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EditorBlock, TemplateTheme } from '@/lib/templates/editor-types'
import type { ContractSettings } from '@/lib/contracts/editor-types'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ContractAiPanelProps {
  docType: string
  blocks: EditorBlock[]
  theme?: TemplateTheme
  contractId?: string
  onApply: (
    blocks: EditorBlock[],
    settings?: Partial<ContractSettings>,
    opts?: { commit?: boolean },
  ) => void
  onUpdateTheme: (updates: Partial<TemplateTheme>) => void
}

const SUGGESTIONS = [
  'Draft a standard membership agreement',
  'Write a mutual NDA for a prospective member',
  'Create an introducer commission agreement',
]

export function ContractAiPanel({
  docType,
  blocks,
  theme,
  contractId,
  onApply,
  onUpdateTheme,
}: ContractAiPanelProps) {
  const supabase = createClient()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [chatId, setChatId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Resume the most recent chat for this contract.
  useEffect(() => {
    if (!contractId) return
    let cancelled = false
    ;(async () => {
      const { data: chat } = await supabase
        .from('contract_ai_chats')
        .select('id')
        .eq('contract_id', contractId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled || !chat) return
      setChatId(chat.id)
      const { data: msgs } = await supabase
        .from('contract_ai_messages')
        .select('role, content, created_at')
        .eq('chat_id', chat.id)
        .order('created_at', { ascending: true })
      if (cancelled || !msgs) return
      setMessages(
        msgs
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      )
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  async function send(text: string) {
    const prompt = text.trim()
    if (!prompt || sending) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: prompt }])
    setSending(true)
    try {
      const res = await fetch('/api/contracts/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          mode: blocks.length > 0 ? 'enhance' : 'create',
          docType,
          existingBlocks: blocks,
          existingTheme: theme ?? null,
          chat_id: chatId,
          contract_id: contractId ?? null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'AI error', description: json.error, variant: 'destructive' })
        setMessages((m) => [...m, { role: 'assistant', content: `Sorry — ${json.error ?? 'something went wrong.'}` }])
        return
      }
      if (json.chat_id) setChatId(json.chat_id)
      setMessages((m) => [...m, { role: 'assistant', content: json.reply ?? 'Done.' }])
      if (json.intent && json.intent !== 'answer' && Array.isArray(json.blocks)) {
        onApply(json.blocks as EditorBlock[], json.name ? { name: json.name } : undefined, { commit: true })
        if (json.theme && typeof json.theme === 'object') onUpdateTheme(json.theme as Partial<TemplateTheme>)
      }
    } catch (e) {
      toast({ title: 'AI error', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3.5 border-b border-graphite-line/50 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-bronze-light" />
        <span className="font-[family-name:var(--font-meta)] text-[10.5px] font-medium uppercase tracking-[0.28em] text-ivory">
          AI contract assistant
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-ivory-soft/80 leading-relaxed">
              Describe the agreement you need and I’ll draft it on the canvas — with the signature
              field placed for the member. You can then tweak any wording.
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="w-full text-left text-xs px-3 py-2 rounded-md border border-graphite-line/60 text-ivory-soft/85 hover:border-bronze/50 hover:text-bronze-light transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[90%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed',
                m.role === 'user'
                  ? 'bg-bronze/15 text-ivory border border-bronze/25'
                  : 'bg-graphite/60 text-ivory-soft border border-graphite-line/50',
              )}
            >
              {m.content}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm bg-graphite/60 text-ivory-soft border border-graphite-line/50">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Drafting…
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-graphite-line/50 p-3">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            placeholder="e.g. Draft an NDA for a prospective member…"
            rows={3}
            className="w-full resize-none rounded-md bg-graphite/60 border border-graphite-line/60 text-sm text-ivory placeholder:text-ivory-soft/40 px-3 py-2.5 pr-11 outline-none focus:border-bronze/50"
          />
          <Button
            size="icon"
            onClick={() => send(input)}
            disabled={sending || !input.trim()}
            className="absolute right-2 bottom-2 h-7 w-7 bg-bronze text-ink hover:bg-bronze-light"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
