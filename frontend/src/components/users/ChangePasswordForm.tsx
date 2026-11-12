import { useEffect, useState, type FormEvent } from 'react'

import { useAuth } from '../../auth/useAuth'
import {
  ApiError,
  changeMyPassword,
  isStrongUserPassword,
  USER_PASSWORD_HINT,
  USER_PASSWORD_MAX_LENGTH,
} from '../../lib/api'
import { getAccessToken } from '../../lib/session'
import { supabase } from '../../lib/supabase'
import { Button } from '../ui/Button'
import { FeedbackBanner } from '../ui/Feedback'
import { FormField, TextInput } from '../ui/FormControls'

interface ChangePasswordFormProps {
  autoFocus?: boolean
  onCancel?(): void
  onBusyChange?(isBusy: boolean): void
  onChanged?(): void
  submitLabel?: string
}

interface FieldErrors {
  confirmation: string | null
  current: string | null
  next: string | null
}

const NO_ERRORS: FieldErrors = { confirmation: null, current: null, next: null }

export const PASSWORD_CHANGED_SIGN_IN_MESSAGE =
  'Your password was changed. Please sign in with your new password.'

function describedBy(id: string, error: string | null, hasDescription = false) {
  const ids = [hasDescription ? `${id}-description` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ')
  return ids || undefined
}

/**
 * Changes the signed-in user's own password. The server signs out every session,
 * so the form signs back in with the new password to keep this device working.
 * If that sign-in fails, the user is sent to sign in with a clear explanation.
 */
export function ChangePasswordForm({
  autoFocus = false,
  onBusyChange,
  onCancel,
  onChanged,
  submitLabel = 'Change password',
}: ChangePasswordFormProps) {
  const { login } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errors, setErrors] = useState<FieldErrors>(NO_ERRORS)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    onBusyChange?.(isSaving)
  }, [isSaving, onBusyChange])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: FieldErrors = {
      confirmation: confirmation === newPassword ? null : 'The passwords do not match.',
      current: currentPassword ? null : 'Enter your current password.',
      next: !isStrongUserPassword(newPassword)
        ? `Use ${USER_PASSWORD_HINT}`
        : newPassword === currentPassword
          ? 'Choose a password that is different from the current one.'
          : null,
    }
    setErrors(nextErrors)
    if (nextErrors.confirmation || nextErrors.current || nextErrors.next) {
      setFormError('Review the marked fields and try again.')
      return
    }

    setIsSaving(true)
    setFormError(null)
    try {
      const { data } = await supabase.auth.getSession()
      const email = data.session?.user.email
      await changeMyPassword(await getAccessToken(), currentPassword, newPassword)

      const result = await login(email ?? '', newPassword, {
        failureMessage: PASSWORD_CHANGED_SIGN_IN_MESSAGE,
      })
      if (result.ok) onChanged?.()
    } catch (error) {
      if (error instanceof ApiError && error.code === 'CURRENT_PASSWORD_INCORRECT') {
        setErrors({ ...NO_ERRORS, current: error.message })
        setFormError(null)
      } else {
        setFormError(
          error instanceof ApiError
            ? error.message
            : 'Your password could not be changed. Please try again.',
        )
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      {formError && <FeedbackBanner tone="error">{formError}</FeedbackBanner>}
      <FormField id="current-password" label="Current password" required error={errors.current}>
        <TextInput
          id="current-password"
          data-modal-autofocus={autoFocus || undefined}
          type="password"
          value={currentPassword}
          maxLength={USER_PASSWORD_MAX_LENGTH}
          autoComplete="current-password"
          disabled={isSaving}
          hasError={Boolean(errors.current)}
          aria-describedby={describedBy('current-password', errors.current)}
          aria-invalid={Boolean(errors.current)}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </FormField>
      <FormField
        id="new-password"
        label="New password"
        required
        description={USER_PASSWORD_HINT}
        error={errors.next}
      >
        <TextInput
          id="new-password"
          type="password"
          value={newPassword}
          maxLength={USER_PASSWORD_MAX_LENGTH}
          autoComplete="new-password"
          disabled={isSaving}
          hasError={Boolean(errors.next)}
          aria-describedby={describedBy('new-password', errors.next, true)}
          aria-invalid={Boolean(errors.next)}
          onChange={(event) => setNewPassword(event.target.value)}
        />
      </FormField>
      <FormField
        id="new-password-confirmation"
        label="Confirm new password"
        required
        error={errors.confirmation}
      >
        <TextInput
          id="new-password-confirmation"
          type="password"
          value={confirmation}
          maxLength={USER_PASSWORD_MAX_LENGTH}
          autoComplete="new-password"
          disabled={isSaving}
          hasError={Boolean(errors.confirmation)}
          aria-describedby={describedBy('new-password-confirmation', errors.confirmation)}
          aria-invalid={Boolean(errors.confirmation)}
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </FormField>
      <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
        )}
        <Button type="submit" isLoading={isSaving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
