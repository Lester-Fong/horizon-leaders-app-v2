import { ArrowLeft, Check, QrCode, RefreshCw, Search, UserPlus, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import { Button, LinkButton } from '../components/ui/Button'
import { EmptyState, ErrorState, FeedbackBanner, LoadingState } from '../components/ui/Feedback'
import { FormField, TextInput } from '../components/ui/FormControls'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import { StatusBadge } from '../components/ui/StatusBadge'
import { ApiError, checkInSundayAttendanceByQr, createAndRegisterSundayVisitor, getSundayAttendance, getSundayService, getSundayVisitors, getVisitors, markSundayAttendance, registerSundayVisitor, removeSundayAttendance, removeSundayVisitor, type SundayAttendanceMember, type SundayService, type SundayVisitorRegistration, type Visitor } from '../lib/api'
import { supabase } from '../lib/supabase'

async function token() { const { data, error } = await supabase.auth.getSession(); if (error || !data.session) throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired.'); return data.session.access_token }
function message(error: unknown) { return error instanceof ApiError ? error.message : 'Sunday Service data is unavailable right now.' }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) }
function memberName(member: SundayAttendanceMember) { return `${member.firstName} ${member.lastName}` }
function visitorName(registration: SundayVisitorRegistration) { return `${registration.visitor.firstName} ${registration.visitor.lastName}` }

type WorkspaceSection = 'attendance' | 'qr' | 'visitors'

