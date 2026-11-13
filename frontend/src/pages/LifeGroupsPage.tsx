import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  Pencil,
  Plus,
  RefreshCw,
  Users,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'
import {
  formatLeaderName,
  getLeaderIssue,
  getSelectableLeaders,
} from '../components/life-groups/leaderOptions'
import { ImageAssetPanel } from '../components/uploads/ImageAssetPanel'
import { Button } from '../components/ui/Button'
import {
  EmptyState,
  ErrorState,
  FeedbackBanner,
  LoadingState,
} from '../components/ui/Feedback'
import { FilteredEmptyState } from '../components/ui/FilteredEmptyState'
import {
  FormField,
  Select,
  TextArea,
  TextInput,
} from '../components/ui/FormControls'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import { RowActionsMenu, type RowAction } from '../components/ui/RowActionsMenu'
import { SearchControl } from '../components/ui/SearchControl'
import { StatusBadge } from '../components/ui/StatusBadge'
import {
  ApiError,
  createLifeGroup,
  getLeaderOptions,
  getLifeGroupRoster,
  getLifeGroupLogo,
  getLifeGroups,
  setLifeGroupActive,
  removeLifeGroupLogo,
  updateLifeGroup,
  uploadLifeGroupLogo,
  type LeaderOption,
  type LifeGroup,
  type LifeGroupRoster,
} from '../lib/api'
import { cn } from '../lib/cn'
import { duplicateNameWarning, findDuplicateName } from '../lib/duplicateName'
import {
  readEnum,
  readSearch,
  useListSearchParams,
  useSearchInput,
} from '../lib/listSearchParams'
import { getAccessToken } from '../lib/session'
import { usePageTitle } from '../lib/usePageTitle'

interface FormState {
  description: string
  leaderProfileId: string
  name: string
}

type LifeGroupListStatus = 'active' | 'archived' | 'all'

const LIFE_GROUP_STATUSES: readonly LifeGroupListStatus[] = ['active', 'archived', 'all']
// Admins see every Life Group by default, as before search and filters existed.
const LIFE_GROUP_LIST_DEFAULTS = { search: '', status: 'all' }
const LEADER_REFRESH_ERROR =
  'The Life Group was saved, but the Leader list could not be refreshed. Use Refresh to try again.'

const EMPTY_FORM: FormState = {
  description: '',
  leaderProfileId: '',
  name: '',
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  return 'Life Group data is unavailable right now. Please try again.'
}

