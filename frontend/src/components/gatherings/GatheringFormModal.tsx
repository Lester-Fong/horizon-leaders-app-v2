import { useState, type FormEvent } from 'react'

import {
  ApiError,
  type GatheringInput,
  type LifeGroupGathering,
} from '../../lib/api'
import { formatCalendarDate } from '../../lib/dates'
import { Button } from '../ui/Button'
import { FeedbackBanner } from '../ui/Feedback'
import { FormField, TextArea, TextInput } from '../ui/FormControls'
import { Modal } from '../ui/Modal'
import { StatusBadge } from '../ui/StatusBadge'
import {
  attendeeKey,
  type PrefillAttendee,
  type PreviousAttendees,
} from './previousGathering'

export type GatheringFormContext =
  | { mode: 'create' }
  | { gathering: LifeGroupGathering; mode: 'edit' }

/** The saved Gathering and how many copied attendees were recorded. */
export interface GatheringSaveResult {
  failedAttendeeCount: number
  gathering: LifeGroupGathering
  recordedAttendeeCount: number
}

interface GatheringFormModalProps {
  context: GatheringFormContext
  lifeGroupName: string
  /** Newest existing Gathering, offered as a starting point when creating. */
  previousGathering?: LifeGroupGathering | null
  loadPreviousAttendees?(gatheringId: string): Promise<PreviousAttendees>
  onClose(): void
  onSave(
    input: GatheringInput,
    attendees: PrefillAttendee[],
  ): Promise<GatheringSaveResult>
  onSaved(result: GatheringSaveResult): void
}

interface AppliedPrefill {
  attendees: PrefillAttendee[]
  locationBefore: string
  skippedCount: number
}

function saveErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  return 'The Gathering could not be saved. Please try again.'
}

export function GatheringFormModal({
  context,
  lifeGroupName,
  previousGathering = null,
  loadPreviousAttendees,
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
  const [prefill, setPrefill] = useState<AppliedPrefill | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [isPrefillLoading, setIsPrefillLoading] = useState(false)
  const [prefillError, setPrefillError] = useState<string | null>(null)

  const canPrefill =
    context.mode === 'create' &&
    previousGathering !== null &&
    Boolean(loadPreviousAttendees)

  async function applyPreviousGathering() {
    if (!previousGathering || !loadPreviousAttendees) return
    setIsPrefillLoading(true)
    setPrefillError(null)
    try {
      const previous = await loadPreviousAttendees(previousGathering.id)
      setPrefill({
        attendees: previous.attendees,
        locationBefore: location,
        skippedCount: previous.skippedCount,
      })
      setSelectedKeys(new Set(previous.attendees.map(attendeeKey)))
      if (previousGathering.location) setLocation(previousGathering.location)
    } catch (error) {
      setPrefillError(
        error instanceof ApiError
          ? error.message
          : 'The last Gathering could not be loaded. Please try again.',
      )
    } finally {
      setIsPrefillLoading(false)
    }
  }

  function undoPreviousGathering() {
    if (!prefill) return
    setLocation(prefill.locationBefore)
    setPrefill(null)
    setSelectedKeys(new Set())
  }

  function toggleAttendee(attendee: PrefillAttendee) {
    const key = attendeeKey(attendee)
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectedAttendees = prefill
    ? prefill.attendees.filter((attendee) => selectedKeys.has(attendeeKey(attendee)))
    : []

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
        await onSave(
          {
            gatheringDate,
            location: location.trim() || null,
            notes: notes.trim() || null,
            title: title.trim() || null,
          },
          selectedAttendees,
        ),
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
      description={
        canPrefill
          ? `${lifeGroupName} is fixed for this Gathering. Start from the last Gathering's attendees, or manage attendance after it is created.`
          : `${lifeGroupName} is fixed for this Gathering. Attendance is managed after it is created.`
      }
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
        {canPrefill && previousGathering && (
          <section
            aria-labelledby="gathering-prefill-heading"
            className="border-t border-line pt-5"
          >
            <p id="gathering-prefill-heading" className="hm-label">
              Start from last Gathering
            </p>
            {!prefill ? (
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-6 text-muted">
                  Copy the location and the people present on{' '}
                  {formatCalendarDate(previousGathering.gatheringDate)}. Topic and notes are not copied.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  isLoading={isPrefillLoading}
                  disabled={isSaving}
                  onClick={() => void applyPreviousGathering()}
                >
                  Use last Gathering
                </Button>
              </div>
            ) : (
              <fieldset className="mt-2" disabled={isSaving}>
                <legend className="text-sm leading-6 text-muted">
                  From {formatCalendarDate(previousGathering.gatheringDate)}. Untick anyone who is absent. Ticked people are marked present when you create the Gathering.
                </legend>
                {prefill.attendees.length === 0 ? (
                  <p className="mt-3 text-sm text-muted">
                    Nobody from the last Gathering can be marked in this Life Group now.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-line border-y border-line">
                    {prefill.attendees.map((attendee) => {
                      const key = attendeeKey(attendee)
                      const inputId = `prefill-${attendee.personType}-${attendee.id}`
                      return (
                        <li key={key} className="flex items-center gap-4 py-2.5">
                          <input
                            id={inputId}
                            type="checkbox"
                            className="size-5 shrink-0 accent-[var(--hm-ink)]"
                            checked={selectedKeys.has(key)}
                            onChange={() => toggleAttendee(attendee)}
                          />
                          <label
                            htmlFor={inputId}
                            className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-2"
                          >
                            <span className="text-sm font-semibold text-ink">{attendee.name}</span>
                            <StatusBadge tone={attendee.personType === 'member' ? 'neutral' : 'warning'}>
                              {attendee.personType}
                            </StatusBadge>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {prefill.skippedCount > 0 && (
                  <p className="mt-2 text-xs text-muted">
                    {prefill.skippedCount === 1
                      ? '1 person from last time can no longer be marked in this Life Group and was left out.'
                      : `${prefill.skippedCount} people from last time can no longer be marked in this Life Group and were left out.`}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-muted" aria-live="polite">
                    {selectedAttendees.length} selected
                  </span>
                  <span className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={selectedAttendees.length === 0}
                      onClick={() => setSelectedKeys(new Set())}
                    >
                      Clear attendees
                    </Button>
                    <Button variant="ghost" size="sm" onClick={undoPreviousGathering}>
                      Undo
                    </Button>
                  </span>
                </div>
              </fieldset>
            )}
            {prefillError && (
              <p className="mt-2 text-sm text-ink" role="alert">
                {prefillError}
              </p>
            )}
          </section>
        )}
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
