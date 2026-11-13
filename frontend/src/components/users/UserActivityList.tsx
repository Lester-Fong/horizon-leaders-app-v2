import { useEffect, useState } from 'react'

import { ApiError, getUserActivity, type UserActivityEvent } from '../../lib/api'
import { formatTimestampDateTime } from '../../lib/dates'
import { getAccessToken } from '../../lib/session'
import { describeUserActivityChanges, USER_ACTIVITY_ACTION_LABELS } from './userActivityFormat'

interface UserActivityListProps {
  userId: string
}

function describeEvent(event: UserActivityEvent, userId: string) {
  const label = USER_ACTIVITY_ACTION_LABELS[event.action]
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
            const changes = describeUserActivityChanges(event)
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
