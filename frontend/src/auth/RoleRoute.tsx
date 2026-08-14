import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { LoadingState } from '../components/ui/Feedback'
import type { AppRole } from '../lib/api'
import { useAuth } from './useAuth'

interface RoleRouteProps {
  allowedRoles: readonly AppRole[]
  children: ReactNode
}

export function RoleRoute({ allowedRoles, children }: RoleRouteProps) {
  const { actor, status } = useAuth()
  const location = useLocation()

  if (status === 'initializing') {
    return <LoadingState title="Checking access" />
  }

  if (status === 'unauthenticated' || !actor) {
    return <Navigate to="/login" replace />
  }

  if (!allowedRoles.includes(actor.role)) {
    return (
      <Navigate
        to="/unauthorized"
        replace
        state={{ from: location.pathname }}
      />
    )
  }

  return children
}
