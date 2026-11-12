import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { LoadingScreen } from '../components/LoadingScreen'
import { ChangePasswordRequiredPage } from '../pages/ChangePasswordRequiredPage'
import { useAuth } from './useAuth'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { actor, status } = useAuth()

  if (status === 'initializing') {
    return <LoadingScreen />
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }

  // The API refuses other requests too; this keeps the app from loading pages that would fail.
  if (actor?.mustChangePassword) {
    return <ChangePasswordRequiredPage />
  }

  return children
}
