import { useState } from 'react'

import { useAuth } from '../auth/useAuth'
import { AutomationStatusPanel } from '../components/dashboard/AutomationStatusPanel'
import { DashboardSummary } from '../components/dashboard/DashboardSummary'
import { MemberSnapshotSection } from '../components/dashboard/MemberSnapshotSection'
import { NeedsAttentionSection } from '../components/dashboard/NeedsAttentionSection'
import { OpenCellSummary } from '../components/dashboard/OpenCellSummary'
import { RecentUpcomingSection } from '../components/dashboard/RecentUpcomingSection'
import { SundayAttendanceSection } from '../components/dashboard/SundayAttendanceSection'
import { useDashboard } from '../components/dashboard/useDashboard'
import { Button } from '../components/ui/Button'
import { ErrorState, LoadingState } from '../components/ui/Feedback'
import { FormField, Select } from '../components/ui/FormControls'
import { PageHeader } from '../components/ui/PageHeader'
import type { DashboardPeriod, LifeGroup } from '../lib/api'
import { usePageTitle } from '../lib/usePageTitle'

function LifeGroupFilter({ lifeGroups, value, onChange }: { lifeGroups: LifeGroup[]; value: string; onChange: (lifeGroupId: string) => void }) {
  return (
    <FormField id="dashboard-life-group" label="Attendance Life Group">
      <Select id="dashboard-life-group" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All Life Groups</option>
        {lifeGroups.map((group) => (
          <option key={group.id} value={group.id}>{group.name}{group.isActive ? '' : ' (Archived)'}</option>
        ))}
      </Select>
    </FormField>
  )
}

export function DashboardPage() {
  usePageTitle('Dashboard')
  const { actor } = useAuth()
  const isAdmin = actor?.role === 'admin'
  const [period, setPeriod] = useState<DashboardPeriod>('8')
  const [lifeGroupId, setLifeGroupId] = useState('')
  const { data, lifeGroups, loading, error } = useDashboard({ isAdmin, period, lifeGroupId })

  if (loading && !data) return <LoadingState title="Loading Dashboard" description="Assembling the authorized operational view." />
  if (error && !data) return <ErrorState title="Dashboard could not be loaded" description={error} action={<Button onClick={() => window.location.reload()}>Try again</Button>} />
  if (!data) return null

  return (
    <div className="space-y-10">
      <PageHeader
        marker="01 — Overview"
        title="Dashboard"
        description={isAdmin ? 'Church-wide operational view' : 'Your Life Group and church-wide operations'}
        actions={isAdmin ? <LifeGroupFilter lifeGroups={lifeGroups} value={lifeGroupId} onChange={setLifeGroupId} /> : undefined}
      />
      {error && <p className="border-l-2 border-ink pl-3 text-sm text-muted" role="status">{error}</p>}
      <DashboardSummary isAdmin={isAdmin} isUnassignedLeader={data.isUnassignedLeader} metrics={data.metrics} period={period} onPeriodChange={setPeriod} />
      <SundayAttendanceSection data={data.sundayAttendance} isUnassignedLeader={data.isUnassignedLeader} />
      <NeedsAttentionSection needsAttention={data.needsAttention} />
      <RecentUpcomingSection recentUpcoming={data.recentUpcoming} />
      <MemberSnapshotSection snapshot={data.memberSnapshot} isUnassignedLeader={data.isUnassignedLeader} />
      <OpenCellSummary openCell={data.openCell} />
      {isAdmin && data.automation && <AutomationStatusPanel status={data.automation} />}
    </div>
  )
}
