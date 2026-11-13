import { ArrowLeft } from 'lucide-react'

import { LinkButton } from '../components/ui/Button'
import { ErrorState } from '../components/ui/Feedback'
import { usePageTitle } from '../lib/usePageTitle'

export function NotFoundPage() {
  usePageTitle('Page not found')
  return (
    <ErrorState
      code="404"
      title="Page not found"
      description="The page you requested does not exist in Horizon or may have moved."
      action={
        <LinkButton to="/">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Return to Dashboard
        </LinkButton>
      }
    />
  )
}
