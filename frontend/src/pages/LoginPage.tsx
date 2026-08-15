import { LockKeyhole } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { LoadingScreen } from '../components/LoadingScreen'
import { Button } from '../components/ui/Button'
import { FeedbackBanner } from '../components/ui/Feedback'
import { FormField, TextInput } from '../components/ui/FormControls'
import { ThemeToggle } from '../components/ui/ThemeToggle'

export function LoginPage() {
  const { login, message: authMessage, status } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const displayedError = formError ?? authMessage

  if (status === 'initializing') {
    return <LoadingScreen />
  }

  if (status === 'authenticated') {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    if (!email.trim() || !password) {
      setFormError('Enter both your email and password.')
      return
    }

    setIsSubmitting(true)

    try {
      const result = await login(email.trim(), password)

      if (!result.ok) {
        setFormError(result.message ?? 'Sign in failed. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="w-full min-w-0 overflow-x-clip bg-canvas lg:grid lg:min-h-screen lg:grid-cols-[minmax(24rem,0.9fr)_minmax(32rem,1.1fr)]">
      <section className="relative hidden overflow-hidden border-r border-line bg-surface px-12 py-12 lg:flex lg:flex-col lg:justify-between xl:px-16">
        <div aria-hidden="true" className="hm-halftone absolute -right-24 bottom-12 h-80 w-80 rounded-full opacity-80" />
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-control border border-ink bg-ink font-mono text-sm font-semibold text-canvas">
            H
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Horizon Church</p>
            <p className="mt-0.5 font-mono text-[0.625rem] tracking-[0.08em] text-muted uppercase">Leaders workspace</p>
          </div>
        </div>
        <div className="relative z-10 max-w-lg pb-10">
          <p className="hm-label">
            01 — Church operations
          </p>
          <h1 className="mt-6 max-w-md font-display text-4xl leading-[1.05] font-medium tracking-[-0.055em] text-ink xl:text-5xl">
            Clear tools for thoughtful leadership.
          </h1>
          <p className="mt-6 max-w-sm text-[0.9375rem] leading-7 text-muted">
            Horizon keeps the operational workspace calm, readable, and focused on
            the people church leaders serve.
          </p>
        </div>
      </section>

      <section className="relative grid min-w-0 min-h-screen place-items-center px-4 py-10 sm:px-8 lg:min-h-0">
        <ThemeToggle compact className="absolute top-5 right-5 w-28 max-w-[calc(100vw-2.5rem)]" />
        <div className="w-full min-w-0 max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid size-10 place-items-center rounded-control border border-ink bg-ink font-mono text-sm font-semibold text-canvas">
              H
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Horizon Church</p>
              <p className="mt-0.5 font-mono text-[0.625rem] tracking-[0.08em] text-muted uppercase">Leaders workspace</p>
            </div>
          </div>

          <div className="border-t border-line pt-7">
            <div className="grid size-10 place-items-center rounded-full border border-line-strong text-ink">
              <LockKeyhole aria-hidden="true" className="size-4" />
            </div>
            <p className="hm-label mt-7">Secure staff access</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink">
              Staff sign in
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Use your controlled Horizon staff account to continue.
            </p>

            <form className="mt-8 min-w-0 space-y-5" onSubmit={handleSubmit} noValidate>
              <FormField id="email" label="Email" required>
                <TextInput
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(displayedError)}
                  aria-describedby={displayedError ? 'login-error' : undefined}
                  required
                />
              </FormField>

              <FormField id="password" label="Password" required>
                <TextInput
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(displayedError)}
                  aria-describedby={displayedError ? 'login-error' : undefined}
                  required
                />
              </FormField>

              {displayedError && (
                <div id="login-error">
                  <FeedbackBanner tone="error">{displayedError}</FeedbackBanner>
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                isLoading={isSubmitting}
                className="w-full"
              >
                {isSubmitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </div>

          <p className="mt-7 font-mono text-[0.625rem] leading-5 tracking-[0.06em] text-muted uppercase">
            Access is limited to active Horizon staff accounts.
          </p>
        </div>
      </section>
    </main>
  )
}
