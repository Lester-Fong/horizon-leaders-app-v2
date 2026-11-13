import type { DashboardData } from '../../lib/api'
import { UnassignedLeaderNote } from './UnassignedLeaderNote'

type MemberSnapshot = DashboardData['memberSnapshot']

function Breakdown({ rows }: { rows: MemberSnapshot['gender'] }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.key}>
          <div className="flex justify-between gap-3 text-sm">
            <span>{row.label}</span>
            <span className="font-mono text-xs text-muted">{row.count} · {row.percentage}%</span>
          </div>
          <div className="mt-1 h-1 bg-surface">
            <div className="h-1 bg-ink" style={{ width: `${row.percentage}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function MemberSnapshotSection({ snapshot, isUnassignedLeader }: { snapshot: MemberSnapshot; isUnassignedLeader?: boolean }) {
  return (
    <section aria-labelledby="snapshot-heading" className="space-y-5">
      <div className="border-b border-line pb-3">
        <h2 id="snapshot-heading" className="hm-label">Member snapshot</h2>
        <p className="mt-1 text-sm text-muted">Active Members only · derived from current records</p>
      </div>
      {isUnassignedLeader ? (
        <UnassignedLeaderNote />
      ) : (
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="mb-4 text-sm font-medium">Gender</p>
            <Breakdown rows={snapshot.gender} />
          </div>
          <div>
            <p className="mb-4 text-sm font-medium">Age</p>
            <Breakdown rows={snapshot.age} />
          </div>
        </div>
      )}
    </section>
  )
}
