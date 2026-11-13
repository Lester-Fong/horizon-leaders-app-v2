import { Trash2, UserX, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  ApiError,
  getLeaderOptions,
  type LeaderOption,
  type ManagedUser,
} from '../../lib/api'
import { getAccessToken } from '../../lib/session'
import { Button } from '../ui/Button'
import { FeedbackBanner } from '../ui/Feedback'
import { FormField, Select } from '../ui/FormControls'
import { Modal } from '../ui/Modal'
import { getLedActiveGroup } from './ledLifeGroup'

/** Select value meaning the Admin explicitly chose to hand the group over later. */
const REASSIGN_LATER = 'reassign-later'

export type RemoveUserMode = 'deactivate' | 'delete'

interface ModeCopy {
  confirmLabel: string
  describe(name: string): string
  icon: LucideIcon
  title: string
  verb: string
}

const MODE_COPY: Record<RemoveUserMode, ModeCopy> = {
  deactivate: {
    confirmLabel: 'Deactivate user',
    describe: (name) =>
      `${name} will be signed out and lose access to Horizon immediately. Their history is kept and an Admin can reactivate them later.`,
    icon: UserX,
    title: 'Deactivate user?',
    verb: 'deactivate',
  },
  delete: {
    confirmLabel: 'Delete user',
    describe: (name) =>
      `${name}'s sign-in will be removed permanently and they will leave the Users list. Their name stays on past Horizon records and in the activity log, and the email can be used for a new account. This cannot be undone.`,
    icon: Trash2,
    title: 'Delete user?',
    verb: 'delete',
  },
}

interface DeactivateUserDialogProps {
  error: string | null
  isSubmitting: boolean
  /** Deactivating can be undone later; deleting removes the sign-in for good. */
  mode?: RemoveUserMode
  onClose(): void
  /** Called with the chosen successor's id, or '' when the group is reassigned later. */
  onConfirm(replacementLeaderId: string): void
  user: ManagedUser
}

interface LoadedReplacements {
  error: string | null
  options: LeaderOption[]
  userId: string
}

function getLoadErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  return 'Leaders could not be loaded. You can still reassign the group later.'
}

/**
 * Confirms deactivating or deleting a user. When they lead an active Life Group,
 * the Admin first chooses a successor or explicitly reassigns the group later.
 */
export function DeactivateUserDialog({
  error,
  isSubmitting,
  mode = 'deactivate',
  onClose,
  onConfirm,
  user,
}: DeactivateUserDialogProps) {
  const copy = MODE_COPY[mode]
  const ConfirmIcon = copy.icon
  const ledGroup = getLedActiveGroup(user)
  const ledGroupId = ledGroup?.id
  const [loaded, setLoaded] = useState<LoadedReplacements | null>(null)
  const [choice, setChoice] = useState('')

  useEffect(() => {
    if (!ledGroupId) return
    let isCurrent = true

    async function loadReplacements() {
      try {
        const options = await getLeaderOptions(await getAccessToken())
        if (!isCurrent) return
        setLoaded({
          error: null,
          options: options.filter(
            (option) =>
              option.isActive &&
              !option.isDeleted &&
              option.id !== user.id &&
              !option.assignedLifeGroup,
          ),
          userId: user.id,
        })
      } catch (loadError) {
        if (!isCurrent) return
        setLoaded({ error: getLoadErrorMessage(loadError), options: [], userId: user.id })
      }
    }

    void loadReplacements()
    return () => {
      isCurrent = false
    }
  }, [ledGroupId, user.id])

  // Ignore anything loaded for a previous deactivate target.
  const replacements = loaded?.userId === user.id ? loaded : null
  const isLoadingOptions = Boolean(ledGroup) && replacements === null
  const hasNoCandidates = replacements !== null && replacements.options.length === 0
  const selectedValue = choice || (hasNoCandidates ? REASSIGN_LATER : '')
  const canConfirm = !ledGroup || (!isLoadingOptions && selectedValue !== '')

  function getSelectDescription(groupName: string) {
    if (isLoadingOptions) return `Loading Leaders who could lead ${groupName}…`
    if (hasNoCandidates && !replacements?.error) {
      return `No unassigned active Leaders are available. ${groupName} will need a new Leader in Life Groups.`
    }
    return `Choose who leads ${groupName} from now on, or leave it without a Leader and reassign it in Life Groups.`
  }

  return (
    <Modal
      className="max-w-md"
      isOpen
      onClose={onClose}
      preventClose={isSubmitting}
      title={copy.title}
      description={copy.describe(user.name)}
    >
      {ledGroup && (
        <div className="mb-5 space-y-3">
          <FeedbackBanner tone="warning" title="This Leader runs a Life Group">
            {user.name} leads {ledGroup.name}. Choose who takes over before you {copy.verb} them.
          </FeedbackBanner>
          <FormField
            id="replacement-leader"
            label="New Leader"
            required
            description={getSelectDescription(ledGroup.name)}
            error={replacements?.error}
          >
            <Select
              id="replacement-leader"
              required
              aria-required="true"
              aria-describedby={
                replacements?.error
                  ? 'replacement-leader-description replacement-leader-error'
                  : 'replacement-leader-description'
              }
              value={selectedValue}
              disabled={isLoadingOptions || isSubmitting}
              onChange={(event) => setChoice(event.target.value)}
            >
              <option value="" disabled>
                {isLoadingOptions ? 'Loading Leaders…' : `Choose who leads ${ledGroup.name}…`}
              </option>
              {replacements?.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
              {replacements && (
                <option value={REASSIGN_LATER}>
                  Reassign later — leave {ledGroup.name} without a Leader for now
                </option>
              )}
            </Select>
          </FormField>
        </div>
      )}
      {error && (
        <FeedbackBanner className="mb-5" tone="error">
          {error}
        </FeedbackBanner>
      )}
      <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
        <Button variant="secondary" disabled={isSubmitting} onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          isLoading={isSubmitting}
          disabled={!canConfirm}
          onClick={() => onConfirm(selectedValue === REASSIGN_LATER ? '' : selectedValue)}
        >
          <ConfirmIcon aria-hidden="true" className="size-4" />
          {copy.confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