export function LifeGroupsPage() {
  usePageTitle('Life Groups')
  const navigate = useNavigate()
  const { actor } = useAuth()
  const isAdmin = actor?.role === 'admin'
  const {
    reset: resetListParams,
    searchParams,
    update: updateListParams,
  } = useListSearchParams(LIFE_GROUP_LIST_DEFAULTS)
  const search = readSearch(searchParams)
  // Leaders keep their existing read-only view; a status in the URL is ignored for them.
  const statusFilter = isAdmin
    ? readEnum(searchParams, 'status', LIFE_GROUP_STATUSES, 'all')
    : 'all'
  const [searchInput, setSearchInput] = useSearchInput(search)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [groups, setGroups] = useState<LifeGroup[]>([])
  const [leaders, setLeaders] = useState<LeaderOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [changingGroupId, setChangingGroupId] = useState<string | null>(null)
  const [editingGroup, setEditingGroup] = useState<LifeGroup | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [archiveGroup, setArchiveGroup] = useState<LifeGroup | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [rosterGroup, setRosterGroup] = useState<LifeGroup | null>(null)
  const [roster, setRoster] = useState<LifeGroupRoster | null>(null)
  const [rosterError, setRosterError] = useState<string | null>(null)
  const [isRosterLoading, setIsRosterLoading] = useState(false)
  const imageLifeGroup = editingGroup ?? rosterGroup
  const imageLifeGroupId = imageLifeGroup?.id ?? null
  const loadLifeGroupLogo = useCallback(async () => {
    if (!imageLifeGroupId) return { imageUrl: null }
    return getLifeGroupLogo(await getAccessToken(), imageLifeGroupId)
  }, [imageLifeGroupId])
  const saveLifeGroupLogo = useCallback(async (file: File) => {
    if (!imageLifeGroupId) return { imageUrl: null }
    return uploadLifeGroupLogo(await getAccessToken(), imageLifeGroupId, file)
  }, [imageLifeGroupId])
  const deleteLifeGroupLogo = useCallback(async () => {
    if (!imageLifeGroupId) return { imageUrl: null }
    return removeLifeGroupLogo(await getAccessToken(), imageLifeGroupId)
  }, [imageLifeGroupId])

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const token = await getAccessToken()
      const [groupData, leaderData] = await Promise.all([
        getLifeGroups(token),
        isAdmin ? getLeaderOptions(token) : Promise.resolve([]),
      ])
      setGroups(groupData)
      setLeaders(leaderData)
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void loadData(), 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadData])

  /** Leader options are loaded for Admins only, so only Admins see Leader issues. */
  const leaderIssue = useCallback(
    (group: LifeGroup): string | null => (isAdmin ? getLeaderIssue(group, leaders) : null),
    [isAdmin, leaders],
  )

  const groupsNeedingLeader = useMemo(
    () => groups.filter((group) => leaderIssue(group) !== null),
    [groups, leaderIssue],
  )

  /** Search and status are applied client-side over the full authorized list. */
  const visibleGroups = useMemo(() => {
    const searchValue = search.toLocaleLowerCase('en')
    return groups.filter((group) => {
      if (statusFilter === 'active' && !group.isActive) return false
      if (statusFilter === 'archived' && group.isActive) return false
      if (!searchValue) return true
      return [group.name, group.leader.name].some((value) =>
        value.toLocaleLowerCase('en').includes(searchValue),
      )
    })
  }, [groups, search, statusFilter])

  // Filters other than the text search; always false for Leaders.
  const hasFilters = statusFilter !== 'all'

  const duplicateGroup = isFormOpen
    ? findDuplicateName(form.name, groups, editingGroup?.id)
    : null
  const nameWarning = duplicateGroup
    ? duplicateNameWarning('Life Group', duplicateGroup)
    : ''

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

  const selectableLeaders = useMemo(
    () => getSelectableLeaders(leaders, editingGroup),
    [editingGroup, leaders],
  )

  function openCreateForm() {
    setEditingGroup(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setNotice(null)
    setIsFormOpen(true)
  }

  function openEditForm(group: LifeGroup) {
    setEditingGroup(group)
    setForm({
      description: group.description ?? '',
      leaderProfileId: group.leader.id,
      name: group.name,
    })
    setFormError(null)
    setNotice(null)
    setIsFormOpen(true)
  }

  function closeForm() {
    if (isSaving) return
    setEditingGroup(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setIsFormOpen(false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = form.name.trim()
    if (!name || !form.leaderProfileId) {
      setFormError('Enter a Life Group name and select an available Leader.')
      return
    }

    setIsSaving(true)
    setFormError(null)
    let isSaved = false
    try {
      const token = await getAccessToken()
      const input = {
        description: form.description.trim() || null,
        leaderProfileId: form.leaderProfileId,
        name,
      }
      const savedGroup = editingGroup
        ? await updateLifeGroup(token, editingGroup.id, input)
        : await createLifeGroup(token, input)
      setGroups((current) => {
        const next = editingGroup
          ? current.map((group) =>
              group.id === savedGroup.id ? savedGroup : group,
            )
          : [...current, savedGroup]
        return next.sort((left, right) => left.name.localeCompare(right.name))
      })
      setNotice(
        editingGroup
          ? `${savedGroup.name} was updated.`
          : `${savedGroup.name} was created.`,
      )
      setEditingGroup(null)
      setForm(EMPTY_FORM)
      setIsFormOpen(false)
      isSaved = true
    } catch (error) {
      setFormError(getErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
    if (!isSaved) return

    // The form is closed by now, so a refresh failure belongs on the page.
    try {
      setLeaders(await getLeaderOptions(await getAccessToken()))
    } catch {
      setLoadError(LEADER_REFRESH_ERROR)
    }
  }

  async function changeGroupStatus(group: LifeGroup, isActive: boolean) {
    setChangingGroupId(group.id)
    setNotice(null)
    setLoadError(null)
    try {
      const token = await getAccessToken()
      const updated = await setLifeGroupActive(token, group.id, isActive)
      setGroups((current) =>
        current.map((currentGroup) =>
          currentGroup.id === updated.id ? updated : currentGroup,
        ),
      )
      setNotice(
        `${updated.name} was ${updated.isActive ? 'reactivated' : 'archived'}.`,
      )
      setArchiveGroup(null)
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setChangingGroupId(null)
    }
  }

  async function openRoster(group: LifeGroup) {
    setRosterGroup(group)
    setRoster(null)
    setRosterError(null)
    setIsRosterLoading(true)
    try {
      setRoster(await getLifeGroupRoster(await getAccessToken(), group.id))
    } catch (error) {
      setRosterError(getErrorMessage(error))
    } finally {
      setIsRosterLoading(false)
    }
  }

  function getRowActions(group: LifeGroup): RowAction[] {
    const actions: RowAction[] = []
    // Leaders may open the roster and Gatherings of their own Life Group only.
    if (isAdmin || group.leader.id === actor?.id) {
      actions.push(
        {
          icon: Users,
          label: 'View current roster',
          onSelect: () => void openRoster(group),
        },
        {
          icon: CalendarDays,
          label: 'View Gatherings',
          onSelect: () => navigate(`/life-groups/${group.id}/gatherings`),
        },
      )
    }
    if (!isAdmin) return actions
    return [
      ...actions,
      {
        icon: Pencil,
        label: 'Edit Life Group',
        onSelect: () => openEditForm(group),
      },
      group.isActive
        ? {
            icon: Archive,
            label: 'Archive Life Group',
            onSelect: () => setArchiveGroup(group),
          }
        : {
            icon: ArchiveRestore,
            label: 'Reactivate Life Group',
            onSelect: () => void changeGroupStatus(group, true),
          },
    ]
  }

  if (isLoading) {
    return (
      <LoadingState
        title="Loading Life Groups"
        description="Retrieving current groups and Leader assignments."
      />
    )
  }

  if (loadError && groups.length === 0) {
    return (
      <ErrorState
        title="Life Groups could not be loaded"
        description={loadError}
        action={<Button onClick={() => void loadData()}>Try again</Button>}
      />
    )
  }

  return (
    <div className="space-y-8">
      <PageHeader
        marker="03 — Organization"
        title="Life Groups"
        description={
          isAdmin
            ? 'Manage current groups, their assigned Leaders, and archive status.'
            : 'View active Horizon Life Groups and their assigned Leaders.'
        }
        actions={
          <>
            {isAdmin && (
              <Button onClick={openCreateForm}>
                <Plus aria-hidden="true" className="size-4" />
                New Life Group
              </Button>
            )}
            <Button variant="secondary" onClick={() => void loadData()}>
              <RefreshCw aria-hidden="true" className="size-4" />
              Refresh
            </Button>
          </>
        }
      />

      {notice && <FeedbackBanner tone="success">{notice}</FeedbackBanner>}
      {groupsNeedingLeader.length > 0 && (
        <FeedbackBanner
          tone="warning"
          title={
            groupsNeedingLeader.length === 1
              ? '1 Life Group needs a new Leader'
              : `${groupsNeedingLeader.length} Life Groups need a new Leader`
          }
        >
          <ul className="mt-1 space-y-1">
            {groupsNeedingLeader.map((group) => (
              <li key={group.id}>
                {group.name}: {leaderIssue(group)?.toLowerCase()} ({group.leader.name}).
                Use Edit Life Group to assign an active Leader.
              </li>
            ))}
          </ul>
        </FeedbackBanner>
      )}
      {loadError && <FeedbackBanner tone="error">{loadError}</FeedbackBanner>}

      <section aria-labelledby="life-group-directory-controls" className="space-y-5">
        <div className="flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p id="life-group-directory-controls" className="hm-label">
              Directory controls
            </p>
            <p className="mt-1 text-sm text-muted">
              {isAdmin
                ? 'Search by Life Group or Leader name within the selected status.'
                : 'Scope: Active Life Groups / Read only'}
            </p>
          </div>
          <p className="font-mono text-xs text-muted" role="status" aria-live="polite">
            {`${visibleGroups.length} ${visibleGroups.length === 1 ? 'Life Group' : 'Life Groups'}`}
          </p>
        </div>

        <form
          className={cn(
            'grid items-end gap-4',
            isAdmin ? 'lg:grid-cols-[minmax(0,40rem)_12rem]' : 'max-w-2xl',
          )}
          onSubmit={handleSearch}
        >
          <SearchControl
            id="life-group-search"
            inputRef={searchInputRef}
            description="Life Group or Leader name"
            placeholder="Search Life Groups"
            value={searchInput}
            isApplied={Boolean(search)}
            onChange={setSearchInput}
            onClear={clearSearch}
          />
          {isAdmin && (
            <FormField id="life-group-status-filter" label="Status">
              <Select
                id="life-group-status-filter"
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

      {groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No Life Groups yet"
          description={
            isAdmin
              ? 'Use New Life Group above when an active, unassigned Leader is ready.'
              : 'There are no active Life Groups to show right now.'
          }
        />
      ) : visibleGroups.length === 0 ? (
        <FilteredEmptyState
          icon={Users}
          plural="Life Groups"
          search={search}
          searchFields="another Life Group or Leader name"
          hasFilters={hasFilters}
          onClearFilters={clearFiltersAndFocus}
          onClearSearch={clearSearchAndFocus}
        />
      ) : (
        <ResponsiveTable
          caption="Life Groups and assigned Leaders"
          tableClassName="horizon-table--life-groups"
        >
          <thead>
            <tr>
              <th scope="col">Life Group</th>
              <th scope="col">Leader</th>
              <th scope="col">Status</th>
              <th scope="col" className="w-16">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleGroups.map((group) => {
              const rowActions = getRowActions(group)
              return (
                <tr key={group.id}>
                  <td className="life-group-cell-primary">
                    <span className="hm-table-mobile-label">Life Group</span>
                    <p className="font-medium text-ink">{group.name}</p>
                    {group.description && (
                      <p className="mt-1 max-w-lg text-sm text-muted">
                        {group.description}
                      </p>
                    )}
                  </td>
                  <td className="life-group-cell-leader">
                    <span className="hm-table-mobile-label">Leader</span>
                    <p className="font-medium text-ink">{formatLeaderName(group.leader)}</p>
                    {leaderIssue(group) ? (
                      <p className="mt-1">
                        <StatusBadge tone="warning">
                          Needs new Leader · {leaderIssue(group)}
                        </StatusBadge>
                      </p>
                    ) : (
                      // A deleted Leader is already marked "(deleted)" beside the name.
                      !group.leader.isActive && !group.leader.isDeleted && (
                        <p className="mt-1 text-xs font-medium text-muted">
                          Inactive Leader profile
                        </p>
                      )
                    )}
                  </td>
                  <td className="life-group-cell-status">
                    <span className="hm-table-mobile-label">Status</span>
                    <StatusBadge tone={group.isActive ? 'success' : 'neutral'}>
                      {group.isActive ? 'Active' : 'Archived'}
                    </StatusBadge>
                  </td>
                  <td className="life-group-cell-actions text-right">
                    {rowActions.length > 0 && (
                      <RowActionsMenu
                        label={`Actions for ${group.name}`}
                        actions={rowActions}
                        disabled={changingGroupId === group.id}
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </ResponsiveTable>
      )}

      <Modal
        className="max-w-2xl"
        isOpen={Boolean(rosterGroup)}
        onClose={() => setRosterGroup(null)}
        title={rosterGroup ? `${rosterGroup.name} roster` : 'Life Group roster'}
        description="Current active Members and active affiliated Visitors. Visitor affiliation does not imply church membership."
      >
        {isRosterLoading ? (
          <LoadingState title="Loading roster" description="Retrieving the authorized current Life Group roster." />
        ) : rosterError ? (
          <FeedbackBanner tone="error">{rosterError}</FeedbackBanner>
        ) : roster ? (
          <div className="space-y-6">
            {rosterGroup && (
              <ImageAssetPanel
                alt={`Logo for ${rosterGroup.name}`}
                canManage={false}
                description="Private Life Group identity shown within the existing Life Group visibility scope."
                initials={rosterGroup.name.slice(0, 2)}
                load={loadLifeGroupLogo}
                onRemove={deleteLifeGroupLogo}
                onUpload={saveLifeGroupLogo}
                title="Life Group logo"
              />
            )}
            <div className="flex items-center justify-between gap-4 border-y border-line py-3">
              <span className="hm-label">Current people</span>
              <span className="font-mono text-xs text-muted">{roster.people.length}</span>
            </div>
            {roster.people.length === 0 ? (
              <p className="py-5 text-sm leading-6 text-muted">No active Members or affiliated Visitors are currently in this Life Group.</p>
            ) : (
              <ul className="divide-y divide-line border-b border-line">
                {roster.people.map((person) => (
                  <li key={`${person.personType}-${person.id}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{person.firstName} {person.lastName}</p>
                      <p className="mt-1 break-words text-xs text-muted">{person.phone ?? 'No phone'} · {person.email ?? 'No email'}</p>
                    </div>
                    <StatusBadge tone={person.personType === 'member' ? 'neutral' : 'warning'}>
                      {person.personType === 'member' ? 'Member' : 'Visitor'}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end border-t border-line pt-5">
              <Button variant="secondary" onClick={() => setRosterGroup(null)}>Close</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={isAdmin && isFormOpen}
        onClose={closeForm}
        preventClose={isSaving}
        title={editingGroup ? `Edit ${editingGroup.name}` : 'Create a Life Group'}
        description="Every Life Group must have one active, unassigned Leader."
      >
        {formError && (
          <FeedbackBanner className="mb-5" tone="error">
            {formError}
          </FeedbackBanner>
        )}
        {editingGroup && (
          <div className="mb-6">
            <ImageAssetPanel
              alt={`Logo for ${editingGroup.name}`}
              canManage
              description="Optional private logo. It remains with the Life Group if the group is archived."
              initials={editingGroup.name.slice(0, 2)}
              load={loadLifeGroupLogo}
              onRemove={deleteLifeGroupLogo}
              onUpload={saveLifeGroupLogo}
              title="Life Group logo"
            />
          </div>
        )}
        <form className="space-y-5" onSubmit={handleSubmit}>
          <FormField id="life-group-name" label="Name" required>
            <TextInput
              id="life-group-name"
              data-modal-autofocus
              value={form.name}
              maxLength={120}
              autoComplete="off"
              disabled={isSaving}
              aria-describedby={nameWarning ? 'life-group-name-warning' : undefined}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
            />
            <p
              id="life-group-name-warning"
              aria-live="polite"
              className="mt-2 text-sm text-ink empty:mt-0"
            >
              {nameWarning}
            </p>
          </FormField>
          <FormField id="life-group-leader" label="Leader" required>
            <Select
              id="life-group-leader"
              value={form.leaderProfileId}
              disabled={isSaving}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  leaderProfileId: event.target.value,
                }))
              }
            >
              <option value="">Select an available Leader</option>
              {selectableLeaders.map((leader) => (
                <option
                  key={leader.id}
                  value={leader.id}
                  disabled={leader.disabled}
                >
                  {leader.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            id="life-group-description"
            label="Description"
            description="Optional. Add a short, practical description for staff."
          >
            <TextArea
              id="life-group-description"
              value={form.description}
              maxLength={1000}
              disabled={isSaving}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </FormField>
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={closeForm} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSaving}>
              {editingGroup ? 'Save changes' : 'Create Life Group'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        className="max-w-md"
        isOpen={Boolean(archiveGroup)}
        onClose={() => setArchiveGroup(null)}
        preventClose={Boolean(changingGroupId)}
        title="Archive Life Group?"
        description={
          archiveGroup
            ? `${archiveGroup.name} will leave the active list. Admins can reactivate it later.`
            : undefined
        }
      >
        <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            disabled={Boolean(changingGroupId)}
            onClick={() => setArchiveGroup(null)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            isLoading={Boolean(changingGroupId)}
            onClick={() => {
              if (archiveGroup) void changeGroupStatus(archiveGroup, false)
            }}
          >
            <Archive aria-hidden="true" className="size-4" />
            Archive Life Group
          </Button>
        </div>
      </Modal>
    </div>
  )
}
