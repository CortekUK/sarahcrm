'use client'

// Owner-only group tools. `mode="create"` → title, description, joinable and
// starting members (POST /conversations/group). `mode="edit"` → rename,
// description, joinable, add/remove members, archive (PATCH + participants).
// The server enforces owner-only; this modal is only offered to the owner.

import { useEffect, useState } from 'react'
import { Archive, UserMinus, UserPlus } from 'lucide-react'
import { ChatAvatar } from '@/components/ui/chat'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import type { ConversationDetail } from '@/lib/chat/contract'
import {
  useAddParticipants,
  useConversation,
  useCreateGroup,
  useRemoveParticipant,
  useUpdateGroup,
} from '@/lib/chat/hooks'
import { getApiErrorMessage } from '@/lib/http/chat-client'
import { toast } from '@/lib/hooks/use-toast'
import { cn } from '@/lib/utils'
import { PeoplePicker } from '@/views/chat/PeoplePicker'

function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-4 rounded-[var(--radius-md)] border border-border px-3.5 py-3 text-left hover:bg-surface-2"
    >
      <span>
        <span className="block text-sm font-medium text-text">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-text-dim">{hint}</span>}
      </span>
      <span className={cn('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-gold' : 'bg-surface-3')}>
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
    </button>
  )
}

export function GroupModal({
  open,
  mode,
  conversation: initial,
  onClose,
  onCreated,
}: {
  open: boolean
  mode: 'create' | 'edit'
  conversation?: ConversationDetail | null
  onClose: () => void
  onCreated?: (id: string) => void
}) {
  // Read the live detail so member add/remove reflects immediately.
  const live = useConversation(open && mode === 'edit' ? initial?.id ?? null : null)
  const conversation = live.data ?? initial
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [joinable, setJoinable] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [adding, setAdding] = useState(false)

  const create = useCreateGroup()
  const update = useUpdateGroup()
  const addPeople = useAddParticipants()
  const removePerson = useRemoveParticipant()

  useEffect(() => {
    if (!open) return
    setTitle(mode === 'edit' ? conversation?.title ?? '' : '')
    setDescription(mode === 'edit' ? conversation?.description ?? '' : '')
    setJoinable(mode === 'edit' ? !!conversation?.isJoinable : false)
    setPicked([])
    setAdding(false)
  }, [open, mode, conversation?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (title: string) => (e: unknown) =>
    toast({ title, description: getApiErrorMessage(e), variant: 'destructive' })

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  async function save() {
    if (!title.trim()) return
    try {
      if (mode === 'create') {
        const d = await create.mutateAsync({
          title: title.trim(),
          description: description.trim() || undefined,
          participantIds: picked,
          isJoinable: joinable,
        })
        toast({ title: 'Group created', description: d.title })
        onCreated?.(d.id)
        onClose()
      } else if (conversation) {
        await update.mutateAsync({
          id: conversation.id,
          title: title.trim(),
          description: description.trim() || null,
          isJoinable: joinable,
        })
        toast({ title: 'Group updated' })
        onClose()
      }
    } catch (e) {
      fail('Couldn’t save the group')(e)
    }
  }

  async function addPicked() {
    if (!conversation || picked.length === 0) return
    try {
      await addPeople.mutateAsync({ id: conversation.id, profileIds: picked })
      toast({ title: `Added ${picked.length} ${picked.length === 1 ? 'person' : 'people'}` })
      setPicked([])
      setAdding(false)
    } catch (e) {
      fail('Couldn’t add people')(e)
    }
  }

  async function archive() {
    if (!conversation) return
    try {
      await update.mutateAsync({ id: conversation.id, archived: !conversation.archivedAt })
      toast({ title: conversation.archivedAt ? 'Group restored' : 'Group archived' })
      onClose()
    } catch (e) {
      fail('Couldn’t archive')(e)
    }
  }

  const members = conversation?.participants ?? []

  return (
    <Modal open={open} onClose={onClose} title={mode === 'create' ? 'New group' : 'Group settings'} size="lg">
      <div className="space-y-4">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Manchester founders" />
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="min-h-[64px]"
          placeholder="What this group is for (optional)"
        />
        {!conversation?.isMain && (
          <Switch
            checked={joinable}
            onChange={setJoinable}
            label="Members can join themselves"
            hint="Joinable groups can be joined by any active member; otherwise only you add people."
          />
        )}

        {mode === 'create' ? (
          <div className="space-y-2">
            <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
              Members {picked.length > 0 && `· ${picked.length} selected`}
            </p>
            <PeoplePicker multi selectedIds={picked} onPick={(p) => toggle(p.id)} />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
                Members · {members.length}
              </p>
              {!conversation?.isMain && (
                <Button variant="ghost" size="sm" icon={<UserPlus size={13} />} onClick={() => setAdding((v) => !v)}>
                  {adding ? 'Done' : 'Add people'}
                </Button>
              )}
            </div>
            {adding ? (
              <>
                <PeoplePicker
                  multi
                  selectedIds={picked}
                  excludeIds={members.map((m) => m.id)}
                  onPick={(p) => toggle(p.id)}
                />
                <div className="flex justify-end">
                  <Button size="sm" disabled={picked.length === 0} loading={addPeople.isPending} onClick={addPicked}>
                    Add {picked.length || ''}
                  </Button>
                </div>
              </>
            ) : (
              <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto rounded-[var(--radius-md)] border border-border">
                {members.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                    <ChatAvatar name={p.name} src={p.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-text">{p.name}</span>
                    {p.role !== 'member' && <Badge variant={p.role === 'owner' ? 'upcoming' : 'info'}>{p.role === 'owner' ? 'Host' : 'Team'}</Badge>}
                    {p.role !== 'owner' && !conversation?.isMain && (
                      <button
                        type="button"
                        aria-label={`Remove ${p.name}`}
                        disabled={removePerson.isPending}
                        onClick={() =>
                          removePerson.mutate(
                            { id: conversation!.id, profileId: p.id },
                            { onError: fail('Couldn’t remove') },
                          )
                        }
                        className="flex h-7 w-7 items-center justify-center rounded-full text-text-dim hover:bg-accent-warm/10 hover:text-accent-warm"
                      >
                        <UserMinus size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
          {mode === 'edit' && conversation && !conversation.isMain ? (
            <Button variant="ghost" size="sm" icon={<Archive size={13} />} loading={update.isPending && update.variables?.archived !== undefined} onClick={archive}>
              {conversation.archivedAt ? 'Restore group' : 'Archive group'}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" disabled={!title.trim()} loading={create.isPending || (update.isPending && update.variables?.archived === undefined)} onClick={save}>
              {mode === 'create' ? 'Create group' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
