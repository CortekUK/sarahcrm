'use client'

// Post / comment body with @mentions: tokens render as gold `@Name`, plain
// text keeps the chat kit's linkified URLs. Only validated mentions (in the
// item's `mentions`) are interactive: in admin they open the member's record
// (looked up by profile on click; team members have none); the portal has no
// member deep link yet, so there they're a highlight only. A mention grants
// nothing else — no extra profile fields are fetched for members.

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Linkified } from '@/components/ui/chat'
import type { ChatPerson } from '@/lib/chat/contract'
import { segments } from '@/lib/feed/mentions'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/hooks/use-toast'

const MENTION = 'font-medium text-gold'

function AdminMention({ person, label }: { person: ChatPerson; label: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function open() {
    if (busy) return
    setBusy(true)
    const { data } = await supabase.from('members').select('id').eq('profile_id', person.id).is('deleted_at', null).limit(1).maybeSingle()
    setBusy(false)
    if (data?.id) router.push(`/dashboard/members/${data.id}`)
    else toast({ title: `${person.name} has no member record` })
  }
  return (
    <button type="button" onClick={open} className={`${MENTION} hover:underline`}>
      @{label}
    </button>
  )
}

export function RichText({ text, mentions }: { text: string; mentions?: ChatPerson[] }) {
  const admin = (usePathname() ?? '').startsWith('/dashboard')
  const people = new Map((mentions ?? []).map((p) => [p.id, p]))
  return (
    <>
      {segments(text).map((s, i) => {
        if (s.type === 'text') return <Linkified key={i} text={s.text} />
        const person = people.get(s.id)
        if (admin && person && !person.isAdmin) return <AdminMention key={i} person={person} label={s.name} />
        return (
          <span key={i} className={MENTION}>
            @{s.name}
          </span>
        )
      })}
    </>
  )
}
