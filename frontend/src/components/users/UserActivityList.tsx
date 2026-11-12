import { useEffect, useState } from 'react'

import { ApiError, getUserActivity, type UserActivityEvent } from '../../lib/api'
import { formatTimestampDateTime } from '../../lib/dates'
import { getAccessToken } from '../../lib/session'

interface UserActivityListProps {
  userId: string
}

const ACTION_LABELS: Record<UserActivityEvent['action'], string> = {
  password_changed: 'Changed their password',
  password_reset: 'Password reset',
  user_created: 'Account created',
  user_deactivated: 'Deactivated',
  user_deleted: 'Account deleted',
  user_reactivated: 'Reactivated',
  user_updated: 'Details updated',
}

const FIELD_LABELS: Record<string, string> = { email: 'email', name: 'name', role: 'role' }

function isChange(value: unknown): value is { from: unknown; to: unknown } {
  return typeof value === 'object' && value !== null && 'from' in value && 'to' in value
}

function describeChanges(event: UserActivityEvent) {
  const changes = event.details.changes
  if (typeof changes !== 'object' || changes === null) return null

  const parts = Object.entries(changes)
    .filter(([, change]) => isChange(change))
    .map(([field, change]) => {
      const { from, to } = change as { from: unknown; to: unknown }
      return `${FIELD_LABELS[field] ?? field}: ${String(from ?? 'none')} → ${String(to)}`
    })
  return parts.length > 0 ? parts.join(' · ') : null
}

function describeEvent(event: UserActivityEvent, userId: string) {
  const label = ACTION_LABELS[event.action]
  if (event.action === 'password_changed') return label
  // This list also shows changes the viewed user made to other accounts.
  if (event.targetUserId !== userId) return `${label}: ${event.targetName}`
  return label
}

/** Admin-only account history for one user: changes made to them and by them. */
export function UserActivityList({ userId }: UserActivityListProps) {
  const [events, setEvents] = useState<UserActivityEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isCurrent = true
    void (async () => {
      try {
        const loaded = await getUserActivity(await getAccessToken(), userId)
        if (isCurrent) setEvents(loaded)
      } catch (loadError) {
        if (isCurrent) {
          setError(
            loadError instanceof ApiError
              ? loadError.message
              : 'Account activity is unavailable right now.',
          )
        }
      }
    })()
    return () => {
      isCurrent = false
    }
  }, [userId])

  return (
    <section aria-labelledby={`user-activity-${userId}`} className="mt-6">
      <h3 id={`user-activity-${userId}`} className="hm-label">
        Account activity
      </h3>
      {error ? (
        <p className="mt-3 text-sm text-muted">{error}</p>
      ) : events === null ? (
        <p className="mt-3 text-sm text-muted" role="status">
          Loading activity…
        </p>
      ) : events.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No recorded account changes yet.</p>
      ) : (
        <ol className="mt-3 max-h-64 overflow-y-auto border-y border-line">
          {events.map((event) => {
            const changes = describeChanges(event)
            return (
              <li key={event.id} className="border-b border-line py-3 last:border-b-0">
                <p className="text-sm font-medium text-ink">{describeEvent(event, userId)}</p>
                {changes && <p className="mt-0.5 break-words text-sm text-muted">{changes}</p>}
                <p className="mt-1 font-mono text-[0.6875rem] text-muted">
                  {formatTimestampDateTime(event.createdAt)} · by {event.actorName}
                </p>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
