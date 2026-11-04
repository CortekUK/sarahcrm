'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/types/database'

type Profile = Database['public']['Tables']['profiles']['Row']

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  // The profile row loaded (or loading) for this user id. getSession() and the
  // INITIAL_SESSION event both report the same user, and TOKEN_REFRESHED fires
  // hourly — none of those should refetch the profile or hand consumers a new
  // user object (pages keyed on `user` would reload).
  const profileFor = useRef<string | null>(null)

  useEffect(() => {
    function apply(session: Session | null, event?: string) {
      const next = session?.user ?? null
      setSession(session)
      setUser((prev) =>
        prev && next && prev.id === next.id && event !== 'USER_UPDATED' ? prev : next,
      )
      if (!next) {
        profileFor.current = null
        setProfile(null)
        setLoading(false)
        return
      }
      if (profileFor.current !== next.id || event === 'USER_UPDATED') {
        profileFor.current = next.id
        fetchProfile(next.id)
      }
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => apply(session))

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => apply(session, event),
    )

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (profileFor.current !== userId) return
    setProfile(data)
    setLoading(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
