import { describe, expect, it } from 'vitest'

import type {
  GatheringAttendanceMember,
  GatheringAttendanceVisitor,
} from '../../lib/api'
import { copyablePreviousAttendees } from './previousGathering'

function member(
  id: string,
  firstName: string,
  flags: { isEligible: boolean; isPresent: boolean },
): GatheringAttendanceMember {
  return {
    currentLifeGroup: { id: 'group-north', name: 'North Group' },
    email: null,
    firstName,
    id,
    isActive: flags.isEligible,
    lastName: 'Member',
    phone: null,
    ...flags,
  }
}

function visitor(
  id: string,
  firstName: string,
  flags: { isEligible: boolean; isPresent: boolean },
): GatheringAttendanceVisitor {
  return {
    currentLifeGroup: flags.isEligible ? { id: 'group-north', name: 'North Group' } : null,
    email: null,
    firstName,
    id,
    lastName: 'Visitor',
    phone: null,
    status: 'active',
    ...flags,
  }
}

describe('copyablePreviousAttendees', () => {
  it('keeps only present people who are still eligible, sorted by name', () => {
    const result = copyablePreviousAttendees({
      members: [
        member('m-cara', 'Cara', { isEligible: true, isPresent: true }),
        member('m-ana', 'Ana', { isEligible: true, isPresent: true }),
        member('m-absent', 'Dan', { isEligible: true, isPresent: false }),
        member('m-archived', 'Eve', { isEligible: false, isPresent: true }),
      ],
      visitors: [
        visitor('v-bea', 'Bea', { isEligible: true, isPresent: true }),
        visitor('v-moved', 'Fay', { isEligible: false, isPresent: true }),
      ],
    })

    expect(result.attendees).toEqual([
      { id: 'm-ana', name: 'Ana Member', personType: 'member' },
      { id: 'v-bea', name: 'Bea Visitor', personType: 'visitor' },
      { id: 'm-cara', name: 'Cara Member', personType: 'member' },
    ])
    expect(result.skippedCount).toBe(2)
  })

  it('returns nothing when nobody was present', () => {
    expect(
      copyablePreviousAttendees({
        members: [member('m-ana', 'Ana', { isEligible: true, isPresent: false })],
        visitors: [],
      }),
    ).toEqual({ attendees: [], skippedCount: 0 })
  })
})
