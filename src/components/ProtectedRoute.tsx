import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'

interface ProtectedRouteProps {
  requiredRole?: 'admin' | 'member'
  redirectTo?: string
}

export function ProtectedRoute({
  requiredRole,
  redirectTo = '/login',
}: ProtectedRouteProps) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

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

  // Not authenticated — redirect to login with return URL
  if (!user) {
    return <Navigate to={redirectTo} state={{ from: location.pathname }} replace />
  }

  // Authenticated but wrong role — redirect to the correct dashboard
  if (requiredRole && profile?.role !== requiredRole) {
    if (profile?.role === 'admin') {
      return <Navigate to="/dashboard" replace />
    }
    return <Navigate to="/portal" replace />
  }

  return <Outlet />
}
