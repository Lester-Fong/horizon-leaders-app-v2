import {
  Check,
  Eye,
  HeartHandshake,
  History,
  RefreshCw,
} from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { Button } from '../components/ui/Button'
import {
  EmptyState,
  ErrorState,
  FeedbackBanner,
  LoadingState,
} from '../components/ui/Feedback'
import { FormField, TextArea } from '../components/ui/FormControls'
import { Modal } from '../components/ui/Modal'
import { PageHeader } from '../components/ui/PageHeader'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import {
  RowActionsMenu,
  type RowAction,
} from '../components/ui/RowActionsMenu'
import { StatusBadge } from '../components/ui/StatusBadge'
import {
  ApiError,
  completeFollowUp,
  getFollowUps,
  type FollowUp,
  type FollowUpStatus,
} from '../lib/api'
import { supabase } from '../lib/supabase'

const dateFormatter = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Manila',
})

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired.')
  }
  return data.session.access_token
}

function getErrorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : 'Follow Up data is unavailable right now. Please try again.'
}

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : 'Not completed'
}

function readNumber(context: Record<string, unknown>, key: string) {
  return typeof context[key] === 'number' ? context[key] : undefined
}

function contextSummary(followUp: FollowUp) {
  if (followUp.reason === 'consecutive_sunday_absence') {
    const threshold = readNumber(followUp.context, 'threshold')
    const qualifyingServiceIds = followUp.context.qualifyingServiceIds
    const serviceCount = Array.isArray(qualifyingServiceIds)
      ? qualifyingServiceIds.length
      : readNumber(followUp.context, 'serviceCount')
    if (threshold && serviceCount) {
      return `${serviceCount} qualifying Sunday absences reached the threshold of ${threshold}.`
    }
    if (threshold) return `Reached the configured threshold of ${threshold} consecutive Sunday absences.`
    return 'Created from the approved consecutive Sunday absence trigger.'
  }

  if (followUp.reason === 'opencell_high_participation') {
    const attendanceCount = readNumber(followUp.context, 'attendanceCount')
    const percentage = readNumber(followUp.context, 'percentage')
    if (attendanceCount !== undefined && percentage !== undefined) {
      return `${attendanceCount} attended sessions, representing ${percentage}% participation.`
    }
    if (percentage !== undefined) return `${percentage}% OpenCell participation recorded.`
    return 'Created from the approved OpenCell participation trigger.'
  }

  return 'Sunday Service interest was explicitly recorded through the approved Harvest workflow.'
}

function subjectMeta(followUp: FollowUp) {
  const type = followUp.subject.type === 'member' ? 'Member' : 'Visitor'
  const recordStatus = followUp.subject.recordStatus === 'active'
    ? 'Active record'
    : followUp.subject.recordStatus === 'archived'
      ? 'Archived record'
      : 'Converted record'
  return `${type} / ${recordStatus}`
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <dt className="hm-label">{label}</dt>
      <dd className="mt-1.5 break-words text-sm leading-6 text-ink">{value}</dd>
    </div>
  )
}

