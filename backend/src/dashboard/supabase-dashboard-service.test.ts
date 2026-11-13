import { describe, expect, it } from "vitest";

import type { HorizonActor } from "../auth/types.js";
import { createSupabaseDashboardService, localMonthBounds } from "./supabase-dashboard-service.js";

const programmeId = "77777777-7777-4777-8777-777777777777";
const admin: HorizonActor = { id: "55555555-5555-4555-8555-555555555555", isActive: true, name: "Ada Admin", role: "admin" };
const unassignedLeader: HorizonActor = { id: "66666666-6666-4666-8666-666666666666", isActive: true, name: "Una Leader", role: "leader" };

/** Serves fixed rows per table or RPC, ignoring filters; HEAD count requests get an empty body. */
function createDashboardFetch(rows: Record<string, unknown[]>) {
  const requests: URL[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push(url);
    const headers = { "Content-Range": "*/0", "Content-Type": "application/json" };
    if (init?.method === "HEAD") return new Response(null, { headers, status: 200 });
    const data = rows[url.pathname.split("/").at(-1) ?? ""] ?? [];
    if (new Headers(init?.headers).get("Accept")?.includes("vnd.pgrst.object")) {
      return new Response(JSON.stringify(data[0] ?? null), { headers, status: 200 });
    }
    return new Response(JSON.stringify(data), { headers, status: 200 });
  };
  return { fetchImpl, requests };
}

function createService(rows: Record<string, unknown[]> = {}) {
  const fake = createDashboardFetch(rows);
  const service = createSupabaseDashboardService({ fetchImpl: fake.fetchImpl, serviceRoleKey: "test-service-role-key", supabaseUrl: "http://postgrest.test" });
  return { ...fake, service };
}

describe("Supabase dashboard church-calendar dates", () => {
  it("dates a finished OpenCell Programme by its Asia/Manila calendar day", async () => {
    const { service } = createService({
      opencell_programmes: [{ finished_at: "2026-11-12T20:30:00Z", id: programmeId, name: "Late finish" }],
    });

    const dashboard = await service.get(admin, { period: "8" });

    expect(dashboard.recentUpcoming.recent).toContainEqual(expect.objectContaining({ date: "2026-11-13", id: programmeId, kind: "opencell_programme" }));
  });

  it("bounds the current month at Asia/Manila midnights, including the December rollover", () => {
    expect(localMonthBounds(new Date("2026-12-15T04:00:00Z"))).toEqual({ end: "2026-12-31T16:00:00.000Z", start: "2026-11-30T16:00:00.000Z" });
    // 2026-11-30T17:00Z is already 1 December in Manila.
    expect(localMonthBounds(new Date("2026-11-30T17:00:00Z"))).toEqual({ end: "2026-12-31T16:00:00.000Z", start: "2026-11-30T16:00:00.000Z" });
  });
});

describe("Supabase dashboard for a Leader without a Life Group", () => {
  it("returns the normal dashboard with empty group-scoped data instead of failing", async () => {
    const { requests, service } = createService({ life_groups: [] });

    const dashboard = await service.get(unassignedLeader, { lifeGroupId: programmeId, period: "8" });

    expect(dashboard.isUnassignedLeader).toBe(true);
    expect(dashboard.metrics).toMatchObject({ myLifeGroupMembers: 0, myLifeGroupVisitors: 0 });
    expect(dashboard.memberSnapshot.gender.every((row) => row.count === 0)).toBe(true);
    expect(dashboard.sundayAttendance).toEqual({ averageRate: null, points: [] });
    expect(dashboard.recentUpcoming.recent.some((item) => item.kind === "gathering")).toBe(false);
    const paths = requests.map((url) => url.pathname);
    for (const groupScoped of ["dashboard_member_demographics", "dashboard_sunday_attendance", "visitors", "life_group_gatherings"]) {
      expect(paths.some((path) => path.endsWith(`/${groupScoped}`))).toBe(false);
    }
  });

  it("marks Admin and assigned-Leader dashboards as not unassigned", async () => {
    const adminView = await createService().service.get(admin, { period: "8" });
    const leaderView = await createService({ life_groups: [{ id: programmeId }] }).service.get({ ...unassignedLeader, name: "Lead" }, { period: "8" });

    expect(adminView.isUnassignedLeader).toBe(false);
    expect(leaderView.isUnassignedLeader).toBe(false);
  });
});
