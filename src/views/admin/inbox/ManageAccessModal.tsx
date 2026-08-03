'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/hooks/use-toast'
import { Check, Loader2 } from 'lucide-react'

interface AccessUser {
  id: string
  name: string
  email: string
  role: string
}
interface CatalogMailbox {
  email: string
  label: string
}
interface Grant {
  profile_id: string
  mailbox: string
}

// Admin-only panel: pick a staff user, then tick/untick which of the catalog
// inboxes they can read. Each toggle POSTs grant/revoke immediately and updates
// local state — no rebuild needed to change who sees what.
export function ManageAccessModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState<AccessUser[]>([])
  const [catalog, setCatalog] = useState<CatalogMailbox[]>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('')
  const [pending, setPending] = useState<string | null>(null) // mailbox mid-toggle

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/inbox/access')
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      setUsers(data.users ?? [])
      setCatalog(data.catalog ?? [])
      setGrants(data.grants ?? [])
    } catch {
      toast({
        title: 'Could not load access settings',
        description: 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const grantedSet = useMemo(() => {
    const s = new Set<string>()
    for (const g of grants) if (g.profile_id === selectedUser) s.add(g.mailbox)
    return s
  }, [grants, selectedUser])

  async function toggle(mailbox: string, granted: boolean) {
    if (!selectedUser) return
    const action = granted ? 'revoke' : 'grant'
    setPending(mailbox)
    try {
      const res = await fetch('/api/admin/inbox/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, profile_id: selectedUser, mailbox }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setGrants((prev) =>
        action === 'grant'
          ? [...prev, { profile_id: selectedUser, mailbox }]
          : prev.filter((g) => !(g.profile_id === selectedUser && g.mailbox === mailbox)),
      )
      toast({ title: action === 'grant' ? 'Access granted' : 'Access revoked' })
    } catch {
      toast({
        title: 'Update failed',
        description: 'The change was not saved.',
        variant: 'destructive',
      })
    } finally {
      setPending(null)
    }
  }

  const userOptions = users.map((u) => ({
    value: u.id,
    label: `${u.name} · ${u.email}`,
  }))

  const selectedName = users.find((u) => u.id === selectedUser)?.name

  return (
    <Modal open={open} onClose={onClose} title="Manage inbox access" size="md">
      {loading ? (
        <p className="py-8 text-center text-sm text-text-dim">Loading…</p>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-text-muted">
            Pick a CRM user, then choose which inboxes they can read. Admins already see every
            inbox.
          </p>

          <Select
            label="Staff member"
            placeholder="Select a user…"
            options={userOptions}
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
          />

          {!selectedUser ? (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-border py-10 text-center">
              <p className="text-sm text-text-dim">
                Choose a staff member above to manage their inbox access.
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
                  Inboxes {selectedName ? `for ${selectedName}` : ''}
                </p>
                <span className="text-xs text-text-dim tabular-nums">
                  {grantedSet.size} of {catalog.length} granted
                </span>
              </div>
              <ul className="max-h-[340px] space-y-1.5 overflow-y-auto pr-1">
                {catalog.map((mb) => {
                  const granted = grantedSet.has(mb.email)
                  const busy = pending === mb.email
                  return (
                    <li key={mb.email}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => toggle(mb.email, granted)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-[var(--radius-md)] border px-3.5 py-2.5 text-left transition-colors disabled:opacity-60',
                          granted
                            ? 'border-gold bg-gold-muted'
                            : 'border-border hover:bg-surface-2',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors',
                            granted ? 'border-gold bg-gold text-white' : 'border-border',
                          )}
                        >
                          {busy ? (
                            <Loader2 size={12} className="animate-spin text-text-dim" />
                          ) : granted ? (
                            <Check size={13} strokeWidth={2.5} />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-text">
                            {mb.label}
                          </span>
                          <span className="block truncate text-xs text-text-dim">{mb.email}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