export function FollowUpsPage() {
  const [status, setStatus] = useState<FollowUpStatus>('active')
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [detailTarget, setDetailTarget] = useState<FollowUp | null>(null)
  const [completionTarget, setCompletionTarget] = useState<FollowUp | null>(null)
  const [completionNote, setCompletionNote] = useState('')
  const [completionFormError, setCompletionFormError] = useState<string | null>(null)
  const [completionNoteError, setCompletionNoteError] = useState<string | null>(null)
  const [isCompleting, setIsCompleting] = useState(false)

  const loadDirectory = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      setFollowUps(await getFollowUps(await getAccessToken(), status))
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [status])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDirectory(), 0)
    return () => window.clearTimeout(timer)
  }, [loadDirectory])

  function openCompletion(followUp: FollowUp) {
    setCompletionTarget(followUp)
    setCompletionNote('')
    setCompletionFormError(null)
    setCompletionNoteError(null)
  }

  function rowActions(followUp: FollowUp): RowAction[] {
    const actions: RowAction[] = [
      {
        icon: Eye,
        label: `View Follow Up for ${followUp.subject.name}`,
        onSelect: () => setDetailTarget(followUp),
      },
    ]
    if (followUp.status === 'active') {
      actions.push({
        icon: Check,
        label: `Complete Follow Up for ${followUp.subject.name}`,
        onSelect: () => openCompletion(followUp),
      })
    }
    return actions
  }

  async function handleCompletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!completionTarget) return
    const normalizedNote = completionNote.trim()
    if (normalizedNote.length > 2000) {
      setCompletionNoteError('Keep the completion note to 2000 characters or fewer.')
      return
    }
    setIsCompleting(true)
    setCompletionFormError(null)
    setCompletionNoteError(null)
    try {
      const completed = await completeFollowUp(
        await getAccessToken(),
        completionTarget.id,
        normalizedNote || null,
      )
      setCompletionTarget(null)
      setCompletionNote('')
      setNotice(`Follow Up for ${completed.subject.name} was completed and moved to History.`)
      await loadDirectory()
    } catch (error) {
      setCompletionFormError(getErrorMessage(error))
    } finally {
      setIsCompleting(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        marker="08 — Care"
        title="Follow Up"
        description="A shared pastoral workflow for approved Member and Visitor triggers, with completed contact preserved in History."
        actions={
          <Button variant="secondary" onClick={() => void loadDirectory()}>
            <RefreshCw aria-hidden="true" className="size-4" />
            Refresh
          </Button>
        }
      />

      {notice && <FeedbackBanner tone="success">{notice}</FeedbackBanner>}
      {loadError && followUps.length > 0 && (
        <FeedbackBanner tone="error">{loadError}</FeedbackBanner>
      )}

      <section aria-labelledby="follow-up-view-controls" className="space-y-5">
        <div className="flex flex-col gap-4 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p id="follow-up-view-controls" className="hm-label">Shared workflow</p>
            <p className="mt-1 text-sm text-muted">
              Active is the default. History preserves completed pastoral contact.
            </p>
          </div>
          {!isLoading && (
            <p className="font-mono text-xs text-muted" aria-live="polite">
              {followUps.length} {status === 'active' ? 'active' : 'completed'} {followUps.length === 1 ? 'record' : 'records'}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Follow Up view">
          <Button
            aria-pressed={status === 'active'}
            variant={status === 'active' ? 'primary' : 'secondary'}
            onClick={() => setStatus('active')}
          >
            <HeartHandshake aria-hidden="true" className="size-4" />
            Active
          </Button>
          <Button
            aria-pressed={status === 'completed'}
            variant={status === 'completed' ? 'primary' : 'secondary'}
            onClick={() => setStatus('completed')}
          >
            <History aria-hidden="true" className="size-4" />
            History
          </Button>
        </div>
      </section>

      {isLoading ? (
        <LoadingState title="Loading Follow Up" description={`Retrieving the shared ${status === 'active' ? 'active list' : 'history'}.`} />
      ) : loadError && followUps.length === 0 ? (
        <ErrorState
          title="Follow Up could not be loaded"
          description={loadError}
          action={<Button onClick={() => void loadDirectory()}>Try again</Button>}
        />
      ) : followUps.length === 0 ? (
        <EmptyState
          icon={status === 'active' ? HeartHandshake : History}
          title={status === 'active' ? 'No active Follow Ups' : 'No completed Follow Ups yet'}
          description={status === 'active'
            ? 'Approved domain triggers will appear here when someone needs pastoral contact. There is no manual task creation.'
            : 'Completed Follow Ups will remain here with the completing person, time, and optional note.'}
        />
      ) : (
        <ResponsiveTable caption={`Shared ${status === 'active' ? 'active Follow Up list' : 'Follow Up history'}`} tableClassName="horizon-table--follow-ups">
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Reason</th>
              <th scope="col">Triggered</th>
              <th scope="col">{status === 'active' ? 'Status' : 'Completed'}</th>
              <th scope="col" className="w-16"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {followUps.map((followUp) => (
              <tr key={followUp.id}>
                <td className="follow-up-cell-person">
                  <span className="hm-table-mobile-label">Person</span>
                  <p className="font-medium text-ink">{followUp.subject.name}</p>
                  <p className="mt-1 text-xs text-muted">{subjectMeta(followUp)}</p>
                </td>
                <td className="follow-up-cell-reason">
                  <span className="hm-table-mobile-label">Reason</span>
                  <p className="font-medium text-ink">{followUp.reasonLabel}</p>
                  <p className="mt-1 max-w-md text-xs leading-5 text-muted">{contextSummary(followUp)}</p>
                </td>
                <td className="follow-up-cell-triggered">
                  <span className="hm-table-mobile-label">Triggered</span>
                  <time className="font-mono text-xs text-muted-strong" dateTime={followUp.createdAt}>{formatDate(followUp.createdAt)}</time>
                </td>
                <td className="follow-up-cell-status">
                  <span className="hm-table-mobile-label">{status === 'active' ? 'Status' : 'Completed'}</span>
                  <StatusBadge tone={followUp.status === 'active' ? 'success' : 'neutral'}>
                    {followUp.status === 'active' ? 'Active' : 'Completed'}
                  </StatusBadge>
                  {followUp.completedAt && (
                    <>
                      <p className="mt-1 font-mono text-xs text-muted">{formatDate(followUp.completedAt)}</p>
                      <p className="mt-1 text-xs text-muted">by {followUp.completedBy?.name ?? 'Unknown operator'}</p>
                      <p className="mt-1 max-w-xs text-xs leading-5 text-muted">{followUp.completionNote ?? 'No completion note'}</p>
                    </>
                  )}
                </td>
                <td className="follow-up-cell-actions text-right">
                  <RowActionsMenu label={`Actions for ${followUp.subject.name}`} actions={rowActions(followUp)} />
                </td>
              </tr>
            ))}
          </tbody>
        </ResponsiveTable>
      )}

      <Modal
        className="max-w-lg"
        isOpen={Boolean(detailTarget)}
        onClose={() => setDetailTarget(null)}
        title={detailTarget ? detailTarget.subject.name : 'Follow Up details'}
        description="Approved trigger context and pastoral workflow history."
      >
        {detailTarget && (
          <>
            <div className="flex items-center justify-between gap-4 border-y border-line py-3">
              <span className="hm-label">Follow Up status</span>
              <StatusBadge tone={detailTarget.status === 'active' ? 'success' : 'neutral'}>
                {detailTarget.status === 'active' ? 'Active' : 'Completed'}
              </StatusBadge>
            </div>
            <dl className="mt-3">
              <DetailItem label="Person" value={`${detailTarget.subject.name} / ${subjectMeta(detailTarget)}`} />
              <DetailItem label="Reason" value={detailTarget.reasonLabel} />
              <DetailItem label="Trigger context" value={contextSummary(detailTarget)} />
              <DetailItem label="Triggered" value={formatDate(detailTarget.createdAt)} />
              {detailTarget.completedBy && <DetailItem label="Completed by" value={detailTarget.completedBy.name} />}
              {detailTarget.completedAt && <DetailItem label="Completed" value={formatDate(detailTarget.completedAt)} />}
              {detailTarget.status === 'completed' && <DetailItem label="Completion note" value={detailTarget.completionNote ?? 'No note recorded'} />}
            </dl>
            <div className="mt-5 flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setDetailTarget(null)}>Close</Button>
              {detailTarget.status === 'active' && (
                <Button onClick={() => { setDetailTarget(null); openCompletion(detailTarget) }}>
                  <Check aria-hidden="true" className="size-4" />
                  Complete
                </Button>
              )}
            </div>
          </>
        )}
      </Modal>

      <Modal
        className="max-w-lg"
        isOpen={Boolean(completionTarget)}
        onClose={() => setCompletionTarget(null)}
        preventClose={isCompleting}
        title="Complete Follow Up?"
        description={completionTarget
          ? `Record completed pastoral contact for ${completionTarget.subject.name}. This action cannot be reopened in the MVP.`
          : undefined}
      >
        {completionTarget && (
          <form className="space-y-5" onSubmit={handleCompletion}>
            {completionFormError && <FeedbackBanner tone="error">{completionFormError}</FeedbackBanner>}
            <div className="border-y border-line py-4">
              <p className="hm-label">Reason</p>
              <p className="mt-2 text-sm font-medium text-ink">{completionTarget.reasonLabel}</p>
              <p className="mt-1 text-sm leading-6 text-muted">{contextSummary(completionTarget)}</p>
            </div>
            <FormField
              id="follow-up-completion-note"
              label="Completion note"
              description="Optional. Record only the concise outcome of the contact."
              error={completionNoteError}
            >
              <TextArea
                id="follow-up-completion-note"
                data-modal-autofocus
                value={completionNote}
                maxLength={2000}
                disabled={isCompleting}
                aria-describedby={`follow-up-completion-note-description${completionNoteError ? ' follow-up-completion-note-error' : ''}`}
                aria-invalid={Boolean(completionNoteError)}
                onChange={(event) => {
                  setCompletionNote(event.target.value)
                  if (completionNoteError) setCompletionNoteError(null)
                }}
                placeholder="Optional completion note"
              />
            </FormField>
            <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
              <Button variant="secondary" disabled={isCompleting} onClick={() => setCompletionTarget(null)}>Cancel</Button>
              <Button type="submit" isLoading={isCompleting}>
                <Check aria-hidden="true" className="size-4" />
                Complete Follow Up
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
