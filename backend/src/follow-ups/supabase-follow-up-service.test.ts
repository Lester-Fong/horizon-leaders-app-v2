import { describe, expect, it } from "vitest";

import type { HorizonActor } from "../auth/types.js";
import { requestsTo, type Row } from "../test-support/fake-postgrest.js";
import { createSupabaseFollowUpService } from "./supabase-follow-up-service.js";

const leader: HorizonActor = {
  id: "44444444-4444-4444-8444-444444444444",
  isActive: true,
  name: "Lina Leader",
  role: "leader",
};
const groupId = "33333333-3333-4333-8333-333333333333";
const memberId = "22222222-2222-4222-8222-222222222222";

const followUpRow = {
  completed_at: null,
  completed_by_profile_id: null,
  completion_note: null,
  context: {},
  created_at: "2026-11-01T02:00:00.000Z",
  id: "11111111-1111-4111-8111-111111111111",
  member_id: memberId,
  reason: "consecutive_sunday_absence",
  status: "active",
  visitor_id: null,
};

/**
 * Records every PostgREST request and answers each table with fixed rows, so a
 * test can assert exactly which filters the service sends.
 */
function createService(tables: Record<string, Row[] | Row | null>) {
  const requests: URL[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push(url);
    const body = tables[url.pathname.split("/").at(-1) ?? ""] ?? [];
    const wantsObject = new Headers(init?.headers).get("Accept")?.includes("vnd.pgrst.object");
    const rows = Array.isArray(body) ? body : body ? [body] : [];
    const headers = { "Content-Range": `0-${Math.max(0, rows.length - 1)}/${rows.length}`, "Content-Type": "application/json" };
    return new Response(JSON.stringify(wantsObject ? (rows[0] ?? null) : rows), { headers, status: 200 });
  };
  const service = createSupabaseFollowUpService({
    fetchImpl,
    serviceRoleKey: "test-service-role-key",
    supabaseUrl: "http://postgrest.test",
  });
  return { requests, service };
}

function followUpRequest(requests: URL[]) {
  const [request] = requestsTo(requests, "follow_ups");
  if (!request) throw new Error("No follow_ups request was made.");
  return request.searchParams;
}

describe("Supabase Follow Up service list filters", () => {
  it("sends no filters and no subject embeds when none are given", async () => {
    const { requests, service } = createService({
      follow_ups: [followUpRow],
      members: [{ first_name: "Mara", id: memberId, is_active: true, last_name: "Reyes" }],
    });
    const list = await service.list(leader, "active");
    const params = followUpRequest(requests);
    expect(list).toHaveLength(1);
    expect(params.get("status")).toBe("eq.active");
    expect(params.get("reason")).toBeNull();
    expect(params.get("or")).toBeNull();
    expect(params.get("select")).not.toContain("members");
  });

  it("filters by reason and an inclusive Manila date range on created time for active", async () => {
    const { requests, service } = createService({ follow_ups: [] });
    await service.list(leader, "active", {
      fromDate: "2026-11-01",
      reason: "harvest_sunday_interest",
      toDate: "2026-11-30",
    });
    const params = followUpRequest(requests);
    expect(params.get("reason")).toBe("eq.harvest_sunday_interest");
    expect(params.getAll("created_at")).toEqual([
      "gte.2026-10-31T16:00:00.000Z",
      "lt.2026-11-30T16:00:00.000Z",
    ]);
    expect(params.get("completed_at")).toBeNull();
  });

  it("applies the date range to completed time for History", async () => {
    const { requests, service } = createService({ follow_ups: [] });
    await service.listPage(leader, "completed", { limit: 50, offset: 0 }, { fromDate: "2026-11-05" });
    const params = followUpRequest(requests);
    expect(params.getAll("completed_at")).toEqual(["gte.2026-11-04T16:00:00.000Z"]);
    expect(params.get("created_at")).toBeNull();
  });

  it("matches Member or affiliated Visitor subjects of an Admin-chosen Life Group", async () => {
    const { requests, service } = createService({ follow_ups: [] });
    await service.list(leader, "active", { lifeGroup: { lifeGroupId: groupId, type: "lifeGroup" } });
    const params = followUpRequest(requests);
    expect(params.get("select")).toContain("members!left(id)");
    expect(params.get("select")).toContain("visitors!left(id)");
    expect(params.get("members.life_group_id")).toBe(`eq.${groupId}`);
    expect(params.get("visitors.life_group_id")).toBe(`eq.${groupId}`);
    expect(params.get("or")).toBe("(members.not.is.null,visitors.not.is.null)");
    expect(requestsTo(requests, "life_groups")).toHaveLength(0);
  });

  it("resolves My Life Group to the group the actor leads and combines filters", async () => {
    const { requests, service } = createService({ follow_ups: [], life_groups: { id: groupId } });
    await service.list(leader, "active", { lifeGroup: { type: "mine" }, reason: "consecutive_sunday_absence" });
    const [groupRequest] = requestsTo(requests, "life_groups");
    expect(groupRequest?.searchParams.get("leader_profile_id")).toBe(`eq.${leader.id}`);
    const params = followUpRequest(requests);
    expect(params.get("members.life_group_id")).toBe(`eq.${groupId}`);
    expect(params.get("reason")).toBe("eq.consecutive_sunday_absence");
  });

  it("returns an empty list and page without querying Follow Ups when the Leader leads no group", async () => {
    const { requests, service } = createService({ life_groups: null });
    const list = await service.list(leader, "active", { lifeGroup: { type: "mine" } });
    const page = await service.listPage(leader, "completed", { limit: 50, offset: 0 }, { lifeGroup: { type: "mine" } });
    expect(list).toEqual([]);
    expect(page).toEqual({ items: [], meta: { hasMore: false, limit: 50, offset: 0, total: 0 } });
    expect(requestsTo(requests, "follow_ups")).toHaveLength(0);
  });
});
