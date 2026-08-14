import { ArrowLeft } from 'lucide-react'

import { LinkButton } from '../components/ui/Button'
import { ErrorState } from '../components/ui/Feedback'

export function UnauthorizedPage() {
  return (
    <ErrorState
      code="Access restricted"
      title="You do not have access to this page"
      description="This area is reserved for a different Horizon role. Frontend route visibility is a convenience; future feature APIs will still enforce authorization on the server."
      action={
        <LinkButton to="/" variant="secondary">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Return to Dashboard
        </LinkButton>
      }
    />
  )
}
