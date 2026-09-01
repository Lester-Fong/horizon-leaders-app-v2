import { ArrowLeft, Check, Minus, RefreshCw, Search, UserPlus, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'

import { Button, LinkButton } from '../components/ui/Button'
import { EmptyState, ErrorState, FeedbackBanner, LoadingState } from '../components/ui/Feedback'
import { FormField, TextInput } from '../components/ui/FormControls'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ApiError, createAndRegisterHarvestVisitor, getHarvestEvent, getHarvestParticipations, getVisitors, recordHarvestInterest, registerHarvestVisitor, type HarvestEvent, type HarvestParticipation, type Visitor } from '../lib/api'
import { supabase } from '../lib/supabase'

async function token() { const { data, error } = await supabase.auth.getSession(); if (error || !data.session) throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired.'); return data.session.access_token }
function message(error: unknown) { return error instanceof ApiError ? error.message : 'Harvest data is unavailable right now.' }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) }
function participantName(participation: HarvestParticipation) { return `${participation.visitor.firstName} ${participation.visitor.lastName}` }
function interestLabel(value: boolean | null) { return value === true ? 'Interested' : value === false ? 'Not interested' : 'Not recorded' }

export function HarvestEventPage() {
  const { eventId } = useParams()
  const [event, setEvent] = useState<HarvestEvent | null>(null); const [participations, setParticipations] = useState<HarvestParticipation[]>([])
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null)
  const [search, setSearch] = useState(''); const [registerOpen, setRegisterOpen] = useState(false); const [interest, setInterest] = useState<HarvestParticipation | null>(null)

  const load = useCallback(async () => {
    if (!eventId) return; setLoading(true); setError(null)
    try { const accessToken = await token(); const [nextEvent, roster] = await Promise.all([getHarvestEvent(accessToken, eventId), getHarvestParticipations(accessToken, eventId)]); setEvent(nextEvent); setParticipations(roster.participations) }
    catch (caught) { setError(message(caught)) }
    finally { setLoading(false) }
  }, [eventId])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('en')
    return query ? participations.filter((entry) => `${entry.visitor.firstName} ${entry.visitor.lastName} ${entry.visitor.phone ?? ''} ${entry.visitor.email ?? ''}`.toLocaleLowerCase('en').includes(query)) : participations
  }, [participations, search])

  if (loading && !event) return <LoadingState title="Loading Harvest workspace" description="Preparing Visitor participation and Sunday-interest decisions." />
  if (!event) return <ErrorState title="Harvest unavailable" description={error ?? 'Harvest Event was not found.'} action={<LinkButton to="/events" variant="secondary">Back to Events</LinkButton>} />

  return (
    <div className="mx-auto w-full max-w-[86rem]">
      <LinkButton to="/events" size="sm" variant="ghost" className="mb-5 -ml-3"><ArrowLeft className="size-4" aria-hidden="true" />Back to Events</LinkButton>
      <PageHeader marker={`Harvest / ${event.status}`} title={event.title} description={`${formatDate(event.eventDate)} · ${event.location ?? 'Location not set'} · Visitor outreach`} actions={<><StatusBadge tone={event.status === 'open' ? 'success' : 'neutral'}>{event.status}</StatusBadge><Button variant="secondary" onClick={() => void load()}><RefreshCw className="size-4" aria-hidden="true" />Refresh</Button></>} />
      {notice && <FeedbackBanner className="mt-6" tone="success">{notice}</FeedbackBanner>}
      {error && <FeedbackBanner className="mt-6" tone="error">{error}</FeedbackBanner>}
      {event.status === 'closed' && <FeedbackBanner className="mt-6" tone="info">This Harvest is closed to new participation. Existing history remains readable, and Sunday-interest decisions remain available.</FeedbackBanner>}

      <section className="mt-9" aria-labelledby="harvest-roster-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="hm-label">Participation / Staff registered</p><h2 id="harvest-roster-title" className="mt-2 text-xl font-semibold tracking-tight text-ink">Visitor roster</h2><p className="mt-1 text-sm leading-6 text-muted">Registration alone creates no Follow Up. Positive Sunday interest uses the shared Follow Up workflow.</p></div>
          {event.status === 'open' && <Button onClick={() => setRegisterOpen(true)}><UserPlus className="size-4" aria-hidden="true" />Register Visitor</Button>}
        </div>
        <div className="mt-6 max-w-xl"><FormField id="harvest-search" label="Search participants"><div className="relative"><Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted" aria-hidden="true" /><TextInput id="harvest-search" className="pl-10" value={search} placeholder="Name, phone, or email" onChange={(change) => setSearch(change.target.value)} /></div></FormField></div>
        <div className="mt-5">
          {filtered.length === 0 ? <EmptyState icon={participations.length ? Search : Users} title={participations.length ? 'No participants match' : 'No Harvest participants'} description={participations.length ? 'Try a different name or contact search.' : event.status === 'open' ? 'Register an active Visitor to begin this Harvest roster.' : 'No Visitors were registered before this Harvest closed.'} /> : (
            <ResponsiveTable caption="Harvest Visitor participation" tableClassName="horizon-table--harvest-participation">
              <thead><tr><th scope="col">Visitor</th><th scope="col">Contact</th><th scope="col">Record</th><th scope="col">Sunday interest</th><th scope="col">Follow Up</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
              <tbody>{filtered.map((entry) => <tr key={entry.visitor.id}>
                <td className="harvest-cell-primary"><span className="font-semibold text-ink">{participantName(entry)}</span><span className="mt-1 block font-mono text-[0.65rem] uppercase tracking-wider text-muted">Registered by {entry.registeredBy.name}</span></td>
                <td className="harvest-cell-contact"><span className="hm-table-mobile-label">Contact</span><span className="text-sm text-muted">{entry.visitor.phone ?? entry.visitor.email ?? 'No contact'}</span></td>
                <td className="harvest-cell-record"><span className="hm-table-mobile-label">Record</span><StatusBadge tone="neutral">{entry.visitor.status}</StatusBadge></td>
                <td className="harvest-cell-interest"><span className="hm-table-mobile-label">Sunday interest</span><StatusBadge tone={entry.sundayInterest === true ? 'success' : 'neutral'}>{interestLabel(entry.sundayInterest)}</StatusBadge>{entry.interestRecordedBy && <span className="mt-1 block text-xs text-muted">by {entry.interestRecordedBy.name}</span>}</td>
                <td className="harvest-cell-follow-up"><span className="hm-table-mobile-label">Follow Up</span><span className="font-mono text-xs uppercase tracking-[0.08em] text-muted">{entry.followUp ? entry.followUp.status : entry.sundayInterest === true ? 'Pending' : 'None'}</span></td>
                <td className="harvest-cell-actions text-right">{entry.sundayInterest !== true ? <Button size="sm" variant="secondary" onClick={() => setInterest(entry)}>{entry.sundayInterest === false ? 'Mark interested' : 'Record decision'}</Button> : <span className="font-mono text-[0.65rem] uppercase tracking-wider text-muted">Recorded</span>}</td>
              </tr>)}</tbody>
            </ResponsiveTable>
          )}
        </div>
      </section>

      {registerOpen && <HarvestRegistrationModal event={event} onClose={() => setRegisterOpen(false)} onRegistered={(text) => { setRegisterOpen(false); setNotice(text); void load() }} />}
      {interest && <InterestModal event={event} participation={interest} onClose={() => setInterest(null)} onRecorded={(text) => { setInterest(null); setNotice(text); void load() }} />}
    </div>
  )
}

