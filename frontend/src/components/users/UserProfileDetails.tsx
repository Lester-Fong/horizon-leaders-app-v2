import type { ReactNode } from 'react'

import type { ManagedUser } from '../../lib/api'
import { formatTimestampDate, formatTimestampDateTime } from '../../lib/dates'
import { StatusBadge } from '../ui/StatusBadge'

interface UserProfileDetailsProps {
  user: ManagedUser
}

function formatDate(value: string | null, withTime = false) {
  if (!value) return 'Never'
  return withTime ? formatTimestampDateTime(value) : formatTimestampDate(value)
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <dt className="hm-label">{label}</dt>
      <dd className="mt-1.5 break-words text-sm leading-6 text-ink">{value}</dd>
    </div>
  )
}

function lifeGroupValue(user: ManagedUser) {
  if (!user.assignedLifeGroup) {
    return <span className="text-muted">Not leading a Life Group</span>
  }
  const group = user.assignedLifeGroup
  const needsLeader = user.role !== 'leader' || !user.isActive
  return (
    <span className="flex flex-wrap items-center gap-2">
      {group.name}
      {!group.isActive && <StatusBadge>Archived</StatusBadge>}
      {group.isActive && needsLeader && (
        <StatusBadge tone="warning">Needs a new Leader</StatusBadge>
      )}
    </span>
  )
}

/** Active, Inactive, or Deleted (sign-in removed, history kept). */
export function UserStatusBadge({ user }: { user: ManagedUser }) {
  if (user.deletedAt) return <StatusBadge tone="error">Deleted</StatusBadge>
  return (
    <StatusBadge tone={user.isActive ? 'success' : 'neutral'}>
      {user.isActive ? 'Active' : 'Inactive'}
    </StatusBadge>
  )
}

/** Read-only staff profile shared by the Admin user view and "My profile". */
export function UserProfileDetails({ user }: UserProfileDetailsProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div
          aria-hidden="true"
          className="grid size-14 shrink-0 place-items-center rounded-full border border-line-strong font-mono text-base font-semibold text-ink"
        >
          {getInitials(user.name)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-ink">{user.name}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <StatusBadge tone={user.role === 'admin' ? 'warning' : 'neutral'}>
              {user.role === 'admin' ? 'Admin' : 'Leader'}
            </StatusBadge>
            <UserStatusBadge user={user} />
          </div>
          {user.deletedAt && (
            <p className="mt-2 font-mono text-xs text-muted">
              Deleted {formatDate(user.deletedAt)}
            </p>
          )}
        </div>
      </div>
      <dl className="border-y border-line">
        <Detail label="Email" value={user.email ?? <span className="text-muted">No email</span>} />
        <Detail label="Life Group" value={lifeGroupValue(user)} />
        <Detail label="Last sign-in" value={formatDate(user.lastSignInAt, true)} />
        <Detail label="Account created" value={formatDate(user.createdAt)} />
        <Detail label="Last updated" value={formatDate(user.updatedAt)} />
      </dl>
    </div>
  )
}
