import { CalendarDays, Eye, LockKeyhole, Pencil, Plus, RefreshCw, Sprout } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { HarvestEventFormModal, type HarvestFormContext } from '../components/events/HarvestEventFormModal'
import { SundayServiceFormModal, type ServiceFormContext } from '../components/events/SundayServiceFormModal'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, FeedbackBanner, LoadingState } from '../components/ui/Feedback'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import { RowActionsMenu, type RowAction } from '../components/ui/RowActionsMenu'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ApiError, closeHarvestEvent, closeSundayService, createHarvestEvent, createSundayService, getHarvestEvents, getSundayServices, updateHarvestEvent, updateSundayService, type HarvestEvent, type HarvestEventInput, type SundayService, type SundayServiceInput } from '../lib/api'
import { supabase } from '../lib/supabase'

async function token() { const { data, error } = await supabase.auth.getSession(); if (error || !data.session) throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired.'); return data.session.access_token }
function message(error: unknown) { return error instanceof ApiError ? error.message : 'Event data is unavailable right now.' }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) }

type Directory = 'service' | 'harvest'
type ClosingEvent = { event: HarvestEvent; type: 'harvest' } | { event: SundayService; type: 'service' }

export function EventsPage() {
  const { actor } = useAuth(); const navigate = useNavigate(); const isAdmin = actor?.role === 'admin'
  const [directory, setDirectory] = useState<Directory>('service')
  const [services, setServices] = useState<SundayService[]>([]); const [harvests, setHarvests] = useState<HarvestEvent[]>([])
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null)
  const [serviceForm, setServiceForm] = useState<ServiceFormContext | null>(null); const [harvestForm, setHarvestForm] = useState<HarvestFormContext | null>(null)
  const [closing, setClosing] = useState<ClosingEvent | null>(null); const [isClosing, setIsClosing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { const accessToken = await token(); const [serviceResult, harvestResult] = await Promise.all([getSundayServices(accessToken), getHarvestEvents(accessToken)]); setServices(serviceResult.events); setHarvests(harvestResult.events) }
    catch (caught) { setError(message(caught)) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  async function saveService(input: SundayServiceInput) { const accessToken = await token(); return serviceForm?.mode === 'edit' ? updateSundayService(accessToken, serviceForm.event.id, input) : createSundayService(accessToken, input) }
  async function saveHarvest(input: HarvestEventInput) { const accessToken = await token(); return harvestForm?.mode === 'edit' ? updateHarvestEvent(accessToken, harvestForm.event.id, input) : createHarvestEvent(accessToken, input) }
  async function confirmClose() {
    if (!closing) return; setIsClosing(true); setError(null)
    try {
      if (closing.type === 'service') await closeSundayService(await token(), closing.event.id); else await closeHarvestEvent(await token(), closing.event.id)
      setNotice(`${closing.event.title} was closed. ${closing.type === 'service' ? 'Its eligible Member snapshot is fixed.' : 'Participation remains readable and Sunday interest can still be recorded.'}`); setClosing(null); await load()
    } catch (caught) { setError(message(caught)); setClosing(null) } finally { setIsClosing(false) }
  }
  function serviceActions(event: SundayService): RowAction[] { const actions: RowAction[] = [{ icon: Eye, label: 'Open Service', onSelect: () => navigate(`/events/${event.id}`) }]; if (isAdmin) actions.push({ icon: Pencil, label: 'Edit', onSelect: () => setServiceForm({ event, mode: 'edit' }) }); if (isAdmin && event.status === 'open') actions.push({ icon: LockKeyhole, label: 'Close Service', onSelect: () => setClosing({ event, type: 'service' }) }); return actions }
  function harvestActions(event: HarvestEvent): RowAction[] { const actions: RowAction[] = [{ icon: Eye, label: 'Open Harvest', onSelect: () => navigate(`/events/harvest/${event.id}`) }]; if (isAdmin) actions.push({ icon: Pencil, label: 'Edit', onSelect: () => setHarvestForm({ event, mode: 'edit' }) }); if (isAdmin && event.status === 'open') actions.push({ icon: LockKeyhole, label: 'Close Harvest', onSelect: () => setClosing({ event, type: 'harvest' }) }); return actions }

  const rows = directory === 'service' ? services : harvests
  return (
    <div className="mx-auto w-full max-w-[82rem]">
      <PageHeader marker="Horizon / Events" title="Events" description="Operate implemented Sunday Service and Harvest workflows without exposing unapproved Other Event behavior." actions={<>{isAdmin && <Button onClick={() => directory === 'service' ? setServiceForm({ mode: 'create' }) : setHarvestForm({ mode: 'create' })}><Plus className="size-4" aria-hidden="true" />New {directory === 'service' ? 'Service' : 'Harvest'}</Button>}<Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw className="size-4" aria-hidden="true" />Refresh</Button></>} />
      <nav aria-label="Event type" className="mt-8 grid border-y border-line sm:grid-cols-2">
        <button type="button" aria-current={directory === 'service' ? 'page' : undefined} onClick={() => setDirectory('service')} className={`min-h-16 border-b border-line px-4 py-3 text-left transition-colors hover:bg-surface-subtle sm:border-r sm:border-b-0 ${directory === 'service' ? 'bg-ink text-canvas' : 'text-ink'}`}><span className="block text-sm font-semibold">Sunday Service</span><span className={`mt-1 block font-mono text-[0.65rem] uppercase tracking-[0.08em] ${directory === 'service' ? 'text-canvas/70' : 'text-muted'}`}>{services.length} Events · Member attendance</span></button>
        <button type="button" aria-current={directory === 'harvest' ? 'page' : undefined} onClick={() => setDirectory('harvest')} className={`min-h-16 px-4 py-3 text-left transition-colors hover:bg-surface-subtle ${directory === 'harvest' ? 'bg-ink text-canvas' : 'text-ink'}`}><span className="block text-sm font-semibold">Harvest</span><span className={`mt-1 block font-mono text-[0.65rem] uppercase tracking-[0.08em] ${directory === 'harvest' ? 'text-canvas/70' : 'text-muted'}`}>{harvests.length} Events · Visitor participation</span></button>
      </nav>
      {notice && <FeedbackBanner className="mt-6" tone="success">{notice}</FeedbackBanner>}
      {error && !loading && rows.length > 0 && <FeedbackBanner className="mt-6" tone="error">{error}</FeedbackBanner>}
      <section className="mt-8">
        {loading ? <LoadingState title="Loading Events" description="Preparing Sunday Service and Harvest directories." /> : error && rows.length === 0 ? <ErrorState title="Events unavailable" description={error} action={<Button onClick={() => void load()}>Try again</Button>} /> : rows.length === 0 ? <EmptyState icon={directory === 'service' ? CalendarDays : Sprout} title={`No ${directory === 'service' ? 'Sunday Services' : 'Harvest Events'} yet`} description={isAdmin ? `Create the first ${directory === 'service' ? 'Service' : 'Harvest Event'} to begin its approved workflow.` : `An Admin has not created a ${directory === 'service' ? 'Sunday Service' : 'Harvest Event'} yet.`} action={isAdmin ? <Button onClick={() => directory === 'service' ? setServiceForm({ mode: 'create' }) : setHarvestForm({ mode: 'create' })}><Plus className="size-4" aria-hidden="true" />New {directory === 'service' ? 'Service' : 'Harvest'}</Button> : undefined} /> : directory === 'service' ? (
          <ResponsiveTable caption="Sunday Service directory" tableClassName="horizon-table--events"><thead><tr><th scope="col">Service</th><th scope="col">Date</th><th scope="col">Counting</th><th scope="col">Attendance</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{services.map((event) => <tr key={event.id}><td className="event-cell-primary"><span className="font-semibold text-ink">{event.title}</span><span className="mt-1 block text-sm text-muted">{event.location ?? 'Location not set'}</span></td><td className="event-cell-date"><span className="hm-table-mobile-label">Date</span><span className="text-sm text-ink">{formatDate(event.eventDate)}</span></td><td className="event-cell-counting"><span className="hm-table-mobile-label">Counting</span><span className="text-sm text-muted">{event.countsForAbsence ? 'Counts for absence' : 'Excluded'}</span></td><td className="event-cell-attendance"><span className="hm-table-mobile-label">Attendance</span><span className="font-mono text-xs text-muted">{event.attendanceCount} present · {event.visitorCount} visitors</span></td><td className="event-cell-status"><span className="hm-table-mobile-label">Status</span><StatusBadge tone={event.status === 'open' ? 'success' : 'neutral'}>{event.status}</StatusBadge></td><td className="event-cell-actions text-right"><RowActionsMenu label={`Actions for ${event.title}`} actions={serviceActions(event)} /></td></tr>)}</tbody></ResponsiveTable>
        ) : (
          <ResponsiveTable caption="Harvest Event directory" tableClassName="horizon-table--events"><thead><tr><th scope="col">Harvest</th><th scope="col">Date</th><th scope="col">Purpose</th><th scope="col">Participation</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{harvests.map((event) => <tr key={event.id}><td className="event-cell-primary"><span className="font-semibold text-ink">{event.title}</span><span className="mt-1 block text-sm text-muted">{event.location ?? 'Location not set'}</span></td><td className="event-cell-date"><span className="hm-table-mobile-label">Date</span><span className="text-sm text-ink">{formatDate(event.eventDate)}</span></td><td className="event-cell-counting"><span className="hm-table-mobile-label">Purpose</span><span className="text-sm text-muted">Visitor outreach · No absence count</span></td><td className="event-cell-attendance"><span className="hm-table-mobile-label">Participation</span><span className="font-mono text-xs text-muted">{event.participationCount} visitors</span></td><td className="event-cell-status"><span className="hm-table-mobile-label">Status</span><StatusBadge tone={event.status === 'open' ? 'success' : 'neutral'}>{event.status}</StatusBadge></td><td className="event-cell-actions text-right"><RowActionsMenu label={`Actions for ${event.title}`} actions={harvestActions(event)} /></td></tr>)}</tbody></ResponsiveTable>
        )}
      </section>
      {serviceForm && <SundayServiceFormModal context={serviceForm} onClose={() => setServiceForm(null)} onSave={saveService} onSaved={(event) => { setNotice(`${event.title} was ${serviceForm.mode === 'edit' ? 'updated' : 'created'}.`); setServiceForm(null); void load() }} />}
      {harvestForm && <HarvestEventFormModal context={harvestForm} onClose={() => setHarvestForm(null)} onSave={saveHarvest} onSaved={(event) => { setNotice(`${event.title} was ${harvestForm.mode === 'edit' ? 'updated' : 'created'}.`); setHarvestForm(null); void load() }} />}
      <Modal isOpen={Boolean(closing)} onClose={() => setClosing(null)} preventClose={isClosing} title={`Close ${closing?.type === 'service' ? 'Sunday Service' : 'Harvest Event'}`} description={closing?.type === 'service' ? 'Closing fixes the eligible Member and Life Group snapshot. This cannot be reopened.' : 'Closing stops new Visitor participation. Existing participation remains readable and Sunday interest can still be recorded.'}>
        <p className="text-sm leading-6 text-muted">Close <strong className="text-ink">{closing?.event.title}</strong>? This Event cannot be reopened.</p>
        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={() => setClosing(null)} disabled={isClosing}>Cancel</Button><Button variant="destructive" isLoading={isClosing} onClick={() => void confirmClose()}>Close Event</Button></div>
      </Modal>
    </div>
  )
}