function HarvestRegistrationModal({ event, onClose, onRegistered }: { event: HarvestEvent; onClose(): void; onRegistered(message: string): void }) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing'); const [options, setOptions] = useState<Visitor[]>([]); const [search, setSearch] = useState(''); const [selected, setSelected] = useState('')
  const [firstName, setFirstName] = useState(''); const [lastName, setLastName] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  useEffect(() => { let active = true; void (async () => { try { const list = await getVisitors(await token(), { status: 'active' }); if (active) setOptions(list) } catch (caught) { if (active) setError(message(caught)) } })(); return () => { active = false } }, [])
  const filtered = useMemo(() => { const query = search.trim().toLocaleLowerCase('en'); return query ? options.filter((visitor) => `${visitor.firstName} ${visitor.lastName} ${visitor.phone ?? ''} ${visitor.email ?? ''}`.toLocaleLowerCase('en').includes(query)) : options }, [options, search])
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); setError(null); setBusy(true)
    try {
      const accessToken = await token()
      if (mode === 'existing') {
        if (!selected) { setError('Choose an active Visitor.'); return }
        const visitor = options.find((item) => item.id === selected); const result = await registerHarvestVisitor(accessToken, event.id, selected)
        onRegistered(`${visitor ? `${visitor.firstName} ${visitor.lastName}` : 'Visitor'} was ${result.result === 'already_registered' ? 'already registered' : 'registered for Harvest'}.`)
      } else {
        if (!firstName.trim() || !lastName.trim()) { setError('First and last name are required.'); return }
        await createAndRegisterHarvestVisitor(accessToken, event.id, { email: email.trim() || null, firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() || null })
        onRegistered(`${firstName.trim()} ${lastName.trim()} was created and registered for Harvest.`)
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'VISITOR_CONTACT_CONFLICT' && typeof caught.details === 'object' && caught.details !== null && 'existingVisitor' in caught.details) {
        const details = caught.details as { existingVisitor?: { id?: unknown } }
        if (typeof details.existingVisitor?.id === 'string') { setMode('existing'); setSelected(details.existingVisitor.id); setError(`${caught.message} The matching active Visitor has been selected below.`); return }
      }
      setError(message(caught))
    } finally { setBusy(false) }
  }
  return <Modal isOpen onClose={onClose} preventClose={busy} title="Register Harvest Visitor" description="Use an active Visitor record or create and register one atomically. Public registration is not enabled."><div className="mb-5 flex border-b border-line" role="tablist" aria-label="Visitor registration method"><button type="button" role="tab" aria-selected={mode === 'existing'} className={`min-h-11 border-b-2 px-4 text-sm font-semibold ${mode === 'existing' ? 'border-ink text-ink' : 'border-transparent text-muted'}`} onClick={() => setMode('existing')}>Existing Visitor</button><button type="button" role="tab" aria-selected={mode === 'new'} className={`min-h-11 border-b-2 px-4 text-sm font-semibold ${mode === 'new' ? 'border-ink text-ink' : 'border-transparent text-muted'}`} onClick={() => setMode('new')}>New Visitor</button></div>{error && <FeedbackBanner className="mb-5" tone="error">{error}</FeedbackBanner>}<form className="space-y-5" onSubmit={submit}>{mode === 'existing' ? <><FormField id="harvest-visitor-search" label="Search active Visitors"><TextInput id="harvest-visitor-search" data-modal-autofocus value={search} placeholder="Name, phone, or email" onChange={(change) => setSearch(change.target.value)} /></FormField><FormField id="harvest-visitor-choice" label="Visitor" required><select id="harvest-visitor-choice" className="min-h-11 w-full rounded-input border border-line-strong bg-surface px-3 py-2 text-sm text-ink" value={selected} onChange={(change) => setSelected(change.target.value)}><option value="">Choose a Visitor</option>{filtered.map((visitor) => <option key={visitor.id} value={visitor.id}>{visitor.firstName} {visitor.lastName}{visitor.phone ? ` · ${visitor.phone}` : ''}</option>)}</select></FormField></> : <><div className="grid gap-5 sm:grid-cols-2"><FormField id="harvest-visitor-first" label="First name" required><TextInput id="harvest-visitor-first" data-modal-autofocus value={firstName} onChange={(change) => setFirstName(change.target.value)} /></FormField><FormField id="harvest-visitor-last" label="Last name" required><TextInput id="harvest-visitor-last" value={lastName} onChange={(change) => setLastName(change.target.value)} /></FormField></div><FormField id="harvest-visitor-phone" label="Phone" description="Optional. Normalized Visitor and Member safeguards apply."><TextInput id="harvest-visitor-phone" value={phone} onChange={(change) => setPhone(change.target.value)} /></FormField><FormField id="harvest-visitor-email" label="Email" description="Optional. Member matches block creation without merging."><TextInput id="harvest-visitor-email" type="email" value={email} onChange={(change) => setEmail(change.target.value)} /></FormField></>}<div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" isLoading={busy}>Register Visitor</Button></div></form></Modal>
}

