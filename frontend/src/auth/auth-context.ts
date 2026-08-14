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

export interface AuthContextValue extends AuthState {
  login(email: string, password: string): Promise<AuthActionResult>
  logout(): Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)
