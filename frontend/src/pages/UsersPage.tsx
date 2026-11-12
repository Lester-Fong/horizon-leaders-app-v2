import {
  Eye,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { useAuth } from '../auth/useAuth'
import { DeactivateUserDialog } from '../components/users/DeactivateUserDialog'
import { getLedActiveGroup } from '../components/users/ledLifeGroup'
import { ResetPasswordModal } from '../components/users/ResetPasswordModal'
import { UserActivityList } from '../components/users/UserActivityList'
import { UserProfileDetails } from '../components/users/UserProfileDetails'
import { UserFormModal, type UserFormContext } from '../components/users/UserFormModal'
import { Button } from '../components/ui/Button'
import {
  EmptyState,
  ErrorState,
  FeedbackBanner,
  LoadingState,
} from '../components/ui/Feedback'
import { FormField, Select, TextInput } from '../components/ui/FormControls'
import { LoadMoreFooter } from '../components/ui/LoadMoreFooter'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import { RowActionsMenu, type RowAction } from '../components/ui/RowActionsMenu'
import { StatusBadge } from '../components/ui/StatusBadge'
import {
  ApiError,
  createUser,
  deleteUser,
  getUser,
  getUsersPage,
  reassignLifeGroupLeader,
  resetUserPassword,
  setUserActive,
  updateUser,
  type CreateUserInput,
  type ManagedUser,
  type UpdateUserInput,
  type UserListStatus,
} from '../lib/api'
import { formatTimestampDate } from '../lib/dates'
import { getAccessToken } from '../lib/session'
import { DIRECTORY_FIRST_PAGE, usePagedList } from '../lib/usePagedList'

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  return 'User data is unavailable right now. Please try again.'
}

function formatLastSignIn(value: string | null) {
  if (!value) return 'Never'
  return formatTimestampDate(value)
}

function matchesStatus(user: ManagedUser, status: UserListStatus) {
  return status === 'all' || user.isActive === (status === 'active')
}

function compareUsers(left: ManagedUser, right: ManagedUser) {
  return left.name.localeCompare(right.name)
}

function lifeGroupWarning(user: ManagedUser) {
  return user.role === 'leader' && user.assignedLifeGroup
    ? ` ${user.name} leads ${user.assignedLifeGroup.name}; reassign it in Life Groups.`
    : ''
}

