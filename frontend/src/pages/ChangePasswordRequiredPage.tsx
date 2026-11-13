import { KeyRound } from 'lucide-react'

import { useAuth } from '../auth/useAuth'
import { ChangePasswordForm } from '../components/users/ChangePasswordForm'
import { Button } from '../components/ui/Button'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { usePageTitle } from '../lib/usePageTitle'

/** Shown instead of the app while the account still uses a password an Admin set. */
export function ChangePasswordRequiredPage() {
  usePageTitle('Set your password')
  const { actor, logout } = useAuth()

  return (
    <main className="relative grid min-h-screen w-full min-w-0 place-items-center overflow-x-clip bg-canvas px-4 py-10 sm:px-8">
      <ThemeToggle compact className="absolute top-5 right-5 w-28 max-w-[calc(100vw-2.5rem)]" />
      <div className="w-full min-w-0 max-w-md">
        <div className="border-t border-line pt-7">
          <div className="grid size-10 place-items-center rounded-full border border-line-strong text-ink">
            <KeyRound aria-hidden="true" className="size-4" />
          </div>
          <p className="hm-label mt-7">Account security</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-ink">
            Set your own password
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {actor ? `Welcome, ${actor.name}. ` : ''}
            Your password was set by an Admin. Choose a new one that only you know before
            continuing to Horizon.
          </p>
          <div className="mt-8">
            <ChangePasswordForm submitLabel="Save and continue" />
          </div>
        </div>
        <Button variant="ghost" className="mt-6" onClick={() => void logout()}>
          Sign out
        </Button>
      </div>
    </main>
  )
}
