/** The church calendar time zone (DEC-033). */
export const CHURCH_TIME_ZONE = 'Asia/Manila'

const DISPLAY_LOCALE = 'en-PH'

const timestampDateFormatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  day: 'numeric',
  month: 'short',
  timeZone: CHURCH_TIME_ZONE,
  year: 'numeric',
})

const timestampDateTimeFormatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  month: 'short',
  timeZone: CHURCH_TIME_ZONE,
  year: 'numeric',
})

// Calendar dates are built at UTC midnight and formatted in UTC, so the
// printed day is exactly the stored day whatever the browser time zone is.
const calendarDateFormatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
})

const calendarDateLongFormatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
  year: 'numeric',
})

const churchCalendarPartsFormatter = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
  day: '2-digit',
  month: '2-digit',
  timeZone: CHURCH_TIME_ZONE,
  year: 'numeric',
})

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function parseCalendarDate(calendarDate: string): Date {
  const match = CALENDAR_DATE_PATTERN.exec(calendarDate)
  if (!match) throw new RangeError(`Invalid calendar date: ${calendarDate}`)
  const [, year, month, day] = match
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
}

/** Formats a timestamptz instant as a Manila date, e.g. "Nov 12, 2026". */
export function formatTimestampDate(timestamp: string): string {
  return timestampDateFormatter.format(new Date(timestamp))
}

/** Formats a timestamptz instant as a Manila date and time, e.g. "Nov 12, 2026, 8:00 AM". */
export function formatTimestampDateTime(timestamp: string): string {
  return timestampDateTimeFormatter.format(new Date(timestamp))
}

/** Formats a plain YYYY-MM-DD calendar date without any time-zone shift, e.g. "Nov 12, 2026". */
export function formatCalendarDate(calendarDate: string): string {
  return calendarDateFormatter.format(parseCalendarDate(calendarDate))
}

/** Formats a plain YYYY-MM-DD calendar date with the full month name, e.g. "November 12, 2026". */
export function formatCalendarDateLong(calendarDate: string): string {
  return calendarDateLongFormatter.format(parseCalendarDate(calendarDate))
}

/** Today's church-calendar date in Asia/Manila as YYYY-MM-DD. */
export function todayInChurchTimeZone(now: Date = new Date()): string {
  const parts = churchCalendarPartsFormatter.formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
