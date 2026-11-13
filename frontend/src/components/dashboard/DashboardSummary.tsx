import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { DashboardData, DashboardPeriod } from '../../lib/api'
import { Select } from '../ui/FormControls'
import { UnassignedLeaderNote } from './UnassignedLeaderNote'

function Metric({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link to={href} className="group border-b border-line py-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">
      <span className="hm-label">{label}</span>
      <span className="mt-2 block text-3xl font-semibold tracking-tight text-ink">{value}</span>
      <ArrowUpRight aria-hidden="true" className="mt-2 size-4 text-muted" />
    </Link>
  )
}

function AdminMetrics({ metrics }: { metrics: DashboardData['metrics'] }) {
  return (
    <>
      <Metric label="Active Members" value={metrics.activeMembers ?? 0} href="/members" />
      <Metric label="Active Visitors" value={metrics.activeVisitors ?? 0} href="/visitors" />
      <Metric label="Active Follow Ups" value={metrics.activeFollowUps} href="/follow-up" />
      <Metric label="New Visitors This Month" value={metrics.newVisitorsThisMonth ?? 0} href="/visitors" />
      <Metric label="Active OpenCell Programmes" value={metrics.activeOpenCellProgrammes} href="/opencell" />
    </>
  )
}

function LeaderMetrics({ metrics }: { metrics: DashboardData['metrics'] }) {
  return (
    <>
      <Metric label="My Life Group Members" value={metrics.myLifeGroupMembers ?? 0} href="/members" />
      <Metric label="My Life Group Visitors" value={metrics.myLifeGroupVisitors ?? 0} href="/visitors" />
      <Metric label="Active Follow Ups" value={metrics.activeFollowUps} href="/follow-up" />
      <Metric label="Active OpenCell Programmes" value={metrics.activeOpenCellProgrammes} href="/opencell" />
    </>
  )
}

export function DashboardSummary({
  isAdmin,
  isUnassignedLeader,
  metrics,
  period,
  onPeriodChange,
}: {
  isAdmin: boolean
  isUnassignedLeader?: boolean
  metrics: DashboardData['metrics']
  period: DashboardPeriod
  onPeriodChange: (period: DashboardPeriod) => void
}) {
  return (
    <section aria-labelledby="summary-heading">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-3">
        <h2 id="summary-heading" className="hm-label">Summary</h2>
        <label className="flex items-center gap-2 text-xs text-muted-strong">
          Period{' '}
          <Select className="min-h-9 w-auto py-1 text-xs" value={period} onChange={(event) => onPeriodChange(event.target.value as DashboardPeriod)}>
            <option value="4">Last 4 Sundays</option>
            <option value="8">Last 8 Sundays</option>
            <option value="12">Last 12 Sundays</option>
            <option value="year">This year</option>
          </Select>
        </label>
      </div>
      <div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-5">
        {isAdmin ? <AdminMetrics metrics={metrics} /> : <LeaderMetrics metrics={metrics} />}
      </div>
      {isUnassignedLeader && (
        <div className="mt-4">
          <UnassignedLeaderNote />
        </div>
      )}
    </section>
  )
}
