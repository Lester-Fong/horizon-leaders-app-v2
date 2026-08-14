import { LockKeyhole } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { LoadingScreen } from '../components/LoadingScreen'
import { Button } from '../components/ui/Button'
import { FeedbackBanner } from '../components/ui/Feedback'
import { FormField, TextInput } from '../components/ui/FormControls'

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
    <main className="min-h-screen bg-canvas lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(32rem,1.1fr)]">
      <section className="hidden bg-primary-strong px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-white text-lg font-bold text-primary-strong">
            H
          </div>
          <div>
            <p className="font-bold">Horizon Church</p>
            <p className="text-sm text-white/70">Leaders workspace</p>
          </div>
        </div>
        <div className="max-w-lg pb-8">
          <p className="text-sm font-bold tracking-[0.2em] text-white/65 uppercase">
            Church operations
          </p>
          <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
            Clear tools for thoughtful leadership.
          </h1>
          <p className="mt-5 max-w-md text-base leading-7 text-white/75">
            Horizon keeps the operational workspace calm, readable, and focused on
            the people church leaders serve.
          </p>
        </div>
      </section>

      <section className="grid min-h-screen place-items-center px-4 py-10 sm:px-8 lg:min-h-0">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid size-10 place-items-center rounded-xl bg-primary text-lg font-bold text-white">
              H
            </div>
            <div>
              <p className="font-bold text-ink">Horizon Church</p>
              <p className="text-xs text-muted">Leaders workspace</p>
            </div>
          </div>

          <div className="rounded-card border border-line bg-surface p-6 shadow-soft sm:p-8">
            <div className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary">
              <LockKeyhole aria-hidden="true" className="size-5" />
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-tight text-ink">
              Staff sign in
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted">
              Use your controlled Horizon staff account to continue.
            </p>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
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

          <p className="mt-5 text-center text-xs leading-5 text-muted">
            Access is limited to active Horizon staff accounts.
          </p>
        </div>
      </section>
    </main>
  )
}