export function UsersPage() {
  const { actor } = useAuth()
  const userList = usePagedList<ManagedUser>(getErrorMessage)
  const {
    insertSorted: insertUser,
    items: users,
    loadMore,
    removeItem: removeUserRow,
    replace: replaceUsers,
    updateItems: updateUsers,
  } = userList
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<UserListStatus>('active')
  const [formContext, setFormContext] = useState<UserFormContext | null>(null)
  const [passwordUser, setPasswordUser] = useState<ManagedUser | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<ManagedUser | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [changingUserId, setChangingUserId] = useState<string | null>(null)
  const [profileUser, setProfileUser] = useState<ManagedUser | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)

  /** Opens the deactivate dialog; it loads possible successors for a group Leader itself. */
  function openDeactivate(user: ManagedUser) {
    setActionError(null)
    setDeactivateTarget(user)
  }

  /** Opens the read-only profile with the row's data, then refreshes it from the server. */
  async function openProfile(user: ManagedUser) {
    setProfileUser(user)
    setProfileError(null)
    try {
      const fresh = await getUser(await getAccessToken(), user.id)
      setProfileUser((current) => (current?.id === fresh.id ? fresh : current))
    } catch (error) {
      setProfileError(getErrorMessage(error))
    }
  }

  // Changing search or status reloads from the first page.
  const loadData = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const token = await getAccessToken()
      replaceUsers(
        await getUsersPage(token, { search, status: statusFilter }, DIRECTORY_FIRST_PAGE),
      )
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [replaceUsers, search, statusFilter])

  const loadMoreUsers = useCallback(
    () =>
      loadMore(async (page) =>
        getUsersPage(await getAccessToken(), { search, status: statusFilter }, page),
      ),
    [loadMore, search, statusFilter],
  )

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void loadData(), 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadData])

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSearch(searchInput.trim())
  }

  function clearSearch() {
    setSearchInput('')
    setSearch('')
  }

  /** Replaces, adds, or removes a row in place, respecting the current status filter. */
  function applyUser(updated: ManagedUser) {
    if (!matchesStatus(updated, statusFilter)) {
      removeUserRow(updated.id)
    } else if (users.some((user) => user.id === updated.id)) {
      updateUsers((current) =>
        current
          .map((user) => (user.id === updated.id ? updated : user))
          .sort(compareUsers),
      )
    } else {
      insertUser(updated, compareUsers)
    }
  }

  async function saveUser(input: CreateUserInput) {
    const token = await getAccessToken()
    if (formContext?.mode !== 'edit') return createUser(token, input)

    const existing = formContext.user
    const update: UpdateUserInput = {}
    if (input.name !== existing.name) update.name = input.name
    // Admins cannot change their own sign-in email here; the server rejects it too.
    if (input.email !== existing.email && existing.id !== actor?.id) update.email = input.email
    if (input.role !== existing.role) update.role = input.role
    if (Object.keys(update).length === 0) return existing
    return updateUser(token, existing.id, update)
  }

  function handleSaved(saved: ManagedUser) {
    const previous = formContext?.mode === 'edit' ? formContext.user : null
    const promotedAssignedLeader =
      previous?.role === 'leader' && saved.role === 'admin' && saved.assignedLifeGroup
    setFormContext(null)
    applyUser(saved)
    setNotice(
      `${saved.name} was ${previous ? 'updated' : 'created'}.` +
        (promotedAssignedLeader
          ? ` Reassign ${saved.assignedLifeGroup?.name} to an active Leader in Life Groups.`
          : ''),
    )
  }

  async function changeStatus(user: ManagedUser, isActive: boolean, replacementId = '') {
    setChangingUserId(user.id)
    setNotice(null)
    setActionError(null)
    try {
      const accessToken = await getAccessToken()
      const ledGroup = isActive ? null : getLedActiveGroup(user)
      let handoverNotice = ''
      if (ledGroup && replacementId) {
        // Hand the group over first so it is never left without an active Leader.
        const group = await reassignLifeGroupLeader(accessToken, ledGroup.id, replacementId)
        handoverNotice = ` ${group.name} is now led by ${group.leader.name}.`
      }
      const updated = await setUserActive(accessToken, user.id, isActive)
      applyUser(updated)
      setDeactivateTarget(null)
      setNotice(
        `${updated.name} was ${updated.isActive ? 'reactivated' : 'deactivated'}.` +
          (updated.isActive ? '' : handoverNotice || lifeGroupWarning(updated)),
      )
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setChangingUserId(null)
    }
  }

  async function removeUser(user: ManagedUser) {
    setChangingUserId(user.id)
    setNotice(null)
    setActionError(null)
    try {
      await deleteUser(await getAccessToken(), user.id)
      removeUserRow(user.id)
      setDeleteTarget(null)
      setNotice(`${user.name} was permanently deleted.`)
    } catch (error) {
      setActionError(getErrorMessage(error))
    } finally {
      setChangingUserId(null)
    }
  }

  function openFormFor(context: UserFormContext) {
    setNotice(null)
    setFormContext(context)
  }

  function getRowActions(user: ManagedUser): RowAction[] {
    const isSelf = user.id === actor?.id
    return [
      {
        icon: Eye,
        label: 'View profile',
        onSelect: () => void openProfile(user),
      },
      {
        icon: Pencil,
        label: 'Edit user',
        onSelect: () => openFormFor({ mode: 'edit', user }),
      },
      {
        disabled: isSelf,
        icon: KeyRound,
        label: 'Reset password',
        onSelect: () => {
          setNotice(null)
          setPasswordUser(user)
        },
      },
      user.isActive
        ? {
            disabled: isSelf,
            icon: UserX,
            label: 'Deactivate user',
            onSelect: () => openDeactivate(user),
          }
        : {
            icon: UserCheck,
            label: 'Reactivate user',
            onSelect: () => void changeStatus(user, true),
          },
      {
        disabled: isSelf,
        icon: Trash2,
        label: 'Delete user',
        onSelect: () => {
          setActionError(null)
          setDeleteTarget(user)
        },
      },
    ]
  }

  const confirmTarget = deactivateTarget ?? deleteTarget

  return (
    <div className="space-y-8">
      <PageHeader
        marker="09 — Administration"
        title="Users"
        description="Manage staff accounts, their roles, and their access to Horizon."
        actions={
          <>
            <Button onClick={() => openFormFor({ mode: 'create' })}>
              <Plus aria-hidden="true" className="size-4" />
              New User
            </Button>
            <Button variant="secondary" onClick={() => void loadData()}>
              <RefreshCw aria-hidden="true" className="size-4" />
              Refresh
            </Button>
          </>
        }
      />

      {notice && <FeedbackBanner tone="success">{notice}</FeedbackBanner>}
      {actionError && !confirmTarget && (
        <FeedbackBanner tone="error">{actionError}</FeedbackBanner>
      )}
      {loadError && users.length > 0 && (
        <FeedbackBanner tone="error">{loadError}</FeedbackBanner>
      )}

      <section aria-labelledby="user-directory-controls" className="space-y-5">
        <div className="flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p id="user-directory-controls" className="hm-label">
              Directory controls
            </p>
            <p className="mt-1 text-sm text-muted">Search by name or email within a status.</p>
          </div>
          {!isLoading && (
            <p className="font-mono text-xs text-muted" aria-live="polite">
              {userList.total} {userList.total === 1 ? 'User' : 'Users'}
            </p>
          )}
        </div>
        <form
          className="grid gap-4 md:grid-cols-[minmax(14rem,1fr)_12rem_auto]"
          onSubmit={handleSearch}
        >
          <FormField id="user-search" label="Search" description="Name or email">
            <TextInput
              id="user-search"
              type="search"
              value={searchInput}
              maxLength={100}
              placeholder="Search Users"
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </FormField>
          <FormField id="user-status-filter" label="Status">
            <Select
              id="user-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as UserListStatus)}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </Select>
          </FormField>
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
        <LoadingState title="Loading Users" description="Retrieving staff accounts and roles." />
      ) : loadError && users.length === 0 ? (
        <ErrorState
          title="Users could not be loaded"
          description={loadError}
          action={<Button onClick={() => void loadData()}>Try again</Button>}
        />
      ) : users.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={search ? 'No matching Users' : 'No Users in this status'}
          description={
            search
              ? 'Try a different name or email, or clear the search.'
              : 'Change the status filter or use New User above to add a staff account.'
          }
        />
      ) : (
        <ResponsiveTable caption="Staff user accounts" tableClassName="horizon-table--users">
          <thead>
            <tr>
              <th scope="col">User</th>
              <th scope="col">Role</th>
              <th scope="col">Life Group</th>
              <th scope="col">Status</th>
              <th scope="col">Last sign-in</th>
              <th scope="col" className="w-16">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td className="user-cell-primary">
                  <span className="hm-table-mobile-label">User</span>
                  <p className="font-medium text-ink">
                    {user.name}
                    {user.id === actor?.id && (
                      <span className="ml-2 font-mono text-xs text-muted">(You)</span>
                    )}
                  </p>
                  <p className="mt-1 break-words text-sm text-muted">
                    {user.email ?? 'No email'}
                  </p>
                </td>
                <td>
                  <span className="hm-table-mobile-label">Role</span>
                  <StatusBadge tone={user.role === 'admin' ? 'warning' : 'neutral'}>
                    {user.role === 'admin' ? 'Admin' : 'Leader'}
                  </StatusBadge>
                </td>
                <td>
                  <span className="hm-table-mobile-label">Life Group</span>
                  {user.assignedLifeGroup ? (
                    <>
                      <p className="text-sm text-ink">{user.assignedLifeGroup.name}</p>
                      {(user.role !== 'leader' || !user.isActive) && (
                        <p className="mt-1 text-xs font-medium text-muted">Needs reassignment</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted">—</p>
                  )}
                </td>
                <td>
                  <span className="hm-table-mobile-label">Status</span>
                  <StatusBadge tone={user.isActive ? 'success' : 'neutral'}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </StatusBadge>
                </td>
                <td>
                  <span className="hm-table-mobile-label">Last sign-in</span>
                  <p className="font-mono text-xs text-muted">
                    {formatLastSignIn(user.lastSignInAt)}
                  </p>
                </td>
                <td className="user-cell-actions text-right">
                  <RowActionsMenu
                    label={`Actions for ${user.name}`}
                    actions={getRowActions(user)}
                    disabled={changingUserId === user.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </ResponsiveTable>
      )}

      {!isLoading && users.length > 0 && (
        <LoadMoreFooter
          error={userList.loadMoreError}
          hasMore={userList.hasMore}
          isLoading={userList.isLoadingMore}
          label="Users"
          onLoadMore={() => void loadMoreUsers()}
          shown={users.length}
          total={userList.total}
        />
      )}

      {formContext && (
        <UserFormModal
          key={formContext.mode === 'edit' ? formContext.user.id : 'create'}
          actorId={actor?.id}
          context={formContext}
          onClose={() => setFormContext(null)}
          onSave={saveUser}
          onSaved={handleSaved}
        />
      )}

      <Modal
        className="max-w-lg"
        isOpen={Boolean(profileUser)}
        onClose={() => setProfileUser(null)}
        title={profileUser ? `${profileUser.name} profile` : 'User profile'}
        description="Read-only staff account details."
      >
        {profileError && (
          <FeedbackBanner className="mb-5" tone="error">
            {profileError}
          </FeedbackBanner>
        )}
        {profileUser && <UserProfileDetails user={profileUser} />}
        {profileUser && <UserActivityList key={profileUser.id} userId={profileUser.id} />}
        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setProfileUser(null)}>
            Close
          </Button>
          <Button
            onClick={() => {
              if (!profileUser) return
              const user = profileUser
              setProfileUser(null)
              openFormFor({ mode: 'edit', user })
            }}
          >
            <Pencil aria-hidden="true" className="size-4" />
            Edit user
          </Button>
        </div>
      </Modal>

      {passwordUser && (
        <ResetPasswordModal
          key={passwordUser.id}
          user={passwordUser}
          onClose={() => setPasswordUser(null)}
          onReset={async (password) =>
            resetUserPassword(await getAccessToken(), passwordUser.id, password)
          }
          onResetComplete={() => {
            setNotice(`The password for ${passwordUser.name} was reset.`)
            setPasswordUser(null)
          }}
        />
      )}

      {deactivateTarget && (
        <DeactivateUserDialog
          key={deactivateTarget.id}
          user={deactivateTarget}
          error={actionError}
          isSubmitting={Boolean(changingUserId)}
          onClose={() => setDeactivateTarget(null)}
          onConfirm={(replacementLeaderId) =>
            void changeStatus(deactivateTarget, false, replacementLeaderId)
          }
        />
      )}

      <Modal
        className="max-w-md"
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        preventClose={Boolean(changingUserId)}
        title="Delete user permanently?"
        description={
          deleteTarget
            ? `${deleteTarget.name} and their sign-in will be removed. This cannot be undone. Users with Horizon history cannot be deleted — deactivate them instead.`
            : undefined
        }
      >
        {actionError && (
          <FeedbackBanner className="mb-5" tone="error">
            {actionError}
          </FeedbackBanner>
        )}
        <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            disabled={Boolean(changingUserId)}
            onClick={() => setDeleteTarget(null)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            isLoading={Boolean(changingUserId)}
            onClick={() => {
              if (deleteTarget) void removeUser(deleteTarget)
            }}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Delete user
          </Button>
        </div>
      </Modal>
    </div>
  )
}
