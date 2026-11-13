import {
  ArrowRight,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Users,
  UserRoundPlus,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { useAuth } from '../auth/useAuth'
import {
  VisitorFormModal,
  type VisitorFormContext,
} from '../components/visitors/VisitorFormModal'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, FeedbackBanner, LoadingState } from '../components/ui/Feedback'
import { FilteredEmptyState } from '../components/ui/FilteredEmptyState'
import { FormField, Select } from '../components/ui/FormControls'
import { SearchControl } from '../components/ui/SearchControl'
import { cn } from '../lib/cn'
import { LoadMoreFooter } from '../components/ui/LoadMoreFooter'
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
  getVisitorsPage,
  setVisitorLifeGroup,
  updateVisitor,
  type LifeGroup,
  type Visitor,
  type VisitorInput,
  type VisitorListStatus,
} from '../lib/api'
import {
  readEnum,
  readSearch,
  useListSearchParams,
  useSearchInput,
} from '../lib/listSearchParams'
import { getAccessToken } from '../lib/session'
import { DIRECTORY_FIRST_PAGE, usePagedList } from '../lib/usePagedList'
import { usePageTitle } from '../lib/usePageTitle'

const VISITOR_STATUSES: readonly VisitorListStatus[] = ['active', 'converted', 'all']
const VISITOR_LIST_DEFAULTS = { search: '', status: 'active' }

const VISITOR_UNAVAILABLE_NOTICE = 'This Visitor is no longer active.'

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  return 'Visitor data is unavailable right now. Please try again.'
}

