import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { UserProfileDetails } from '../components/users/UserProfileDetails'
import { Button } from '../components/ui/Button'
import { ErrorState, FeedbackBanner, LoadingState } from '../components/ui/Feedback'
import { PageHeader } from '../components/ui/PageHeader'
import { ApiError, getMyProfile, type ManagedUser } from '../lib/api'
import { getAccessToken } from '../lib/session'

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  return 'Your profile is unavailable right now. Please try again.'
}

export function ProfilePage() {
  const [profile, setProfile] = useState<ManagedUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadProfile = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      setProfile(await getMyProfile(await getAccessToken()))
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void loadProfile(), 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadProfile])

  if (isLoading && !profile) {
    return <LoadingState title="Loading your profile" description="Retrieving your staff account details." />
  }

  if (!profile) {
    return (
      <ErrorState
        title="Your profile could not be loaded"
        description={loadError ?? 'Please try again.'}
        action={<Button onClick={() => void loadProfile()}>Try again</Button>}
      />
    )
  }

  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader
        marker="Account"
        title="My profile"
        description="Your Horizon staff account details."
        actions={
          <Button variant="secondary" onClick={() => void loadProfile()} isLoading={isLoading}>
            <RefreshCw aria-hidden="true" className="size-4" />
            Refresh
          </Button>
        }
      />
      {loadError && <FeedbackBanner tone="error">{loadError}</FeedbackBanner>}
      <UserProfileDetails user={profile} />
      <FeedbackBanner tone="info">
        To change your name, email, role, or password, ask a Horizon Admin.
      </FeedbackBanner>
    </div>
  )
}
