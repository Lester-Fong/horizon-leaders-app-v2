import {
  Archive,
  ArchiveRestore,
  Pencil,
  Plus,
  RefreshCw,
  Users,
} from 'lucide-react'
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
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import { RowActionsMenu, type RowAction } from '../components/ui/RowActionsMenu'
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
  const [archiveGroup, setArchiveGroup] = useState<LifeGroup | null>(null)
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
      const refreshedToken = await getAccessToken()
      setLeaders(await getLeaderOptions(refreshedToken))
    } catch (error) {
      setFormError(getErrorMessage(error))
    } finally {
      setIsSaving(false)
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

  function getRowActions(group: LifeGroup): RowAction[] {
    return [
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
      {loadError && <FeedbackBanner tone="error">{loadError}</FeedbackBanner>}

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
              {isAdmin && (
                <th scope="col" className="w-16">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
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
                  <p className="font-medium text-ink">{group.leader.name}</p>
                  {!group.leader.isActive && (
                    <p className="mt-1 text-xs font-medium text-muted">
                      Inactive Leader profile
                    </p>
                  )}
                </td>
                <td className="life-group-cell-status">
                  <span className="hm-table-mobile-label">Status</span>
                  <StatusBadge tone={group.isActive ? 'success' : 'neutral'}>
                    {group.isActive ? 'Active' : 'Archived'}
                  </StatusBadge>
                </td>
                {isAdmin && (
                  <td className="life-group-cell-actions text-right">
                    <RowActionsMenu
                      label={`Actions for ${group.name}`}
                      actions={getRowActions(group)}
                      disabled={changingGroupId === group.id}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </ResponsiveTable>
      )}

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
        <form className="space-y-5" onSubmit={handleSubmit}>
          <FormField id="life-group-name" label="Name" required>
            <TextInput
              id="life-group-name"
              data-modal-autofocus
              value={form.name}
              maxLength={120}
              autoComplete="off"
              disabled={isSaving}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
            />
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
