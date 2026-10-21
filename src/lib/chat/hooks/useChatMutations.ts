// Chat mutations: DMs, joining/leaving, deleting, blocking and reporting for
// everyone; group management, report review and staff oversight for the
// owner/overseers (the server enforces who may call what — the UI just hides
// the controls). Results are patched into the cache rather than refetched
// wholesale; `conversation:updated` from the socket covers other tabs.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { chatClient } from '@/lib/http/chat-client'
import { useChat } from '../ChatProvider'
import type { ConversationDetail, PersonLookup, ReportPage, StaffAccessEntry } from '../contract'
import { chatKeys } from '../keys'
import { markMessageDeleted, removeConversation, upsertConversation } from '../cache'
import type { ReportStatus } from '../types'

function useDetailSync() {
  const qc = useQueryClient()
  return (detail: ConversationDetail) => {
    qc.setQueryData(chatKeys.conversation(detail.id), detail)
    upsertConversation(qc, detail, { moveToTop: false })
  }
}

// ── Everyone ─────────────────────────────────────────────────────────

export function useCreateDm() {
  const sync = useDetailSync()
  return useMutation({
    mutationFn: async (profileId: string) =>
      (await chatClient.post<ConversationDetail>('/conversations/dm', { profileId })).data,
    onSuccess: sync,
  })
}

export function useJoinConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => (await chatClient.post(`/conversations/${id}/join`)).data,
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: chatKeys.conversation(id) })
      qc.invalidateQueries({ queryKey: chatKeys.conversationLists() })
    },
  })
}

export function useLeaveConversation() {
  const qc = useQueryClient()
  const { viewer } = useChat()
  return useMutation({
    mutationFn: async (id: string) =>
      (await chatClient.delete(`/conversations/${id}/participants/${viewer?.id}`)).data,
    onSuccess: (_d, id) => {
      removeConversation(qc, id)
      qc.removeQueries({ queryKey: chatKeys.conversation(id) })
      qc.removeQueries({ queryKey: chatKeys.messages(id) })
    },
  })
}

export function useDeleteMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { conversationId: string; messageId: string }) =>
      (await chatClient.delete(`/messages/${v.messageId}`)).data,
    onSuccess: (_d, v) => markMessageDeleted(qc, v.conversationId, v.messageId),
  })
}

export function useBlock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { profileId: string; block: boolean }) =>
      v.block
        ? (await chatClient.post('/blocks', { profileId: v.profileId })).data
        : (await chatClient.delete(`/blocks/${v.profileId}`)).data,
    // Read-only state of the DM changes server-side; refresh the open detail.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat', 'conversation'] }),
  })
}

export function useReport() {
  return useMutation({
    mutationFn: async (v: { conversationId: string; messageId?: string; reason: string }) =>
      (await chatClient.post('/reports', v)).data,
  })
}

// ── Owner: groups ────────────────────────────────────────────────────

export function useCreateGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { title: string; description?: string; participantIds: string[]; isJoinable?: boolean }) =>
      (await chatClient.post<ConversationDetail>('/conversations/group', v)).data,
    onSuccess: (d) => {
      qc.setQueryData(chatKeys.conversation(d.id), d)
      upsertConversation(qc, d, { moveToTop: true })
    },
  })
}

export function useUpdateGroup() {
  const sync = useDetailSync()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; title?: string; description?: string | null; isJoinable?: boolean; archived?: boolean }) => {
      const { id, ...body } = v
      return (await chatClient.patch<ConversationDetail | { ok: true }>(`/conversations/${id}`, body)).data
    },
    onSuccess: (d, v) => {
      if (d && 'id' in d) sync(d)
      else qc.invalidateQueries({ queryKey: chatKeys.conversation(v.id) })
      if (v.archived) removeConversation(qc, v.id)
    },
  })
}

export function useAddParticipants() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; profileIds: string[] }) =>
      (await chatClient.post(`/conversations/${v.id}/participants`, { profileIds: v.profileIds })).data,
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: chatKeys.conversation(v.id) }),
  })
}

export function useRemoveParticipant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; profileId: string }) =>
      (await chatClient.delete(`/conversations/${v.id}/participants/${v.profileId}`)).data,
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: chatKeys.conversation(v.id) }),
  })
}

// ── Owner + overseers: reports ───────────────────────────────────────

export function useReports(status: ReportStatus | 'all' = 'open') {
  const { ready, viewer } = useChat()
  return useQuery({
    queryKey: chatKeys.reports(status),
    enabled: ready && !!viewer?.canOversee,
    queryFn: async ({ signal }) => {
      const { data } = await chatClient.get<ReportPage>('/reports', {
        signal,
        params: { status: status === 'all' ? undefined : status },
      })
      return data.reports ?? []
    },
  })
}

export function useUpdateReport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; status: ReportStatus }) =>
      (await chatClient.patch(`/reports/${v.id}`, { status: v.status })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat', 'reports'] }),
  })
}

// ── Owner: staff oversight access ────────────────────────────────────

export function useStaffAccess() {
  const { ready, viewer } = useChat()
  return useQuery({
    queryKey: chatKeys.staffAccess(),
    enabled: ready && !!viewer?.isOwner,
    queryFn: async ({ signal }) => {
      const { data } = await chatClient.get<{ staff: StaffAccessEntry[] }>('/staff-access', { signal })
      return data.staff ?? []
    },
  })
}

export function useSetStaffAccess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { profileId: string; grant: boolean }) =>
      v.grant
        ? (await chatClient.post('/staff-access', { profileId: v.profileId })).data
        : (await chatClient.delete(`/staff-access/${v.profileId}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.staffAccess() }),
  })
}

// ── Mute + single-person lookup ──────────────────────────────────────

/** Mute / unmute for me: still counted per conversation, left out of the badge. */
export function useMute() {
  const qc = useQueryClient()
  const { setMutedLocal } = useChat()
  return useMutation({
    mutationFn: async (v: { id: string; muted: boolean }) =>
      (await chatClient.post<ConversationDetail>(`/conversations/${v.id}/mute`, { muted: v.muted })).data,
    onMutate: (v) => setMutedLocal(v.id, v.muted),
    onError: (_e, v) => setMutedLocal(v.id, !v.muted),
    onSuccess: (d) => {
      qc.setQueryData(chatKeys.conversation(d.id), d)
      upsertConversation(qc, d, { moveToTop: false })
    },
  })
}

/** GET /people/:id — restores a draft DM (?to=) after reload. 404 = not someone you can message. */
export function usePerson(id: string | null, opts: { enabled?: boolean } = {}) {
  const { ready } = useChat()
  return useQuery({
    queryKey: chatKeys.person(id ?? ''),
    enabled: ready && !!id && (opts.enabled ?? true),
    retry: false,
    staleTime: 60_000,
    queryFn: async ({ signal }) => (await chatClient.get<PersonLookup>(`/people/${id}`, { signal })).data,
  })
}
