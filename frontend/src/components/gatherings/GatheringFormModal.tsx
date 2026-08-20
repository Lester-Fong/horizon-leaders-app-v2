import { useState, type FormEvent } from 'react'

import {
  ApiError,
  type GatheringInput,
  type LifeGroupGathering,
} from '../../lib/api'
import { Button } from '../ui/Button'
import { FeedbackBanner } from '../ui/Feedback'
import { FormField, TextArea, TextInput } from '../ui/FormControls'
import { Modal } from '../ui/Modal'

export type GatheringFormContext =
  | { mode: 'create' }
  | { gathering: LifeGroupGathering; mode: 'edit' }

interface GatheringFormModalProps {
  context: GatheringFormContext
  lifeGroupName: string
  onClose(): void
  onSave(input: GatheringInput): Promise<LifeGroupGathering>
  onSaved(gathering: LifeGroupGathering): void
}

function saveErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  return 'The Gathering could not be saved. Please try again.'
}

export function GatheringFormModal({
  context,
  lifeGroupName,
  onClose,
  onSave,
  onSaved,
}: GatheringFormModalProps) {
  const gathering = context.mode === 'edit' ? context.gathering : null
  const [gatheringDate, setGatheringDate] = useState(
    gathering?.gatheringDate ?? '',
  )
  const [title, setTitle] = useState(gathering?.title ?? '')
  const [location, setLocation] = useState(gathering?.location ?? '')
  const [notes, setNotes] = useState(gathering?.notes ?? '')
  const [dateError, setDateError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!gatheringDate) {
      setDateError('Choose the Gathering date.')
      setFormError('Review the marked field and try again.')
      return
    }

    setDateError(null)
    setFormError(null)
    setIsSaving(true)
    try {
      onSaved(
        await onSave({
          gatheringDate,
          location: location.trim() || null,
          notes: notes.trim() || null,
          title: title.trim() || null,
        }),
      )
    } catch (error) {
      setFormError(saveErrorMessage(error))
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
      title={isEditing ? 'Edit Gathering' : 'Create a Gathering'}
      description={`${lifeGroupName} is fixed for this Gathering. Attendance is managed after it is created.`}
    >
      {formError && (
        <FeedbackBanner className="mb-5" tone="error">
          {formError}
        </FeedbackBanner>
      )}
      <form className="space-y-5" noValidate onSubmit={handleSubmit}>
        <FormField
          id="gathering-date"
          label="Date"
          required
          error={dateError}
        >
          <TextInput
            id="gathering-date"
            data-modal-autofocus
            type="date"
            value={gatheringDate}
            disabled={isSaving}
            hasError={Boolean(dateError)}
            aria-invalid={Boolean(dateError)}
            aria-describedby={dateError ? 'gathering-date-error' : undefined}
            onChange={(event) => setGatheringDate(event.target.value)}
          />
        </FormField>
        <FormField
          id="gathering-title"
          label="Topic or title"
          description="Optional. A concise subject for the meeting."
        >
          <TextInput
            id="gathering-title"
            value={title}
            maxLength={160}
            disabled={isSaving}
            onChange={(event) => setTitle(event.target.value)}
          />
        </FormField>
        <FormField id="gathering-location" label="Location" description="Optional.">
          <TextInput
            id="gathering-location"
            value={location}
            maxLength={240}
            disabled={isSaving}
            onChange={(event) => setLocation(event.target.value)}
          />
        </FormField>
        <FormField
          id="gathering-notes"
          label="Notes"
          description="Optional meeting description, minutes, or operational notes."
        >
          <TextArea
            id="gathering-notes"
            value={notes}
            maxLength={5000}
            disabled={isSaving}
            onChange={(event) => setNotes(event.target.value)}
          />
        </FormField>
        <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSaving}>
            {isEditing ? 'Save changes' : 'Create Gathering'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
