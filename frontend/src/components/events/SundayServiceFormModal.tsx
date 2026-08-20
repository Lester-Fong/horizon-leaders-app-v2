import { useState, type FormEvent } from 'react'

import { ApiError, type SundayService, type SundayServiceInput } from '../../lib/api'
import { Button } from '../ui/Button'
import { FeedbackBanner } from '../ui/Feedback'
import { FormField, TextArea, TextInput } from '../ui/FormControls'
import { Modal } from '../ui/Modal'

export type ServiceFormContext = { mode: 'create' } | { event: SundayService; mode: 'edit' }

export function SundayServiceFormModal({ context, onClose, onSave, onSaved }: {
  context: ServiceFormContext
  onClose(): void
  onSave(input: SundayServiceInput): Promise<SundayService>
  onSaved(event: SundayService): void
}) {
  const event = context.mode === 'edit' ? context.event : null
  const [title, setTitle] = useState(event?.title ?? 'Sunday Service')
  const [eventDate, setEventDate] = useState(event?.eventDate ?? '')
  const [location, setLocation] = useState(event?.location ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [countsForAbsence, setCountsForAbsence] = useState(event?.countsForAbsence ?? true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (!title.trim() || !eventDate) { setError('Title and date are required.'); return }
    setSaving(true); setError(null)
    try {
      onSaved(await onSave({ countsForAbsence, description: description.trim() || null, eventDate, location: location.trim() || null, title: title.trim() }))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The Sunday Service could not be saved.')
    } finally { setSaving(false) }
  }

  const editing = context.mode === 'edit'
  const dateLocked = event?.status === 'closed'
  return (
    <Modal isOpen onClose={onClose} preventClose={saving} title={editing ? 'Edit Sunday Service' : 'Create Sunday Service'} description="Keep the Service record concise. Attendance and Sunday Visitors are managed from its workspace.">
      {error && <FeedbackBanner className="mb-5" tone="error">{error}</FeedbackBanner>}
      <form className="space-y-5" noValidate onSubmit={submit}>
        <FormField id="service-title" label="Title" required>
          <TextInput id="service-title" data-modal-autofocus value={title} maxLength={160} disabled={saving} onChange={(change) => setTitle(change.target.value)} />
        </FormField>
        <FormField id="service-date" label="Date" required description={dateLocked ? 'The close-time attendance snapshot locks this date.' : 'Counting Services must use a Sunday.'}>
          <TextInput id="service-date" type="date" value={eventDate} disabled={saving || dateLocked} onChange={(change) => setEventDate(change.target.value)} />
        </FormField>
        <FormField id="service-location" label="Location" description="Optional.">
          <TextInput id="service-location" value={location} maxLength={240} disabled={saving} onChange={(change) => setLocation(change.target.value)} />
        </FormField>
        <FormField id="service-description" label="Description" description="Optional operational context.">
          <TextArea id="service-description" value={description} maxLength={5000} disabled={saving} onChange={(change) => setDescription(change.target.value)} />
        </FormField>
        <label className="flex items-start gap-3 border-y border-line py-4 text-sm text-ink" htmlFor="service-counts">
          <input id="service-counts" type="checkbox" className="mt-0.5 size-4 accent-[var(--hm-ink)]" checked={countsForAbsence} disabled={saving} onChange={(change) => setCountsForAbsence(change.target.checked)} />
          <span><span className="font-semibold">Counts for Sunday absence</span><span className="mt-1 block leading-5 text-muted">When closed, missing presence is shown as derived absence. Excluded Services are never treated as absence.</span></span>
        </label>
        <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" isLoading={saving}>{editing ? 'Save changes' : 'Create Service'}</Button>
        </div>
      </form>
    </Modal>
  )
}
