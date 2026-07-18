'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { Button } from '@/components/ui/Button'
import { toast } from '@/lib/hooks/use-toast'
import { normalizeE164 } from '@/lib/whatsapp/client'
import { TEMPLATES } from './shared'

// "New conversation" — reproduces the old send form. On success, hands the
// normalized phone back so the inbox can refresh + select that thread.
export function NewConversationModal({
  open,
  onClose,
  onStarted,
}: {
  open: boolean
  onClose: () => void
  onStarted: (phone: string) => void
}) {
  const [mode, setMode] = useState<'template' | 'text'>('template')
  const [to, setTo] = useState('')
  const [templateName, setTemplateName] = useState(TEMPLATES[0]?.value ?? 'hello_world')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  function reset() {
    setMode('template')
    setTo('')
    setTemplateName(TEMPLATES[0]?.value ?? 'hello_world')
    setText('')
  }

  async function handleSend() {
    if (!to.trim()) {
      toast({ title: 'Add a recipient number', variant: 'destructive' })
      return
    }
    if (mode === 'text' && !text.trim()) {
      toast({ title: 'Add a message', variant: 'destructive' })
      return
    }
    setSending(true)
    try {
      const selected = TEMPLATES.find((t) => t.value === templateName)
      const res = await fetch('/api/admin/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: to.trim(),
          mode,
          templateName: mode === 'template' ? templateName : undefined,
          languageCode: mode === 'template' ? selected?.languageCode ?? 'en_US' : undefined,
          text: mode === 'text' ? text : undefined,
        }),
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
      toast({ title: 'WhatsApp sent' })
      // The trigger keys the contact by the normalized E.164 (what the lib
      // sends to). Match that so we select the right thread.
      const normalized = normalizeE164(to.trim()) ?? to.trim()
      reset()
      onStarted(normalized)
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
    <Modal open={open} onClose={onClose} title="New conversation" size="md">
      <div className="space-y-4">
        <Input
          label="Recipient"
          placeholder="+44 7700 900123"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />

        <div className="space-y-1.5">
          <label className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
            Mode
          </label>
          <SelectMenu
            ariaLabel="Message mode"
            value={mode}
            onValueChange={(v) => setMode(v as 'template' | 'text')}
            options={[
              { value: 'template', label: 'Template' },
              { value: 'text', label: 'Free text' },
            ]}
          />
        </div>

        {mode === 'template' ? (
          <div className="space-y-1.5">
            <label className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
              Template
            </label>
            <SelectMenu
              ariaLabel="Template"
              value={templateName}
              onValueChange={setTemplateName}
              options={TEMPLATES.map((t) => ({ value: t.value, label: t.label }))}
            />
          </div>
        ) : (
          <Textarea
            label="Message"
            placeholder="Type your message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}

        <p className="text-xs leading-relaxed text-text-muted">
          Free-text reaches a recipient only inside the 24-hour window after they last messaged you
          — otherwise send an approved template (e.g. <code>hello_world</code>) to open the
          conversation.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSend} loading={sending}>
            Send
          </Button>
        </div>
      </div>
    </Modal>
  )
}
