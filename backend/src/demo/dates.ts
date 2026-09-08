import { CHURCH_TIME_ZONE } from "../config/constants.js";

export function churchDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHURCH_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => parts.find((value) => value.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function offsetDate(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function sundayDates(today: string) {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  // Always strictly before today, so today's service can remain open.
  const last = offsetDate(today, -(weekday || 7));
  return {
    past: Array.from({ length: 12 }, (_, index) => offsetDate(last, -7 * (11 - index))),
    upcoming: offsetDate(last, 7),
  };
}

export function birthDateForAge(today: string, age: number): string {
  // January 15 works in every year; adjust for dates before that birthday.
  const year = Number(today.slice(0, 4)) - age - (today.slice(5) < "01-15" ? 1 : 0);
  return `${year}-01-15`;
}
