import {
  ArrowRight,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  UserRoundPlus,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'

import { useAuth } from '../auth/useAuth'
import {
  VisitorFormModal,
  type VisitorFormContext,
} from '../components/visitors/VisitorFormModal'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, FeedbackBanner, LoadingState } from '../components/ui/Feedback'
import { FormField, Select, TextInput } from '../components/ui/FormControls'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import { RowActionsMenu, type RowAction } from '../components/ui/RowActionsMenu'
import { StatusBadge } from '../components/ui/StatusBadge'
import {
  ApiError,
  convertVisitor,
  createVisitor,
  getLifeGroups,
  getVisitor,
  getVisitors,
  updateVisitor,
  type LifeGroup,
  type Visitor,
  type VisitorInput,
  type VisitorListStatus,
} from '../lib/api'
import { supabase } from '../lib/supabase'

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired.')
  return data.session.access_token
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  return 'Visitor data is unavailable right now. Please try again.'
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <dt className="hm-label">{label}</dt>
      <dd className="mt-1.5 break-words text-sm leading-6 text-ink">{value}</dd>
    </div>
  )
}

export function VisitorsPage() {
  const { actor } = useAuth()
  const isAdmin = actor?.role === 'admin'
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [lifeGroups, setLifeGroups] = useState<LifeGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<VisitorListStatus>('active')
  const [formContext, setFormContext] = useState<VisitorFormContext | null>(null)
  const [detailVisitorId, setDetailVisitorId] = useState<string | null>(null)
  const [detailVisitor, setDetailVisitor] = useState<Visitor | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [conversionTarget, setConversionTarget] = useState<Visitor | null>(null)
  const [conversionGroupId, setConversionGroupId] = useState('')
  const [conversionError, setConversionError] = useState<string | null>(null)
  const [isConverting, setIsConverting] = useState(false)

  const activeLifeGroups = useMemo(
    () => lifeGroups.filter((lifeGroup) => lifeGroup.isActive),
    [lifeGroups],
  )
  const ownLifeGroup = useMemo(
    () => lifeGroups.find((lifeGroup) => lifeGroup.leader.id === actor?.id) ?? null,
    [actor?.id, lifeGroups],
  )
  const canConvert = isAdmin ? activeLifeGroups.length > 0 : Boolean(ownLifeGroup?.isActive)

  const loadDirectory = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const token = await getAccessToken()
      const [visitorData, lifeGroupData] = await Promise.all([
        getVisitors(token, isAdmin
          ? { ...(search ? { search } : {}), status: statusFilter }
          : { ...(search ? { search } : {}) }),
        getLifeGroups(token),
      ])
      setVisitors(visitorData)
      setLifeGroups(lifeGroupData)
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [isAdmin, search, statusFilter])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDirectory(), 0)
    return () => window.clearTimeout(timer)
  }, [loadDirectory])

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSearch(searchInput.trim())
  }

  async function openDetails(visitor: Visitor) {
    setDetailVisitorId(visitor.id)
    setDetailVisitor(null)
    setDetailError(null)
    setIsDetailLoading(true)
    try {
      setDetailVisitor(await getVisitor(await getAccessToken(), visitor.id))
    } catch (error) {
      setDetailError(getErrorMessage(error))
    } finally {
      setIsDetailLoading(false)
    }
  }

  function closeDetails() {
    if (isDetailLoading) return
    setDetailVisitorId(null)
    setDetailVisitor(null)
    setDetailError(null)
  }

  function openConversion(visitor: Visitor) {
    const initialGroupId = isAdmin ? activeLifeGroups[0]?.id ?? '' : ownLifeGroup?.id ?? ''
    setConversionTarget(visitor)
    setConversionGroupId(initialGroupId)
    setConversionError(null)
  }

  function getRowActions(visitor: Visitor): RowAction[] {
    const actions: RowAction[] = [{ icon: Eye, label: 'View Visitor details', onSelect: () => void openDetails(visitor) }]
    if (visitor.status === 'active') {
      actions.push(
        { icon: Pencil, label: 'Edit Visitor', onSelect: () => setFormContext({ mode: 'edit', visitor }) },
        { disabled: !canConvert, icon: ArrowRight, label: 'Convert to Member', onSelect: () => openConversion(visitor) },
      )
    }
    return actions
  }

  async function saveVisitor(input: VisitorInput) {
    const token = await getAccessToken()
    return formContext?.mode === 'edit'
      ? updateVisitor(token, formContext.visitor.id, input)
      : createVisitor(token, input)
  }

  function handleVisitorSaved(visitor: Visitor) {
    const wasEditing = formContext?.mode === 'edit'
    setFormContext(null)
    setNotice(`${visitor.firstName} ${visitor.lastName} was ${wasEditing ? 'updated' : 'created'}.`)
    void loadDirectory()
  }

  async function handleConversion() {
    if (!conversionTarget || !conversionGroupId) {
      setConversionError('Select an active Life Group for the new Member.')
      return
    }
    setIsConverting(true)
    setConversionError(null)
    try {
      const result = await convertVisitor(await getAccessToken(), conversionTarget.id, conversionGroupId)
      setNotice(`${result.visitor.firstName} ${result.visitor.lastName} was converted to a Member in ${result.member.lifeGroup.name}.`)
      setConversionTarget(null)
      setDetailVisitorId(null)
      setDetailVisitor(null)
      await loadDirectory()
    } catch (error) {
      setConversionError(getErrorMessage(error))
    } finally {
      setIsConverting(false)
    }
  }

  const hasFilters = Boolean(search || (isAdmin && statusFilter !== 'active'))

  return (
    <div className="space-y-8">
      <PageHeader
        marker="06 — People"
        title="Visitors"
        description={isAdmin
          ? 'Manage active Visitor records, review converted history, and begin approved Member conversion.'
          : 'Manage active Visitors and convert them into your assigned Life Group when ready.'}
        actions={
          <>
            <Button onClick={() => setFormContext({ mode: 'create' })} disabled={Boolean(loadError)}>
              <Plus aria-hidden="true" className="size-4" />New Visitor
            </Button>
            <Button variant="secondary" onClick={() => void loadDirectory()}>
              <RefreshCw aria-hidden="true" className="size-4" />Refresh
            </Button>
          </>
        }
      />

      {notice && <FeedbackBanner tone="success">{notice}</FeedbackBanner>}
      {loadError && visitors.length > 0 && <FeedbackBanner tone="error">{loadError}</FeedbackBanner>}
      {!canConvert && !loadError && (
        <FeedbackBanner tone="warning" title="An active Life Group is required for conversion">
          {isAdmin ? 'Create or reactivate a Life Group before converting a Visitor.' : 'Your assigned Life Group must be active before you can convert a Visitor.'}
        </FeedbackBanner>
      )}

      <section aria-labelledby="visitor-directory-controls" className="space-y-5">
        <div className="flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p id="visitor-directory-controls" className="hm-label">Directory controls</p>
            <p className="mt-1 text-sm text-muted">
              {isAdmin ? 'Search within the selected Visitor status.' : 'Scope: Active Visitors only'}
            </p>
          </div>
          {!isLoading && <p className="font-mono text-xs text-muted" aria-live="polite">{visitors.length} {visitors.length === 1 ? 'Visitor' : 'Visitors'}</p>}
        </div>
        <form className="grid gap-4 md:grid-cols-[minmax(14rem,1fr)_auto] xl:grid-cols-[minmax(18rem,1fr)_11rem_auto]" onSubmit={handleSearch}>
          <FormField id="visitor-search" label="Search" description="Name, phone, or email">
            <TextInput id="visitor-search" type="search" value={searchInput} placeholder="Search Visitors" onChange={(event) => setSearchInput(event.target.value)} />
          </FormField>
          {isAdmin && (
            <FormField id="visitor-status-filter" label="Status">
              <Select id="visitor-status-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as VisitorListStatus)}>
                <option value="active">Active</option>
                <option value="converted">Converted</option>
                <option value="all">All</option>
              </Select>
            </FormField>
          )}
          <div className="flex items-end gap-2 md:justify-end">
            <Button type="submit" variant="secondary"><Search aria-hidden="true" className="size-4" />Search</Button>
            {search && <Button type="button" variant="ghost" onClick={() => { setSearchInput(''); setSearch('') }}>Clear</Button>}
          </div>
        </form>
      </section>

      {isLoading ? (
        <LoadingState title="Loading Visitors" description="Retrieving the authorized Visitor directory." />
      ) : loadError && visitors.length === 0 ? (
        <ErrorState title="Visitors could not be loaded" description={loadError} action={<Button onClick={() => void loadDirectory()}>Try again</Button>} />
      ) : visitors.length === 0 ? (
        <EmptyState
          icon={UserRoundPlus}
          title={hasFilters ? 'No Visitors match these controls' : 'No active Visitors yet'}
          description={hasFilters ? 'Adjust the search or status to review a different authorized set.' : 'Use New Visitor when someone is ready to be recorded.'}
        />
      ) : (
        <ResponsiveTable caption="Authorized Visitor directory" tableClassName="horizon-table--visitors">
          <thead><tr><th scope="col">Visitor</th><th scope="col">Contact</th><th scope="col">Status</th><th scope="col" className="w-16"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {visitors.map((visitor) => (
              <tr key={visitor.id}>
                <td className="visitor-cell-primary">
                  <span className="hm-table-mobile-label">Visitor</span>
                  <p className="font-medium text-ink">{visitor.firstName} {visitor.lastName}</p>
                  <p className="mt-1 text-xs text-muted">Visitor record</p>
                </td>
                <td className="visitor-cell-contact">
                  <span className="hm-table-mobile-label">Contact</span>
                  <p className="text-sm text-ink">{visitor.phone ?? 'No phone'}</p>
                  <p className="mt-1 break-all text-xs text-muted">{visitor.email ?? 'No email'}</p>
                </td>
                <td className="visitor-cell-status">
                  <span className="hm-table-mobile-label">Status</span>
                  <StatusBadge tone={visitor.status === 'active' ? 'success' : 'neutral'}>{visitor.status === 'active' ? 'Active' : 'Converted'}</StatusBadge>
                  {visitor.status === 'converted' && <p className="mt-1 text-xs text-muted">Preserved history</p>}
                </td>
                <td className="visitor-cell-actions text-right">
                  <RowActionsMenu label={`Actions for ${visitor.firstName} ${visitor.lastName}`} actions={getRowActions(visitor)} />
                </td>
              </tr>
            ))}
          </tbody>
        </ResponsiveTable>
      )}

      {formContext && (
        <VisitorFormModal
          key={formContext.mode === 'edit' ? `edit-${formContext.visitor.id}` : 'create-visitor'}
          context={formContext}
          onClose={() => setFormContext(null)}
          onSave={saveVisitor}
          onSaved={handleVisitorSaved}
        />
      )}

      <Modal
        className="max-w-lg"
        isOpen={Boolean(detailVisitorId)}
        onClose={closeDetails}
        preventClose={isDetailLoading}
        title={detailVisitor ? `${detailVisitor.firstName} ${detailVisitor.lastName}` : 'Visitor details'}
        description="Current Visitor identity, contact information, and lifecycle status."
      >
        {isDetailLoading ? <LoadingState title="Loading Visitor" description="Retrieving the authorized record." /> : detailError ? (
          <FeedbackBanner tone="error">{detailError}</FeedbackBanner>
        ) : detailVisitor ? (
          <>
            <div className="flex items-center justify-between gap-4 border-y border-line py-3">
              <span className="hm-label">Visitor status</span>
              <StatusBadge tone={detailVisitor.status === 'active' ? 'success' : 'neutral'}>{detailVisitor.status === 'active' ? 'Active' : 'Converted'}</StatusBadge>
            </div>
            <dl className="mt-3 grid sm:grid-cols-2 sm:gap-x-6">
              <DetailItem label="Phone" value={detailVisitor.phone ?? 'Not recorded'} />
              <DetailItem label="Email" value={detailVisitor.email ?? 'Not recorded'} />
              {detailVisitor.status === 'converted' && <DetailItem label="Conversion result" value="Linked Member record preserved" />}
            </dl>
            <div className="mt-5 flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={closeDetails}>Close</Button>
              {detailVisitor.status === 'active' && <Button variant="secondary" onClick={() => { closeDetails(); setFormContext({ mode: 'edit', visitor: detailVisitor }) }}><Pencil aria-hidden="true" className="size-4" />Edit Visitor</Button>}
              {detailVisitor.status === 'active' && <Button disabled={!canConvert} onClick={() => { closeDetails(); openConversion(detailVisitor) }}><ArrowRight aria-hidden="true" className="size-4" />Convert</Button>}
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        className="max-w-lg"
        isOpen={Boolean(conversionTarget)}
        onClose={() => setConversionTarget(null)}
        preventClose={isConverting}
        title="Convert Visitor to Member?"
        description={conversionTarget ? `${conversionTarget.firstName} ${conversionTarget.lastName} will receive a new permanent Member record. The Visitor record remains preserved as converted.` : undefined}
      >
        {conversionError && <FeedbackBanner className="mb-5" tone="error">{conversionError}</FeedbackBanner>}
        {conversionTarget && (
          <div className="space-y-5">
            <div className="border-y border-line py-4">
              <p className="hm-label">Copied to new Member</p>
              <p className="mt-2 text-sm font-medium text-ink">{conversionTarget.firstName} {conversionTarget.lastName}</p>
              <p className="mt-1 text-sm text-muted">{conversionTarget.phone ?? 'No phone'} · {conversionTarget.email ?? 'No email'}</p>
            </div>
            <FormField id="visitor-conversion-group" label="Life Group" required description={isAdmin ? 'Choose any current active Life Group.' : 'Your assigned Life Group is shown and cannot be changed.'}>
              <Select id="visitor-conversion-group" data-modal-autofocus value={conversionGroupId} disabled={isConverting || !isAdmin} onChange={(event) => setConversionGroupId(event.target.value)}>
                {isAdmin && <option value="">Select an active Life Group</option>}
                {(isAdmin ? activeLifeGroups : ownLifeGroup ? [ownLifeGroup] : []).map((lifeGroup) => <option key={lifeGroup.id} value={lifeGroup.id}>{lifeGroup.name}</option>)}
              </Select>
            </FormField>
            <p className="text-sm leading-6 text-muted">Conversion is one-way. Horizon creates the permanent QR token on the server; this process never reuses or overwrites an existing Member.</p>
            <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
              <Button variant="secondary" disabled={isConverting} onClick={() => setConversionTarget(null)}>Cancel</Button>
              <Button isLoading={isConverting} onClick={() => void handleConversion()}><ArrowRight aria-hidden="true" className="size-4" />Convert to Member</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
