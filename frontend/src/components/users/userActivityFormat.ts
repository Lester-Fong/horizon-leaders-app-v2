import type { UserActivityEvent } from '../../lib/api'

/** Readable labels for recorded account changes. */
export const USER_ACTIVITY_ACTION_LABELS: Record<UserActivityEvent['action'], string> = {
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

/** Summarises a "Details updated" event, e.g. "role: leader → admin"; null when nothing changed. */
export function describeUserActivityChanges(event: UserActivityEvent) {
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
