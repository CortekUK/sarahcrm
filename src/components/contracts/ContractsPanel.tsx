'use client'

// Saved contracts list — lives inside the AI Templates screen under the
// "Contracts" filter. Shows each saved contract, the status of its latest
// e-signature send, and row actions (edit, send for signature, view document,
// refresh status, duplicate, delete). Self-contained so the email templates
// code path is untouched.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { toast } from '@/lib/hooks/use-toast'
import { formatDate } from '@/lib/utils'
import { SendContractModal } from './SendContractModal'
import { CONTRACT_DOC_TYPES } from '@/lib/contracts/editor-types'
import {
  FileSignature,
  Loader2,
  Edit,
  Send,
  Eye,
  RefreshCw,
  Copy,
  Trash2,
} from 'lucide-react'
import type { Database } from '@/types/database'

type ContractRow = Database['public']['Tables']['contract_templates']['Row']
type SignatureRow = Database['public']['Tables']['signature_requests']['Row']

const DOC_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  CONTRACT_DOC_TYPES.map((d) => [d.value, d.label]),
)

type BadgeVariant = 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'
const STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  created: { label: 'Draft', variant: 'draft' },
  sent: { label: 'Awaiting signature', variant: 'upcoming' },
  delivered: { label: 'Opened', variant: 'upcoming' },
  completed: { label: 'Signed', variant: 'active' },
  declined: { label: 'Declined', variant: 'urgent' },
  voided: { label: 'Voided', variant: 'draft' },
  error: { label: 'Needs attention', variant: 'urgent' },
}

interface LatestReq {
  id: string
  status: string
  signed_document_id: string | null
}