function InterestModal({ event, participation, onClose, onRecorded }: { event: HarvestEvent; participation: HarvestParticipation; onClose(): void; onRecorded(message: string): void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  async function record(interested: boolean) {
    setBusy(true); setError(null)
    try { const result = await recordHarvestInterest(await token(), event.id, participation.visitor.id, interested); const name = participantName(participation); onRecorded(interested ? `${name} is interested in Sunday Service. Follow Up was ${result.followUpResult === 'created' ? 'created' : 'already active'}.` : `${name} was recorded as not interested in Sunday Service.`) }
    catch (caught) { setError(message(caught)) } finally { setBusy(false) }
  }
  return <Modal isOpen onClose={onClose} preventClose={busy} title="Record Sunday interest" description="A positive decision creates or deduplicates the shared Visitor Follow Up. Positive interest cannot be reversed in MVP.">{error && <FeedbackBanner className="mb-5" tone="error">{error}</FeedbackBanner>}<div className="border-y border-line py-5"><p className="font-semibold text-ink">{participantName(participation)}</p><p className="mt-1 text-sm leading-6 text-muted">Current decision: {interestLabel(participation.sundayInterest)}. This may be recorded even though the Harvest Event is {event.status}.</p></div><div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>{participation.sundayInterest === null && <Button variant="secondary" isLoading={busy} onClick={() => void record(false)}><Minus className="size-4" aria-hidden="true" />Not interested</Button>}<Button isLoading={busy} onClick={() => void record(true)}><Check className="size-4" aria-hidden="true" />Interested</Button></div></Modal>
}
