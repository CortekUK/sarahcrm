import { Navigate } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'

interface Props {
  children: React.ReactNode
}

/**
 * Wraps public-only pages (login). If already signed in, redirects to the
 * correct dashboard based on role.
 */
export function RedirectIfAuthenticated({ children }: Props) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading...</span>
        </div>
      </div>
    )
  }

  if (user) {
    if (profile?.role === 'admin') {
      return <Navigate to="/dashboard" replace />
    }
    return <Navigate to="/portal" replace />
  }

  return <>{children}</>
}
