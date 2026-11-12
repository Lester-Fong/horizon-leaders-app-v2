import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AuthContextValue } from './auth-context'
import { ProtectedRoute } from './ProtectedRoute'

const authState = vi.hoisted(() => ({ current: {} as Partial<AuthContextValue> }))

vi.mock('./useAuth', () => ({ useAuth: () => authState.current }))
vi.mock('../pages/ChangePasswordRequiredPage', () => ({
  ChangePasswordRequiredPage: () => <h1>Set your own password</h1>,
}))

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/login" element={<p>Login page</p>} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <p>App content</p>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

const actor = { id: 'user-1', name: 'Test Leader', role: 'leader' }

afterEach(cleanup)

describe('ProtectedRoute', () => {
  it('renders the forced change-password page when the actor must change password', () => {
    authState.current = {
      actor: { ...actor, mustChangePassword: true } as AuthContextValue['actor'],
      status: 'authenticated',
    }
    renderRoute()

    expect(screen.getByRole('heading', { name: 'Set your own password' })).toBeInTheDocument()
    expect(screen.queryByText('App content')).not.toBeInTheDocument()
  })

  it('renders the app when no password change is required', () => {
    authState.current = {
      actor: { ...actor, mustChangePassword: false } as AuthContextValue['actor'],
      status: 'authenticated',
    }
    renderRoute()

    expect(screen.getByText('App content')).toBeInTheDocument()
  })

  it('redirects to login when unauthenticated', () => {
    authState.current = { actor: null, status: 'unauthenticated' }
    renderRoute()

    expect(screen.getByText('Login page')).toBeInTheDocument()
  })
})
