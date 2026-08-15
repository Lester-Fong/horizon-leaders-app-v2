import {
  Archive,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  UserMinus,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'

import { useAuth } from '../auth/useAuth'
import {
  MinistryFormModal,
  type MinistryFormContext,
} from '../components/ministries/MinistryFormModal'
import { Button } from '../components/ui/Button'
import {
  EmptyState,
  ErrorState,
  FeedbackBanner,
  LoadingState,
} from '../components/ui/Feedback'
import { FormField, Select, TextInput } from '../components/ui/FormControls'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import { RowActionsMenu, type RowAction } from '../components/ui/RowActionsMenu'
import { StatusBadge } from '../components/ui/StatusBadge'
import {
  ApiError,
  archiveMinistry,
  assignMemberToMinistry,
  createMinistry,
  getMembers,
  getMinistries,
  getMinistry,
  getMinistryMembers,
  removeMemberFromMinistry,
  updateMinistry,
  type Member,
  type Ministry,
  type MinistryInput,
  type MinistryListStatus,
  type MinistryMember,
} from '../lib/api'
import { supabase } from '../lib/supabase'

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired.')
  }
  return data.session.access_token
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  return 'Ministry data is unavailable right now. Please try again.'
}

function memberName(member: MinistryMember | Member) {
  return `${member.firstName} ${member.lastName}`
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <dt className="hm-label">{label}</dt>
      <dd className="mt-1.5 break-words text-sm leading-6 text-ink">{value}</dd>
    </div>
  )
}

