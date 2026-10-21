'use client'

// Owner-only: grant / revoke chat oversight ("All chats" + Reports) to other
// admins and team members. Candidates are read straight from profiles
// (role admin | team_member, read-only select via the admin's supabase
// session); grants live on the chat server (GET/POST/DELETE /staff-access).

import { useQuery } from '@tanstack/react-query'
import { Loader2, ShieldCheck } from 'lucide-react'
import { ChatAvatar } from '@/components/ui/chat'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { useChat } from '@/lib/chat/ChatProvider'
import { chatKeys } from '@/lib/chat/keys'
import { useSetStaffAccess, useStaffAccess } from '@/lib/chat/hooks'
import { getApiErrorMessage } from '@/lib/http/chat-client'
import { toast } from '@/lib/hooks/use-toast'
import { supabase } from '@/lib/supabase/client'

interface StaffProfile {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  avatar_url: string | null
  role: string
}

export function TeamAccessPanel() {
  const { viewer } = useChat()
  const access = useStaffAccess()
  const setAccess = useSetStaffAccess()
  const candidates = useQuery({
    queryKey: chatKeys.staffCandidates(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, avatar_url, role')
        .in('role', ['admin', 'team_member'])
        .order('first_name')
      if (error) throw error
      return (data ?? []) as StaffProfile[]
    },
  })

  const granted = new Set((access.data ?? []).map((r) => r.profileId))
  const people = (candidates.data ?? []).filter((p) => p.id !== viewer?.id)

  function toggle(p: StaffProfile, grant: boolean) {
    const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email || 'Team member'
    setAccess.mutate(
      { profileId: p.id, grant },
      {
        onSuccess: () => toast({ title: grant ? `${name} can now oversee chats` : `Oversight removed for ${name}` }),
        onError: (e) => toast({ title: 'Couldn’t update access', description: getApiErrorMessage(e), variant: 'destructive' }),
      },
    )
  }

  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      <p className="mb-5 max-w-2xl text-sm leading-relaxed text-text-muted">
        People with oversight can read <strong className="font-medium text-text">every</strong> conversation (DMs, groups and
        event chats) in read-only mode and review reports. Opening a chat never marks it read or adds them to it.
        Only you can create and manage groups.
      </p>
      {candidates.isLoading || access.isLoading ? (
        <div className="flex justify-center py-16 text-text-dim">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : candidates.isError || access.isError ? (
        <p className="py-12 text-center text-sm text-text-muted">
          {getApiErrorMessage(candidates.error ?? access.error, 'Team access couldn’t be loaded.')}
        </p>
      ) : people.length === 0 ? (
        <AdminEmptyState icon={ShieldCheck} title="No team members yet" description="Invite admins or team members in Settings, then grant oversight here." />
      ) : (
        <Card className="divide-y divide-border p-0">
          {people.map((p) => {
            const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email || 'Team member'
            const has = granted.has(p.id)
            const busy = setAccess.isPending && setAccess.variables?.profileId === p.id
            return (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3.5">
                <ChatAvatar name={name} src={p.avatar_url} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{name}</p>
                  <p className="truncate text-xs text-text-dim">{p.email}</p>
                </div>
                <Badge variant={p.role === 'admin' ? 'info' : 'draft'}>{p.role === 'admin' ? 'Admin' : 'Team'}</Badge>
                {has && <Badge variant="active" dot>Oversight</Badge>}
                <Button
                  size="sm"
                  variant={has ? 'ghost' : 'secondary'}
                  loading={busy}
                  disabled={setAccess.isPending && !busy}
                  onClick={() => toggle(p, !has)}
                >
                  {has ? 'Revoke' : 'Grant'}
                </Button>
              </div>
            )
          })}
        </Card>
      )}
    </div>
  )
}
