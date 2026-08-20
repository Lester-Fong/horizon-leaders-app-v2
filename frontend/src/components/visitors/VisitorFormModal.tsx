import { useState, type FormEvent } from 'react'

import { ApiError, type Visitor, type VisitorInput } from '../../lib/api'
import { Button } from '../ui/Button'
import { FeedbackBanner } from '../ui/Feedback'
import { FormField, TextInput } from '../ui/FormControls'
import { Modal } from '../ui/Modal'

export type VisitorFormContext =
  | { mode: 'create' }
  | { mode: 'edit'; visitor: Visitor }

interface VisitorFormModalProps {
  context: VisitorFormContext
  onClose(): void
  onSave(input: VisitorInput): Promise<Visitor>
  onSaved(visitor: Visitor): void
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  return 'Visitor details could not be saved. Please try again.'
}

export function VisitorFormModal({
  context,
  onClose,
  onSave,
  onSaved,
}: VisitorFormModalProps) {
  const editingVisitor = context.mode === 'edit' ? context.visitor : null
  const [form, setForm] = useState({
    email: editingVisitor?.email ?? '',
    firstName: editingVisitor?.firstName ?? '',
    lastName: editingVisitor?.lastName ?? '',
    phone: editingVisitor?.phone ?? '',
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    if (!form.firstName.trim()) nextErrors.firstName = 'Enter a first name.'
    if (!form.lastName.trim()) nextErrors.lastName = 'Enter a last name.'
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors)
      setFormError('Review the marked fields and try again.')
      return
    }

    setIsSaving(true)
    setFieldErrors({})
    setFormError(null)
    try {
      onSaved(await onSave({
        email: form.email.trim() || null,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim() || null,
      }))
    } catch (error) {
      setFormError(getErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      className="max-w-xl"
      isOpen
      onClose={onClose}
      preventClose={isSaving}
      title={editingVisitor ? `Edit ${editingVisitor.firstName} ${editingVisitor.lastName}` : 'Create a Visitor'}
      description="Record the Visitor's identity and available contact details. A matching name alone does not prevent creation."
    >
      {formError && <FeedbackBanner className="mb-5" tone="error">{formError}</FeedbackBanner>}
      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField id="visitor-first-name" label="First name" required error={fieldErrors.firstName}>
            <TextInput
              id="visitor-first-name"
              data-modal-autofocus
              autoComplete="given-name"
              value={form.firstName}
              disabled={isSaving}
              hasError={Boolean(fieldErrors.firstName)}
              aria-describedby={fieldErrors.firstName ? 'visitor-first-name-error' : undefined}
              aria-invalid={Boolean(fieldErrors.firstName)}
              onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
            />
          </FormField>
          <FormField id="visitor-last-name" label="Last name" required error={fieldErrors.lastName}>
            <TextInput
              id="visitor-last-name"
              autoComplete="family-name"
              value={form.lastName}
              disabled={isSaving}
              hasError={Boolean(fieldErrors.lastName)}
              aria-describedby={fieldErrors.lastName ? 'visitor-last-name-error' : undefined}
              aria-invalid={Boolean(fieldErrors.lastName)}
              onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))}
            />
          </FormField>
          <FormField id="visitor-phone" label="Phone">
            <TextInput id="visitor-phone" type="tel" autoComplete="tel" value={form.phone} disabled={isSaving} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
          </FormField>
          <FormField id="visitor-email" label="Email">
            <TextInput id="visitor-email" type="email" autoComplete="email" value={form.email} disabled={isSaving} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
          </FormField>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button type="submit" isLoading={isSaving}>{editingVisitor ? 'Save changes' : 'Create Visitor'}</Button>
        </div>
      </form>
    </Modal>
  )
}
