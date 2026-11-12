import { useState, type FormEvent } from 'react'

import {
  ApiError,
  isStrongUserPassword,
  USER_PASSWORD_HINT,
  USER_PASSWORD_MAX_LENGTH,
  type ManagedUser,
} from '../../lib/api'
import { Button } from '../ui/Button'
import { FeedbackBanner } from '../ui/Feedback'
import { FormField, TextInput } from '../ui/FormControls'
import { Modal } from '../ui/Modal'
import { CopyPasswordButton } from './CopyPasswordButton'

interface ResetPasswordModalProps {
  onClose(): void
  onReset(password: string): Promise<unknown>
  onResetComplete(): void
  user: ManagedUser
}

export function ResetPasswordModal({
  onClose,
  onReset,
  onResetComplete,
  user,
}: ResetPasswordModalProps) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [confirmationError, setConfirmationError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextPasswordError = isStrongUserPassword(password)
      ? null
      : `Use ${USER_PASSWORD_HINT}`
    const nextConfirmationError =
      confirmation === password ? null : 'The passwords do not match.'

    setPasswordError(nextPasswordError)
    setConfirmationError(nextConfirmationError)
    if (nextPasswordError || nextConfirmationError) {
      setFormError('Review the marked fields and try again.')
      return
    }

    setIsSaving(true)
    setFormError(null)
    try {
      await onReset(password)
      onResetComplete()
    } catch (error) {
      setFormError(
        error instanceof ApiError
          ? error.message
          : 'The password could not be reset. Please try again.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      className="max-w-md"
      isOpen
      onClose={onClose}
      preventClose={isSaving}
      title={`Reset password for ${user.name}`}
      description="Set a new password and share it with the person securely. Their current password stops working immediately and they are signed out on every device. They must choose a new password the next time they sign in."
    >
      {formError && (
        <FeedbackBanner className="mb-5" tone="error">
          {formError}
        </FeedbackBanner>
      )}
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <FormField
          id="reset-password"
          label="New password"
          required
          description={USER_PASSWORD_HINT}
          error={passwordError}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <TextInput
              id="reset-password"
              data-modal-autofocus
              type="password"
              value={password}
              maxLength={USER_PASSWORD_MAX_LENGTH}
              autoComplete="new-password"
              disabled={isSaving}
              hasError={Boolean(passwordError)}
              aria-describedby={
                passwordError
                  ? 'reset-password-description reset-password-error'
                  : 'reset-password-description'
              }
              aria-invalid={Boolean(passwordError)}
              onChange={(event) => setPassword(event.target.value)}
            />
            <CopyPasswordButton value={password} disabled={isSaving} />
          </div>
        </FormField>
        <FormField
          id="reset-password-confirmation"
          label="Confirm new password"
          required
          error={confirmationError}
        >
          <TextInput
            id="reset-password-confirmation"
            type="password"
            value={confirmation}
            maxLength={USER_PASSWORD_MAX_LENGTH}
            autoComplete="new-password"
            disabled={isSaving}
            hasError={Boolean(confirmationError)}
            aria-describedby={
              confirmationError ? 'reset-password-confirmation-error' : undefined
            }
            aria-invalid={Boolean(confirmationError)}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </FormField>
        <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSaving}>
            Reset password
          </Button>
        </div>
      </form>
    </Modal>
  )
}
