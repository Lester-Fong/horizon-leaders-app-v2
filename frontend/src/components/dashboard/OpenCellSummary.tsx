import { Link } from 'react-router-dom'

import type { DashboardData } from '../../lib/api'

export function OpenCellSummary({ openCell }: { openCell: DashboardData['openCell'] }) {
  return (
    <section aria-labelledby="opencell-heading" className="border-t border-line pt-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 id="opencell-heading" className="hm-label">OpenCell</h2>
          <p className="mt-1 text-sm text-muted">Current active programme participation.</p>
        </div>
        <Link className="text-sm font-medium text-ink underline decoration-line underline-offset-4" to="/opencell">View OpenCell</Link>
      </div>
      <div className="mt-4 flex gap-10">
        <div>
          <span className="hm-label">Active Programmes</span>
          <p className="mt-1 text-2xl font-semibold">{openCell.activeProgrammes}</p>
        </div>
        <div>
          <span className="hm-label">Current Participants</span>
          <p className="mt-1 text-2xl font-semibold">{openCell.currentParticipants}</p>
        </div>
      </div>
    </section>
  )
}
