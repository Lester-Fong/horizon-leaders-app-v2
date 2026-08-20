import { CalendarDays, Eye, LockKeyhole, Pencil, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { SundayServiceFormModal, type ServiceFormContext } from '../components/events/SundayServiceFormModal'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, FeedbackBanner, LoadingState } from '../components/ui/Feedback'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import { RowActionsMenu, type RowAction } from '../components/ui/RowActionsMenu'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ApiError, closeSundayService, createSundayService, getSundayServices, updateSundayService, type SundayService, type SundayServiceInput } from '../lib/api'
import { supabase } from '../lib/supabase'

async function token() {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired.')
  return data.session.access_token
}
function message(error: unknown) { return error instanceof ApiError ? error.message : 'Sunday Service data is unavailable right now.' }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) }

export function EventsPage() {
  const { actor } = useAuth()
  const navigate = useNavigate()
  const isAdmin = actor?.role === 'admin'
  const [events, setEvents] = useState<SundayService[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [form, setForm] = useState<ServiceFormContext | null>(null)
  const [closing, setClosing] = useState<SundayService | null>(null)
  const [isClosing, setIsClosing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setEvents((await getSundayServices(await token())).events) }
    catch (caught) { setError(message(caught)) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  async function save(input: SundayServiceInput) {
    const accessToken = await token()
    return form?.mode === 'edit' ? updateSundayService(accessToken, form.event.id, input) : createSundayService(accessToken, input)
  }
  function saved(event: SundayService) {
    setNotice(`${event.title} was ${form?.mode === 'edit' ? 'updated' : 'created'}.`)
    setForm(null); void load()
  }
  async function confirmClose() {
    if (!closing) return
    setIsClosing(true); setError(null)
    try { await closeSundayService(await token(), closing.id); setNotice(`${closing.title} was closed and its eligible Member snapshot is fixed.`); setClosing(null); await load() }
    catch (caught) { setError(message(caught)); setClosing(null) }
    finally { setIsClosing(false) }
  }
  function actions(event: SundayService): RowAction[] {
    const result: RowAction[] = [{ icon: Eye, label: 'Open Service', onSelect: () => navigate(`/events/${event.id}`) }]
    if (isAdmin) result.push({ icon: Pencil, label: 'Edit', onSelect: () => setForm({ event, mode: 'edit' }) })
    if (isAdmin && event.status === 'open') result.push({ icon: LockKeyhole, label: 'Close Service', onSelect: () => setClosing(event) })
    return result
  }

  return (
    <div className="mx-auto w-full max-w-[82rem]">
      <PageHeader marker="Horizon / Sunday Service" title="Events" description="Create Sunday Services, operate attendance, and preserve close-time church records without mixing in Harvest or Other Event workflows." actions={<>{isAdmin && <Button onClick={() => setForm({ mode: 'create' })}><Plus className="size-4" aria-hidden="true" />New Service</Button>}<Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw className="size-4" aria-hidden="true" />Refresh</Button></>} />
      {notice && <FeedbackBanner className="mt-6" tone="success">{notice}</FeedbackBanner>}
      {error && !loading && events.length > 0 && <FeedbackBanner className="mt-6" tone="error">{error}</FeedbackBanner>}
      <section className="mt-8">
        {loading ? <LoadingState title="Loading Sunday Services" description="Preparing the Service directory." /> : error && events.length === 0 ? <ErrorState title="Sunday Services unavailable" description={error} action={<Button onClick={() => void load()}>Try again</Button>} /> : events.length === 0 ? <EmptyState icon={CalendarDays} title="No Sunday Services yet" description={isAdmin ? 'Create the first Service to begin attendance and Sunday Visitor registration.' : 'An Admin has not created a Sunday Service yet.'} action={isAdmin ? <Button onClick={() => setForm({ mode: 'create' })}><Plus className="size-4" aria-hidden="true" />New Service</Button> : undefined} /> : (
          <ResponsiveTable caption="Sunday Service directory" tableClassName="horizon-table--events">
            <thead><tr><th scope="col">Service</th><th scope="col">Date</th><th scope="col">Counting</th><th scope="col">Attendance</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{events.map((event) => <tr key={event.id}>
              <td className="event-cell-primary"><span className="font-semibold text-ink">{event.title}</span><span className="mt-1 block text-sm text-muted">{event.location ?? 'Location not set'}</span></td>
              <td className="event-cell-date"><span className="hm-table-mobile-label">Date</span><span className="text-sm text-ink">{formatDate(event.eventDate)}</span></td>
              <td className="event-cell-counting"><span className="hm-table-mobile-label">Counting</span><span className="text-sm text-muted">{event.countsForAbsence ? 'Counts for absence' : 'Excluded'}</span></td>
              <td className="event-cell-attendance"><span className="hm-table-mobile-label">Attendance</span><span className="font-mono text-xs text-muted">{event.attendanceCount} present · {event.visitorCount} visitors</span></td>
              <td className="event-cell-status"><span className="hm-table-mobile-label">Status</span><StatusBadge tone={event.status === 'open' ? 'success' : 'neutral'}>{event.status}</StatusBadge></td>
              <td className="event-cell-actions text-right"><RowActionsMenu label={`Actions for ${event.title}`} actions={actions(event)} /></td>
            </tr>)}</tbody>
          </ResponsiveTable>
        )}
      </section>
      {form && <SundayServiceFormModal context={form} onClose={() => setForm(null)} onSave={save} onSaved={saved} />}
      <Modal isOpen={Boolean(closing)} onClose={() => setClosing(null)} preventClose={isClosing} title="Close Sunday Service" description="Closing fixes the eligible Member and Life Group snapshot. Leaders become read-only; an Admin can still make corrections.">
        <p className="text-sm leading-6 text-muted">Close <strong className="text-ink">{closing?.title}</strong>? This Service cannot be reopened.</p>
        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={() => setClosing(null)} disabled={isClosing}>Cancel</Button><Button variant="destructive" isLoading={isClosing} onClick={() => void confirmClose()}>Close Service</Button></div>
      </Modal>
    </div>
  )
}