export function SundayServicePage() {
  const { eventId } = useParams(); const { actor } = useAuth(); const isAdmin = actor?.role === 'admin'
  const [event, setEvent] = useState<SundayService | null>(null)
  const [members, setMembers] = useState<SundayAttendanceMember[]>([])
  const [visitors, setVisitors] = useState<SundayVisitorRegistration[]>([])
  const [section, setSection] = useState<WorkspaceSection>('attendance')
  const [search, setSearch] = useState(''); const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null)
  const [changing, setChanging] = useState<string | null>(null); const [qrOpen, setQrOpen] = useState(false); const [visitorOpen, setVisitorOpen] = useState(false)

  const load = useCallback(async () => {
    if (!eventId) return
    setLoading(true); setError(null)
    try { const accessToken = await token(); const [nextEvent, roster, registrations] = await Promise.all([getSundayService(accessToken, eventId), getSundayAttendance(accessToken, eventId), getSundayVisitors(accessToken, eventId)]); setEvent(nextEvent); setMembers(roster.members); setVisitors(registrations.registrations) }
    catch (caught) { setError(message(caught)) }
    finally { setLoading(false) }
  }, [eventId])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  const canCorrect = event?.status === 'open' || isAdmin
  const filteredMembers = useMemo(() => { const query = search.trim().toLocaleLowerCase('en'); return query ? members.filter((member) => [member.firstName, member.lastName, member.email ?? '', member.phone ?? '', member.lifeGroup.name].some((value) => value.toLocaleLowerCase('en').includes(query))) : members }, [members, search])

  async function changeAttendance(member: SundayAttendanceMember) {
    if (!eventId) return; setChanging(member.id); setError(null)
    try { const accessToken = await token(); if (member.isPresent) await removeSundayAttendance(accessToken, eventId, member.id); else await markSundayAttendance(accessToken, eventId, member.id); setNotice(`${memberName(member)} is now ${member.isPresent ? 'not marked present' : 'present'}.`); await load() }
    catch (caught) { setError(message(caught)) }
    finally { setChanging(null) }
  }
  async function unregisterVisitor(registration: SundayVisitorRegistration) {
    if (!eventId) return; setChanging(registration.visitor.id); setError(null)
    try { await removeSundayVisitor(await token(), eventId, registration.visitor.id); setNotice(`${visitorName(registration)} was removed from this Service.`); await load() }
    catch (caught) { setError(message(caught)) }
    finally { setChanging(null) }
  }

  if (loading && !event) return <LoadingState title="Loading Service workspace" description="Preparing attendance and Sunday Visitors." />
  if (!event || error && !event) return <ErrorState title="Service unavailable" description={error ?? 'Sunday Service was not found.'} action={<LinkButton to="/events" variant="secondary">Back to Events</LinkButton>} />

  const tabs: { id: WorkspaceSection; label: string; meta: string }[] = [
    { id: 'attendance', label: 'Member Attendance', meta: `${event.attendanceCount} present` },
    { id: 'qr', label: 'QR Check-in', meta: event.status === 'open' ? 'Ready' : isAdmin ? 'Admin correction' : 'Read only' },
    { id: 'visitors', label: 'Sunday Visitors', meta: `${event.visitorCount} registered` },
  ]
  return (
    <div className="mx-auto w-full max-w-[86rem]">
      <LinkButton to="/events" size="sm" variant="ghost" className="mb-5 -ml-3"><ArrowLeft className="size-4" aria-hidden="true" />Back to Events</LinkButton>
      <PageHeader marker={`Sunday Service / ${event.status}`} title={event.title} description={`${formatDate(event.eventDate)} · ${event.location ?? 'Location not set'} · ${event.countsForAbsence ? 'Counts for derived Sunday absence' : 'Excluded from absence'}`} actions={<><StatusBadge tone={event.status === 'open' ? 'success' : 'neutral'}>{event.status}</StatusBadge><Button variant="secondary" onClick={() => void load()}><RefreshCw className="size-4" aria-hidden="true" />Refresh</Button></>} />
      {notice && <FeedbackBanner className="mt-6" tone="success">{notice}</FeedbackBanner>}
      {error && <FeedbackBanner className="mt-6" tone="error">{error}</FeedbackBanner>}
      {event.status === 'closed' && <FeedbackBanner className="mt-6" tone="info">The eligible Member and Life Group snapshot is fixed. {isAdmin ? 'You can make attendance or Visitor corrections.' : 'Attendance and registration are read-only.'}</FeedbackBanner>}
      <nav aria-label="Service workspace" className="mt-8 grid border-y border-line sm:grid-cols-3">
        {tabs.map((tab) => <button key={tab.id} type="button" aria-current={section === tab.id ? 'page' : undefined} onClick={() => setSection(tab.id)} className={`min-h-16 border-b border-line px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-subtle sm:border-r sm:border-b-0 sm:last:border-r-0 ${section === tab.id ? 'bg-ink text-canvas' : 'text-ink'}`}><span className="block text-sm font-semibold">{tab.label}</span><span className={`mt-1 block font-mono text-[0.65rem] uppercase tracking-[0.08em] ${section === tab.id ? 'text-canvas/70' : 'text-muted'}`}>{tab.meta}</span></button>)}
      </nav>

      {section === 'attendance' && <section className="mt-8" aria-labelledby="attendance-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="attendance-title" className="text-xl font-semibold tracking-tight text-ink">Member Attendance</h2><p className="mt-1 text-sm text-muted">{event.status === 'open' ? 'Active Members eligible on the Service date.' : 'Close-time eligibility and Life Group assignments.'}</p></div>{canCorrect && <Button variant="secondary" onClick={() => setQrOpen(true)}><QrCode className="size-4" aria-hidden="true" />QR check-in</Button>}</div>
        <FormField id="attendance-search" label="Search Members"><div className="relative max-w-xl"><Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted" aria-hidden="true" /><TextInput id="attendance-search" className="pl-10" value={search} placeholder="Name, contact, or Life Group" onChange={(change) => setSearch(change.target.value)} /></div></FormField>
        <div className="mt-5">{filteredMembers.length === 0 ? <EmptyState icon={Users} title="No eligible Members" description={search ? 'No Members match this search.' : 'There are no Members in the authorized eligibility scope for this Service.'} /> : <ResponsiveTable caption="Sunday Service Member attendance" tableClassName="horizon-table--service-attendance"><thead><tr><th scope="col">Member</th><th scope="col">Life Group</th><th scope="col">Contact</th><th scope="col">Attendance</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead><tbody>{filteredMembers.map((member) => <tr key={member.id}><td className="attendance-cell-primary"><span className="font-semibold text-ink">{memberName(member)}</span>{!member.isActive && <span className="mt-1 block font-mono text-[0.65rem] uppercase tracking-wider text-muted">Currently archived</span>}</td><td className="attendance-cell-group"><span className="hm-table-mobile-label">Life Group</span><span className="text-sm text-muted">{member.lifeGroup.name}</span></td><td className="attendance-cell-contact"><span className="hm-table-mobile-label">Contact</span><span className="block text-sm text-muted">{member.phone ?? member.email ?? 'No contact'}</span></td><td className="attendance-cell-status"><span className="hm-table-mobile-label">Attendance</span><StatusBadge tone={member.isPresent ? 'success' : 'neutral'}>{member.attendanceStatus.replaceAll('_', ' ')}</StatusBadge></td><td className="attendance-cell-actions text-right">{canCorrect && <Button size="sm" variant={member.isPresent ? 'ghost' : 'secondary'} isLoading={changing === member.id} onClick={() => void changeAttendance(member)}>{member.isPresent ? <><X className="size-4" aria-hidden="true" />Remove</> : <><Check className="size-4" aria-hidden="true" />Mark present</>}</Button>}</td></tr>)}</tbody></ResponsiveTable>}</div>
      </section>}

      {section === 'qr' && <section className="mt-8 border-y border-line py-8" aria-labelledby="qr-title"><div className="max-w-2xl"><p className="hm-label">Secure / Express</p><h2 id="qr-title" className="mt-2 text-xl font-semibold text-ink">QR token check-in</h2><p className="mt-2 text-sm leading-6 text-muted">Use a connected scanner that enters the permanent Member token. Tokens are resolved and authorized by the server; Horizon never performs browser-side Member lookup.</p>{canCorrect ? <Button className="mt-6" onClick={() => setQrOpen(true)}><QrCode className="size-4" aria-hidden="true" />Open check-in</Button> : <p className="mt-5 font-mono text-xs uppercase tracking-wider text-muted">Closed · Leader read only</p>}</div></section>}

      {section === 'visitors' && <section className="mt-8" aria-labelledby="visitor-title"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="visitor-title" className="text-xl font-semibold text-ink">Sunday Visitors</h2><p className="mt-1 text-sm text-muted">Historical registrations remain visible after Visitor conversion.</p></div>{canCorrect && <Button onClick={() => setVisitorOpen(true)}><UserPlus className="size-4" aria-hidden="true" />Register Visitor</Button>}</div><div className="mt-5">{visitors.length === 0 ? <EmptyState icon={UserPlus} title="No Sunday Visitors" description="No Visitors are registered to this Service." action={canCorrect ? <Button onClick={() => setVisitorOpen(true)}>Register Visitor</Button> : undefined} /> : <ResponsiveTable caption="Sunday Visitor registrations" tableClassName="horizon-table--service-visitors"><thead><tr><th scope="col">Visitor</th><th scope="col">Contact</th><th scope="col">Record</th><th scope="col">Registered by</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead><tbody>{visitors.map((registration) => <tr key={registration.visitor.id}><td className="service-visitor-cell-primary"><span className="font-semibold text-ink">{visitorName(registration)}</span></td><td className="service-visitor-cell-contact"><span className="hm-table-mobile-label">Contact</span><span className="text-sm text-muted">{registration.visitor.phone ?? registration.visitor.email ?? 'No contact'}</span></td><td className="service-visitor-cell-status"><span className="hm-table-mobile-label">Record</span><StatusBadge tone="neutral">{registration.visitor.status}</StatusBadge></td><td className="service-visitor-cell-actor"><span className="hm-table-mobile-label">Registered by</span><span className="text-sm text-muted">{registration.registeredBy.name}</span></td><td className="service-visitor-cell-actions text-right">{canCorrect && <Button size="sm" variant="ghost" isLoading={changing === registration.visitor.id} onClick={() => void unregisterVisitor(registration)}>Remove</Button>}</td></tr>)}</tbody></ResponsiveTable>}</div></section>}

      {qrOpen && <QrCheckInModal eventId={event.id} onClose={() => setQrOpen(false)} onRecorded={(text) => { setNotice(text); void load() }} />}
      {visitorOpen && <VisitorRegistrationModal event={event} onClose={() => setVisitorOpen(false)} onRegistered={(text) => { setVisitorOpen(false); setNotice(text); void load() }} />}
    </div>
  )
}

