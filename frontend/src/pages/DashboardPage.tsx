import { ArrowUpRight, BarChart3 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/Feedback'
import { FormField, Select } from '../components/ui/FormControls'
import { PageHeader } from '../components/ui/PageHeader'
import { ApiError, getDashboard, getLifeGroups, type DashboardData, type DashboardPeriod, type LifeGroup } from '../lib/api'
import { supabase } from '../lib/supabase'

async function accessToken() {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired.')
  return data.session.access_token
}

function Metric({ label, value, href }: { label: string; value: number; href: string }) {
  return <Link to={href} className="group border-b border-line py-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"><span className="hm-label">{label}</span><span className="mt-2 block text-3xl font-semibold tracking-tight text-ink">{value}</span><ArrowUpRight aria-hidden="true" className="mt-2 size-4 text-muted" /></Link>
}

function RateChart({ data }: { data: DashboardData['sundayAttendance'] }) {
  if (!data.points.length) return <EmptyState icon={BarChart3} title="No qualifying Sunday history" description="Closed, absence-counting Sunday Services will appear here once attendance is recorded." />
  const width = 720; const height = 220
  const values = data.points.map((point) => point.rate ?? 0)
  const points = data.points.map((_, index) => `${(index / Math.max(1, data.points.length - 1)) * width},${height - (values[index] / 100) * (height - 24)}`).join(' ')
  return <div><div className="flex items-baseline justify-between gap-4 border-b border-line pb-3"><span className="hm-label">Attendance rate</span><span className="font-mono text-sm text-muted">Average {data.averageRate === null ? '—' : `${data.averageRate}%`}</span></div><svg className="mt-6 h-56 w-full text-ink" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Sunday attendance rate over time"><line x1="0" y1={height} x2={width} y2={height} stroke="currentColor" strokeOpacity=".16" /><polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" />{data.points.map((point, index) => <circle key={point.eventId} cx={(index / Math.max(1, data.points.length - 1)) * width} cy={height - (values[index] / 100) * (height - 24)} r="4" fill="currentColor"><title>{point.date}: {point.rate === null ? 'No eligible Members' : `${point.rate}%`} ({point.presentCount}/{point.eligibleCount})</title></circle>)}</svg><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Sunday attendance data">{data.points.map((point) => <div key={point.eventId} className="font-mono text-xs text-muted">{point.date} · {point.rate === null ? '—' : `${point.rate}%`} · {point.presentCount}/{point.eligibleCount}</div>)}</div></div>
}

function Breakdown({ rows }: { rows: DashboardData['memberSnapshot']['gender'] }) {
  return <div className="space-y-3">{rows.map((row) => <div key={row.key}><div className="flex justify-between gap-3 text-sm"><span>{row.label}</span><span className="font-mono text-xs text-muted">{row.count} · {row.percentage}%</span></div><div className="mt-1 h-1 bg-surface"><div className="h-1 bg-ink" style={{ width: `${row.percentage}%` }} /></div></div>)}</div>
}

function Activity({ title, items }: { title: string; items: DashboardData['recentUpcoming']['upcoming'] }) {
  return <div><p className="mb-3 text-sm font-medium">{title}</p>{items.length ? <ul className="divide-y divide-line border-y border-line">{items.map((item) => <li key={`${item.kind}-${item.id}`}><Link className="flex items-start justify-between gap-4 py-3 hover:text-muted" to={item.href ?? '#'}><span><span className="block text-sm font-medium">{item.title}</span><span className="mt-1 block font-mono text-xs text-muted">{item.context ?? item.kind} · {item.date}</span></span><ArrowUpRight aria-hidden="true" className="mt-0.5 size-4 shrink-0" /></Link></li>)}</ul> : <p className="text-sm text-muted">Nothing to show.</p>}</div>
}

export function DashboardPage() {
  const { actor } = useAuth(); const isAdmin = actor?.role === 'admin'
  const [data, setData] = useState<DashboardData | null>(null); const [lifeGroups, setLifeGroups] = useState<LifeGroup[]>([])
  const [period, setPeriod] = useState<DashboardPeriod>('8'); const [lifeGroupId, setLifeGroupId] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null)
  useEffect(() => { let cancelled = false; void (async () => { setLoading(true); setError(null); try { const token = await accessToken(); const [dashboard, groups] = await Promise.all([getDashboard(token, period, isAdmin && lifeGroupId ? lifeGroupId : undefined), isAdmin ? getLifeGroups(token) : Promise.resolve([])]); if (!cancelled) { setData(dashboard); setLifeGroups(groups) } } catch (reason) { if (!cancelled) setError(reason instanceof ApiError ? reason.message : 'Dashboard data is unavailable right now.') } finally { if (!cancelled) setLoading(false) } })(); return () => { cancelled = true } }, [isAdmin, lifeGroupId, period])
  if (loading && !data) return <LoadingState title="Loading Dashboard" description="Assembling the authorized operational view." />
  if (error && !data) return <ErrorState title="Dashboard could not be loaded" description={error} action={<Button onClick={() => window.location.reload()}>Try again</Button>} />
  if (!data) return null
  const metrics = data.metrics
  return <div className="space-y-10"><PageHeader marker="01 — Overview" title="Dashboard" description={isAdmin ? 'Church-wide operational view' : 'Your Life Group and church-wide operations'} actions={isAdmin ? <FormField id="dashboard-life-group" label="Attendance Life Group"><Select id="dashboard-life-group" value={lifeGroupId} onChange={(event) => setLifeGroupId(event.target.value)}><option value="">All Life Groups</option>{lifeGroups.map((group) => <option key={group.id} value={group.id}>{group.name}{group.isActive ? '' : ' (Archived)'}</option>)}</Select></FormField> : undefined} />{error && <p className="border-l-2 border-ink pl-3 text-sm text-muted" role="status">{error}</p>}
    <section aria-labelledby="summary-heading"><div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-3"><h2 id="summary-heading" className="hm-label">Summary</h2><label className="flex items-center gap-2 text-xs text-muted">Period <select className="hm-control py-1" value={period} onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}><option value="4">Last 4 Sundays</option><option value="8">Last 8 Sundays</option><option value="12">Last 12 Sundays</option><option value="year">This year</option></select></label></div><div className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-5">{isAdmin ? <><Metric label="Active Members" value={metrics.activeMembers ?? 0} href="/members" /><Metric label="Active Visitors" value={metrics.activeVisitors ?? 0} href="/visitors" /><Metric label="Active Follow Ups" value={metrics.activeFollowUps} href="/follow-up" /><Metric label="New Visitors This Month" value={metrics.newVisitorsThisMonth ?? 0} href="/visitors" /><Metric label="Active OpenCell Programmes" value={metrics.activeOpenCellProgrammes} href="/opencell" /></> : <><Metric label="My Life Group Members" value={metrics.myLifeGroupMembers ?? 0} href="/members" /><Metric label="My Life Group Visitors" value={metrics.myLifeGroupVisitors ?? 0} href="/visitors" /><Metric label="Active Follow Ups" value={metrics.activeFollowUps} href="/follow-up" /><Metric label="Active OpenCell Programmes" value={metrics.activeOpenCellProgrammes} href="/opencell" /></>}</div></section>
    <section aria-labelledby="attendance-heading" className="space-y-5"><div className="flex items-end justify-between border-b border-line pb-3"><h2 id="attendance-heading" className="hm-label">Sunday attendance</h2><span className="font-mono text-xs text-muted">Frozen eligibility · qualifying Services</span></div><RateChart data={data.sundayAttendance} /></section>
    <section aria-labelledby="attention-heading" className="space-y-5"><div className="flex items-end justify-between border-b border-line pb-3"><h2 id="attention-heading" className="hm-label">Needs attention</h2><Link className="text-sm font-medium text-ink underline decoration-line underline-offset-4" to="/follow-up">View Follow Ups</Link></div>{data.needsAttention.total === 0 ? <p className="text-sm text-muted">No active Follow Ups.</p> : <div className="grid gap-4 sm:grid-cols-3">{data.needsAttention.byReason.map((row) => <div key={row.key} className="border-b border-line py-3"><p className="text-sm text-ink">{row.label}</p><p className="mt-2 font-mono text-2xl text-ink">{row.count}</p></div>)}</div>}</section>
    <section aria-labelledby="recent-heading" className="space-y-5"><div className="border-b border-line pb-3"><h2 id="recent-heading" className="hm-label">Recent &amp; Upcoming</h2></div><div className="grid gap-8 lg:grid-cols-2"><Activity title="Upcoming" items={data.recentUpcoming.upcoming} /><Activity title="Recent" items={data.recentUpcoming.recent} /></div></section>
    <section aria-labelledby="snapshot-heading" className="space-y-5"><div className="border-b border-line pb-3"><h2 id="snapshot-heading" className="hm-label">Member snapshot</h2><p className="mt-1 text-sm text-muted">Active Members only · derived from current records</p></div><div className="grid gap-10 lg:grid-cols-2"><div><p className="mb-4 text-sm font-medium">Gender</p><Breakdown rows={data.memberSnapshot.gender} /></div><div><p className="mb-4 text-sm font-medium">Age</p><Breakdown rows={data.memberSnapshot.age} /></div></div></section>
    <section aria-labelledby="opencell-heading" className="border-t border-line pt-6"><div className="flex items-center justify-between gap-4"><div><h2 id="opencell-heading" className="hm-label">OpenCell</h2><p className="mt-1 text-sm text-muted">Current active programme participation.</p></div><Link className="text-sm font-medium text-ink underline decoration-line underline-offset-4" to="/opencell">View OpenCell</Link></div><div className="mt-4 flex gap-10"><div><span className="hm-label">Active Programmes</span><p className="mt-1 text-2xl font-semibold">{data.openCell.activeProgrammes}</p></div><div><span className="hm-label">Current Participants</span><p className="mt-1 text-2xl font-semibold">{data.openCell.currentParticipants}</p></div></div></section>
  </div>
}
