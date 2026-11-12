import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  CHURCH_TIME_ZONE,
  formatCalendarDate,
  formatCalendarDateLong,
  formatTimestampDate,
  formatTimestampDateTime,
  todayInChurchTimeZone,
} from './dates'

const NON_MANILA_TIME_ZONES = ['America/Los_Angeles', 'UTC', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']

describe('dates', () => {
  let originalTimeZone: string | undefined

  beforeEach(() => {
    originalTimeZone = process.env.TZ
  })

  afterEach(() => {
    if (originalTimeZone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimeZone
  })

  it('uses the Asia/Manila church time zone', () => {
    expect(CHURCH_TIME_ZONE).toBe('Asia/Manila')
  })

  it('renders an instant shortly before midnight UTC as the next day in Manila', () => {
    process.env.TZ = 'America/Los_Angeles'
    const instant = '2026-11-14T16:30:00Z'

    expect(formatTimestampDate(instant)).toBe('Nov 15, 2026')
    expect(formatTimestampDateTime(instant)).toBe('Nov 15, 2026, 12:30 AM')
  })

  it.each(NON_MANILA_TIME_ZONES)('never shifts a calendar date under process TZ %s', (timeZone) => {
    process.env.TZ = timeZone

    // 15 Nov 2026 is a Sunday; it must never render as Saturday the 14th.
    expect(formatCalendarDate('2026-11-15')).toBe('Nov 15, 2026')
    expect(formatCalendarDateLong('2026-11-15')).toBe('November 15, 2026')
    expect(formatCalendarDate('2026-01-01')).toBe('Jan 1, 2026')
  })

  it('rejects a value that is not a YYYY-MM-DD calendar date', () => {
    expect(() => formatCalendarDate('2026-11-15T00:00:00Z')).toThrow(RangeError)
  })

  it('computes today from the Manila calendar, not UTC or the browser zone', () => {
    process.env.TZ = 'America/Los_Angeles'

    // 17:00 UTC on Saturday 14 Nov is already Sunday 15 Nov in Manila.
    expect(todayInChurchTimeZone(new Date('2026-11-14T17:00:00Z'))).toBe('2026-11-15')
    // 15:59 UTC is still 23:59 on the 14th in Manila.
    expect(todayInChurchTimeZone(new Date('2026-11-14T15:59:00Z'))).toBe('2026-11-14')
  })
})
