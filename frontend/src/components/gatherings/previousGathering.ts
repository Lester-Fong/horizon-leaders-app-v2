import type { GatheringAttendanceRoster } from '../../lib/api'

/** A person copied from the previous Gathering as a starting attendee. */
export interface PrefillAttendee {
  id: string
  name: string
  personType: 'member' | 'visitor'
}

export interface PreviousAttendees {
  attendees: PrefillAttendee[]
  /** People present last time who can no longer be marked in this Life Group. */
  skippedCount: number
}

/**
 * Keeps only the people who were present at the previous Gathering and are
 * still eligible for a new mark in this Life Group (DEC-059, DEC-064).
 */
export function copyablePreviousAttendees(
  roster: GatheringAttendanceRoster,
): PreviousAttendees {
  const people = [
    ...roster.members.map((member) => ({ ...member, personType: 'member' as const })),
    ...roster.visitors.map((visitor) => ({ ...visitor, personType: 'visitor' as const })),
  ].filter((person) => person.isPresent)

  const attendees = people
    .filter((person) => person.isEligible)
    .map((person) => ({
      id: person.id,
      name: `${person.firstName} ${person.lastName}`,
      personType: person.personType,
    }))
    .sort((left, right) => left.name.localeCompare(right.name))

  return { attendees, skippedCount: people.length - attendees.length }
}

export function attendeeKey(attendee: PrefillAttendee) {
  return `${attendee.personType}:${attendee.id}`
}