/** The Visitor was converted or removed by someone else, so this action no longer applies. */
function isVisitorUnavailableError(error: unknown) {
  return error instanceof ApiError &&
    (error.code === 'VISITOR_NOT_ACTIVE' || error.code === 'VISITOR_NOT_FOUND')
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
  usePageTitle('Visitors')
  const { actor } = useAuth()
  const isAdmin = actor?.role === 'admin'
  const {
    reset: resetListParams,
    searchParams,
    update: updateListParams,
  } = useListSearchParams(VISITOR_LIST_DEFAULTS)
  const search = readSearch(searchParams)
  // Leaders only see active Visitors; a status in the URL is ignored for them.
  const statusFilter = isAdmin
    ? readEnum(searchParams, 'status', VISITOR_STATUSES, 'active')
    : 'active'
  const [searchInput, setSearchInput] = useSearchInput(search)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const visitorList = usePagedList<Visitor>(getErrorMessage)
  const { items: visitors, loadMore, replace: replaceVisitors } = visitorList
  const [lifeGroups, setLifeGroups] = useState<LifeGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ message: string; tone: 'success' | 'warning' } | null>(null)
  const [formContext, setFormContext] = useState<VisitorFormContext | null>(null)
  const [detailVisitorId, setDetailVisitorId] = useState<string | null>(null)
  const [detailVisitor, setDetailVisitor] = useState<Visitor | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [conversionTarget, setConversionTarget] = useState<Visitor | null>(null)
  const [conversionGroupId, setConversionGroupId] = useState('')
  const [conversionError, setConversionError] = useState<string | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [affiliationTarget, setAffiliationTarget] = useState<Visitor | null>(null)
  const [affiliationGroupId, setAffiliationGroupId] = useState('')
  const [affiliationError, setAffiliationError] = useState<string | null>(null)
  const [isAffiliationSaving, setIsAffiliationSaving] = useState(false)

  const activeLifeGroups = useMemo(
    () => lifeGroups.filter((lifeGroup) => lifeGroup.isActive),
    [lifeGroups],
  )
  const ownLifeGroup = useMemo(
    () => lifeGroups.find((lifeGroup) => lifeGroup.leader.id === actor?.id) ?? null,
    [actor?.id, lifeGroups],
  )
  function canConvertVisitor(visitor: Visitor) {
    if (visitor.lifeGroup) {
      return visitor.lifeGroup.isActive &&
        (isAdmin || visitor.lifeGroup.id === ownLifeGroup?.id)
    }
    return isAdmin ? activeLifeGroups.length > 0 : Boolean(ownLifeGroup?.isActive)
  }

  function canManageAffiliation(visitor: Visitor) {
    return visitor.status === 'active' && (
      isAdmin ||
      visitor.lifeGroup === null ||
      visitor.lifeGroup.id === ownLifeGroup?.id
    )
  }

  const visitorFilters = useMemo(
    () => isAdmin
      ? { ...(search ? { search } : {}), status: statusFilter }
      : { ...(search ? { search } : {}) },
    [isAdmin, search, statusFilter],
  )

  // Changing search or status reloads from the first page.
  const loadDirectory = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const token = await getAccessToken()
      const [visitorPage, lifeGroupData] = await Promise.all([
        getVisitorsPage(token, visitorFilters, DIRECTORY_FIRST_PAGE),
        getLifeGroups(token),
      ])
      replaceVisitors(visitorPage)
      setLifeGroups(lifeGroupData)
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [replaceVisitors, visitorFilters])

  const loadMoreVisitors = useCallback(
    () =>
      loadMore(async (page) =>
        getVisitorsPage(await getAccessToken(), visitorFilters, page),
      ),
    [loadMore, visitorFilters],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDirectory(), 0)
    return () => window.clearTimeout(timer)
  }, [loadDirectory])

  // Loads the open Visitor; a response for a closed or replaced dialog is ignored.
  useEffect(() => {
    if (!detailVisitorId) return
    let isCurrent = true
    void (async () => {
      try {
        const loadedVisitor = await getVisitor(await getAccessToken(), detailVisitorId)
        if (isCurrent) setDetailVisitor(loadedVisitor)
      } catch (error) {
        if (isCurrent) setDetailError(getErrorMessage(error))
      } finally {
        if (isCurrent) setIsDetailLoading(false)
      }
    })()
    return () => {
      isCurrent = false
    }
  }, [detailVisitorId])

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    updateListParams({ search: searchInput.trim() })
  }

  function clearSearch() {
    setSearchInput('')
    updateListParams({ search: '' })
  }

  /** Empty-state actions: clear, then return focus to the search field. */
  function clearSearchAndFocus() {
    clearSearch()
    searchInputRef.current?.focus()
  }

  function clearFiltersAndFocus() {
    setSearchInput('')
    resetListParams()
    searchInputRef.current?.focus()
  }

  function openDetails(visitor: Visitor) {
    // Re-selecting the open Visitor would not re-run the loading effect.
    if (visitor.id === detailVisitorId) return
    setDetailVisitorId(visitor.id)
    setDetailVisitor(null)
    setDetailError(null)
    setIsDetailLoading(true)
  }

  function closeDetails() {
    setIsDetailLoading(false)
    setDetailVisitorId(null)
    setDetailVisitor(null)
    setDetailError(null)
  }

  function openConversion(visitor: Visitor) {
    const initialGroupId = visitor.lifeGroup?.id ?? (
      isAdmin ? activeLifeGroups[0]?.id ?? '' : ownLifeGroup?.id ?? ''
    )
    setConversionTarget(visitor)
    setConversionGroupId(initialGroupId)
    setConversionError(null)
  }

  function openAffiliation(visitor: Visitor) {
    setAffiliationTarget(visitor)
    setAffiliationGroupId(visitor.lifeGroup?.id ?? '')
    setAffiliationError(null)
  }

  function getRowActions(visitor: Visitor): RowAction[] {
    const actions: RowAction[] = [{ icon: Eye, label: 'View Visitor details', onSelect: () => openDetails(visitor) }]
    if (visitor.status === 'active') {
      actions.push({ icon: Pencil, label: 'Edit Visitor', onSelect: () => setFormContext({ mode: 'edit', visitor }) })
      if (canManageAffiliation(visitor)) {
        actions.push({ icon: Users, label: 'Manage Life Group', onSelect: () => openAffiliation(visitor) })
      }
      actions.push({ disabled: !canConvertVisitor(visitor), icon: ArrowRight, label: 'Convert to Member', onSelect: () => openConversion(visitor) })
    }
    return actions
  }

  /** Closes every Visitor dialog, explains why, and refreshes the stale list. */
  function handleVisitorUnavailable() {
    setFormContext(null)
    setConversionTarget(null)
    setAffiliationTarget(null)
    setNotice({ message: VISITOR_UNAVAILABLE_NOTICE, tone: 'warning' })
    void loadDirectory()
  }

  async function saveVisitor(input: VisitorInput) {
    const token = await getAccessToken()
    if (formContext?.mode !== 'edit') return createVisitor(token, input)
    try {
      return await updateVisitor(token, formContext.visitor.id, input)
    } catch (error) {
      if (isVisitorUnavailableError(error)) handleVisitorUnavailable()
      throw error
    }
  }

  function handleVisitorSaved(visitor: Visitor) {
    const wasEditing = formContext?.mode === 'edit'
    setFormContext(null)
    setNotice({
      message: `${visitor.firstName} ${visitor.lastName} was ${wasEditing ? 'updated' : 'created'}.`,
      tone: 'success',
    })
    void loadDirectory()
  }

  async function handleConversion() {
    if (!conversionTarget || (!conversionTarget.lifeGroup && !conversionGroupId)) {
      setConversionError('Select an active Life Group for the new Member.')
      return
    }
    setIsConverting(true)
    setConversionError(null)
    try {
      const result = await convertVisitor(
        await getAccessToken(),
        conversionTarget.id,
        conversionTarget.lifeGroup ? undefined : conversionGroupId,
      )
      setNotice({
        message: `${result.visitor.firstName} ${result.visitor.lastName} was converted to a Member in ${result.member.lifeGroup.name}.`,
        tone: 'success',
      })
      setConversionTarget(null)
      setDetailVisitorId(null)
      setDetailVisitor(null)
      await loadDirectory()
    } catch (error) {
      if (isVisitorUnavailableError(error)) handleVisitorUnavailable()
      else setConversionError(getErrorMessage(error))
    } finally {
      setIsConverting(false)
    }
  }

  async function handleAffiliation() {
    if (!affiliationTarget) return
    const nextLifeGroupId = isAdmin
      ? affiliationGroupId || null
      : affiliationTarget.lifeGroup
        ? null
        : ownLifeGroup?.id ?? null
    if (!isAdmin && !nextLifeGroupId && !affiliationTarget.lifeGroup) {
      setAffiliationError('Your active Life Group is required before assigning this Visitor.')
      return
    }
    setIsAffiliationSaving(true)
    setAffiliationError(null)
    try {
      const updated = await setVisitorLifeGroup(
        await getAccessToken(),
        affiliationTarget.id,
        nextLifeGroupId,
      )
      setNotice({
        message: updated.lifeGroup
          ? `${updated.firstName} ${updated.lastName} is now affiliated with ${updated.lifeGroup.name}.`
          : `${updated.firstName} ${updated.lastName} is now unassigned.`,
        tone: 'success',
      })
      setAffiliationTarget(null)
      await loadDirectory()
    } catch (error) {
      if (isVisitorUnavailableError(error)) handleVisitorUnavailable()
      else setAffiliationError(getErrorMessage(error))
    } finally {
      setIsAffiliationSaving(false)
    }
  }

  // Filters other than the text search; always false for Leaders.
  const hasFilters = statusFilter !== 'active'

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

      {notice && <FeedbackBanner tone={notice.tone}>{notice.message}</FeedbackBanner>}
      {loadError && visitors.length > 0 && <FeedbackBanner tone="error">{loadError}</FeedbackBanner>}
      {!isAdmin && !ownLifeGroup?.isActive && !loadError && (
        <FeedbackBanner tone="warning" title="An active Life Group is required for conversion">
          Your assigned Life Group must be active before you can assign or convert an unassigned Visitor.
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
          <p className="font-mono text-xs text-muted" role="status" aria-live="polite">
            {isLoading ? 'Loading…' : `${visitorList.total} ${visitorList.total === 1 ? 'Visitor' : 'Visitors'}`}
          </p>
        </div>
        <form className={cn('grid items-end gap-4', isAdmin ? 'lg:grid-cols-[minmax(0,40rem)_12rem]' : 'max-w-2xl')} onSubmit={handleSearch}>
          <SearchControl id="visitor-search" inputRef={searchInputRef} description="Name, phone, or email" placeholder="Search Visitors" value={searchInput} isApplied={Boolean(search)} onChange={setSearchInput} onClear={clearSearch} />
          {isAdmin && (
            <FormField id="visitor-status-filter" label="Status">
              <Select id="visitor-status-filter" value={statusFilter} onChange={(event) => updateListParams({ status: event.target.value })}>
                <option value="active">Active</option>
                <option value="converted">Converted</option>
                <option value="all">All</option>
              </Select>
            </FormField>
          )}
        </form>
      </section>

      {isLoading ? (
        <LoadingState title="Loading Visitors" description="Retrieving the authorized Visitor directory." />
      ) : loadError && visitors.length === 0 ? (
        <ErrorState title="Visitors could not be loaded" description={loadError} action={<Button onClick={() => void loadDirectory()}>Try again</Button>} />
      ) : visitors.length === 0 && (search || hasFilters) ? (
        <FilteredEmptyState
          icon={UserRoundPlus}
          plural="Visitors"
          search={search}
          searchFields="name, phone, or email"
          hasFilters={hasFilters}
          onClearFilters={clearFiltersAndFocus}
          onClearSearch={clearSearchAndFocus}
        />
      ) : visitors.length === 0 ? (
        <EmptyState
          icon={UserRoundPlus}
          title="No active Visitors yet"
          description="Use New Visitor when someone is ready to be recorded."
        />
      ) : (
        <ResponsiveTable caption="Authorized Visitor directory" tableClassName="horizon-table--visitors">
          <thead><tr><th scope="col">Visitor</th><th scope="col">Contact</th><th scope="col">Life Group</th><th scope="col">Status</th><th scope="col" className="w-16"><span className="sr-only">Actions</span></th></tr></thead>
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
                  <span className="hm-table-mobile-label">Life Group</span>
                  <p className="text-sm font-medium text-ink">{visitor.lifeGroup?.name ?? 'Unassigned'}</p>
                  {visitor.lifeGroup && !visitor.lifeGroup.isActive && <p className="mt-1 text-xs text-muted">Archived group</p>}
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

      {!isLoading && visitors.length > 0 && (
        <LoadMoreFooter
          error={visitorList.loadMoreError}
          hasMore={visitorList.hasMore}
          isLoading={visitorList.isLoadingMore}
          label="Visitors"
          onLoadMore={() => void loadMoreVisitors()}
          shown={visitors.length}
          total={visitorList.total}
        />
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
              <DetailItem label="Life Group" value={detailVisitor.lifeGroup?.name ?? 'Unassigned'} />
              {detailVisitor.status === 'converted' && <DetailItem label="Conversion result" value="Linked Member record preserved" />}
            </dl>
            <div className="mt-5 flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={closeDetails}>Close</Button>
              {detailVisitor.status === 'active' && <Button variant="secondary" onClick={() => { closeDetails(); setFormContext({ mode: 'edit', visitor: detailVisitor }) }}><Pencil aria-hidden="true" className="size-4" />Edit Visitor</Button>}
              {detailVisitor.status === 'active' && canManageAffiliation(detailVisitor) && <Button variant="secondary" onClick={() => { closeDetails(); openAffiliation(detailVisitor) }}><Users aria-hidden="true" className="size-4" />Life Group</Button>}
              {detailVisitor.status === 'active' && <Button disabled={!canConvertVisitor(detailVisitor)} onClick={() => { closeDetails(); openConversion(detailVisitor) }}><ArrowRight aria-hidden="true" className="size-4" />Convert</Button>}
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        className="max-w-lg"
        isOpen={Boolean(affiliationTarget)}
        onClose={() => setAffiliationTarget(null)}
        preventClose={isAffiliationSaving}
        title="Manage Visitor Life Group"
        description={affiliationTarget ? `Update ${affiliationTarget.firstName} ${affiliationTarget.lastName}'s current Visitor affiliation. This does not make them a Member.` : undefined}
      >
        {affiliationError && <FeedbackBanner className="mb-5" tone="error">{affiliationError}</FeedbackBanner>}
        {affiliationTarget && (
          <div className="space-y-5">
            {isAdmin ? (
              <FormField id="visitor-affiliation-group" label="Life Group" description="Choose an active Life Group, or leave unassigned.">
                <Select id="visitor-affiliation-group" data-modal-autofocus value={affiliationGroupId} disabled={isAffiliationSaving} onChange={(event) => setAffiliationGroupId(event.target.value)}>
                  <option value="">Unassigned</option>
                  {activeLifeGroups.map((lifeGroup) => <option key={lifeGroup.id} value={lifeGroup.id}>{lifeGroup.name}</option>)}
                </Select>
              </FormField>
            ) : (
              <div className="border-y border-line py-4" tabIndex={-1} data-modal-autofocus>
                <p className="hm-label">Approved change</p>
                <p className="mt-2 text-sm font-medium text-ink">
                  {affiliationTarget.lifeGroup
                    ? `Unassign from ${affiliationTarget.lifeGroup.name}`
                    : `Assign to ${ownLifeGroup?.name ?? 'your Life Group'}`}
                </p>
                <p className="mt-1 text-sm leading-6 text-muted">Leaders cannot move Visitors between groups or take a Visitor from another group.</p>
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
              <Button variant="secondary" disabled={isAffiliationSaving} onClick={() => setAffiliationTarget(null)}>Cancel</Button>
              <Button isLoading={isAffiliationSaving} onClick={() => void handleAffiliation()}>
                {isAdmin ? 'Save affiliation' : affiliationTarget.lifeGroup ? 'Unassign Visitor' : 'Assign Visitor'}
              </Button>
            </div>
          </div>
        )}
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
            {conversionTarget.lifeGroup ? (
              <div className="border-y border-line py-4" tabIndex={-1} data-modal-autofocus>
                <p className="hm-label">Inherited Life Group</p>
                <p className="mt-2 text-sm font-medium text-ink">{conversionTarget.lifeGroup.name}</p>
                <p className="mt-1 text-sm leading-6 text-muted">The new Member inherits the Visitor's existing pastoral affiliation. It cannot be changed during conversion.</p>
              </div>
            ) : (
              <FormField id="visitor-conversion-group" label="Life Group" required description={isAdmin ? 'Choose any current active Life Group.' : 'Your assigned Life Group is shown and cannot be changed.'}>
                <Select id="visitor-conversion-group" data-modal-autofocus value={conversionGroupId} disabled={isConverting || !isAdmin} onChange={(event) => setConversionGroupId(event.target.value)}>
                  {isAdmin && <option value="">Select an active Life Group</option>}
                  {(isAdmin ? activeLifeGroups : ownLifeGroup ? [ownLifeGroup] : []).map((lifeGroup) => <option key={lifeGroup.id} value={lifeGroup.id}>{lifeGroup.name}</option>)}
                </Select>
              </FormField>
            )}
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
