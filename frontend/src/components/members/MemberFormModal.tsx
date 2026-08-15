import { useMemo, useState, type FormEvent } from 'react'

import { Button } from '../ui/Button'
import { FeedbackBanner } from '../ui/Feedback'
import {
  FormField,
  Select,
  TextArea,
  TextInput,
} from '../ui/FormControls'
import { Modal } from '../ui/Modal'
import {
  ApiError,
  type AppRole,
  type LifeGroup,
  type Member,
  type MemberGender,
  type MemberInput,
} from '../../lib/api'

export type MemberFormContext =
  | { mode: 'create' }
  | { member: Member; mode: 'edit' }

interface MemberFormState {
  address: string
  birthDate: string
  email: string
  firstName: string
  gender: MemberGender | ''
  lastName: string
  lifeGroupId: string
  phone: string
}

interface MemberFieldErrors {
  firstName?: string
  lastName?: string
  lifeGroupId?: string
}

interface MemberFormModalProps {
  actorId: string
  actorRole: AppRole
  context: MemberFormContext
  lifeGroups: LifeGroup[]
  onClose(): void
  onSave(input: MemberInput): Promise<Member>
  onSaved(member: Member): void
}

function getInitialForm(
  context: MemberFormContext,
  actorId: string,
  actorRole: AppRole,
  lifeGroups: LifeGroup[],
): MemberFormState {
  if (context.mode === 'edit') {
    const { member } = context
    return {
      address: member.address ?? '',
      birthDate: member.birthDate ?? '',
      email: member.email ?? '',
      firstName: member.firstName,
      gender: member.gender ?? '',
      lastName: member.lastName,
      lifeGroupId: member.lifeGroup.id,
      phone: member.phone ?? '',
    }
  }

  const ownLifeGroup = lifeGroups.find(
    (lifeGroup) => lifeGroup.isActive && lifeGroup.leader.id === actorId,
  )
  return {
    address: '',
    birthDate: '',
    email: '',
    firstName: '',
    gender: '',
    lastName: '',
    lifeGroupId: actorRole === 'leader' ? (ownLifeGroup?.id ?? '') : '',
    phone: '',
  }
}

function getMemberErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === 'DUPLICATE_MEMBER_EMAIL') {
      return 'A Member already uses this email address. Review the email and use a different one; Horizon will not merge or overwrite records.'
    }
    if (error.code === 'DUPLICATE_MEMBER_PHONE') {
      return 'A Member already uses this phone number. Review the number and use a different one; Horizon will not merge or overwrite records.'
    }
    return error.message
  }
  return 'The Member could not be saved right now. Please try again.'
}

