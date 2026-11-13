import { describe, expect, it } from 'vitest'

import { duplicateNameWarning, findDuplicateName } from './duplicateName'

const records = [
  { id: 'a', isActive: true, name: 'Worship Team' },
  { id: 'b', isActive: false, name: 'Ushers' },
]

describe('findDuplicateName', () => {
  it('matches trimmed names case-insensitively', () => {
    expect(findDuplicateName('  worship TEAM ', records)).toEqual(records[0])
  })

  it('excludes the record being edited', () => {
    expect(findDuplicateName('Worship Team', records, 'a')).toBeNull()
  })

  it('returns null for blank names and non-matching names', () => {
    expect(findDuplicateName('   ', records)).toBeNull()
    expect(findDuplicateName('Worship', records)).toBeNull()
  })
})

describe('duplicateNameWarning', () => {
  it('describes active and archived matches', () => {
    expect(duplicateNameWarning('Ministry', records[0])).toBe(
      'A Ministry named “Worship Team” already exists. You can still save.',
    )
    expect(duplicateNameWarning('Life Group', records[1])).toBe(
      'A Life Group named “Ushers” (archived) already exists. You can still save.',
    )
  })
})
