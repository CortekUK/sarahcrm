'use client'

// Report a conversation or a single message to the Club team (owner +
// overseers review these in admin → Messages → Reports).

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { useReport } from '@/lib/chat/hooks'
import { getApiErrorMessage } from '@/lib/http/chat-client'
import { toast } from '@/lib/hooks/use-toast'

export function ReportModal({
  target,
  onClose,
}: {
  target: { conversationId: string; messageId?: string } | null
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const report = useReport()

  async function submit() {
    if (!target || !reason.trim()) return
    try {
      await report.mutateAsync({ ...target, reason: reason.trim() })
      toast({ title: 'Report sent', description: 'Thank you — the Club team will review it in confidence.' })
      setReason('')
      onClose()
    } catch (e) {
      toast({ title: 'Could not send report', description: getApiErrorMessage(e), variant: 'destructive' })
    }
  }

  return (
    <Modal open={!!target} onClose={onClose} title={target?.messageId ? 'Report message' : 'Report conversation'} size="md">
      <p className="mb-3 text-sm text-text-muted">
        Tell us what happened. Only the Club team sees reports — the other person isn’t notified.
      </p>
      <Textarea
        label="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. unsolicited sales pitch, inappropriate message…"
        rows={4}
      />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" loading={report.isPending} disabled={!reason.trim()} onClick={submit}>
          Send report
        </Button>
      </div>
    </Modal>
  )
}