export function ContractsPanel({ search }: { search?: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [latest, setLatest] = useState<Record<string, LatestReq>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [sendTarget, setSendTarget] = useState<ContractRow | null>(null)

  // Silently pull the live DocuSign status for any not-yet-finished request and
  // update the row — so the list reflects "Signed" without a manual refresh
  // (and files the signed PDF). Settled requests are skipped, so this is a
  // no-op once everything is signed.
  const autoReconcile = useCallback(async (map: Record<string, LatestReq>) => {
    const pending = Object.entries(map).filter(
      ([, r]) =>
        !(r.status === 'declined' || r.status === 'voided' || (r.status === 'completed' && !!r.signed_document_id)),
    )
    if (pending.length === 0) return
    await Promise.all(
      pending.map(async ([cid, r]) => {
        try {
          const res = await fetch('/api/admin/signatures/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: r.id }),
          })
          if (!res.ok) return
          const json = await res.json()
          const updated: SignatureRow | undefined = json.requests?.[0]
          if (updated) {
            setLatest((m) => ({
              ...m,
              [cid]: { id: updated.id, status: updated.status, signed_document_id: updated.signed_document_id },
            }))
          }
        } catch {
          /* best-effort */
        }
      }),
    )
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: rows }, { data: reqs }] = await Promise.all([
      supabase.from('contract_templates').select('*').order('updated_at', { ascending: false }),
      supabase
        .from('signature_requests')
        .select('id, contract_template_id, status, signed_document_id, created_at')
        .not('contract_template_id', 'is', null)
        .order('created_at', { ascending: false }),
    ])
    setContracts(rows ?? [])
    // First (newest) request per contract wins.
    const map: Record<string, LatestReq> = {}
    for (const r of (reqs ?? []) as Pick<
      SignatureRow,
      'id' | 'contract_template_id' | 'status' | 'signed_document_id'
    >[]) {
      const cid = r.contract_template_id
      if (cid && !map[cid]) map[cid] = { id: r.id, status: r.status, signed_document_id: r.signed_document_id }
    }
    setLatest(map)
    setLoading(false)
    void autoReconcile(map)
  }, [autoReconcile])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const q = (search ?? '').trim().toLowerCase()
    if (!q) return contracts
    return contracts.filter((c) => c.name.toLowerCase().includes(q))
  }, [contracts, search])

  function edit(c: ContractRow) {
    router.push(`/dashboard/communications/contracts/editor?id=${c.id}`)
  }

  async function refreshStatus(c: ContractRow) {
    const req = latest[c.id]
    if (!req) return
    setBusyId(c.id)
    try {
      const res = await fetch('/api/admin/signatures/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: req.id }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not refresh', description: json.error, variant: 'destructive' })
        return
      }
      const updated: SignatureRow | undefined = json.requests?.[0]
      if (updated) {
        setLatest((m) => ({
          ...m,
          [c.id]: { id: updated.id, status: updated.status, signed_document_id: updated.signed_document_id },
        }))
      }
      toast({ title: 'Status updated' })
    } finally {
      setBusyId(null)
    }
  }

  function viewDoc(c: ContractRow) {
    const req = latest[c.id]
    if (!req) return
    window.open(`/api/admin/signatures/view?id=${req.id}`, '_blank', 'noopener,noreferrer')
  }

  async function duplicate(c: ContractRow) {
    setBusyId(c.id)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { error } = await supabase.from('contract_templates').insert({
        name: `${c.name} (copy)`,
        doc_type: c.doc_type,
        body_html: c.body_html,
        body_json: c.body_json,
        theme: c.theme,
        is_draft: true,
        created_by_id: user?.id,
      })
      if (error) {
        toast({ title: 'Could not duplicate', description: error.message, variant: 'destructive' })
        return
      }
      toast({ title: 'Contract duplicated' })
      load()
    } finally {
      setBusyId(null)
    }
  }

  async function remove(c: ContractRow) {
    const ok = await confirm({
      title: 'Delete this contract?',
      description: `"${c.name}" will be permanently removed. Sent envelopes already with members are unaffected.`,
      confirmLabel: 'Delete contract',
      tone: 'danger',
    })
    if (!ok) return
    const { error } = await supabase.from('contract_templates').delete().eq('id', c.id)
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' })
      return
    }
    setContracts((cs) => cs.filter((x) => x.id !== c.id))
    toast({ title: 'Contract deleted' })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {filtered.length} {filtered.length === 1 ? 'contract' : 'contracts'}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="h-5 w-5 animate-spin mx-auto text-text-dim" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gold-muted mb-4">
              <FileSignature className="h-5 w-5 text-gold" />
            </div>
            <h3 className="font-medium text-text mb-1">No contracts yet</h3>
            <p className="text-sm text-text-dim max-w-sm mx-auto">
              Click <span className="font-medium text-gold">New contract</span> to draft an agreement
              or NDA, then send it to a member for signature.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Signature status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-[220px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const req = latest[c.id]
                const meta = req ? (STATUS[req.status] ?? { label: req.status, variant: 'draft' as BadgeVariant }) : null
                const busy = busyId === c.id
                return (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => edit(c)}>
                    <TableCell className="font-medium text-text">{c.name}</TableCell>
                    <TableCell className="text-text-muted">
                      {DOC_TYPE_LABEL[c.doc_type] ?? c.doc_type}
                    </TableCell>
                    <TableCell>
                      {meta ? (
                        <Badge variant={meta.variant} dot>
                          {meta.label}
                        </Badge>
                      ) : (
                        <span className="text-xs text-text-dim">
                          {c.is_draft ? 'Draft · not sent' : 'Not sent'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-text-muted">{formatDate(c.updated_at)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-0.5">
                        <IconBtn title="Edit" onClick={() => edit(c)} icon={<Edit size={14} />} />
                        <IconBtn
                          title="Send for signature"
                          onClick={() => setSendTarget(c)}
                          icon={<Send size={14} />}
                          className="text-gold"
                        />
                        <IconBtn
                          title="View document"
                          onClick={() => viewDoc(c)}
                          icon={<Eye size={14} />}
                          disabled={!req}
                        />
                        <IconBtn
                          title="Refresh status"
                          onClick={() => refreshStatus(c)}
                          icon={busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                          disabled={!req || busy}
                        />
                        <IconBtn title="Duplicate" onClick={() => duplicate(c)} icon={<Copy size={14} />} disabled={busy} />
                        <IconBtn
                          title="Delete"
                          onClick={() => remove(c)}
                          icon={<Trash2 size={14} />}
                          className="text-accent-warm"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <SendContractModal
        contract={sendTarget ? { id: sendTarget.id, name: sendTarget.name, doc_type: sendTarget.doc_type } : null}
        open={!!sendTarget}
        onClose={() => setSendTarget(null)}
        onSent={load}
      />
    </Card>
  )
}

function IconBtn({
  title,
  onClick,
  icon,
  disabled,
  className,
}: {
  title: string
  onClick: () => void
  icon: React.ReactNode
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`p-1.5 rounded hover:bg-surface-2 text-text-muted disabled:opacity-30 disabled:cursor-not-allowed ${className ?? ''}`}
    >
      {icon}
    </button>
  )
}
