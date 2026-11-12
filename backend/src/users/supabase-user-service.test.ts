import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HorizonActor } from "../auth/types.js";
import { createSupabaseUserService } from "./supabase-user-service.js";

interface RecordedQuery {
  operations: Array<{ args: unknown[]; method: string }>;
  table: string;
}

interface QueryResult {
  data: unknown;
  error: unknown;
}

type QueryHandler = (query: RecordedQuery) => QueryResult;

const fakeSupabase = vi.hoisted(() => ({ client: undefined as unknown }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => fakeSupabase.client,
}));

const adminId = "55555555-5555-4555-8555-555555555555";
const userId = "11111111-1111-4111-8111-111111111111";
const admin: HorizonActor = { id: adminId, isActive: true, name: "Ada Admin", role: "admin" };

const CHAINABLE_METHODS = [
  "delete",
  "eq",
  "in",
  "insert",
  "limit",
  "neq",
  "or",
  "order",
  "select",
  "update",
];

/** A minimal PostgREST-style builder: every call is recorded and the handler decides the result. */
function createFakeQuery(table: string, handler: QueryHandler, log: RecordedQuery[]) {
  const query: RecordedQuery = { operations: [], table };
  log.push(query);
  const builder: Record<string, unknown> = {};

  for (const method of CHAINABLE_METHODS) {
    builder[method] = (...args: unknown[]) => {
      query.operations.push({ args, method });
      return builder;
    };
  }

  const resolve = () => Promise.resolve(handler(query));
  builder.maybeSingle = () => {
    query.operations.push({ args: [], method: "maybeSingle" });
    return resolve();
  };
  builder.then = (
    onFulfilled: (value: QueryResult) => unknown,
    onRejected: (reason: unknown) => unknown,
  ) => resolve().then(onFulfilled, onRejected);

  return builder;
}

function hasOperation(query: RecordedQuery, method: string) {
  return query.operations.some((operation) => operation.method === method);
}

function profileRow(id: string, name: string) {
  return {
    created_at: "2026-11-01T00:00:00.000Z",
    id,
    is_active: true,
    name,
    role: "leader",
    updated_at: "2026-11-01T00:00:00.000Z",
  };
}

