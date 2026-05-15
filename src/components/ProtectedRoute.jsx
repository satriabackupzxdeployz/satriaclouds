import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <div style={{ color: '#536471' }}>Memuat SatriaClouds...</div>
      </div>
    )
  }

  if (!user) return <Navigate to="/" replace />

  return children
}
