import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import type { DashboardData } from '../../lib/api'

type RecentUpcoming = DashboardData['recentUpcoming']

function ActivityList({ title, items }: { title: string; items: RecentUpcoming['upcoming'] }) {
  return (
    <div>
      <p className="mb-3 text-sm font-medium">{title}</p>
      {items.length ? (
        <ul className="divide-y divide-line border-y border-line">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <Link className="flex items-start justify-between gap-4 py-3 hover:text-muted" to={item.href ?? '#'}>
                <span>
                  <span className="block text-sm font-medium">{item.title}</span>
                  <span className="mt-1 block font-mono text-xs text-muted">{item.context ?? item.kind} · {item.date}</span>
                </span>
                <ArrowUpRight aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Nothing to show.</p>
      )}
    </div>
  )
}

export function RecentUpcomingSection({ recentUpcoming }: { recentUpcoming: RecentUpcoming }) {
  return (
    <section aria-labelledby="recent-heading" className="space-y-5">
      <div className="border-b border-line pb-3">
        <h2 id="recent-heading" className="hm-label">Recent &amp; Upcoming</h2>
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <ActivityList title="Upcoming" items={recentUpcoming.upcoming} />
        <ActivityList title="Recent" items={recentUpcoming.recent} />
      </div>
    </section>
  )
}
