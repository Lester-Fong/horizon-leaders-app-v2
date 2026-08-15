import { Archive, ArchiveRestore, Pencil, Plus, RefreshCw, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'

import { useAuth } from '../auth/useAuth'
import { Button } from '../components/ui/Button'
import {
  EmptyState,
  ErrorState,
  FeedbackBanner,
  LoadingState,
} from '../components/ui/Feedback'
import {
  FormField,
  Select,
  TextArea,
  TextInput,
} from '../components/ui/FormControls'
import { PageHeader } from '../components/ui/PageHeader'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import { StatusBadge } from '../components/ui/StatusBadge'
import {
  ApiError,
  createLifeGroup,
  getLeaderOptions,
  getLifeGroups,
  setLifeGroupActive,
  updateLifeGroup,
  type LeaderOption,
  type LifeGroup,
} from '../lib/api'
import { supabase } from '../lib/supabase'

interface FormState {
  description: string
  leaderProfileId: string
  name: string
}

const EMPTY_FORM: FormState = {
  description: '',
  leaderProfileId: '',
  name: '',
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  return 'Life Group data is unavailable right now. Please try again.'
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired.')
  }
  return data.session.access_token
}

export function LifeGroupsPage() {
  const { actor } = useAuth()
  const isAdmin = actor?.role === 'admin'
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
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

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

  const selectableLeaders = useMemo(
    () =>
      leaders.map((leader) => {
        const assignedElsewhere = Boolean(
          leader.assignedLifeGroup &&
            leader.assignedLifeGroup.id !== editingGroup?.id,
        )
        return {
          ...leader,
          disabled: !leader.isActive || assignedElsewhere,
          label: `${leader.name}${
            !leader.isActive
              ? ' (Inactive)'
              : assignedElsewhere
                ? ` (Assigned to ${leader.assignedLifeGroup?.name})`
                : ''
          }`,
        }
      }),
    [editingGroup?.id, leaders],
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
      closeForm()
      const refreshedToken = await getAccessToken()
      setLeaders(await getLeaderOptions(refreshedToken))
    } catch (error) {
      setFormError(getErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleStatusChange(group: LifeGroup) {
    setChangingGroupId(group.id)
    setNotice(null)
    setLoadError(null)
    try {
      const token = await getAccessToken()
      const updated = await setLifeGroupActive(token, group.id, !group.isActive)
      setGroups((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      )
      setNotice(
        `${updated.name} was ${updated.isActive ? 'reactivated' : 'archived'}.`,
      )
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setChangingGroupId(null)
    }
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
        title="Life Groups"
        description={
          isAdmin
            ? 'Manage current groups, their assigned Leaders, and archive status.'
            : 'View active Horizon Life Groups and their assigned Leaders.'
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => void loadData()}>
              <RefreshCw aria-hidden="true" className="size-4" />
              Refresh
            </Button>
            {isAdmin && (
              <Button onClick={openCreateForm}>
                <Plus aria-hidden="true" className="size-4" />
                New Life Group
              </Button>
            )}
          </>
        }
      />

      {notice && <FeedbackBanner tone="success">{notice}</FeedbackBanner>}
      {loadError && <FeedbackBanner tone="error">{loadError}</FeedbackBanner>}

      {isAdmin && isFormOpen && (
        <section className="rounded-card border border-line bg-surface p-5 shadow-soft sm:p-6">
          <div>
            <h2 className="text-lg font-bold text-ink">
              {editingGroup ? `Edit ${editingGroup.name}` : 'Create a Life Group'}
            </h2>
            <p className="mt-1 text-sm text-muted">
              Every Life Group must have one active, unassigned Leader.
            </p>
          </div>
          {formError && (
            <FeedbackBanner className="mt-5" tone="error">
              {formError}
            </FeedbackBanner>
          )}
          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-5 lg:grid-cols-2">
              <FormField id="life-group-name" label="Name" required>
                <TextInput
                  id="life-group-name"
                  value={form.name}
                  maxLength={120}
                  autoComplete="off"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </FormField>
              <FormField id="life-group-leader" label="Leader" required>
                <Select
                  id="life-group-leader"
                  value={form.leaderProfileId}
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
            </div>
            <FormField
              id="life-group-description"
              label="Description"
              description="Optional. Add a short, practical description for staff."
            >
              <TextArea
                id="life-group-description"
                value={form.description}
                maxLength={1000}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
              />
            </FormField>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" isLoading={isSaving}>
                {editingGroup ? 'Save changes' : 'Create Life Group'}
              </Button>
              <Button variant="secondary" onClick={closeForm} disabled={isSaving}>
                Cancel
              </Button>
            </div>
          </form>
        </section>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No Life Groups yet"
          description={
            isAdmin
              ? 'Create the first Life Group when an active, unassigned Leader is ready.'
              : 'There are no active Life Groups to show right now.'
          }
          action={
            isAdmin ? <Button onClick={openCreateForm}>Create Life Group</Button> : undefined
          }
        />
      ) : (
        <ResponsiveTable caption="Life Groups and assigned Leaders">
          <thead>
            <tr>
              <th scope="col">Life Group</th>
              <th scope="col">Leader</th>
              <th scope="col">Status</th>
              {isAdmin && <th scope="col"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.id}>
                <td>
                  <p className="font-semibold text-ink">{group.name}</p>
                  {group.description && (
                    <p className="mt-1 max-w-lg text-sm text-muted">
                      {group.description}
                    </p>
                  )}
                </td>
                <td>
                  <p className="font-medium text-ink">{group.leader.name}</p>
                  {!group.leader.isActive && (
                    <p className="mt-1 text-xs font-semibold text-warning-strong">
                      Leader profile inactive
                    </p>
                  )}
                </td>
                <td>
                  <StatusBadge tone={group.isActive ? 'success' : 'neutral'}>
                    {group.isActive ? 'Active' : 'Archived'}
                  </StatusBadge>
                </td>
                {isAdmin && (
                  <td>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEditForm(group)}>
                        <Pencil aria-hidden="true" className="size-4" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        isLoading={changingGroupId === group.id}
                        onClick={() => void handleStatusChange(group)}
                      >
                        {group.isActive ? (
                          <Archive aria-hidden="true" className="size-4" />
                        ) : (
                          <ArchiveRestore aria-hidden="true" className="size-4" />
                        )}
                        {group.isActive ? 'Archive' : 'Reactivate'}
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </ResponsiveTable>
      )}
    </div>
  )
}
