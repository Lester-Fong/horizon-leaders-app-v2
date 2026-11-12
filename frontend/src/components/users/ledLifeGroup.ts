import type { ManagedUser } from '../../lib/api'

/** The active Life Group a Leader runs, which needs a new Leader if they are deactivated. */
export function getLedActiveGroup(user: ManagedUser | null) {
  return user?.role === 'leader' && user.assignedLifeGroup?.isActive
    ? user.assignedLifeGroup
    : null
}