function setupFakeSupabase({
  activityRows = [],
  profileUpdateRows = [{ id: userId }],
  rpc = async () => ({ data: null, error: null }),
}: {
  activityRows?: unknown[];
  profileUpdateRows?: unknown[];
  rpc?: () => Promise<QueryResult>;
} = {}) {
  const queries: RecordedQuery[] = [];
  const events: string[] = [];

  const handler: QueryHandler = (query) => {
    if (query.table === "user_audit_events") {
      if (hasOperation(query, "insert")) {
        events.push("audit");
        return { data: null, error: null };
      }
      return { data: activityRows, error: null };
    }

    if (query.table === "profiles") {
      if (hasOperation(query, "update")) {
        events.push("profile_update");
        return { data: profileUpdateRows, error: null };
      }
      const idFilter = query.operations.find((operation) => operation.method === "eq");
      const id = String(idFilter?.args[1]);
      return { data: profileRow(id, id === adminId ? "Ada Admin" : "Lee Leader"), error: null };
    }

    return { data: null, error: null };
  };

  const authUsers = [
    { email: "ada@example.test", id: adminId, last_sign_in_at: null },
    { email: "lee@example.test", id: userId, last_sign_in_at: null },
  ];

  const client = {
    auth: {
      admin: {
        createUser: vi.fn(async () => ({ data: { user: { id: userId } }, error: null })),
        deleteUser: vi.fn(async () => ({ data: null, error: null })),
        getUserById: vi.fn(async (id: string) => ({
          data: { user: authUsers.find((authUser) => authUser.id === id) },
          error: null,
        })),
        listUsers: vi.fn(async () => ({ data: { users: authUsers }, error: null })),
        updateUserById: vi.fn(async () => {
          events.push("auth_update");
          return { data: {}, error: null as unknown };
        }),
      },
      signInWithPassword: vi.fn(async () => ({ data: {}, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: (table: string) => createFakeQuery(table, handler, queries),
    rpc: vi.fn(async () => {
      events.push("revoke");
      return rpc();
    }),
  };

  fakeSupabase.client = client;

  return {
    client,
    events,
    queries,
    service: createSupabaseUserService({ serviceRoleKey: "test-key", supabaseUrl: "http://fake" }),
  };
}

describe("Supabase User service safeguards", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("rejects an Admin resetting their own password", async () => {
    const { client, service } = setupFakeSupabase();

    await expect(service.resetPassword(admin, adminId, "Welcome2Horizon")).rejects.toMatchObject({
      code: "CANNOT_MODIFY_OWN_ACCOUNT",
      message: "Use My profile to change your own password.",
      status: 409,
    });
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it("rejects an Admin changing their own email but allows their own name", async () => {
    const { client, events, service } = setupFakeSupabase({
      profileUpdateRows: [{ id: adminId }],
    });

    await expect(
      service.update(admin, adminId, { email: "new.ada@example.test", name: "Ada New" }),
    ).rejects.toMatchObject({
      code: "CANNOT_MODIFY_OWN_ACCOUNT",
      message: "Ask another Admin to change your sign-in email.",
      status: 409,
    });
    expect(events).toEqual([]);

    const renamed = await service.update(admin, adminId, {
      email: "ada@example.test",
      name: "Ada Renamed",
    });
    expect(renamed.id).toBe(adminId);
    expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
    expect(events).toEqual(["profile_update", "audit"]);
  });

  it("records the audit row before revoking and survives a failed revocation", async () => {
    const { events, service } = setupFakeSupabase({
      rpc: async () => ({ data: null, error: { message: "boom" } }),
    });

    await expect(service.setActive(admin, userId, false)).resolves.toMatchObject({ id: userId });
    expect(events).toEqual(["profile_update", "audit", "revoke"]);
    expect(consoleError).toHaveBeenCalledWith(`[users] Could not revoke sessions for ${userId}.`);
  });

  it("keeps a completed password reset and email change when revocation throws", async () => {
    const { events, service } = setupFakeSupabase({
      rpc: async () => {
        throw new Error("network down");
      },
    });

    await expect(service.resetPassword(admin, userId, "Welcome2Horizon")).resolves.toEqual({
      id: userId,
    });
    expect(events).toEqual(["auth_update", "audit", "revoke"]);

    events.length = 0;
    await expect(
      service.update(admin, userId, { email: "lee.new@example.test" }),
    ).resolves.toMatchObject({ id: userId });
    expect(events).toEqual(["auth_update", "audit", "revoke"]);
    expect(consoleError).toHaveBeenCalledTimes(2);
  });

  it("signs out the verification session when the own-password change fails", async () => {
    const { client, events, service } = setupFakeSupabase();
    client.auth.admin.updateUserById.mockResolvedValueOnce({
      data: {},
      error: { code: "unexpected_failure", status: 500 },
    });

    await expect(
      service.changeOwnPassword(admin, "Current1Horizon", "Personal3Horizon"),
    ).rejects.toMatchObject({ code: "USER_SERVICE_UNAVAILABLE" });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(events).toEqual([]);
  });

  it("deletes the new Auth user when no Profile row was updated", async () => {
    const { client, events, service } = setupFakeSupabase({ profileUpdateRows: [] });

    await expect(
      service.create(admin, {
        email: "lee@example.test",
        name: "Lee Leader",
        password: "Welcome2Horizon",
        role: "leader",
      }),
    ).rejects.toMatchObject({ code: "USER_SERVICE_UNAVAILABLE", status: 500 });
    expect(client.auth.admin.deleteUser).toHaveBeenCalledWith(userId);
    expect(events).toEqual(["profile_update"]);
  });

  it("rejects a non-UUID activity id and skips unknown audit actions", async () => {
    const auditRow = {
      actor_name: "Ada Admin",
      actor_profile_id: adminId,
      created_at: "2026-11-02T00:00:00.000Z",
      details: {},
      target_name: "Lee Leader",
      target_user_id: userId,
    };
    const { queries, service } = setupFakeSupabase({
      activityRows: [
        { ...auditRow, action: "password_reset", id: "event-1" },
        { ...auditRow, action: "future_action", id: "event-2" },
      ],
    });

    await expect(service.listActivity(`${userId},actor_profile_id.neq.x`)).rejects.toMatchObject({
      code: "USER_NOT_FOUND",
      status: 404,
    });
    expect(queries).toEqual([]);

    const activity = await service.listActivity(userId);
    expect(activity.map((event) => event.id)).toEqual(["event-1"]);
  });
});
