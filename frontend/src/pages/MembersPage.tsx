import {
  Archive,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  UsersRound,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'

import { useAuth } from '../auth/useAuth'
import {
  MemberFormModal,
  type MemberFormContext,
} from '../components/members/MemberFormModal'
import { MemberQrPanel } from '../components/members/MemberQrPanel'
import { ImageAssetPanel } from '../components/uploads/ImageAssetPanel'
import { LoadMoreFooter } from '../components/ui/LoadMoreFooter'
import { Button } from '../components/ui/Button'
import {
  EmptyState,
  ErrorState,
  FeedbackBanner,
  LoadingState,
} from '../components/ui/Feedback'
import { FilteredEmptyState } from '../components/ui/FilteredEmptyState'
import { FormField, Select } from '../components/ui/FormControls'
import { SearchControl } from '../components/ui/SearchControl'
import { cn } from '../lib/cn'
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
  getMemberPhoto,
  getMembersPage,
  updateMember,
  uploadMemberPhoto,
  removeMemberPhoto,
  type LifeGroup,
  type Member,
  type MemberSummary,
  type MemberInput,
  type MemberListStatus,
  type MemberAgeFilter,
  type MemberGenderFilter,
} from '../lib/api'
import { formatCalendarDate } from '../lib/dates'
import {
  readEnum,
  readSearch,
  readUuid,
  useListSearchParams,
  useSearchInput,
} from '../lib/listSearchParams'
import { getAccessToken } from '../lib/session'
import { DIRECTORY_FIRST_PAGE, usePagedList } from '../lib/usePagedList'
import { usePageTitle } from '../lib/usePageTitle'

const MEMBER_STATUSES: readonly MemberListStatus[] = ['active', 'archived', 'all']
const MEMBER_GENDERS: readonly (MemberGenderFilter | '')[] = ['', 'male', 'female', 'not_set']
const MEMBER_AGES: readonly (MemberAgeFilter | '')[] = [
  '',
  'under_18',
  '18_24',
  '25_34',
  '35_44',
  '45_54',
  '55_plus',
  'not_set',
]
const MEMBER_LIST_DEFAULTS = {
  age: '',
  gender: '',
  lifeGroupId: '',
  search: '',
  status: 'active',
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  return 'Member data is unavailable right now. Please try again.'
}

function formatBirthDate(birthDate: string | null) {
  if (!birthDate) return 'Not recorded'
  return formatCalendarDate(birthDate)
}

