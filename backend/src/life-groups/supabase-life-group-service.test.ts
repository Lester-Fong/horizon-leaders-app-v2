import { describe, expect, it, vi } from "vitest";

import { createSupabaseLifeGroupService } from "./supabase-life-group-service.js";

interface RecordedQuery {
  operations: Array<{ args: unknown[]; method: string }>;
  table: string;
}

interface QueryResult {
  data: unknown;
  error: unknown;
}

const fakeSupabase = vi.hoisted(() => ({ client: undefined as unknown }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeSupabase.client,
}));

const lifeGroupId = "33333333-3333-4333-8333-333333333333";
const currentLeaderId = "11111111-1111-4111-8111-111111111111";
const otherLeaderId = "22222222-2222-4222-8222-222222222222";

const CHAINABLE_METHODS = ["eq", "in", "neq", "order", "select", "update"];

function profile(id: string, overrides: { is_active?: boolean; role?: string } = {}) {
  return { id, is_active: true, name: `Leader ${id.slice(0, 4)}`, role: "leader", ...overrides };
}

/**
 * The current Leader has been deactivated and promoted (DEC-073), and the other
 * Leader is inactive, so any validation of either one would fail.
 */
function setupFakeSupabase() {
  const queries: RecordedQuery[] = [];
  const profiles = new Map([
    [currentLeaderId, profile(currentLeaderId, { is_active: false, role: "admin" })],
    [otherLeaderId, profile(otherLeaderId, { is_active: false })],
  ]);
  const groupRow = {
    created_at: "2026-11-01T00:00:00.000Z",
    description: null,
    id: lifeGroupId,
    is_active: true,
    leader_profile_id: currentLeaderId,
    name: "North",
    updated_at: "2026-11-01T00:00:00.000Z",
  };

  function resolveQuery(query: RecordedQuery): QueryResult {
    const findArgs = (method: string) =>
      query.operations.find((operation) => operation.method === method)?.args;

    if (query.table === "life_groups") {
      const update = findArgs("update")?.[0] as Record<string, unknown> | undefined;
      return { data: update ? { ...groupRow, ...update } : groupRow, error: null };
    }

    const ids = findArgs("in")?.[1] as string[] | undefined;
    if (ids) return { data: ids.map((id) => profiles.get(id)), error: null };

    return { data: profiles.get(String(findArgs("eq")?.[1])) ?? null, error: null };
  }

  function createFakeQuery(table: string) {
    const query: RecordedQuery = { operations: [], table };
    queries.push(query);
    const builder: Record<string, unknown> = {};

    for (const method of CHAINABLE_METHODS) {
      builder[method] = (...args: unknown[]) => {
        query.operations.push({ args, method });
        return builder;
      };
    }
    builder.maybeSingle = async () => {
      query.operations.push({ args: [], method: "maybeSingle" });
      return resolveQuery(query);
    };
    builder.single = async () => resolveQuery(query);
    builder.then = (
      onFulfilled: (value: QueryResult) => unknown,
      onRejected: (reason: unknown) => unknown,
    ) => Promise.resolve(resolveQuery(query)).then(onFulfilled, onRejected);

    return builder;
  }

  fakeSupabase.client = { from: createFakeQuery };

  return {
    queries,
    service: createSupabaseLifeGroupService({
      serviceRoleKey: "test-key",
      supabaseUrl: "http://fake",
    }),
  };
}

describe("Supabase Life Group service update", () => {
  it("keeps an inactive or promoted current Leader when only other fields change", async () => {
    const { queries, service } = setupFakeSupabase();

    const updated = await service.update(lifeGroupId, {
      description: "Renamed",
      leaderProfileId: currentLeaderId,
      name: "North Renamed",
    });

    expect(updated).toMatchObject({ leader: { id: currentLeaderId }, name: "North Renamed" });
    const lifeGroupUpdate = queries
      .flatMap((query) => query.operations)
      .find((operation) => operation.method === "update");
    expect(lifeGroupUpdate?.args[0]).toEqual({ description: "Renamed", name: "North Renamed" });
    // validateLeader reads a single Profile with maybeSingle; it must not run.
    expect(
      queries.some(
        (query) =>
          query.table === "profiles" &&
          query.operations.some((operation) => operation.method === "maybeSingle"),
      ),
    ).toBe(false);
  });

  it("returns the group unchanged when only the current Leader is resubmitted", async () => {
    const { queries, service } = setupFakeSupabase();

    const unchanged = await service.update(lifeGroupId, { leaderProfileId: currentLeaderId });

    expect(unchanged).toMatchObject({ id: lifeGroupId, name: "North" });
    expect(
      queries.some((query) => query.operations.some((operation) => operation.method === "update")),
    ).toBe(false);
  });

  it("still fully validates a real reassignment", async () => {
    const { service } = setupFakeSupabase();

    await expect(
      service.update(lifeGroupId, { leaderProfileId: otherLeaderId, name: "North" }),
    ).rejects.toMatchObject({ code: "LEADER_INACTIVE", status: 422 });
  });
});
