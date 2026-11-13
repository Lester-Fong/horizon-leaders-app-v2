import { describe, expect, it } from "vitest";

import type { HorizonActor } from "../auth/types.js";
import { createSupabaseDashboardService, localMonthBounds } from "./supabase-dashboard-service.js";

const programmeId = "77777777-7777-4777-8777-777777777777";
const admin: HorizonActor = { id: "55555555-5555-4555-8555-555555555555", isActive: true, name: "Ada Admin", role: "admin" };
const unassignedLeader: HorizonActor = { id: "66666666-6666-4666-8666-666666666666", isActive: true, name: "Una Leader", role: "leader" };

/** Serves fixed rows per table or RPC, ignoring filters; HEAD count requests get an empty body. */
function createDashboardFetch(rows: Record<string, unknown[]>, counts: Record<string, number> = {}) {
  const requests: URL[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push(url);
    const table = url.pathname.split("/").at(-1) ?? "";
    const headers = { "Content-Range": `*/${counts[table] ?? 0}`, "Content-Type": "application/json" };
    if (init?.method === "HEAD") return new Response(null, { headers, status: 200 });
    const data = rows[table] ?? [];
    if (new Headers(init?.headers).get("Accept")?.includes("vnd.pgrst.object")) {
      return new Response(JSON.stringify(data[0] ?? null), { headers, status: 200 });
    }
    return new Response(JSON.stringify(data), { headers, status: 200 });
  };
  return { fetchImpl, requests };
}

function createService(rows: Record<string, unknown[]> = {}, counts: Record<string, number> = {}) {
  const fake = createDashboardFetch(rows, counts);
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

describe("Supabase dashboard automation status", () => {
  const eventId = "88888888-8888-4888-8888-888888888888";
  const failedRun = {
    error_count: 1, error_summary: `${eventId}: boom`, finished_at: "2026-11-12T19:00:05Z", job_name: "sunday_reconciliation",
    processed_count: 0, started_at: "2026-11-12T19:00:00Z", status: "failed",
  };

  it("gives an Admin the latest Sunday reconciliation run and the pending Services", async () => {
    const { requests, service } = createService(
      { automation_runs: [failedRun], events: [{ event_date: "2026-11-08", id: eventId, title: "Sunday Service" }] },
      { events: 3 },
    );

    const dashboard = await service.get(admin, { period: "8" });

    expect(dashboard.automation).toEqual({
      lastRun: {
        errorCount: 1, errorSummary: `${eventId}: boom`, finishedAt: "2026-11-12T19:00:05Z", jobName: "sunday_reconciliation",
        processedCount: 0, startedAt: "2026-11-12T19:00:00Z", status: "failed",
      },
      pendingServiceCount: 3,
      pendingServices: [{ date: "2026-11-08", eventId, title: "Sunday Service" }],
    });
    const runRequest = requests.find((url) => url.pathname.endsWith("/automation_runs"));
    expect(runRequest?.searchParams.get("job_name")).toBe("eq.sunday_reconciliation");
    expect(runRequest?.searchParams.get("order")).toBe("started_at.desc");
    const pendingRequest = requests.find((url) => url.pathname.endsWith("/events") && url.searchParams.has("sunday_service_evaluations"));
    expect(pendingRequest?.searchParams.get("sunday_service_evaluations")).toBe("is.null");
    expect(pendingRequest?.searchParams.get("counts_for_absence")).toBe("eq.true");
    expect(pendingRequest?.searchParams.get("status")).toBe("eq.closed");
  });

  it("reports no runs and nothing pending on an empty table", async () => {
    const dashboard = await createService().service.get(admin, { period: "8" });

    expect(dashboard.automation).toEqual({ lastRun: null, pendingServiceCount: 0, pendingServices: [] });
  });

  it("never queries or returns automation data for a Leader", async () => {
    const { requests, service } = createService({ automation_runs: [failedRun], life_groups: [{ id: programmeId }] });

    const dashboard = await service.get({ ...unassignedLeader, name: "Lead" }, { period: "8" });

    expect(dashboard).not.toHaveProperty("automation");
    expect(requests.some((url) => url.pathname.endsWith("/automation_runs"))).toBe(false);
    expect(requests.some((url) => url.searchParams.has("sunday_service_evaluations"))).toBe(false);
  });

  it("fails safely on a run status the database does not define", async () => {
    const { service } = createService({ automation_runs: [{ ...failedRun, status: "unknown" }] });

    await expect(service.get(admin, { period: "8" })).rejects.toMatchObject({ code: "DASHBOARD_SERVICE_UNAVAILABLE", status: 500 });
  });
});
