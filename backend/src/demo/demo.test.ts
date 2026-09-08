import { describe, expect, it, vi } from "vitest";
import { assertLocalUrl } from "./config.js";
import { birthDateForAge, churchDate, offsetDate, sundayDates } from "./dates.js";
import { attendsSunday } from "./sunday-services.js";
import { assertEmptyDatabase, type DemoContext } from "./context.js";

describe("Local demo safeguards and stable relative scenarios", () => {
  it.each([undefined, "", "https://production.supabase.co", "http://localhost.evil.test:54321", "http://127.0.0.1:54321@remote.test", "http://user:pass@localhost:54321", "http://127.1:54321", "http://localhost:54321/rest/v1", "http://localhost:54321?url=remote", "http://localhost:8000", "https://localhost:54321"])("rejects unsafe URL %s", (url) => {
    expect(() => assertLocalUrl(url)).toThrow("LOCAL DEMO ONLY");
  });
  it.each(["http://127.0.0.1:54321", "http://localhost:54321/", "http://[::1]:54321"])("accepts explicit local endpoint %s", (url) => expect(assertLocalUrl(url)).toBe(url.replace(/\/$/, "")));
  it("refuses a rerun before creating or deleting data", async () => {
    const from = vi.fn();
    const context = { db: { from, auth: { admin: { listUsers: vi.fn(async () => ({ data: { users: [{ id: "existing" }] }, error: null })) } } } } as unknown as DemoContext;
    await expect(assertEmptyDatabase(context)).rejects.toThrow("existing Auth users");
    expect(from).not.toHaveBeenCalled();
  });
  it("handles Manila midnight, year boundaries, and Sunday itself", () => {
    expect(churchDate(new Date("2026-12-31T16:00:00Z"))).toBe("2027-01-01");
    expect(offsetDate("2028-03-01", -1)).toBe("2028-02-29");
    for (const today of ["2027-01-01", "2026-09-06", "2028-02-29"]) {
      const dates = sundayDates(today);
      expect(dates.past).toHaveLength(12);
      expect(new Set(dates.past).size).toBe(12);
      expect(dates.past.every((date) => date < today && new Date(`${date}T00:00:00Z`).getUTCDay() === 0)).toBe(true);
      expect(dates.upcoming >= today).toBe(true);
    }
    expect(birthDateForAge("2027-01-01", 21)).toBe("2005-01-15");
    expect(birthDateForAge("2027-01-15", 21)).toBe("2006-01-15");
  });
  it("includes constant attendance, sustained absence and reset scenarios", () => {
    const history = (member: number) => Array.from({ length: 12 }, (_, index) => attendsSunday(member, index, 0));
    expect(history(0).every(Boolean)).toBe(true);
    expect(history(1).some(Boolean)).toBe(false);
    expect(history(2).filter(Boolean).length).toBeGreaterThan(1);
  });
});