function formatGender(gender: MemberSummary['gender']) {
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
  usePageTitle('Members')
  const { actor } = useAuth()
  const {
    reset: resetListParams,
    searchParams,
    update: updateListParams,
  } = useListSearchParams(MEMBER_LIST_DEFAULTS)
  const isAdmin = actor?.role === 'admin'
  const search = readSearch(searchParams)
  // Leaders always see their own group's active Members; ignore Admin-only filters.
  const lifeGroupFilter = isAdmin ? readUuid(searchParams, 'lifeGroupId') : ''
  const statusFilter = isAdmin
    ? readEnum(searchParams, 'status', MEMBER_STATUSES, 'active')
    : 'active'
  const genderFilter = readEnum(searchParams, 'gender', MEMBER_GENDERS, '')
  const ageFilter = readEnum(searchParams, 'age', MEMBER_AGES, '')
  const [searchInput, setSearchInput] = useSearchInput(search)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const memberList = usePagedList<MemberSummary>(getErrorMessage)
  const { items: members, loadMore, replace: replaceMembers } = memberList
  const [lifeGroups, setLifeGroups] = useState<LifeGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [formContext, setFormContext] = useState<MemberFormContext | null>(null)
  const [detailMemberId, setDetailMemberId] = useState<string | null>(null)
  const [detailMember, setDetailMember] = useState<Member | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<MemberSummary | null>(null)
  const [isArchiving, setIsArchiving] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)

  const detailMemberImageId = detailMember?.id ?? null
  const loadMemberPhoto = useCallback(async () => {
    if (!detailMemberImageId) return { imageUrl: null }
    return getMemberPhoto(await getAccessToken(), detailMemberImageId)
  }, [detailMemberImageId])
  const saveMemberPhoto = useCallback(async (file: File) => {
    if (!detailMemberImageId) return { imageUrl: null }
    return uploadMemberPhoto(await getAccessToken(), detailMemberImageId, file)
  }, [detailMemberImageId])
  const deleteMemberPhoto = useCallback(async () => {
    if (!detailMemberImageId) return { imageUrl: null }
    return removeMemberPhoto(await getAccessToken(), detailMemberImageId)
  }, [detailMemberImageId])

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

  // Built from primitives so an unchanged URL never triggers a reload.
  const memberFilters = useMemo(
    () => ({
      ...(lifeGroupFilter ? { lifeGroupId: lifeGroupFilter } : {}),
      ...(search ? { search } : {}),
      ...(isAdmin ? { status: statusFilter } : {}),
      ...(genderFilter ? { gender: genderFilter } : {}),
      ...(ageFilter ? { age: ageFilter } : {}),
    }),
    [ageFilter, genderFilter, isAdmin, lifeGroupFilter, search, statusFilter],
  )

  // Changing search or filters reloads from the first page.
  const loadDirectory = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const token = await getAccessToken()
      const [memberPage, lifeGroupData] = await Promise.all([
        getMembersPage(token, memberFilters, DIRECTORY_FIRST_PAGE),
        getLifeGroups(token),
      ])
      replaceMembers(memberPage)
      setLifeGroups(lifeGroupData)
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [memberFilters, replaceMembers])

  const loadMoreMembers = useCallback(
    () =>
      loadMore(async (page) =>
        getMembersPage(await getAccessToken(), memberFilters, page),
      ),
    [loadMore, memberFilters],
  )

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void loadDirectory(), 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadDirectory])

  // Loads the open Member; a response for a closed or replaced dialog is ignored.
  useEffect(() => {
    if (!detailMemberId) return
    let isCurrent = true
    void (async () => {
      try {
        const loadedMember = await getMember(await getAccessToken(), detailMemberId)
        if (isCurrent) setDetailMember(loadedMember)
      } catch (error) {
        if (isCurrent) setDetailError(getErrorMessage(error))
      } finally {
        if (isCurrent) setIsDetailLoading(false)
      }
    })()
    return () => {
      isCurrent = false
    }
  }, [detailMemberId])

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

  function openDetails(member: MemberSummary) {
    // Re-selecting the open Member would not re-run the loading effect.
    if (member.id === detailMemberId) return
    setDetailMemberId(member.id)
    setDetailMember(null)
    setDetailError(null)
    setIsDetailLoading(true)
  }

  function closeDetails() {
    setIsDetailLoading(false)
    setDetailMemberId(null)
    setDetailMember(null)
    setDetailError(null)
  }

  function openEdit(member: MemberSummary) {
    setDetailMemberId(null)
    setDetailMember(null)
    setFormContext({ member, mode: 'edit' })
  }

  function getRowActions(member: MemberSummary): RowAction[] {
    const actions: RowAction[] = [
      {
        icon: Eye,
        label: 'View Member details',
        onSelect: () => openDetails(member),
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
        onSelect: () => openArchive(member),
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

  function handleMemberSaved(member: MemberSummary) {
    const wasEditing = formContext?.mode === 'edit'
    setFormContext(null)
    setNotice(
      `${member.firstName} ${member.lastName} was ${wasEditing ? 'updated' : 'created'}.`,
    )
    void loadDirectory()
  }

  function openArchive(member: MemberSummary) {
    setArchiveError(null)
    setArchiveTarget(member)
  }

  function closeArchive() {
    setArchiveError(null)
    setArchiveTarget(null)
  }

  async function handleArchive() {
    if (!archiveTarget) return
    setIsArchiving(true)
    setArchiveError(null)
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
      setArchiveError(getErrorMessage(error))
    } finally {
      setIsArchiving(false)
    }
  }

  // Filters other than the text search; Admin-only filters are always blank for Leaders.
  const hasFilters = Boolean(
    genderFilter || ageFilter || lifeGroupFilter || statusFilter !== 'active',
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
          <p className="font-mono text-xs text-muted" role="status" aria-live="polite">
            {isLoading ? 'Loading…' : `${memberList.total} ${memberList.total === 1 ? 'Member' : 'Members'}`}
          </p>
        </div>

        <form
          className={cn(
            'grid items-end gap-4 md:grid-cols-2',
            // Admin: search on its own row, then all four filters in one row.
            isAdmin
              ? 'lg:grid-cols-4'
              : 'xl:grid-cols-[minmax(18rem,40rem)_repeat(2,minmax(8rem,11rem))]',
          )}
          onSubmit={handleSearch}
        >
          <div
            className={cn(
              'max-w-3xl',
              isAdmin ? 'md:col-span-2 lg:col-span-4' : 'md:col-span-2 xl:col-span-1',
            )}
          >
            <SearchControl
              id="member-search"
              inputRef={searchInputRef}
              description="Name, phone, email, or address"
              placeholder="Search Members"
              value={searchInput}
              isApplied={Boolean(search)}
              onChange={setSearchInput}
              onClear={clearSearch}
            />
          </div>
          {isAdmin && (
            <FormField id="member-life-group-filter" label="Life Group">
              <Select
                id="member-life-group-filter"
                value={lifeGroupFilter}
                onChange={(event) => updateListParams({ lifeGroupId: event.target.value })}
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
          <FormField id="member-gender-filter" label="Gender">
            <Select id="member-gender-filter" value={genderFilter} onChange={(event) => updateListParams({ gender: event.target.value })}>
              <option value="">All genders</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="not_set">Not set</option>
            </Select>
          </FormField>
          <FormField id="member-age-filter" label="Age">
            <Select id="member-age-filter" value={ageFilter} onChange={(event) => updateListParams({ age: event.target.value })}>
              <option value="">All ages</option>
              <option value="under_18">Under 18</option>
              <option value="18_24">18–24</option>
              <option value="25_34">25–34</option>
              <option value="35_44">35–44</option>
              <option value="45_54">45–54</option>
              <option value="55_plus">55+</option>
              <option value="not_set">Not set</option>
            </Select>
          </FormField>
          {isAdmin && (
            <FormField id="member-status-filter" label="Status">
              <Select
                id="member-status-filter"
                value={statusFilter}
                onChange={(event) => updateListParams({ status: event.target.value })}
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </Select>
            </FormField>
          )}
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
      ) : members.length === 0 && (search || hasFilters) ? (
        <FilteredEmptyState
          icon={UsersRound}
          plural="Members"
          search={search}
          searchFields="name, phone, email, or address"
          hasFilters={hasFilters}
          onClearFilters={clearFiltersAndFocus}
          onClearSearch={clearSearchAndFocus}
        />
      ) : members.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title="No Members yet"
          description="Use New Member when the first Member is ready to be added."
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

      {!isLoading && members.length > 0 && (
        <LoadMoreFooter
          error={memberList.loadMoreError}
          hasMore={memberList.hasMore}
          isLoading={memberList.isLoadingMore}
          label="Members"
          onLoadMore={() => void loadMoreMembers()}
          shown={members.length}
          total={memberList.total}
        />
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
            <ImageAssetPanel
              alt={`Profile photo for ${detailMember.firstName} ${detailMember.lastName}`}
              canManage={Boolean(isAdmin || (detailMember.isActive && detailMember.lifeGroup.isActive))}
              description="A private profile image visible only within the existing Member access scope."
              initials={`${detailMember.firstName.charAt(0)}${detailMember.lastName.charAt(0)}`}
              load={loadMemberPhoto}
              onRemove={deleteMemberPhoto}
              onUpload={saveMemberPhoto}
              title="Member profile photo"
            />
            <MemberQrPanel
              firstName={detailMember.firstName}
              lastName={detailMember.lastName}
              qrToken={detailMember.qrToken}
            />
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
                    openArchive(detailMember)
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
        onClose={closeArchive}
        preventClose={isArchiving}
        title="Archive Member?"
        description={
          archiveTarget
            ? `${archiveTarget.firstName} ${archiveTarget.lastName} will leave active Member directories. The record and permanent QR token will be preserved.`
            : undefined
        }
      >
        {archiveError && (
          <FeedbackBanner className="mb-5" tone="error">{archiveError}</FeedbackBanner>
        )}
        <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            disabled={isArchiving}
            onClick={closeArchive}
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
