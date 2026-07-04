'use client'

// Send a saved contract to a member for e-signature. Pick the member, confirm
// the signer email + subject, and POST to /api/admin/signatures/send with the
// contract_template_id (the server loads the contract HTML, merges member data,
// places the signature field, and creates the DocuSign envelope).

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { toast } from '@/lib/hooks/use-toast'
import { Search, Loader2, Send, ShieldAlert, ExternalLink, Check, User } from 'lucide-react'

interface ContractLite {
  id: string
  name: string
  doc_type: string
}

interface MemberOption {
  id: string
  name: string
  email: string
  company: string | null
}

interface Props {
  contract: ContractLite | null
  open: boolean
  onClose: () => void
  onSent?: () => void
}

export function SendContractModal({ contract, open, onClose, onSent }: Props) {
  const [members, setMembers] = useState<MemberOption[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<MemberOption | null>(null)
  const [signerEmail, setSignerEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [consentUrl, setConsentUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !contract) return
    setSelected(null)
    setSignerEmail('')
    setSearch('')
    setSubject(`Please sign: ${contract.name}`)
    setMessage('')
    setConsentUrl(null)
    loadMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contract?.id])

  async function loadMembers() {
    setLoadingMembers(true)
    const { data } = await supabase
      .from('members')
      .select('id, company_name, profiles(first_name, last_name, email, company_name)')
      .eq('membership_status', 'active')
      .is('deleted_at', null)
      .limit(500)
    const opts: MemberOption[] = (data ?? []).map((m) => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
      const name = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || (p?.email ?? 'Unnamed member')
      return {
        id: m.id,
        name,
        email: p?.email ?? '',
        company: m.company_name ?? p?.company_name ?? null,
      }
    })
    opts.sort((a, b) => a.name.localeCompare(b.name))
    setMembers(opts)
    setLoadingMembers(false)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return members.slice(0, 50)
    return members
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q) ||
          (m.company ?? '').toLowerCase().includes(q),
      )
      .slice(0, 50)
  }, [members, search])

  function pick(m: MemberOption) {
    setSelected(m)
    setSignerEmail(m.email)
  }

  async function submit() {
    if (!contract || !selected) {
      toast({ title: 'Choose a member to send to', variant: 'destructive' })
      return
    }
    if (!signerEmail.trim()) {
      toast({ title: 'The member has no email — add one first', variant: 'destructive' })
      return
    }
    if (!subject.trim()) {
      toast({ title: 'An email subject is required', variant: 'destructive' })
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/admin/signatures/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: selected.id,
          contract_template_id: contract.id,
          doc_type: contract.doc_type,
          title: contract.name,
          signer_name: selected.name,
          signer_email: signerEmail.trim(),
          subject: subject.trim(),
          message: message.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.consentUrl) setConsentUrl(json.consentUrl)
        toast({ title: 'Could not send', description: json.error, variant: 'destructive' })
        return
      }
      toast({ title: 'Sent for signature', description: `DocuSign emailed ${signerEmail}.` })
      onSent?.()
      onClose()
    } catch (e) {
      toast({ title: 'Could not send', description: e instanceof Error ? e.message : undefined, variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  if (!contract) return null

  return (
    <Modal open={open} onClose={() => !sending && onClose()} title={`Send “${contract.name}” for signature`} size="lg">
      <div className="p-6 space-y-4 overflow-y-auto">
        {consentUrl && (
          <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-gold/40 bg-gold-muted px-4 py-3">
            <ShieldAlert size={18} className="text-gold mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text">DocuSign access needs granting once</p>
              <p className="text-xs text-text-muted mt-0.5">Click below, sign in and choose Allow, then send again.</p>
            </div>
            <a href={consentUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
              <Button size="sm" icon={<ExternalLink size={14} />}>Grant access</Button>
            </a>
          </div>
        )}

        {/* Member picker */}
        <div>
          <label className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-1.5">
            Send to member
          </label>
          {selected ? (
            <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-gold/40 bg-gold-muted px-3 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center shrink-0">
                  <Check size={15} className="text-gold" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text truncate">{selected.name}</p>
                  <p className="text-xs text-text-dim truncate">{selected.company ?? selected.email}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Change</Button>
            </div>
          ) : (
            <>
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search members by name, company or email…"
                  className="pl-9"
                />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-[var(--radius-md)] border border-border divide-y divide-border">
                {loadingMembers ? (
                  <div className="flex items-center gap-2 text-sm text-text-muted p-4">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading members…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="p-4 text-sm text-text-dim flex items-center gap-2">
                    <User size={14} /> No members match.
                  </div>
                ) : (
                  filtered.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => pick(m)}
                      className="w-full text-left px-3 py-2.5 hover:bg-surface-2 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-text truncate">{m.name}</p>
                        <p className="text-xs text-text-dim truncate">{m.company ?? m.email}</p>
                      </div>
                      {!m.email && <span className="text-[10px] text-accent-warm shrink-0">no email</span>}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {selected && (
          <Input
            label="Signer email"
            type="email"
            value={signerEmail}
            onChange={(e) => setSignerEmail(e.target.value)}
            hint="DocuSign sends the signing link here."
          />
        )}

        <Input label="Email subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea
          label="Message to signer (optional)"
          placeholder="A short note shown in the DocuSign email."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button>
        <Button
          icon={sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          disabled={sending || !selected}
          onClick={submit}
        >
          {sending ? 'Sending…' : 'Send for signature'}
        </Button>
      </div>
    </Modal>
  )
}
