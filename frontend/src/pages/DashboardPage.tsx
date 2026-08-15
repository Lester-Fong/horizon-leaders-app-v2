import { LayoutDashboard } from 'lucide-react'

import { EmptyState } from '../components/ui/Feedback'
import { PageHeader } from '../components/ui/PageHeader'

export function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        marker="01 — Overview"
        title="Dashboard"
        description="Your starting point for Horizon church operations. Dashboard metrics and activity summaries will be defined in a later development phase."
      />
      <EmptyState
        icon={LayoutDashboard}
        title="Dashboard insights are intentionally deferred"
        description="This shell is ready for future dashboard content, but no metrics, records, or operational data are being simulated in Phase 3."
      />
    </div>
  )
}
