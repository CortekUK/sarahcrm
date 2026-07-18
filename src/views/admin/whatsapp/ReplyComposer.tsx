'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { toast } from '@/lib/hooks/use-toast'
import { Send, Lock } from 'lucide-react'
import { type WaLogRow, TEMPLATES, WINDOW_MS } from './shared'

// Bottom composer. WhatsApp rule: free-text only delivers inside the 24h window
// opened by the contact's LAST INBOUND message; otherwise an approved template
// must be sent to re-open the conversation.
export function ReplyComposer({
  phone,
  messages,
  onSent,
}: {
  phone: string
  messages: WaLogRow[]
  onSent: () => void
}) {
  const [text, setText] = useState('')
  const [templateName, setTemplateName] = useState(TEMPLATES[0]?.value ?? 'hello_world')
  const [sending, setSending] = useState(false)

  // Window open if the latest INBOUND message is < 24h old.
  const windowOpen = useMemo(() => {
    let latest = 0
    for (const m of messages) {
      if (m.direction === 'inbound') {
        const t = new Date(m.created_at).getTime()
        if (t > latest) latest = t
      }
    }
    if (!latest) return false
    return Date.now() - latest < WINDOW_MS
  }, [messages])

  async function send() {
    if (windowOpen && !text.trim()) {
      toast({ title: 'Type a message', variant: 'destructive' })
      return
    }
    setSending(true)
    try {
      const selected = TEMPLATES.find((t) => t.value === templateName)
      const payload = windowOpen
        ? { to: phone, mode: 'text' as const, text: text.trim() }
        : {
            to: phone,
            mode: 'template' as const,
            templateName,
            languageCode: selected?.languageCode ?? 'en_US',
          }
      const res = await fetch('/api/admin/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) {
        toast({
          title: 'Could not send',
          description: json.error || 'WhatsApp send failed.',
          variant: 'destructive',
        })
        return
      }
      if (windowOpen) setText('')
      onSent()
    } catch (e) {
      toast({
        title: 'Could not send',
        description: e instanceof Error ? e.message : 'Unexpected error',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="shrink-0 border-t border-border bg-surface px-6 py-4">
      {windowOpen ? (
        <div className="flex items-end gap-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (!sending) send()
              }
            }}
            rows={1}
            placeholder="Type a reply…"
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-[var(--radius-md)] border border-border bg-surface px-3.5 py-2.5 text-sm text-text outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-text-dim focus:border-gold focus:shadow-[0_0_0_3px_var(--color-gold-muted)]"
          />
          <Button icon={<Send size={15} />} loading={sending} onClick={send}>
            Send
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-[var(--radius-md)] bg-surface-2 px-3.5 py-2.5">
            <Lock size={14} className="mt-0.5 shrink-0 text-bronze" />
            <p className="text-xs leading-relaxed text-text-muted">
              24-hour window closed — send an approved template to re-open the conversation. The
              member can then reply with free text.
            </p>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <SelectMenu
                ariaLabel="Template"
                value={templateName}
                onValueChange={setTemplateName}
                options={TEMPLATES.map((t) => ({ value: t.value, label: t.label }))}
              />
            </div>
            <Button icon={<Send size={15} />} loading={sending} onClick={send}>
              Send template
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