function QrCheckInModal({ eventId, onClose, onRecorded }: { eventId: string; onClose(): void; onRecorded(message: string): void }) {
  const [value, setValue] = useState(''); const [feedback, setFeedback] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  async function submit(formEvent: FormEvent<HTMLFormElement>) { formEvent.preventDefault(); if (!value.trim()) { setError('Scan or enter a QR token.'); return } setBusy(true); setError(null); try { const result = await checkInSundayAttendanceByQr(await token(), eventId, value.trim()); const text = `${memberName(result.member)}: ${result.result === 'recorded' ? 'check-in recorded' : 'already present'}.`; setFeedback(text); setValue(''); onRecorded(text); window.setTimeout(() => document.getElementById('qr-token')?.focus(), 0) } catch (caught) { setError(message(caught)) } finally { setBusy(false) } }
  return <Modal isOpen onClose={onClose} preventClose={busy} title="QR check-in" description="Scan into the field and press Enter. The server applies Service lifecycle, Member eligibility, and Life Group authorization.">{feedback && <FeedbackBanner className="mb-5" tone="success">{feedback}</FeedbackBanner>}{error && <FeedbackBanner className="mb-5" tone="error">{error}</FeedbackBanner>}<form onSubmit={submit}><FormField id="qr-token" label="Member QR token" required><TextInput id="qr-token" data-modal-autofocus autoComplete="off" value={value} onChange={(change) => setValue(change.target.value)} /></FormField><div className="mt-6 flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={onClose} disabled={busy}>Done</Button><Button type="submit" isLoading={busy}><QrCode className="size-4" aria-hidden="true" />Check in</Button></div></form></Modal>
}

