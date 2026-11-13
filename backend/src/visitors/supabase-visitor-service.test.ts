import { describe, expect, it } from "vitest";

import type { HorizonActor } from "../auth/types.js";
import type { MemberService } from "../members/types.js";
import { createSupabaseVisitorService } from "./supabase-visitor-service.js";

const visitorId = "11111111-1111-4111-8111-111111111111";
const admin: HorizonActor = {
  id: "55555555-5555-4555-8555-555555555555",
  isActive: true,
  name: "Ada Admin",
  role: "admin",
};
const leader: HorizonActor = {
  id: "66666666-6666-4666-8666-666666666666",
  isActive: true,
  name: "Lee Leader",
  role: "leader",
};

function visitorRow(status: "active" | "converted") {
  return {
    converted_at: status === "converted" ? "2026-11-02T00:00:00.000Z" : null,
    converted_member_id:
      status === "converted" ? "22222222-2222-4222-8222-222222222222" : null,
    created_at: "2026-11-01T00:00:00.000Z",
    email: null,
    first_name: "Vera",
    id: visitorId,
    last_name: "Visitor",
    life_group_id: null,
    normalized_email: null,
    normalized_phone: null,
    phone: null,
    status,
    updated_at: "2026-11-01T00:00:00.000Z",
  };
}

/**
 * Serves the visitors table like PostgREST while a conversion lands between
 * the service's status check and its update: the first read sees an active
 * Visitor, the status-guarded PATCH matches no row, and later reads see
 * `afterRaceRow` (null when the Visitor no longer exists).
 */
function createRaceFetch(afterRaceRow: ReturnType<typeof visitorRow> | null) {
  let reads = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const method = init?.method ?? "GET";
    const json = { "Content-Type": "application/json" };
    if (method === "PATCH") {
      // `.single()` with zero matching rows.
      return new Response(
        JSON.stringify({
          code: "PGRST116",
          details: "The result contains 0 rows",
          hint: null,
          message: "JSON object requested, multiple (or no) rows returned",
        }),
        { headers: json, status: 406 },
      );
    }
    reads += 1;
    const row = reads === 1 ? visitorRow("active") : afterRaceRow;
    return new Response(JSON.stringify(row ? [row] : []), {
      headers: json,
      status: 200,
    });
  };
  return fetchImpl;
}

function createService(afterRaceRow: ReturnType<typeof visitorRow> | null) {
  return createSupabaseVisitorService({
    fetchImpl: createRaceFetch(afterRaceRow),
    memberService: {} as MemberService,
    serviceRoleKey: "test-service-role-key",
    supabaseUrl: "http://postgrest.test",
  });
}

describe("Supabase Visitor service update racing a conversion", () => {
  it("returns 409 VISITOR_NOT_ACTIVE to an Admin instead of a 500", async () => {
    await expect(
      createService(visitorRow("converted")).update(admin, visitorId, {
        firstName: "Vera",
      }),
    ).rejects.toMatchObject({ code: "VISITOR_NOT_ACTIVE", status: 409 });
  });

  it("returns 404 VISITOR_NOT_FOUND to a Leader, matching converted-Visitor scope", async () => {
    await expect(
      createService(visitorRow("converted")).update(leader, visitorId, {
        firstName: "Vera",
      }),
    ).rejects.toMatchObject({ code: "VISITOR_NOT_FOUND", status: 404 });
  });

  it("returns 404 VISITOR_NOT_FOUND when the Visitor disappeared", async () => {
    await expect(
      createService(null).update(admin, visitorId, { firstName: "Vera" }),
    ).rejects.toMatchObject({ code: "VISITOR_NOT_FOUND", status: 404 });
  });
});
