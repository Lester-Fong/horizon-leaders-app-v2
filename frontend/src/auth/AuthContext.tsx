import type { Session } from '@supabase/supabase-js'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import {
  ApiError,
  getCurrentActor,
} from '../lib/api'
import { supabase } from '../lib/supabase'
import {
  AuthContext,
  type AuthActionResult,
  type AuthState,
} from './auth-context'

interface SessionResolution {
  promise: Promise<AuthActionResult>
  token: string
}

const INITIAL_AUTH_STATE: AuthState = {
  actor: null,
  message: null,
  status: 'initializing',
}

function getSessionFailureMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === 'ACCOUNT_INACTIVE') {
      return 'Your Horizon account is disabled. Contact an administrator.'
    }

    if (error.code === 'PROFILE_NOT_FOUND') {
      return 'Horizon access is not configured for this account.'
    }

    if (error.status === 401) {
      return 'Your session has expired. Please sign in again.'
    }
  }

  return 'Horizon is unavailable right now. Please try again.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>(INITIAL_AUTH_STATE)
  const sessionResolution = useRef<SessionResolution | undefined>(undefined)
  const signedOutMessage = useRef<string | undefined>(undefined)

  const clearRejectedSession = useCallback((message: string) => {
    signedOutMessage.current = message
    setAuthState({ actor: null, message, status: 'unauthenticated' })
    void supabase.auth.signOut({ scope: 'local' })
  }, [])

  const resolveSession = useCallback(
    (session: Session | null): Promise<AuthActionResult> => {
      if (!session) {
        sessionResolution.current = undefined
        const message = signedOutMessage.current
        setAuthState({
          actor: null,
          message: message ?? null,
          status: 'unauthenticated',
        })
        return Promise.resolve({ ok: false, ...(message ? { message } : {}) })
      }

      if (sessionResolution.current?.token === session.access_token) {
        return sessionResolution.current.promise
      }

      setAuthState({ actor: null, message: null, status: 'initializing' })

      const promise = getCurrentActor(session.access_token)
        .then((actor) => {
          signedOutMessage.current = undefined
          setAuthState({ actor, message: null, status: 'authenticated' })
          return { ok: true }
        })
        .catch((error: unknown) => {
          const message = getSessionFailureMessage(error)

          if (
            error instanceof ApiError &&
            (error.status === 401 || error.status === 403)
          ) {
            clearRejectedSession(message)
          } else {
            setAuthState({ actor: null, message, status: 'unauthenticated' })
          }

          return { message, ok: false }
        })

      sessionResolution.current = {
        promise,
        token: session.access_token,
      }
      return promise
    },
    [clearRejectedSession],
  )

  useEffect(() => {
    let isMounted = true

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) {
        return
      }

      if (error) {
        clearRejectedSession(
          'Your session could not be restored. Please sign in again.',
        )
        return
      }

      void resolveSession(data.session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        if (isMounted) {
          void resolveSession(session)
        }
      }, 0)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [clearRejectedSession, resolveSession])

  const login = useCallback(
    async (email: string, password: string): Promise<AuthActionResult> => {
      signedOutMessage.current = undefined
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error || !data.session) {
          const message =
            error?.code === 'invalid_credentials'
              ? 'Email or password is incorrect.'
              : 'Sign in is unavailable right now. Please try again.'
          setAuthState({ actor: null, message, status: 'unauthenticated' })
          return { message, ok: false }
        }

        return resolveSession(data.session)
      } catch {
        const message = 'Sign in is unavailable right now. Please try again.'
        setAuthState({ actor: null, message, status: 'unauthenticated' })
        return { message, ok: false }
      }
    },
    [resolveSession],
  )

  const logout = useCallback(async () => {
    signedOutMessage.current = undefined
    sessionResolution.current = undefined
    await supabase.auth.signOut({ scope: 'local' })
    setAuthState({ actor: null, message: null, status: 'unauthenticated' })
  }, [])

  const value = useMemo(
    () => ({ ...authState, login, logout }),
    [authState, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
