import type { LeaderOption, LifeGroup } from '../../lib/api'

export interface SelectableLeader {
  disabled: boolean
  id: string
  label: string
}

/**
 * Why an active group's Leader can no longer lead it, or null when the Leader is eligible.
 * Leader options list every Leader-role profile, so a missing entry means the profile was
 * changed to Admin.
 */
export function getLeaderIssue(group: LifeGroup, leaders: LeaderOption[]): string | null {
  if (!group.isActive) return null
  if (group.leader.isDeleted) return 'Leader was deleted'
  if (!group.leader.isActive) return 'Leader is deactivated'
  if (!leaders.some((leader) => leader.id === group.leader.id)) {
    return 'Leader is now an Admin'
  }
  return null
}

/** The Leader's name with a "(deleted)" marker once an Admin deleted their sign-in. */
export function formatLeaderName(leader: LifeGroup['leader']) {
  return leader.isDeleted ? `${leader.name} (deleted)` : leader.name
}

/**
 * Leader picker entries. Deleted users never appear, except the edited group's current
 * Leader, who is shown disabled so the form still names who leads the group today.
 */
export function getSelectableLeaders(
  leaders: LeaderOption[],
  editingGroup: LifeGroup | null,
): SelectableLeader[] {
  const currentLeader = editingGroup?.leader
  const selectable = leaders.flatMap((leader): SelectableLeader[] => {
    if (leader.isDeleted) return []
    const assignedElsewhere = Boolean(
      leader.assignedLifeGroup && leader.assignedLifeGroup.id !== editingGroup?.id,
    )
    return [
      {
        disabled: !leader.isActive || assignedElsewhere,
        id: leader.id,
        label: `${leader.name}${
          !leader.isActive
            ? ' (Inactive)'
            : assignedElsewhere
              ? ` (Assigned to ${leader.assignedLifeGroup?.name})`
              : ''
        }`,
      },
    ]
  })

  if (currentLeader?.isDeleted) {
    selectable.push({ disabled: true, id: currentLeader.id, label: `${currentLeader.name} (Deleted)` })
  }

  return selectable
}