function VisitorRegistrationModal({ event, onClose, onRegistered }: { event: SundayService; onClose(): void; onRegistered(message: string): void }) {
  const [mode, setMode] = useState<'existing' | 'new'>('existing'); const [options, setOptions] = useState<Visitor[]>([]); const [search, setSearch] = useState(''); const [selected, setSelected] = useState(''); const [firstName, setFirstName] = useState(''); const [lastName, setLastName] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState(''); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false)
  useEffect(() => { let active = true; void (async () => { try { const list = await getVisitors(await token(), { status: 'active' }); if (active) setOptions(list) } catch (caught) { if (active) setError(message(caught)) } })(); return () => { active = false } }, [])
  const filtered = useMemo(() => { const query = search.trim().toLocaleLowerCase('en'); return query ? options.filter((visitor) => `${visitor.firstName} ${visitor.lastName} ${visitor.phone ?? ''} ${visitor.email ?? ''}`.toLocaleLowerCase('en').includes(query)) : options }, [options, search])
  async function submit(formEvent: FormEvent<HTMLFormElement>) { formEvent.preventDefault(); setError(null); setBusy(true); try { const accessToken = await token(); if (mode === 'existing') { if (!selected) { setError('Choose an active Visitor.'); return } const visitor = options.find((item) => item.id === selected); const result = await registerSundayVisitor(accessToken, event.id, selected); onRegistered(`${visitor ? `${visitor.firstName} ${visitor.lastName}` : 'Visitor'} was ${result.result === 'already_registered' ? 'already registered' : 'registered'}.`) } else { if (!firstName.trim() || !lastName.trim()) { setError('First and last name are required.'); return } await createAndRegisterSundayVisitor(accessToken, event.id, { email: email.trim() || null, firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() || null }); onRegistered(`${firstName.trim()} ${lastName.trim()} was created and registered.`) } } catch (caught) { if (caught instanceof ApiError && caught.code === 'VISITOR_CONTACT_CONFLICT' && typeof caught.details === 'object' && caught.details !== null && 'existingVisitor' in caught.details) { const details = caught.details as { existingVisitor?: { id?: unknown; name?: unknown } }; if (typeof details.existingVisitor?.id === 'string') { setMode('existing'); setSelected(details.existingVisitor.id); setError(`${caught.message} The matching active Visitor has been selected below.`); return } } setError(message(caught)) } finally { setBusy(false) } }
  return <Modal isOpen onClose={onClose} preventClose={busy} title="Register Sunday Visitor" description={event.status === 'closed' ? 'Closed-Service corrections can register an existing eligible active Visitor only.' : 'Use an active Visitor record or create and register one atomically.'}><div className="mb-5 flex border-b border-line" role="tablist" aria-label="Visitor registration method"><button type="button" role="tab" aria-selected={mode === 'existing'} className={`min-h-11 border-b-2 px-4 text-sm font-semibold ${mode === 'existing' ? 'border-ink text-ink' : 'border-transparent text-muted'}`} onClick={() => setMode('existing')}>Existing Visitor</button>{event.status === 'open' && <button type="button" role="tab" aria-selected={mode === 'new'} className={`min-h-11 border-b-2 px-4 text-sm font-semibold ${mode === 'new' ? 'border-ink text-ink' : 'border-transparent text-muted'}`} onClick={() => setMode('new')}>New Visitor</button>}</div>{error && <FeedbackBanner className="mb-5" tone="error">{error}</FeedbackBanner>}<form className="space-y-5" onSubmit={submit}>{mode === 'existing' ? <><FormField id="visitor-search" label="Search active Visitors"><TextInput id="visitor-search" data-modal-autofocus value={search} placeholder="Name, phone, or email" onChange={(change) => setSearch(change.target.value)} /></FormField><FormField id="visitor-choice" label="Visitor" required><select id="visitor-choice" className="min-h-11 w-full rounded-input border border-line-strong bg-surface px-3 py-2 text-sm text-ink" value={selected} onChange={(change) => setSelected(change.target.value)}><option value="">Choose a Visitor</option>{filtered.map((visitor) => <option key={visitor.id} value={visitor.id}>{visitor.firstName} {visitor.lastName}{visitor.phone ? ` · ${visitor.phone}` : ''}</option>)}</select></FormField></> : <><div className="grid gap-5 sm:grid-cols-2"><FormField id="sunday-visitor-first" label="First name" required><TextInput id="sunday-visitor-first" data-modal-autofocus value={firstName} onChange={(change) => setFirstName(change.target.value)} /></FormField><FormField id="sunday-visitor-last" label="Last name" required><TextInput id="sunday-visitor-last" value={lastName} onChange={(change) => setLastName(change.target.value)} /></FormField></div><FormField id="sunday-visitor-phone" label="Phone" description="Optional. Normalized duplicate safeguards apply."><TextInput id="sunday-visitor-phone" value={phone} onChange={(change) => setPhone(change.target.value)} /></FormField><FormField id="sunday-visitor-email" label="Email" description="Optional. Matching a Member redirects the operator to Member check-in."><TextInput id="sunday-visitor-email" type="email" value={email} onChange={(change) => setEmail(change.target.value)} /></FormField></>}<div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" isLoading={busy}>Register Visitor</Button></div></form></Modal>
}
