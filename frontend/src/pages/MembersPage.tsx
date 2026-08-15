import {
  Archive,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Search,
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
  MemberFormModal,
  type MemberFormContext,
} from '../components/members/MemberFormModal'
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
  archiveMember,
  createMember,
  getLifeGroups,
  getMember,
  getMembers,
  updateMember,
  type LifeGroup,
  type Member,
  type MemberInput,
  type MemberListStatus,
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
  return 'Member data is unavailable right now. Please try again.'
}

function formatBirthDate(birthDate: string | null) {
  if (!birthDate) return 'Not recorded'
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${birthDate}T00:00:00.000Z`))
}

function formatGender(gender: Member['gender']) {
  if (!gender) return 'Not recorded'
  return gender === 'male' ? 'Male' : 'Female'
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <dt className="hm-label">{label}</dt>
      <dd className="mt-1.5 break-words text-sm leading-6 text-ink">{value}</dd>
    </div>
  )
}

export function MembersPage() {
  const { actor } = useAuth()
  const isAdmin = actor?.role === 'admin'
  const [members, setMembers] = useState<Member[]>([])
  const [lifeGroups, setLifeGroups] = useState<LifeGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [lifeGroupFilter, setLifeGroupFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<MemberListStatus>('active')
  const [formContext, setFormContext] = useState<MemberFormContext | null>(null)
  const [detailMemberId, setDetailMemberId] = useState<string | null>(null)
  const [detailMember, setDetailMember] = useState<Member | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<Member | null>(null)
  const [isArchiving, setIsArchiving] = useState(false)

  const activeLifeGroups = useMemo(
    () => lifeGroups.filter((lifeGroup) => lifeGroup.isActive),
    [lifeGroups],
  )
  const ownLifeGroup = useMemo(
    () => lifeGroups.find((lifeGroup) => lifeGroup.leader.id === actor?.id) ?? null,
    [actor?.id, lifeGroups],
  )
  const canCreate = isAdmin
    ? activeLifeGroups.length > 0
    : Boolean(ownLifeGroup?.isActive)

  const loadDirectory = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const token = await getAccessToken()
      const filters = isAdmin
        ? {
            ...(lifeGroupFilter ? { lifeGroupId: lifeGroupFilter } : {}),
            ...(search ? { search } : {}),
            status: statusFilter,
          }
        : { ...(search ? { search } : {}) }
      const [memberData, lifeGroupData] = await Promise.all([
        getMembers(token, filters),
        getLifeGroups(token),
      ])
      setMembers(memberData)
      setLifeGroups(lifeGroupData)
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [isAdmin, lifeGroupFilter, search, statusFilter])

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

  async function openDetails(member: Member) {
    setDetailMemberId(member.id)
    setDetailMember(null)
    setDetailError(null)
    setIsDetailLoading(true)
    try {
      const token = await getAccessToken()
      setDetailMember(await getMember(token, member.id))
    } catch (error) {
      setDetailError(getErrorMessage(error))
    } finally {
      setIsDetailLoading(false)
    }
  }

  function closeDetails() {
    if (isDetailLoading) return
    setDetailMemberId(null)
    setDetailMember(null)
    setDetailError(null)
  }

  function openEdit(member: Member) {
    setDetailMemberId(null)
    setDetailMember(null)
    setFormContext({ member, mode: 'edit' })
  }

  function getRowActions(member: Member): RowAction[] {
    const actions: RowAction[] = [
      {
        icon: Eye,
        label: 'View Member details',
        onSelect: () => void openDetails(member),
      },
      {
        icon: Pencil,
        label: 'Edit Member',
        onSelect: () => openEdit(member),
      },
    ]
    if (isAdmin && member.isActive) {
      actions.push({
        icon: Archive,
        label: 'Archive Member',
        onSelect: () => setArchiveTarget(member),
      })
    }
    return actions
  }

  async function saveMember(input: MemberInput) {
    const token = await getAccessToken()
    if (formContext?.mode === 'edit') {
      return updateMember(token, formContext.member.id, input)
    }
    return createMember(token, input)
  }

  function handleMemberSaved(member: Member) {
    const wasEditing = formContext?.mode === 'edit'
    setFormContext(null)
    setNotice(
      `${member.firstName} ${member.lastName} was ${wasEditing ? 'updated' : 'created'}.`,
    )
    void loadDirectory()
  }

  async function handleArchive() {
    if (!archiveTarget) return
    setIsArchiving(true)
    setLoadError(null)
    setNotice(null)
    try {
      const token = await getAccessToken()
      const archivedMember = await archiveMember(token, archiveTarget.id)
      setNotice(
        `${archivedMember.firstName} ${archivedMember.lastName} was archived.`,
      )
      setArchiveTarget(null)
      setDetailMemberId(null)
      setDetailMember(null)
      await loadDirectory()
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setIsArchiving(false)
    }
  }

  const hasFilters = Boolean(
    search || (isAdmin && (lifeGroupFilter || statusFilter !== 'active')),
  )

  return (
    <div className="space-y-8">
      <PageHeader
        marker="02 — People"
        title="Members"
        description={
          isAdmin
            ? 'Manage Member records across Life Groups, including archived history.'
            : `Manage active Members in ${ownLifeGroup?.name ?? 'your assigned Life Group'}.`
        }
        actions={
          <>
            <Button
              onClick={() => setFormContext({ mode: 'create' })}
              disabled={!canCreate || Boolean(loadError)}
            >
              <Plus aria-hidden="true" className="size-4" />
              New Member
            </Button>
            <Button variant="secondary" onClick={() => void loadDirectory()}>
              <RefreshCw aria-hidden="true" className="size-4" />
              Refresh
            </Button>
          </>
        }
      />

      {notice && <FeedbackBanner tone="success">{notice}</FeedbackBanner>}
      {loadError && members.length > 0 && (
        <FeedbackBanner tone="error">{loadError}</FeedbackBanner>
      )}
      {!canCreate && !loadError && (
        <FeedbackBanner tone="warning" title="An active Life Group is required">
          {isAdmin
            ? 'Create or reactivate a Life Group before adding a Member.'
            : 'Your assigned Life Group must be active before you can add Members.'}
        </FeedbackBanner>
      )}

      <section aria-labelledby="member-directory-controls" className="space-y-5">
        <div className="flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p id="member-directory-controls" className="hm-label">
              Directory controls
            </p>
            <p className="mt-1 text-sm text-muted">
              {isAdmin
                ? 'Search within the selected Life Group and status.'
                : `Scope: ${ownLifeGroup?.name ?? 'No assigned Life Group'} / Active only`}
            </p>
          </div>
          {!isLoading && (
            <p className="font-mono text-xs text-muted" aria-live="polite">
              {members.length} {members.length === 1 ? 'Member' : 'Members'}
            </p>
          )}
        </div>

        <form
          className="grid gap-4 md:grid-cols-[minmax(14rem,1fr)_auto] xl:grid-cols-[minmax(16rem,1fr)_14rem_10rem_auto]"
          onSubmit={handleSearch}
        >
          <FormField
            id="member-search"
            label="Search"
            description="Name, phone, email, or address"
          >
            <TextInput
              id="member-search"
              type="search"
              value={searchInput}
              placeholder="Search Members"
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </FormField>
          {isAdmin && (
            <FormField id="member-life-group-filter" label="Life Group">
              <Select
                id="member-life-group-filter"
                value={lifeGroupFilter}
                onChange={(event) => setLifeGroupFilter(event.target.value)}
              >
                <option value="">All Life Groups</option>
                {lifeGroups.map((lifeGroup) => (
                  <option key={lifeGroup.id} value={lifeGroup.id}>
                    {lifeGroup.name}{lifeGroup.isActive ? '' : ' (Archived)'}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          {isAdmin && (
            <FormField id="member-status-filter" label="Status">
              <Select
                id="member-status-filter"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as MemberListStatus)
                }
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </Select>
            </FormField>
          )}
          <div className="flex items-end gap-2 md:justify-end">
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
        <LoadingState
          title="Loading Members"
          description="Retrieving the authorized Member directory."
        />
      ) : loadError && members.length === 0 ? (
        <ErrorState
          title="Members could not be loaded"
          description={loadError}
          action={<Button onClick={() => void loadDirectory()}>Try again</Button>}
        />
      ) : members.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={hasFilters ? 'No Members match these controls' : 'No Members yet'}
          description={
            hasFilters
              ? 'Adjust the search or filters to review a different authorized set.'
              : 'Use New Member when the first Member is ready to be added.'
          }
        />
      ) : (
        <ResponsiveTable
          caption="Authorized Member directory"
          tableClassName="horizon-table--members"
        >
          <thead>
            <tr>
              <th scope="col">Member</th>
              <th scope="col">Contact</th>
              <th scope="col">Life Group</th>
              <th scope="col">Status</th>
              <th scope="col" className="w-16">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id}>
                <td className="member-cell-primary">
                  <span className="hm-table-mobile-label">Member</span>
                  <p className="font-medium text-ink">
                    {member.firstName} {member.lastName}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {member.gender ? formatGender(member.gender) : 'Gender not recorded'}
                  </p>
                </td>
                <td className="member-cell-contact">
                  <span className="hm-table-mobile-label">Contact</span>
                  <p className="text-sm text-ink">{member.phone ?? 'No phone'}</p>
                  <p className="mt-1 break-all text-xs text-muted">
                    {member.email ?? 'No email'}
                  </p>
                </td>
                <td className="member-cell-group">
                  <span className="hm-table-mobile-label">Life Group</span>
                  <p className="text-sm font-medium text-ink">
                    {member.lifeGroup.name}
                  </p>
                  {!member.lifeGroup.isActive && (
                    <p className="mt-1 text-xs text-muted">Archived Life Group</p>
                  )}
                </td>
                <td className="member-cell-status">
                  <span className="hm-table-mobile-label">Status</span>
                  <StatusBadge tone={member.isActive ? 'success' : 'neutral'}>
                    {member.isActive ? 'Active' : 'Archived'}
                  </StatusBadge>
                </td>
                <td className="member-cell-actions text-right">
                  <RowActionsMenu
                    label={`Actions for ${member.firstName} ${member.lastName}`}
                    actions={getRowActions(member)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </ResponsiveTable>
      )}

      {formContext && actor && (
        <MemberFormModal
          key={
            formContext.mode === 'edit'
              ? `edit-${formContext.member.id}`
              : 'create-member'
          }
          actorId={actor.id}
          actorRole={actor.role}
          context={formContext}
          lifeGroups={lifeGroups}
          onClose={() => setFormContext(null)}
          onSave={saveMember}
          onSaved={handleMemberSaved}
        />
      )}

      <Modal
        className="max-w-lg"
        isOpen={Boolean(detailMemberId)}
        onClose={closeDetails}
        preventClose={isDetailLoading}
        title={
          detailMember
            ? `${detailMember.firstName} ${detailMember.lastName}`
            : 'Member details'
        }
        description="Current Member information and Life Group context."
      >
        {isDetailLoading ? (
          <LoadingState
            title="Loading Member"
            description="Retrieving the current authorized record."
          />
        ) : detailError ? (
          <FeedbackBanner tone="error">{detailError}</FeedbackBanner>
        ) : detailMember ? (
          <>
            <div className="flex items-center justify-between gap-4 border-y border-line py-3">
              <span className="hm-label">Member status</span>
              <StatusBadge tone={detailMember.isActive ? 'success' : 'neutral'}>
                {detailMember.isActive ? 'Active' : 'Archived'}
              </StatusBadge>
            </div>
            <dl className="mt-3 grid sm:grid-cols-2 sm:gap-x-6">
              <DetailItem label="Life Group" value={detailMember.lifeGroup.name} />
              <DetailItem label="Phone" value={detailMember.phone ?? 'Not recorded'} />
              <DetailItem label="Email" value={detailMember.email ?? 'Not recorded'} />
              <DetailItem label="Birth date" value={formatBirthDate(detailMember.birthDate)} />
              <DetailItem label="Gender" value={formatGender(detailMember.gender)} />
              <DetailItem label="Address" value={detailMember.address ?? 'Not recorded'} />
            </dl>
            <div className="mt-5 flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={closeDetails}>
                Close
              </Button>
              <Button variant="secondary" onClick={() => openEdit(detailMember)}>
                <Pencil aria-hidden="true" className="size-4" />
                Edit Member
              </Button>
              {isAdmin && detailMember.isActive && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    setDetailMemberId(null)
                    setDetailMember(null)
                    setArchiveTarget(detailMember)
                  }}
                >
                  <Archive aria-hidden="true" className="size-4" />
                  Archive
                </Button>
              )}
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        className="max-w-md"
        isOpen={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        preventClose={isArchiving}
        title="Archive Member?"
        description={
          archiveTarget
            ? `${archiveTarget.firstName} ${archiveTarget.lastName} will leave active Member directories. The record and permanent QR token will be preserved.`
            : undefined
        }
      >
        <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            disabled={isArchiving}
            onClick={() => setArchiveTarget(null)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            isLoading={isArchiving}
            onClick={() => void handleArchive()}
          >
            <Archive aria-hidden="true" className="size-4" />
            Archive Member
          </Button>
        </div>
      </Modal>
    </div>
  )
}
