import { BarChart3 } from 'lucide-react'

import type { DashboardData } from '../../lib/api'
import { EmptyState } from '../ui/Feedback'
import { CHART_HEIGHT, CHART_WIDTH, chartCoordinates, formatRate } from './attendanceChart'
import { UnassignedLeaderNote } from './UnassignedLeaderNote'

type SundayAttendance = DashboardData['sundayAttendance']

function AttendanceRateChart({ data }: { data: SundayAttendance }) {
  if (!data.points.length) {
    return <EmptyState icon={BarChart3} title="No qualifying Sunday history" description="Closed, absence-counting Sunday Services will appear here once attendance is recorded." />
  }
  const coordinates = chartCoordinates(data.points)
  const polylinePoints = coordinates.map(({ x, y }) => `${x},${y}`).join(' ')

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
        <span className="hm-label">Attendance rate</span>
        <span className="font-mono text-sm text-muted">Average {formatRate(data.averageRate, '—')}</span>
      </div>
      <svg className="mt-6 h-56 w-full text-ink" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label="Sunday attendance rate over time">
        <line x1="0" y1={CHART_HEIGHT} x2={CHART_WIDTH} y2={CHART_HEIGHT} stroke="currentColor" strokeOpacity=".16" />
        <polyline points={polylinePoints} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        {data.points.map((point, index) => (
          <circle key={point.eventId} cx={coordinates[index].x} cy={coordinates[index].y} r="4" fill="currentColor">
            <title>{point.date}: {formatRate(point.rate, 'No eligible Members')} ({point.presentCount}/{point.eligibleCount})</title>
          </circle>
        ))}
      </svg>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Sunday attendance data">
        {data.points.map((point) => (
          <div key={point.eventId} className="font-mono text-xs text-muted">
            {point.date} · {formatRate(point.rate, '—')} · {point.presentCount}/{point.eligibleCount}
          </div>
        ))}
      </div>
    </div>
  )
}

export function SundayAttendanceSection({ data, isUnassignedLeader }: { data: SundayAttendance; isUnassignedLeader?: boolean }) {
  return (
    <section aria-labelledby="attendance-heading" className="space-y-5">
      <div className="flex items-end justify-between border-b border-line pb-3">
        <h2 id="attendance-heading" className="hm-label">Sunday attendance</h2>
        <span className="font-mono text-xs text-muted">Frozen eligibility · qualifying Services</span>
      </div>
      {isUnassignedLeader ? <UnassignedLeaderNote /> : <AttendanceRateChart data={data} />}
    </section>
  )
}
