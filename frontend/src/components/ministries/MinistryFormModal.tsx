import { useEffect, useState, type FormEvent } from 'react'

import {
  ApiError,
  getMinistries,
  type Ministry,
  type MinistryInput,
} from '../../lib/api'
import { duplicateNameWarning, findDuplicateName } from '../../lib/duplicateName'
import { getAccessToken } from '../../lib/session'
import { Button } from '../ui/Button'
import { FeedbackBanner } from '../ui/Feedback'
import { FormField, TextArea, TextInput } from '../ui/FormControls'
import { Modal } from '../ui/Modal'

export type MinistryFormContext =
  | { mode: 'create' }
  | { ministry: Ministry; mode: 'edit' }

interface MinistryFormModalProps {
  context: MinistryFormContext
  onClose(): void
  onSave(input: MinistryInput): Promise<Ministry>
  onSaved(ministry: Ministry): void
}

function getSaveErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  return 'The Ministry could not be saved. Please try again.'
}

export function MinistryFormModal({
  context,
  onClose,
  onSave,
  onSaved,
}: MinistryFormModalProps) {
  const ministry = context.mode === 'edit' ? context.ministry : null
  const [name, setName] = useState(ministry?.name ?? '')
  const [description, setDescription] = useState(ministry?.description ?? '')
  const [nameError, setNameError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [existingMinistries, setExistingMinistries] = useState<Ministry[]>([])

  useEffect(() => {
    let isCurrent = true
    async function loadExistingMinistries() {
      try {
        const token = await getAccessToken()
        const allMinistries = await getMinistries(token, { status: 'all' })
        if (isCurrent) setExistingMinistries(allMinistries)
      } catch {
        // The duplicate-name warning is a convenience; saving never depends on it.
        if (isCurrent) setExistingMinistries([])
      }
    }
    void loadExistingMinistries()
    return () => {
      isCurrent = false
    }
  }, [])

  const duplicateMinistry = findDuplicateName(name, existingMinistries, ministry?.id)
  const nameWarning = duplicateMinistry
    ? duplicateNameWarning('Ministry', duplicateMinistry)
    : ''
  const nameDescribedBy =
    [nameError ? 'ministry-name-error' : null, nameWarning ? 'ministry-name-warning' : null]
      .filter(Boolean)
      .join(' ') || undefined

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedName = name.trim()
    if (!normalizedName) {
      setNameError('Enter a Ministry name.')
      setFormError('Review the marked field and try again.')
      return
    }

    setIsSaving(true)
    setNameError(null)
    setFormError(null)
    try {
      onSaved(
        await onSave({
          description: description.trim() || null,
          name: normalizedName,
        }),
      )
    } catch (error) {
      setFormError(getSaveErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  const isEditing = context.mode === 'edit'

  return (
    <Modal
      isOpen
      onClose={onClose}
      preventClose={isSaving}
      title={
        context.mode === 'edit'
          ? `Edit ${context.ministry.name}`
          : 'Create a Ministry'
      }
      description={
        isEditing
          ? 'Update the approved Ministry name and description.'
          : 'Add an operational Ministry. Member assignments can be managed after creation.'
      }
    >
      {formError && (
        <FeedbackBanner className="mb-5" tone="error">
          {formError}
        </FeedbackBanner>
      )}
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <FormField
          id="ministry-name"
          label="Name"
          required
          error={nameError}
        >
          <TextInput
            id="ministry-name"
            data-modal-autofocus
            value={name}
            disabled={isSaving}
            hasError={Boolean(nameError)}
            aria-describedby={nameDescribedBy}
            aria-invalid={Boolean(nameError)}
            onChange={(event) => setName(event.target.value)}
          />
          <p id="ministry-name-warning" aria-live="polite" className="mt-2 text-sm text-ink empty:mt-0">
            {nameWarning}
          </p>
        </FormField>
        <FormField
          id="ministry-description"
          label="Description"
          description="Optional. Keep this concise and operational."
        >
          <TextArea
            id="ministry-description"
            value={description}
            disabled={isSaving}
            onChange={(event) => setDescription(event.target.value)}
          />
        </FormField>
        <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSaving}>
            {isEditing ? 'Save changes' : 'Create Ministry'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
