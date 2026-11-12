import { UserX } from 'lucide-react'
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

interface DeactivateUserDialogProps {
  error: string | null
  isSubmitting: boolean
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

export function DeactivateUserDialog({
  error,
  isSubmitting,
  onClose,
  onConfirm,
  user,
}: DeactivateUserDialogProps) {
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
            (option) => option.isActive && option.id !== user.id && !option.assignedLifeGroup,
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
      title="Deactivate user?"
      description={`${user.name} will be signed out and lose access to Horizon immediately. Their history is kept and an Admin can reactivate them later.`}
    >
      {ledGroup && (
        <div className="mb-5 space-y-3">
          <FeedbackBanner tone="warning" title="This Leader runs a Life Group">
            {user.name} leads {ledGroup.name}. Choose who takes over before you deactivate them.
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
          <UserX aria-hidden="true" className="size-4" />
          Deactivate user
        </Button>
      </div>
    </Modal>
  )
}