export function MinistriesPage() {
  const { actor } = useAuth()
  const isAdmin = actor?.role === 'admin'
  const [ministries, setMinistries] = useState<Ministry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<MinistryListStatus>('active')
  const [formContext, setFormContext] = useState<MinistryFormContext | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailMinistry, setDetailMinistry] = useState<Ministry | null>(null)
  const [detailMembers, setDetailMembers] = useState<MinistryMember[]>([])
  const [detailError, setDetailError] = useState<string | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<Ministry | null>(null)
  const [isArchiving, setIsArchiving] = useState(false)
  const [assignmentTarget, setAssignmentTarget] = useState<Ministry | null>(null)
  const [assignedMembers, setAssignedMembers] = useState<MinistryMember[]>([])
  const [candidateMembers, setCandidateMembers] = useState<Member[]>([])
  const [candidateSearch, setCandidateSearch] = useState('')
  const [candidateId, setCandidateId] = useState('')
  const [assignmentError, setAssignmentError] = useState<string | null>(null)
  const [isAssignmentLoading, setIsAssignmentLoading] = useState(false)
  const [isAssignmentSaving, setIsAssignmentSaving] = useState(false)

  const loadDirectory = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const token = await getAccessToken()
      setMinistries(
        await getMinistries(token, {
          ...(search ? { search } : {}),
          ...(isAdmin ? { status: statusFilter } : {}),
        }),
      )
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [isAdmin, search, statusFilter])

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void loadDirectory(), 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadDirectory])

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSearch(searchInput.trim())
  }

  function clearSearch() {
    setSearchInput('')
    setSearch('')
  }

  async function openDetails(ministry: Ministry) {
    setDetailId(ministry.id)
    setDetailMinistry(null)
    setDetailMembers([])
    setDetailError(null)
    setIsDetailLoading(true)
    try {
      const token = await getAccessToken()
      const [ministryData, memberData] = await Promise.all([
        getMinistry(token, ministry.id),
        getMinistryMembers(token, ministry.id),
      ])
      setDetailMinistry(ministryData)
      setDetailMembers(memberData)
    } catch (error) {
      setDetailError(getErrorMessage(error))
    } finally {
      setIsDetailLoading(false)
    }
  }

  function closeDetails() {
    if (isDetailLoading) return
    setDetailId(null)
    setDetailMinistry(null)
    setDetailMembers([])
    setDetailError(null)
  }

  function openEdit(ministry: Ministry) {
    setDetailId(null)
    setDetailMinistry(null)
    setFormContext({ ministry, mode: 'edit' })
  }

  async function saveMinistry(input: MinistryInput) {
    const token = await getAccessToken()
    if (formContext?.mode === 'edit') {
      return updateMinistry(token, formContext.ministry.id, input)
    }
    return createMinistry(token, input)
  }

  function handleMinistrySaved(ministry: Ministry) {
    const wasEditing = formContext?.mode === 'edit'
    setFormContext(null)
    setNotice(`${ministry.name} was ${wasEditing ? 'updated' : 'created'}.`)
    void loadDirectory()
  }

  async function handleArchive() {
    if (!archiveTarget) return
    setIsArchiving(true)
    setLoadError(null)
    setNotice(null)
    try {
      const token = await getAccessToken()
      const ministry = await archiveMinistry(token, archiveTarget.id)
      setNotice(`${ministry.name} was archived. Existing assignments were preserved.`)
      setArchiveTarget(null)
      setDetailId(null)
      setDetailMinistry(null)
      await loadDirectory()
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setIsArchiving(false)
    }
  }

  async function openAssignments(ministry: Ministry) {
    setDetailId(null)
    setDetailMinistry(null)
    setAssignmentTarget(ministry)
    setAssignedMembers([])
    setCandidateMembers([])
    setCandidateSearch('')
    setCandidateId('')
    setAssignmentError(null)
    setIsAssignmentLoading(true)
    try {
      const token = await getAccessToken()
      const [roster, activeMembers] = await Promise.all([
        getMinistryMembers(token, ministry.id),
        getMembers(token, { status: 'active' }),
      ])
      setAssignedMembers(roster)
      setCandidateMembers(activeMembers)
    } catch (error) {
      setAssignmentError(getErrorMessage(error))
    } finally {
      setIsAssignmentLoading(false)
    }
  }

  const availableCandidates = useMemo(() => {
    const assignedIds = new Set(assignedMembers.map((member) => member.id))
    const searchValue = candidateSearch.trim().toLocaleLowerCase('en')
    return candidateMembers.filter((member) => {
      if (assignedIds.has(member.id)) return false
      if (!searchValue) return true
      return [
        member.firstName,
        member.lastName,
        member.email ?? '',
        member.phone ?? '',
        member.lifeGroup.name,
      ].some((value) => value.toLocaleLowerCase('en').includes(searchValue))
    })
  }, [assignedMembers, candidateMembers, candidateSearch])

  async function handleAssignMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!assignmentTarget || !candidateId) {
      setAssignmentError('Select an active Member to add.')
      return
    }
    setIsAssignmentSaving(true)
    setAssignmentError(null)
    try {
      const token = await getAccessToken()
      const assigned = await assignMemberToMinistry(
        token,
        assignmentTarget.id,
        candidateId,
      )
      setAssignedMembers((current) =>
        [...current, assigned].sort((left, right) =>
          memberName(left).localeCompare(memberName(right)),
        ),
      )
      setCandidateId('')
      setNotice(`${memberName(assigned)} was added to ${assignmentTarget.name}.`)
    } catch (error) {
      setAssignmentError(getErrorMessage(error))
    } finally {
      setIsAssignmentSaving(false)
    }
  }

  async function handleRemoveMember(member: MinistryMember) {
    if (!assignmentTarget) return
    setIsAssignmentSaving(true)
    setAssignmentError(null)
    try {
      const token = await getAccessToken()
      await removeMemberFromMinistry(token, assignmentTarget.id, member.id)
      setAssignedMembers((current) =>
        current.filter((assigned) => assigned.id !== member.id),
      )
      setNotice(`${memberName(member)} was removed from ${assignmentTarget.name}.`)
    } catch (error) {
      setAssignmentError(getErrorMessage(error))
    } finally {
      setIsAssignmentSaving(false)
    }
  }

  function rowActions(ministry: Ministry): RowAction[] {
    const actions: RowAction[] = [
      {
        icon: Eye,
        label: 'View Ministry details',
        onSelect: () => void openDetails(ministry),
      },
    ]
    if (isAdmin) {
      actions.push(
        {
          icon: UsersRound,
          label: 'Manage assigned Members',
          onSelect: () => void openAssignments(ministry),
        },
        {
          icon: Pencil,
          label: 'Edit Ministry',
          onSelect: () => openEdit(ministry),
        },
      )
      if (ministry.isActive) {
        actions.push({
          icon: Archive,
          label: 'Archive Ministry',
          onSelect: () => setArchiveTarget(ministry),
        })
      }
    }
    return actions
  }

  const hasFilters = Boolean(search || (isAdmin && statusFilter !== 'active'))

  return (
    <div className="space-y-8">
      <PageHeader
        marker="03 — Service"
        title="Ministries"
        description={
          isAdmin
            ? 'Manage Ministries and their Member assignments without changing Member ownership or Life Group scope.'
            : 'View active Ministries and the assigned Members already visible within your Life Group scope.'
        }
        actions={
          <>
            {isAdmin && (
              <Button onClick={() => setFormContext({ mode: 'create' })}>
                <Plus aria-hidden="true" className="size-4" />
                New Ministry
              </Button>
            )}
            <Button variant="secondary" onClick={() => void loadDirectory()}>
              <RefreshCw aria-hidden="true" className="size-4" />
              Refresh
            </Button>
          </>
        }
      />

      {notice && <FeedbackBanner tone="success">{notice}</FeedbackBanner>}
      {loadError && ministries.length > 0 && (
        <FeedbackBanner tone="error">{loadError}</FeedbackBanner>
      )}

      <section aria-labelledby="ministry-directory-controls" className="space-y-5">
        <div className="flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p id="ministry-directory-controls" className="hm-label">
              Directory controls
            </p>
            <p className="mt-1 text-sm text-muted">
              {isAdmin
                ? 'Search within the selected Ministry status.'
                : 'Scope: Active Ministries / Read only'}
            </p>
          </div>
          {!isLoading && (
            <p className="font-mono text-xs text-muted" aria-live="polite">
              {ministries.length} {ministries.length === 1 ? 'Ministry' : 'Ministries'}
            </p>
          )}
        </div>

        <form
          className="grid gap-4 md:grid-cols-[minmax(14rem,1fr)_auto] lg:grid-cols-[minmax(16rem,1fr)_12rem_auto]"
          onSubmit={handleSearch}
        >
          <FormField id="ministry-search" label="Search" description="Ministry name">
            <TextInput
              id="ministry-search"
              type="search"
              value={searchInput}
              placeholder="Search Ministries"
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </FormField>
          {isAdmin && (
            <FormField id="ministry-status-filter" label="Status">
              <Select
                id="ministry-status-filter"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as MinistryListStatus)
                }
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </Select>
            </FormField>
          )}
          <div className="flex items-end gap-2">
            <Button type="submit" variant="secondary">
              <Search aria-hidden="true" className="size-4" />
              Search
            </Button>
            {search && (
              <Button type="button" variant="ghost" onClick={clearSearch}>
                Clear
              </Button>
            )}
          </div>
        </form>
      </section>

      {isLoading ? (
        <LoadingState title="Loading Ministries" description="Preparing the Ministry directory." />
      ) : loadError && ministries.length === 0 ? (
        <ErrorState
          title="Ministries could not be loaded"
          description={loadError}
          action={<Button onClick={() => void loadDirectory()}>Try again</Button>}
        />
      ) : ministries.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={hasFilters ? 'No Ministries match' : 'No active Ministries yet'}
          description={
            hasFilters
              ? 'Adjust the current search or status and try again.'
              : isAdmin
                ? 'Create the first Ministry to begin organizing Member assignments.'
                : 'No active Ministries are available to view.'
          }
          action={
            isAdmin && !hasFilters ? (
              <Button onClick={() => setFormContext({ mode: 'create' })}>
                <Plus aria-hidden="true" className="size-4" />
                New Ministry
              </Button>
            ) : hasFilters ? (
              <Button variant="secondary" onClick={clearSearch}>Clear search</Button>
            ) : undefined
          }
        />
      ) : (
        <ResponsiveTable
          caption="Ministry directory"
          tableClassName="horizon-table--ministries"
        >
          <thead>
            <tr>
              <th scope="col">Ministry</th>
              <th scope="col">Description</th>
              <th scope="col">Status</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {ministries.map((ministry) => (
              <tr key={ministry.id}>
                <td className="ministry-cell-primary">
                  <button
                    type="button"
                    className="min-h-10 text-left font-semibold text-ink underline-offset-4 hover:underline"
                    onClick={() => void openDetails(ministry)}
                  >
                    {ministry.name}
                  </button>
                </td>
                <td className="ministry-cell-description text-sm leading-6 text-muted">
                  {ministry.description ?? 'No description'}
                </td>
                <td className="ministry-cell-status">
                  <StatusBadge tone={ministry.isActive ? 'success' : 'neutral'}>
                    {ministry.isActive ? 'Active' : 'Archived'}
                  </StatusBadge>
                </td>
                <td className="ministry-cell-actions text-right">
                  <RowActionsMenu
                    label={`Actions for ${ministry.name}`}
                    actions={rowActions(ministry)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </ResponsiveTable>
      )}

      {formContext && (
        <MinistryFormModal
          context={formContext}
          onClose={() => setFormContext(null)}
          onSave={saveMinistry}
          onSaved={handleMinistrySaved}
        />
      )}

      <Modal
        className="max-w-2xl"
        isOpen={Boolean(detailId)}
        onClose={closeDetails}
        preventClose={isDetailLoading}
        title={detailMinistry?.name ?? 'Ministry details'}
        description="Ministry information and the assigned Members this account is authorized to see."
      >
        {isDetailLoading ? (
          <LoadingState title="Loading Ministry" description="Retrieving Ministry details and roster." />
        ) : detailError ? (
          <FeedbackBanner tone="error">{detailError}</FeedbackBanner>
        ) : detailMinistry ? (
          <div className="space-y-6">
            <dl>
              <DetailItem label="Status" value={detailMinistry.isActive ? 'Active' : 'Archived'} />
              <DetailItem label="Description" value={detailMinistry.description ?? 'No description recorded'} />
            </dl>
            <section aria-labelledby="ministry-roster-heading">
              <div className="flex items-end justify-between gap-4 border-b border-line pb-3">
                <div>
                  <p className="hm-label">Assigned Members</p>
                  <h3 id="ministry-roster-heading" className="mt-1 text-base font-semibold text-ink">
                    Visible roster
                  </h3>
                </div>
                <span className="font-mono text-xs text-muted">{detailMembers.length}</span>
              </div>
              {!isAdmin && (
                <p className="mt-3 text-xs leading-5 text-muted">
                  This roster shows active assigned Members from your own Life Group only.
                </p>
              )}
              {detailMembers.length === 0 ? (
                <p className="py-7 text-sm text-muted">
                  No assigned Members are visible within your current access scope.
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {detailMembers.map((member) => (
                    <li key={member.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{memberName(member)}</p>
                        <p className="mt-1 truncate font-mono text-xs text-muted">{member.lifeGroup.name}</p>
                      </div>
                      <StatusBadge tone={member.isActive ? 'success' : 'neutral'}>
                        {member.isActive ? 'Active' : 'Archived'}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={closeDetails}>Close</Button>
              {isAdmin && (
                <>
                  <Button variant="secondary" onClick={() => void openAssignments(detailMinistry)}>
                    <UsersRound aria-hidden="true" className="size-4" />
                    Manage Members
                  </Button>
                  <Button onClick={() => openEdit(detailMinistry)}>
                    <Pencil aria-hidden="true" className="size-4" />
                    Edit
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        className="max-w-3xl"
        isOpen={Boolean(assignmentTarget)}
        onClose={() => !isAssignmentSaving && setAssignmentTarget(null)}
        preventClose={isAssignmentSaving}
        title={assignmentTarget ? `Members of ${assignmentTarget.name}` : 'Manage Members'}
        description="Assign active Members or remove an existing assignment. Member records and Life Group ownership remain unchanged."
      >
        {assignmentError && (
          <FeedbackBanner className="mb-5" tone="error">{assignmentError}</FeedbackBanner>
        )}
        {isAssignmentLoading ? (
          <LoadingState title="Loading assignments" description="Preparing the Ministry roster and active Member choices." />
        ) : assignmentTarget ? (
          <div className="space-y-6">
            {assignmentTarget.isActive ? (
              <form className="space-y-4 border-b border-line pb-6" onSubmit={handleAssignMember}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField id="ministry-member-search" label="Find an active Member" description="Name, contact, or Life Group">
                    <TextInput
                      id="ministry-member-search"
                      data-modal-autofocus
                      type="search"
                      value={candidateSearch}
                      disabled={isAssignmentSaving}
                      onChange={(event) => {
                        setCandidateSearch(event.target.value)
                        setCandidateId('')
                      }}
                    />
                  </FormField>
                  <FormField id="ministry-member-select" label="Member" required>
                    <Select
                      id="ministry-member-select"
                      value={candidateId}
                      disabled={isAssignmentSaving}
                      onChange={(event) => setCandidateId(event.target.value)}
                    >
                      <option value="">Select an active Member</option>
                      {availableCandidates.map((member) => (
                        <option key={member.id} value={member.id}>
                          {memberName(member)} — {member.lifeGroup.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" isLoading={isAssignmentSaving} disabled={!candidateId}>
                    <UserPlus aria-hidden="true" className="size-4" />
                    Add Member
                  </Button>
                </div>
              </form>
            ) : (
              <FeedbackBanner title="Archived Ministry" tone="info">
                New assignments are closed. Existing assignments remain available for review or explicit removal.
              </FeedbackBanner>
            )}

            <section aria-labelledby="assigned-members-heading">
              <div className="flex items-end justify-between gap-4 border-b border-line pb-3">
                <h3 id="assigned-members-heading" className="text-base font-semibold text-ink">Assigned Members</h3>
                <span className="font-mono text-xs text-muted">{assignedMembers.length}</span>
              </div>
              {assignedMembers.length === 0 ? (
                <p className="py-8 text-sm text-muted">No Members are assigned to this Ministry.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {assignedMembers.map((member) => (
                    <li key={member.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{memberName(member)}</p>
                        <p className="mt-1 font-mono text-xs text-muted">
                          {member.lifeGroup.name} / {member.isActive ? 'Active' : 'Archived'}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isAssignmentSaving}
                        onClick={() => void handleRemoveMember(member)}
                      >
                        <UserMinus aria-hidden="true" className="size-4" />
                        Remove assignment
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <div className="flex justify-end border-t border-line pt-5">
              <Button variant="secondary" onClick={() => setAssignmentTarget(null)} disabled={isAssignmentSaving}>
                Done
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        preventClose={isArchiving}
        title="Archive Ministry?"
        description="The Ministry will leave the active directory. Its existing Member assignments will remain stored."
      >
        <p className="text-sm leading-6 text-muted">
          Archive <span className="font-semibold text-ink">{archiveTarget?.name}</span>? New Member assignments will no longer be allowed. This phase does not include reactivation.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setArchiveTarget(null)} disabled={isArchiving}>Cancel</Button>
          <Button variant="destructive" onClick={() => void handleArchive()} isLoading={isArchiving}>
            <Archive aria-hidden="true" className="size-4" />
            Archive Ministry
          </Button>
        </div>
      </Modal>
    </div>
  )
}