export function MemberFormModal({
  actorId,
  actorRole,
  context,
  lifeGroups,
  onClose,
  onSave,
  onSaved,
}: MemberFormModalProps) {
  const isAdmin = actorRole === 'admin'
  const isEditing = context.mode === 'edit'
  const editingMember = isEditing ? context.member : null
  const [form, setForm] = useState(() =>
    getInitialForm(context, actorId, actorRole, lifeGroups),
  )
  const [fieldErrors, setFieldErrors] = useState<MemberFieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const selectableLifeGroups = useMemo(() => {
    if (!isAdmin) {
      return lifeGroups
        .filter((lifeGroup) => lifeGroup.leader.id === actorId)
        .map(({ id, isActive, name }) => ({ id, isActive, name }))
    }

    const activeGroups = lifeGroups
      .filter((lifeGroup) => lifeGroup.isActive)
      .map(({ id, isActive, name }) => ({ id, isActive, name }))
    if (
      editingMember &&
      !activeGroups.some((lifeGroup) => lifeGroup.id === editingMember.lifeGroup.id)
    ) {
      return [
        ...activeGroups,
        editingMember.lifeGroup,
      ]
    }
    return activeGroups
  }, [actorId, editingMember, isAdmin, lifeGroups])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextFieldErrors: MemberFieldErrors = {}
    if (!form.firstName.trim()) nextFieldErrors.firstName = 'Enter a first name.'
    if (!form.lastName.trim()) nextFieldErrors.lastName = 'Enter a last name.'
    if (!form.lifeGroupId) {
      nextFieldErrors.lifeGroupId = 'Select an active Life Group.'
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors)
      setFormError('Review the marked fields and try again.')
      return
    }

    setIsSaving(true)
    setFieldErrors({})
    setFormError(null)
    try {
      const savedMember = await onSave({
        address: form.address.trim() || null,
        birthDate: form.birthDate || null,
        email: form.email.trim() || null,
        firstName: form.firstName.trim(),
        gender: form.gender || null,
        lastName: form.lastName.trim(),
        lifeGroupId: form.lifeGroupId,
        phone: form.phone.trim() || null,
      })
      onSaved(savedMember)
    } catch (error) {
      setFormError(getMemberErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      className="max-w-2xl"
      isOpen
      onClose={onClose}
      preventClose={isSaving}
      title={
        context.mode === 'edit'
          ? `Edit ${context.member.firstName} ${context.member.lastName}`
          : 'Create a Member'
      }
      description={
        isEditing
          ? 'Update the approved Member details. The permanent QR token remains unchanged.'
          : "Add the Member's current details and required Life Group. Horizon creates the permanent QR token automatically."
      }
    >
      {formError && (
        <FeedbackBanner className="mb-5" tone="error">
          {formError}
        </FeedbackBanner>
      )}
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            id="member-first-name"
            label="First name"
            required
            error={fieldErrors.firstName}
          >
            <TextInput
              id="member-first-name"
              data-modal-autofocus
              autoComplete="given-name"
              value={form.firstName}
              disabled={isSaving}
              hasError={Boolean(fieldErrors.firstName)}
              aria-describedby={fieldErrors.firstName ? 'member-first-name-error' : undefined}
              aria-invalid={Boolean(fieldErrors.firstName)}
              onChange={(event) =>
                setForm((current) => ({ ...current, firstName: event.target.value }))
              }
            />
          </FormField>
          <FormField
            id="member-last-name"
            label="Last name"
            required
            error={fieldErrors.lastName}
          >
            <TextInput
              id="member-last-name"
              autoComplete="family-name"
              value={form.lastName}
              disabled={isSaving}
              hasError={Boolean(fieldErrors.lastName)}
              aria-describedby={fieldErrors.lastName ? 'member-last-name-error' : undefined}
              aria-invalid={Boolean(fieldErrors.lastName)}
              onChange={(event) =>
                setForm((current) => ({ ...current, lastName: event.target.value }))
              }
            />
          </FormField>
          <FormField id="member-phone" label="Phone">
            <TextInput
              id="member-phone"
              type="tel"
              autoComplete="tel"
              value={form.phone}
              disabled={isSaving}
              onChange={(event) =>
                setForm((current) => ({ ...current, phone: event.target.value }))
              }
            />
          </FormField>
          <FormField id="member-email" label="Email">
            <TextInput
              id="member-email"
              type="email"
              autoComplete="email"
              value={form.email}
              disabled={isSaving}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
            />
          </FormField>
          <FormField id="member-birth-date" label="Birth date">
            <TextInput
              id="member-birth-date"
              type="date"
              autoComplete="bday"
              value={form.birthDate}
              disabled={isSaving}
              onChange={(event) =>
                setForm((current) => ({ ...current, birthDate: event.target.value }))
              }
            />
          </FormField>
          <FormField id="member-gender" label="Gender">
            <Select
              id="member-gender"
              value={form.gender}
              disabled={isSaving}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  gender: event.target.value as MemberGender | '',
                }))
              }
            >
              <option value="">Not selected</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </Select>
          </FormField>
        </div>

        <FormField
          id="member-address"
          label="Address"
          description="Optional. Enter the current address as staff should see it."
        >
          <TextArea
            id="member-address"
            autoComplete="street-address"
            value={form.address}
            disabled={isSaving}
            onChange={(event) =>
              setForm((current) => ({ ...current, address: event.target.value }))
            }
          />
        </FormField>

        <FormField
          id="member-life-group"
          label="Life Group"
          required
          description={
            isAdmin
              ? 'Choose any current active Life Group.'
              : 'Your assigned Life Group is shown and cannot be changed.'
          }
          error={fieldErrors.lifeGroupId}
        >
          <Select
            id="member-life-group"
            value={form.lifeGroupId}
            disabled={isSaving || !isAdmin}
            hasError={Boolean(fieldErrors.lifeGroupId)}
            aria-describedby={
              fieldErrors.lifeGroupId
                ? 'member-life-group-description member-life-group-error'
                : 'member-life-group-description'
            }
            aria-invalid={Boolean(fieldErrors.lifeGroupId)}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                lifeGroupId: event.target.value,
              }))
            }
          >
            {isAdmin && <option value="">Select an active Life Group</option>}
            {selectableLifeGroups.map((lifeGroup) => (
              <option
                key={lifeGroup.id}
                value={lifeGroup.id}
                disabled={!lifeGroup.isActive}
              >
                {lifeGroup.name}{lifeGroup.isActive ? '' : ' (Archived group)'}
              </option>
            ))}
          </Select>
        </FormField>

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSaving}>
            {isEditing ? 'Save changes' : 'Create Member'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
