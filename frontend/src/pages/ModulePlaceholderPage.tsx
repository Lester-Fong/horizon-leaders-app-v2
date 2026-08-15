import type { LucideIcon } from 'lucide-react'

import { EmptyState } from '../components/ui/Feedback'
import { PageHeader } from '../components/ui/PageHeader'

interface ModulePlaceholderPageProps {
  description: string
  icon: LucideIcon
  title: string
}

export function ModulePlaceholderPage({
  description,
  icon,
  title,
}: ModulePlaceholderPageProps) {
  return (
    <div className="space-y-8">
      <PageHeader
        marker="Horizon — Planned module"
        title={title}
        description={description}
      />
      <EmptyState
        icon={icon}
        title={`${title} is coming in a later phase`}
        description="This route establishes the application structure only. No records, tables, actions, or business behavior are implemented here yet."
      />
    </div>
  )
}
