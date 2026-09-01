import { useState, type FormEvent } from 'react'

import { ApiError, type HarvestEvent, type HarvestEventInput } from '../../lib/api'
import { Button } from '../ui/Button'
import { FeedbackBanner } from '../ui/Feedback'
import { FormField, TextArea, TextInput } from '../ui/FormControls'
import { Modal } from '../ui/Modal'

export type HarvestFormContext = { mode: 'create' } | { event: HarvestEvent; mode: 'edit' }

export function HarvestEventFormModal({ context, onClose, onSave, onSaved }: {
  context: HarvestFormContext
  onClose(): void
  onSave(input: HarvestEventInput): Promise<HarvestEvent>
  onSaved(event: HarvestEvent): void
}) {
  const event = context.mode === 'edit' ? context.event : null
  const [title, setTitle] = useState(event?.title ?? 'Harvest')
  const [eventDate, setEventDate] = useState(event?.eventDate ?? '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (!title.trim() || !eventDate) { setError('Title and date are required.'); return }
    setSaving(true); setError(null)
    try { onSaved(await onSave({ description: description.trim() || null, eventDate, location: location.trim() || null, title: title.trim() })) }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'The Harvest Event could not be saved.') }
    finally { setSaving(false) }
  }

  const editing = context.mode === 'edit'
  const dateLocked = event?.status === 'closed' || (event?.participationCount ?? 0) > 0
  return (
    <Modal isOpen onClose={onClose} preventClose={saving} title={editing ? 'Edit Harvest Event' : 'Create Harvest Event'} description="Harvest uses the shared Event lifecycle. Visitor participation is managed from its workspace.">
      {error && <FeedbackBanner className="mb-5" tone="error">{error}</FeedbackBanner>}
      <form className="space-y-5" noValidate onSubmit={submit}>
        <FormField id="harvest-title" label="Title" required><TextInput id="harvest-title" data-modal-autofocus value={title} maxLength={160} disabled={saving} onChange={(change) => setTitle(change.target.value)} /></FormField>
        <FormField id="harvest-date" label="Date" required description={dateLocked ? 'The date is fixed after participation begins or the Event closes.' : 'Use the church-calendar date.'}><TextInput id="harvest-date" type="date" value={eventDate} disabled={saving || dateLocked} onChange={(change) => setEventDate(change.target.value)} /></FormField>
        <FormField id="harvest-location" label="Location" description="Optional."><TextInput id="harvest-location" value={location} maxLength={240} disabled={saving} onChange={(change) => setLocation(change.target.value)} /></FormField>
        <FormField id="harvest-description" label="Description" description="Optional operational context."><TextArea id="harvest-description" value={description} maxLength={5000} disabled={saving} onChange={(change) => setDescription(change.target.value)} /></FormField>
        <p className="border-y border-line py-4 font-mono text-xs uppercase tracking-[0.08em] text-muted">Harvest never counts for Sunday absence.</p>
        <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" isLoading={saving}>{editing ? 'Save changes' : 'Create Harvest'}</Button></div>
      </form>
    </Modal>
  )
}
