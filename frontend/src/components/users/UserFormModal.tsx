import { useState, type FormEvent } from 'react'

import {
  ApiError,
  isStrongUserPassword,
  USER_PASSWORD_HINT,
  USER_PASSWORD_MAX_LENGTH,
  type AppRole,
  type CreateUserInput,
  type ManagedUser,
} from '../../lib/api'
import { Button } from '../ui/Button'
import { FeedbackBanner } from '../ui/Feedback'
import { FormField, Select, TextInput } from '../ui/FormControls'
import { Modal } from '../ui/Modal'
import { CopyPasswordButton } from './CopyPasswordButton'

export type UserFormContext =
  | { mode: 'create' }
  | { mode: 'edit'; user: ManagedUser }

interface UserFormModalProps {
  actorId: string | undefined
  context: UserFormContext
  onClose(): void
  onSave(input: CreateUserInput): Promise<ManagedUser>
  onSaved(user: ManagedUser): void
}

type FieldErrors = Partial<Record<'email' | 'name' | 'password', string>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getSaveErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  return 'The user could not be saved. Please try again.'
}

export function UserFormModal({
  actorId,
  context,
  onClose,
  onSave,
  onSaved,
}: UserFormModalProps) {
  const user = context.mode === 'edit' ? context.user : null
  const isEditing = user !== null
  const isOwnAccount = user?.id === actorId
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [role, setRole] = useState<AppRole>(user?.role ?? 'leader')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const leavesLifeGroupWithoutLeader = Boolean(
    user?.assignedLifeGroup && user.role === 'leader' && role === 'admin',
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedName = name.trim()
    const normalizedEmail = email.trim().toLowerCase()
    const errors: FieldErrors = {}

    if (!normalizedName) errors.name = 'Enter a name.'
    if (!EMAIL_PATTERN.test(normalizedEmail)) errors.email = 'Enter a valid email address.'
    if (!isEditing && !isStrongUserPassword(password)) {
      errors.password = `Use ${USER_PASSWORD_HINT}`
    }

    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      setFormError('Review the marked fields and try again.')
      return
    }

    setIsSaving(true)
    setFormError(null)
    try {
      onSaved(
        await onSave({
          email: normalizedEmail,
          name: normalizedName,
          password,
          role,
        }),
      )
    } catch (error) {
      setFormError(getSaveErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  function describedBy(field: keyof FieldErrors, hint?: string) {
    return [hint, fieldErrors[field] ? `user-${field}-error` : undefined]
      .filter(Boolean)
      .join(' ') || undefined
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      preventClose={isSaving}
      title={user ? `Edit ${user.name}` : 'Create a user'}
      description={
        isEditing
          ? 'Update the staff account name, sign-in email, and role.'
          : 'Create a staff account. Share the initial password with the person securely.'
      }
    >
      {formError && (
        <FeedbackBanner className="mb-5" tone="error">
          {formError}
        </FeedbackBanner>
      )}
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <FormField id="user-name" label="Name" required error={fieldErrors.name}>
          <TextInput
            id="user-name"
            data-modal-autofocus
            value={name}
            maxLength={120}
            autoComplete="off"
            disabled={isSaving}
            hasError={Boolean(fieldErrors.name)}
            aria-describedby={describedBy('name')}
            aria-invalid={Boolean(fieldErrors.name)}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>
        <FormField id="user-email" label="Email" required error={fieldErrors.email}>
          <TextInput
            id="user-email"
            type="email"
            value={email}
            maxLength={254}
            autoComplete="off"
            disabled={isSaving}
            hasError={Boolean(fieldErrors.email)}
            aria-describedby={describedBy('email')}
            aria-invalid={Boolean(fieldErrors.email)}
            onChange={(event) => setEmail(event.target.value)}
          />
        </FormField>
        <FormField
          id="user-role"
          label="Role"
          required
          description={
            isOwnAccount
              ? 'You cannot change the role of your own account.'
              : 'Admins manage all Horizon data. Leaders work within their Life Group.'
          }
        >
          <Select
            id="user-role"
            value={role}
            disabled={isSaving || isOwnAccount}
            aria-describedby="user-role-description"
            onChange={(event) => setRole(event.target.value as AppRole)}
          >
            <option value="leader">Leader</option>
            <option value="admin">Admin</option>
          </Select>
        </FormField>
        {leavesLifeGroupWithoutLeader && (
          <FeedbackBanner tone="warning" title="Life Group reassignment needed">
            {user?.name} leads {user?.assignedLifeGroup?.name}. As an Admin they can no
            longer lead it — reassign {user?.assignedLifeGroup?.name} in Life Groups.
          </FeedbackBanner>
        )}
        {!isEditing && (
          <FormField
            id="user-password"
            label="Initial password"
            required
            description={USER_PASSWORD_HINT}
            error={fieldErrors.password}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <TextInput
                id="user-password"
                type="password"
                value={password}
                maxLength={USER_PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                disabled={isSaving}
                hasError={Boolean(fieldErrors.password)}
                aria-describedby={describedBy('password', 'user-password-description')}
                aria-invalid={Boolean(fieldErrors.password)}
                onChange={(event) => setPassword(event.target.value)}
              />
              <CopyPasswordButton value={password} disabled={isSaving} />
            </div>
          </FormField>
        )}
        <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSaving}>
            {isEditing ? 'Save changes' : 'Create user'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
