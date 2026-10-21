'use client'

// The short "reason / desired outcome" form a member fills before an
// introduction request goes to The Club. Shared by the Members and Wider
// network halves of the directory; the caller decides where it's sent.

import { useEffect, useState } from 'react'
import { Handshake } from 'lucide-react'
import {
  PortalButton,
  PortalField,
  PortalModal,
  PortalTextarea,
} from '@/components/portal/PortalChrome'

interface Props {
  open: boolean
  targetName: string
  onClose: () => void
  // Resolve with an error message to show, or null on success.
  onSubmit: (reason: string, desiredOutcome: string) => Promise<string | null>
}

export function RequestIntroModal({ open, targetName, onClose, onSubmit }: Props) {
  const [reason, setReason] = useState('')
  const [outcome, setOutcome] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setReason('')
      setOutcome('')
      setError(null)
    }
  }, [open])

  async function submit() {
    if (sending) return
    const r = reason.trim()
    if (!r) {
      setError('Please share a reason for the introduction.')
      return
    }
    setError(null)
    setSending(true)
    try {
      const err = await onSubmit(r, outcome.trim())
      if (err) setError(err)
    } finally {
      setSending(false)
    }
  }

  return (
    <PortalModal open={open} onClose={() => !sending && onClose()} size="md">
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.35rem,2vw,1.65rem)] text-ivory leading-tight">
            Request an introduction
          </h2>
          {targetName && (
            <p className="mt-2 font-[family-name:var(--font-editorial)] italic text-[13.5px] text-slate-haze break-words">
              to {targetName}
            </p>
          )}
        </div>

        <PortalField label="Reason for introduction" hint="Shared with The Club, in confidence.">
          <PortalTextarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why would you like to be introduced?"
            rows={3}
            maxLength={2000}
          />
        </PortalField>

        <PortalField label="Desired outcome" hint="Optional — what you hope comes of it.">
          <PortalTextarea
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder="What would a good introduction lead to?"
            rows={3}
            maxLength={2000}
          />
        </PortalField>

        <div>
          <PortalButton
            className="w-full justify-center"
            icon={<Handshake size={14} strokeWidth={1.5} />}
            onClick={submit}
            loading={sending}
          >
            Send request to The Club
          </PortalButton>
          {error && (
            <p className="mt-2 text-center text-[12px] text-rose-300/90 day:text-rose-700">{error}</p>
          )}
        </div>
      </div>
    </PortalModal>
  )
}
