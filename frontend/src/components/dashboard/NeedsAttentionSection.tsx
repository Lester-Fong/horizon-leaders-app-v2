import { Link } from 'react-router-dom'

import type { DashboardData } from '../../lib/api'

export function NeedsAttentionSection({ needsAttention }: { needsAttention: DashboardData['needsAttention'] }) {
  return (
    <section aria-labelledby="attention-heading" className="space-y-5">
      <div className="flex items-end justify-between border-b border-line pb-3">
        <h2 id="attention-heading" className="hm-label">Needs attention</h2>
        <Link className="text-sm font-medium text-ink underline decoration-line underline-offset-4" to="/follow-up">View Follow Ups</Link>
      </div>
      {needsAttention.total === 0 ? (
        <p className="text-sm text-muted">No active Follow Ups.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {needsAttention.byReason.map((row) => (
            <div key={row.key} className="border-b border-line py-3">
              <p className="text-sm text-ink">{row.label}</p>
              <p className="mt-2 font-mono text-2xl text-ink">{row.count}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
