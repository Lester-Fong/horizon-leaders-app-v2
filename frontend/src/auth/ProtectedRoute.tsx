import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { LoadingScreen } from '../components/LoadingScreen'
import { useAuth } from './useAuth'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth()

  if (status === 'initializing') {
    return <LoadingScreen />
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }

  return children
}
