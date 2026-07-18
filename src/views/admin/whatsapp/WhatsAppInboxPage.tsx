'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { MessageCircle } from 'lucide-react'
import { ConversationList } from './ConversationList'
import { ConversationThread } from './ConversationThread'
import { ReplyComposer } from './ReplyComposer'
import { NewConversationModal } from './NewConversationModal'
import {
  type ContactRow,
  type WaLogRow,
  type MemberMatch,
  phoneKey,
} from './shared'

interface MemberLite {
  memberId: string
  name: string
  key: string // last-9-digits phone key
}

const LIST_POLL_MS = 8000
const THREAD_POLL_MS = 5000

// WhatsApp team inbox — two-pane, web.whatsapp-style. Left: conversation list
// from whatsapp_contacts. Right: the selected thread (whatsapp_log grouped by
// to_phone) + a window-aware composer.
export function WhatsAppInboxPage() {
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [members, setMembers] = useState<MemberLite[]>([])
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [messages, setMessages] = useState<WaLogRow[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  const selectedRef = useRef<string | null>(null)
  selectedRef.current = selectedPhone

  // ── Data loads ────────────────────────────────────────────────────
  const loadContacts = useCallback(async () => {
    const { data } = await supabase
      .from('whatsapp_contacts')
      .select('*')
      .order('last_message_at', { ascending: false, nullsFirst: false })
    setContacts((data ?? []) as ContactRow[])
    setLoadingList(false)
  }, [])

  const loadMembers = useCallback(async () => {
    // Members carry no phone directly — it lives on their linked profile.
    const { data } = await supabase
      .from('members')
      .select('id, profiles(first_name, last_name, phone)')
      .is('deleted_at', null)
    if (!data) return
    const list: MemberLite[] = []
    for (const m of data) {
      const p = (
        m as { id: string; profiles: { first_name: string | null; last_name: string | null; phone: string | null } | null }
      ).profiles
      const key = phoneKey(p?.phone)
      if (!key) continue
      const name = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || 'Member'
      list.push({ memberId: (m as { id: string }).id, name, key })
    }
    setMembers(list)
  }, [])

  const loadThread = useCallback(async (phone: string) => {
    const { data } = await supabase
      .from('whatsapp_log')
      .select('id, to_phone, direction, template_name, body, status, created_at, whatsapp_message_id')
      .eq('to_phone', phone)
      .order('created_at', { ascending: true })
    setMessages((data ?? []) as WaLogRow[])
  }, [])

  useEffect(() => {
    loadContacts()
    loadMembers()
  }, [loadContacts, loadMembers])

  // Polling — list every 8s, open thread every 5s.
  useEffect(() => {
    const listId = setInterval(loadContacts, LIST_POLL_MS)
    const threadId = setInterval(() => {
      if (selectedRef.current) loadThread(selectedRef.current)
    }, THREAD_POLL_MS)
    return () => {
      clearInterval(listId)
      clearInterval(threadId)
    }
  }, [loadContacts, loadThread])

  // ── Member name resolution (suffix-match on last 9 digits) ─────────
  const memberByKey = useMemo(() => {
    const map: Record<string, MemberLite> = {}
    for (const m of members) if (!map[m.key]) map[m.key] = m
    return map
  }, [members])

  const resolveName = useCallback(
    (c: ContactRow): { label: string; match: MemberMatch | null } => {
      const m = memberByKey[phoneKey(c.phone)]
      if (m) return { label: m.name, match: { memberId: m.memberId, name: m.name } }
      if (c.display_name) return { label: c.display_name, match: null }
      return { label: `+${c.phone}`, match: null }
    },
    [memberByKey],
  )

  // ── Select a thread → clear unread, load messages ──────────────────
  const selectPhone = useCallback(
    async (phone: string) => {
      setSelectedPhone(phone)
      await loadThread(phone)
      // Optimistically clear the unread badge, then persist.
      setContacts((prev) =>
        prev.map((c) => (c.phone === phone ? { ...c, unread_count: 0 } : c)),
      )
      await supabase
        .from('whatsapp_contacts')
        .update({ unread_count: 0, admin_read_at: new Date().toISOString() })
        .eq('phone', phone)
    },
    [loadThread],
  )

  const refreshAfterSend = useCallback(async () => {
    const phone = selectedRef.current
    await Promise.all([loadContacts(), phone ? loadThread(phone) : Promise.resolve()])
  }, [loadContacts, loadThread])

  const handleStarted = useCallback(
    async (phone: string) => {
      setModalOpen(false)
      await loadContacts()
      await selectPhone(phone)
    },
    [loadContacts, selectPhone],
  )

  const selectedContact = useMemo(
    () => contacts.find((c) => c.phone === selectedPhone) ?? null,
    [contacts, selectedPhone],
  )
  const resolved = selectedContact ? resolveName(selectedContact) : null

  return (
    <div className="flex h-screen overflow-hidden">
      <ConversationList
        contacts={contacts}
        selectedPhone={selectedPhone}
        onSelect={selectPhone}
        onNew={() => setModalOpen(true)}
        resolveName={resolveName}
        loading={loadingList}
      />

      <div className="flex min-w-0 flex-1 flex-col bg-surface-2/40">
        {!selectedPhone || !resolved ? (
          <div className="flex flex-1 items-center justify-center">
            <AdminEmptyState
              icon={MessageCircle}
              title="Select a conversation"
              description="Choose a conversation on the left to read the thread and reply — or start a new one."
            />
          </div>
        ) : (
          <>
            <ConversationThread
              phone={selectedPhone}
              label={resolved.label}
              match={resolved.match}
              messages={messages}
            />
            <ReplyComposer phone={selectedPhone} messages={messages} onSent={refreshAfterSend} />
          </>
        )}
      </div>

      <NewConversationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onStarted={handleStarted}
      />
    </div>
  )
}
