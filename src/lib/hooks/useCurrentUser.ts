'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface CurrentUser {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  full_name: string | null
  role: 'admin' | 'member'
  avatar_url: string | null
}

export function useCurrentUser() {
  const supabase = createClient()
  return useQuery<CurrentUser | null>({
    queryKey: ['current-user'],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return null
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, role, avatar_url')
        .eq('id', user.id)
        .single()
      if (!profile) return null
      const fullName = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
      return {
        id: profile.id,
        email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        full_name: fullName || null,
        role: profile.role,
        avatar_url: profile.avatar_url,
      } as CurrentUser
    },
  })
}
