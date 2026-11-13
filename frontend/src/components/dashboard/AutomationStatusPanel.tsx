import { Link } from 'react-router-dom'

import type { AutomationRunStatus, DashboardAutomationStatus } from '../../lib/api'
import { formatCalendarDate, formatTimestampDateTime } from '../../lib/dates'

const STATUS_LABELS: Record<AutomationRunStatus, string> = {
  failed: 'Failed',
  partial: 'Partly failed',
  running: 'Running',
  succeeded: 'Succeeded',
}

/** Admin-only view of the daily Sunday absence reconciliation (DEC-067, DEC-079). */
export function AutomationStatusPanel({ status }: { status: DashboardAutomationStatus }) {
  const { lastRun, pendingServiceCount, pendingServices } = status
  const hiddenCount = pendingServiceCount - pendingServices.length

  return (
    <section aria-labelledby="automation-heading" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-3">
        <h2 id="automation-heading" className="hm-label">Sunday automation</h2>
        <span className="font-mono text-xs text-muted">Daily at 3:00 AM Manila</span>
      </div>
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-3">
        <div>
          <span className="hm-label">Last run</span>
          {lastRun ? (
            <>
              <p className="mt-2 text-xl font-semibold tracking-tight text-ink">{STATUS_LABELS[lastRun.status]}</p>
              <p className="mt-1 font-mono text-xs text-muted">{formatTimestampDateTime(lastRun.startedAt)}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">No automation runs yet</p>
          )}
        </div>
        {lastRun && (
          <div>
            <span className="hm-label">Processed · errors</span>
            <p className="mt-2 font-mono text-xl text-ink">{lastRun.processedCount} · {lastRun.errorCount}</p>
          </div>
        )}
        <div>
          <span className="hm-label">Awaiting retry</span>
          <p className="mt-2 font-mono text-xl text-ink">{pendingServiceCount}</p>
          <p className="mt-1 text-xs text-muted">Closed Sunday Services not yet evaluated</p>
        </div>
      </div>
      {lastRun?.errorSummary && (
        <p className="border-l-2 border-ink pl-3 font-mono text-xs break-words text-muted">{lastRun.errorSummary}</p>
      )}
      {pendingServices.length > 0 && (
        <ul aria-label="Sunday Services awaiting retry" className="divide-y divide-line border-y border-line">
          {pendingServices.map((service) => (
            <li key={service.eventId}>
              <Link className="flex items-baseline justify-between gap-4 py-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" to={`/events/${service.eventId}`}>
                <span className="min-w-0 truncate">{service.title}</span>
                <span className="shrink-0 font-mono text-xs text-muted">{formatCalendarDate(service.date)}</span>
              </Link>
            </li>
          ))}
          {hiddenCount > 0 && <li className="py-3 text-xs text-muted">and {hiddenCount} more</li>}
        </ul>
      )}
    </section>
  )
}
