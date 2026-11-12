import { describe, expect, it } from "vitest";

import type { HorizonActor } from "../auth/types.js";
import { createSupabaseMemberService } from "./supabase-member-service.js";

const MAX_ROWS = 1000;
const groupId = "33333333-3333-4333-8333-333333333333";
const admin: HorizonActor = {
  id: "55555555-5555-4555-8555-555555555555",
  isActive: true,
  name: "Ada Admin",
  role: "admin",
};

function memberRow(index: number) {
  const suffix = String(index).padStart(12, "0");
  return {
    address: null,
    birth_date: null,
    created_at: "2026-11-01T00:00:00.000Z",
    email: null,
    first_name: `First ${index}`,
    gender: index % 2 === 0 ? "female" : "male",
    id: `00000000-0000-4000-8000-${suffix}`,
    is_active: true,
    last_name: `Last ${String(index).padStart(5, "0")}`,
    life_group_id: groupId,
    phone: null,
    qr_token: `token-${index}`,
    updated_at: "2026-11-01T00:00:00.000Z",
  };
}

/**
 * Serves members and life_groups like PostgREST: `offset`/`limit` select a
 * window, no response exceeds max_rows, and `Prefer: count=exact` adds a total.
 */
function createPostgrestFetch(memberCount: number) {
  const members = Array.from({ length: memberCount }, (_, index) => memberRow(index));
  const memberRequests: URL[] = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers = new Headers(init?.headers);
    const table = url.pathname.split("/").at(-1);

    if (table === "life_groups") {
      const body = [{ id: groupId, is_active: true, leader_profile_id: null, name: "North" }];
      return new Response(JSON.stringify(body), { status: 200 });
    }

    memberRequests.push(url);
    let rows = members;
    const gender = url.searchParams.get("gender");
    if (gender) rows = rows.filter((row) => `eq.${row.gender}` === gender);

    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? MAX_ROWS), MAX_ROWS);
    const window = rows.slice(offset, offset + limit);
    const responseHeaders = new Headers({ "Content-Type": "application/json" });
    if (headers.get("Prefer")?.includes("count=exact")) {
      const end = window.length ? offset + window.length - 1 : offset;
      responseHeaders.set("Content-Range", `${offset}-${end}/${rows.length}`);
    }
    return new Response(JSON.stringify(window), { headers: responseHeaders, status: 200 });
  };

  return { fetchImpl, memberRequests };
}

function createService(memberCount: number) {
  const postgrest = createPostgrestFetch(memberCount);
  const service = createSupabaseMemberService({
    fetchImpl: postgrest.fetchImpl,
    serviceRoleKey: "test-service-role-key",
    supabaseUrl: "http://postgrest.test",
  });
  return { ...postgrest, service };
}

describe("Supabase Member service list completeness", () => {
  it("returns every Member past the 1000-row cap when no page is requested", async () => {
    const { memberRequests, service } = createService(1250);

    const members = await service.list(admin, { status: "all" });

    expect(members).toHaveLength(1250);
    expect(new Set(members.map((member) => member.id)).size).toBe(1250);
    expect(members.at(-1)?.firstName).toBe("First 1249");
    expect(
      memberRequests.map((url) => [url.searchParams.get("offset"), url.searchParams.get("limit")]),
    ).toEqual([
      ["0", "1000"],
      ["1000", "1000"],
    ]);
    expect(memberRequests[0]?.searchParams.get("order")).toBe(
      "last_name.asc,first_name.asc,id.asc",
    );
  });

  it("applies in-memory search across every batch, not only the first 1000 rows", async () => {
    const { service } = createService(1250);

    const members = await service.list(admin, { search: "First 1249", status: "all" });

    expect(members.map((member) => member.firstName)).toEqual(["First 1249"]);
  });

  it("reads one exact-count page from the database when only database filters apply", async () => {
    const { memberRequests, service } = createService(1250);

    const page = await service.listPage(
      admin,
      { gender: "male", status: "all" },
      { limit: 50, offset: 600 },
    );

    expect(page.meta).toEqual({ hasMore: false, limit: 50, offset: 600, total: 625 });
    expect(page.items).toHaveLength(25);
    expect(page.items.every((member) => member.gender === "male")).toBe(true);
    expect(memberRequests).toHaveLength(1);
    expect(memberRequests[0]?.searchParams.get("offset")).toBe("600");
    expect(memberRequests[0]?.searchParams.get("limit")).toBe("50");
  });

  it("pages after in-memory search so the total counts only matching Members", async () => {
    const { service } = createService(1250);

    const page = await service.listPage(
      admin,
      { search: "First 12", status: "all" },
      { limit: 5, offset: 0 },
    );

    // "First 12", "First 120".."First 129", "First 1200".."First 1249".
    expect(page.meta).toEqual({ hasMore: true, limit: 5, offset: 0, total: 61 });
    expect(page.items).toHaveLength(5);
  });
});
