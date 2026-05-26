'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { toast } from '@/lib/hooks/use-toast'
import { formatDate, cn } from '@/lib/utils'
import { ListChecks, Plus, Edit, Trash2, Search, Users, Crown } from 'lucide-react'
import type { Database } from '@/types/database'

type Audience = Database['public']['Tables']['audiences']['Row']
type Subscriber = Database['public']['Tables']['mailing_list']['Row']

interface AudienceWithCounts extends Audience {
  subscriber_count: number
  member_count: number
}

interface MemberRow {
  id: string
  membership_tier: string
  profiles: { first_name: string | null; last_name: string | null; email: string | null } | null
}

export function ListsTab() {
  const confirm = useConfirm()
  const [audiences, setAudiences] = useState<AudienceWithCounts[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Audience | null>(null)

  useEffect(() => {
    fetchAudiences()
  }, [])

  async function fetchAudiences() {
    setLoading(true)
    const { data: lists, error } = await supabase
      .from('audiences')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      toast({ title: 'Failed to load lists', description: error.message, variant: 'destructive' })
      setLoading(false)
      return
    }
    // Fetch counts per audience in parallel.
    const enriched = await Promise.all(
      (lists ?? []).map(async (l) => {
        const { data: rows } = await supabase
          .from('audience_members')
          .select('subscriber_id, member_id')
          .eq('audience_id', l.id)
        const subscriber_count = (rows ?? []).filter((r) => r.subscriber_id).length
        const member_count = (rows ?? []).filter((r) => r.member_id).length
        return { ...l, subscriber_count, member_count }
      }),
    )
    setAudiences(enriched)
    setLoading(false)
  }

  async function createAudience(name: string, description: string) {
    const { data, error } = await supabase
      .from('audiences')
      .insert({ name, description: description || null })
      .select()
      .single()
    if (error || !data) {
      toast({ title: 'Could not create list', description: error?.message, variant: 'destructive' })
      return
    }
    setAudiences((prev) => [{ ...data, subscriber_count: 0, member_count: 0 }, ...prev])
    setCreateOpen(false)
    setEditTarget(data)
    toast({ title: 'List created — now add recipients' })
  }

  async function deleteAudience(a: AudienceWithCounts) {
    const ok = await confirm({
      title: `Delete "${a.name}"?`,
      description:
        'The list is removed but the underlying subscribers and members remain. Past campaigns sent to this list keep their send history.',
      tone: 'danger',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    const { error } = await supabase.from('audiences').delete().eq('id', a.id)
    if (error) {
      toast({ title: 'Failed', description: error.message, variant: 'destructive' })
      return
    }
    setAudiences((prev) => prev.filter((x) => x.id !== a.id))
    toast({ title: 'List deleted' })
  }

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-text-muted">
          Reusable recipient lists. Each list can mix newsletter subscribers and approved members.
        </p>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={14} />
          New list
        </Button>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-text-dim">Loading…</CardContent>
        </Card>
      ) : audiences.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <AdminEmptyState
              icon={ListChecks}
              title="No lists yet"
              description="Create a list to group subscribers and/or members for targeted campaigns."
              action={
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus size={14} />
                  Create the first list
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {audiences.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-[family-name:var(--font-heading)] text-base font-semibold text-text truncate">
                      {a.name}
                    </h3>
                    {a.description && (
                      <p className="text-xs text-text-muted mt-1 line-clamp-2">{a.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditTarget(a)}
                      className="p-1.5 rounded text-text-dim hover:text-text hover:bg-surface-2"
                      title="Edit list"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteAudience(a)}
                      className="p-1.5 rounded text-text-dim hover:text-accent-warm hover:bg-surface-2"
                      title="Delete list"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-4">
                  <Badge variant="info">
                    <Users size={10} className="mr-1" />
                    {a.subscriber_count} subscribers
                  </Badge>
                  <Badge variant="active">
                    <Crown size={10} className="mr-1" />
                    {a.member_count} members
                  </Badge>
                </div>
                <p className="text-[11px] text-text-dim mt-4">
                  Created {formatDate(a.created_at)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateAudienceModal onClose={() => setCreateOpen(false)} onCreate={createAudience} />
      )}
      {editTarget && (
        <AudienceEditorModal
          audience={editTarget}
          onClose={() => {
            setEditTarget(null)
            fetchAudiences()
          }}
        />
      )}
    </>
  )
}

// ─── Create modal ───────────────────────────────────────────────────

function CreateAudienceModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (name: string, description: string) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  return (
    <Modal open onClose={onClose} title="New audience" size="md">
      <div className="space-y-4">
        <div>
          <label className="text-xs text-text-muted">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. London members + press"
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs text-text-muted">Description (optional)</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Who is this list for, what gets sent to them?"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onCreate(name.trim(), description.trim())} disabled={!name.trim()}>
            Create
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Membership editor ──────────────────────────────────────────────
// The single most important UI in this whole flow. Two tabs side by
// side — subscribers and members — each with a search + ticky checkbox.
// Currently selected rows are highlighted; toggling instantly upserts
// or deletes the audience_members row.

function AudienceEditorModal({
  audience,
  onClose,
}: {
  audience: Audience
  onClose: () => void
}) {
  const [tab, setTab] = useState<'subscribers' | 'members'>('subscribers')
  const [search, setSearch] = useState('')
  const [subs, setSubs] = useState<Subscriber[]>([])
  const [members, setMembers] = useState<MemberRow[]>([])
  const [pickedSubs, setPickedSubs] = useState<Set<string>>(new Set())
  const [pickedMembers, setPickedMembers] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [subsRes, membersRes, currentRes] = await Promise.all([
        supabase
          .from('mailing_list')
          .select('*')
          .is('unsubscribed_at', null)
          .order('subscribed_at', { ascending: false }),
        supabase
          .from('members')
          .select(
            'id, membership_tier, profiles(first_name, last_name, email)',
          )
          .eq('membership_status', 'active')
          .is('deleted_at', null),
        supabase
          .from('audience_members')
          .select('subscriber_id, member_id')
          .eq('audience_id', audience.id),
      ])
      if (cancelled) return
      setSubs((subsRes.data ?? []) as Subscriber[])
      setMembers((membersRes.data ?? []) as unknown as MemberRow[])
      const ps = new Set<string>()
      const pm = new Set<string>()
      for (const r of currentRes.data ?? []) {
        if (r.subscriber_id) ps.add(r.subscriber_id)
        if (r.member_id) pm.add(r.member_id)
      }
      setPickedSubs(ps)
      setPickedMembers(pm)
      setLoading(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [audience.id])

  async function toggleSub(id: string) {
    if (pickedSubs.has(id)) {
      const { error } = await supabase
        .from('audience_members')
        .delete()
        .eq('audience_id', audience.id)
        .eq('subscriber_id', id)
      if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' })
      setPickedSubs((p) => {
        const n = new Set(p)
        n.delete(id)
        return n
      })
    } else {
      const { error } = await supabase
        .from('audience_members')
        .insert({ audience_id: audience.id, subscriber_id: id })
      if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' })
      setPickedSubs((p) => new Set(p).add(id))
    }
  }

  async function toggleMember(id: string) {
    if (pickedMembers.has(id)) {
      const { error } = await supabase
        .from('audience_members')
        .delete()
        .eq('audience_id', audience.id)
        .eq('member_id', id)
      if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' })
      setPickedMembers((p) => {
        const n = new Set(p)
        n.delete(id)
        return n
      })
    } else {
      const { error } = await supabase
        .from('audience_members')
        .insert({ audience_id: audience.id, member_id: id })
      if (error) return toast({ title: 'Failed', description: error.message, variant: 'destructive' })
      setPickedMembers((p) => new Set(p).add(id))
    }
  }

  const filteredSubs = useMemo(() => {
    const t = search.trim().toLowerCase()
    if (!t) return subs
    return subs.filter(
      (s) =>
        s.email.toLowerCase().includes(t) ||
        `${s.first_name} ${s.last_name}`.toLowerCase().includes(t),
    )
  }, [subs, search])

  const filteredMembers = useMemo(() => {
    const t = search.trim().toLowerCase()
    if (!t) return members
    return members.filter((m) => {
      const name = `${m.profiles?.first_name ?? ''} ${m.profiles?.last_name ?? ''}`.toLowerCase()
      const email = (m.profiles?.email ?? '').toLowerCase()
      return name.includes(t) || email.includes(t)
    })
  }, [members, search])

  return (
    <Modal open onClose={onClose} title={audience.name} size="xl">
      <div className="space-y-4">
        <div className="flex items-center gap-1.5 border-b border-border">
          <SubTab active={tab === 'subscribers'} onClick={() => setTab('subscribers')}>
            <Users size={12} />
            Subscribers ({pickedSubs.size})
          </SubTab>
          <SubTab active={tab === 'members'} onClick={() => setTab('members')}>
            <Crown size={12} />
            Members ({pickedMembers.size})
          </SubTab>
        </div>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === 'subscribers' ? 'Search subscribers…' : 'Search members…'}
            className="pl-9"
          />
        </div>

        <div className="max-h-[420px] overflow-y-auto border border-border rounded-md divide-y divide-border">
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-text-dim">Loading…</div>
          ) : tab === 'subscribers' ? (
            filteredSubs.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-text-dim">
                {subs.length === 0 ? 'No active subscribers yet.' : 'No matches for that search.'}
              </div>
            ) : (
              filteredSubs.map((s) => (
                <PickerRow
                  key={s.id}
                  checked={pickedSubs.has(s.id)}
                  onToggle={() => toggleSub(s.id)}
                  title={`${s.first_name} ${s.last_name}`}
                  subtitle={s.email}
                />
              ))
            )
          ) : filteredMembers.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-dim">
              {members.length === 0
                ? 'No active members yet.'
                : 'No matches for that search.'}
            </div>
          ) : (
            filteredMembers.map((m) => {
              const name =
                `${m.profiles?.first_name ?? ''} ${m.profiles?.last_name ?? ''}`.trim() ||
                'Unnamed'
              return (
                <PickerRow
                  key={m.id}
                  checked={pickedMembers.has(m.id)}
                  onToggle={() => toggleMember(m.id)}
                  title={name}
                  subtitle={m.profiles?.email ?? '—'}
                  rightChip={m.membership_tier.replace('_', ' ')}
                />
              )
            })
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function SubTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-2 -mb-px border-b-2 text-xs uppercase tracking-[0.16em] transition-colors',
        active
          ? 'border-gold text-gold'
          : 'border-transparent text-text-muted hover:text-text',
      )}
    >
      {children}
    </button>
  )
}

function PickerRow({
  checked,
  onToggle,
  title,
  subtitle,
  rightChip,
}: {
  checked: boolean
  onToggle: () => void
  title: string
  subtitle: string
  rightChip?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
        checked ? 'bg-gold-muted/40' : 'hover:bg-surface-2',
      )}
    >
      <span
        className={cn(
          'shrink-0 w-4 h-4 border flex items-center justify-center text-[10px] font-bold',
          checked ? 'bg-gold border-gold text-ink' : 'border-border',
        )}
      >
        {checked ? '✓' : ''}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text truncate">{title}</p>
        <p className="text-xs text-text-dim truncate">{subtitle}</p>
      </div>
      {rightChip && (
        <span className="text-[10px] uppercase tracking-[0.14em] text-text-muted capitalize">
          {rightChip}
        </span>
      )}
    </button>
  )
}
