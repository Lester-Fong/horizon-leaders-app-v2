import { createContext } from 'react'

import type { HorizonActor } from '../lib/api'

export type AuthStatus = 'authenticated' | 'initializing' | 'unauthenticated'

export interface AuthState {
  actor: HorizonActor | null
  message: string | null
  status: AuthStatus
}

export interface AuthActionResult {
  message?: string
  ok: boolean
}

export interface LoginOptions {
  /** Replaces the sign-in failure message and clears the stale local session. */
  failureMessage?: string
}

export interface AuthContextValue extends AuthState {
  login(email: string, password: string, options?: LoginOptions): Promise<AuthActionResult>
  logout(): Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
