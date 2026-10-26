import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

export function RequireAuth() {
  const { loading, user, configured } = useAuth()
  if (!configured) return <Navigate to="/" replace />
  if (loading) return <div className="page muted">Загрузка…</div>
  if (!user) return <Navigate to="/" replace />
  return <Outlet />
}

export function RequireApproved() {
  const { loading, profile } = useAuth()
  if (loading) return <div className="page muted">Загрузка…</div>
  if (!profile) return <Navigate to="/" replace />
  if (profile.status === 'pending') return <Navigate to="/pending" replace />
  if (profile.status === 'rejected') return <Navigate to="/pending" replace />
  if (profile.status !== 'approved') return <Navigate to="/pending" replace />
  return <Outlet />
}

export function RequireAdmin() {
  const { profile } = useAuth()
  if (profile?.role !== 'admin') return <Navigate to="/app" replace />
  return <Outlet />
}
