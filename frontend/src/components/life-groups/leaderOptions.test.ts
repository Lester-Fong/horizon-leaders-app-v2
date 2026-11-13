import { describe, expect, it } from 'vitest'

import type { LeaderOption, LifeGroup } from '../../lib/api'
import { formatLeaderName, getLeaderIssue, getSelectableLeaders } from './leaderOptions'

function leaderOption(id: string, overrides: Partial<LeaderOption> = {}): LeaderOption {
  return { assignedLifeGroup: null, id, isActive: true, isDeleted: false, name: `Leader ${id}`, ...overrides }
}

function lifeGroup(leader: LifeGroup['leader'], overrides: Partial<LifeGroup> = {}): LifeGroup {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    description: null,
    id: 'group-1',
    isActive: true,
    leader,
    name: 'North Group',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const deletedLeader = { id: 'gone', isActive: false, isDeleted: true, name: 'Gina Gone' }

describe('Life Group leader options', () => {
  it('reports a deleted Leader before the inactive check', () => {
    const options = [leaderOption('gone', { isActive: false, isDeleted: true })]
    expect(getLeaderIssue(lifeGroup(deletedLeader), options)).toBe('Leader was deleted')
    expect(
      getLeaderIssue(lifeGroup({ ...deletedLeader, isDeleted: false }), options),
    ).toBe('Leader is deactivated')
    expect(getLeaderIssue(lifeGroup(deletedLeader, { isActive: false }), options)).toBeNull()
  })

  it('marks a deleted Leader by name', () => {
    expect(formatLeaderName(deletedLeader)).toBe('Gina Gone (deleted)')
    expect(formatLeaderName({ ...deletedLeader, isDeleted: false })).toBe('Gina Gone')
  })

  it('hides deleted users except the edited group current Leader, shown disabled', () => {
    const options = [
      leaderOption('gone', { assignedLifeGroup: { id: 'group-1', isActive: true, name: 'North Group' }, isActive: false, isDeleted: true, name: 'Gina Gone' }),
      leaderOption('other-gone', { isActive: false, isDeleted: true }),
      leaderOption('ready', { name: 'Ready Leader' }),
    ]

    expect(getSelectableLeaders(options, null)).toEqual([
      { disabled: false, id: 'ready', label: 'Ready Leader' },
    ])
    expect(getSelectableLeaders(options, lifeGroup(deletedLeader))).toEqual([
      { disabled: false, id: 'ready', label: 'Ready Leader' },
      { disabled: true, id: 'gone', label: 'Gina Gone (Deleted)' },
    ])
  })
})
