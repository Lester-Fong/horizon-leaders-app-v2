import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HorizonActor } from "../auth/types.js";
import { createSupabaseUserService } from "./supabase-user-service.js";

interface RecordedQuery {
  operations: Array<{ args: unknown[]; method: string }>;
  table: string;
}

interface QueryResult {
  count?: number | null;
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
  "is",
  "limit",
  "neq",
  "not",
  "or",
  "range",
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
    deleted_at: null as string | null,
    id,
    is_active: true,
    name,
    role: "leader",
    updated_at: "2026-11-01T00:00:00.000Z",
  };
}

function setupFakeSupabase({
  activityRows = [],
  auditTotal = activityRows.length,
  auditError = null,
  profileListRows = [],
  profileOverrides = {},
  profileUpdateError = null,
  profileUpdateRows = [{ id: userId }],
  rpc = async () => ({ data: null, error: null }),
}: {
  activityRows?: unknown[];
  auditError?: unknown;
  auditTotal?: number;
  profileListRows?: unknown[];
  profileOverrides?: Partial<ReturnType<typeof profileRow>>;
  profileUpdateError?: unknown;
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
      if (hasOperation(query, "range")) {
        return auditError
          ? { data: null, error: auditError }
          : { count: auditTotal, data: activityRows, error: null };
      }
      return { data: activityRows, error: null };
    }

    if (query.table === "profiles") {
      if (hasOperation(query, "update")) {
        events.push("profile_update");
        return profileUpdateError
          ? { data: null, error: profileUpdateError }
          : { data: profileUpdateRows, error: null };
      }
      if (!hasOperation(query, "maybeSingle")) {
        return { data: profileListRows, error: null };
      }
      const idFilter = query.operations.find((operation) => operation.method === "eq");
      const id = String(idFilter?.args[1]);
      const row = profileRow(id, id === adminId ? "Ada Admin" : "Lee Leader");
      return { data: id === adminId ? row : { ...row, ...profileOverrides }, error: null };
    }

    if (query.table === "life_groups" && !hasOperation(query, "maybeSingle")) {
      return { data: [], error: null };
    }

    return { data: null, error: null };
  };

  const authUsers = [
    { app_metadata: { provider: "email" }, email: "ada@example.test", id: adminId, last_sign_in_at: null },
    { app_metadata: { provider: "email" }, email: "lee@example.test", id: userId, last_sign_in_at: null },
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

  describe("audit log page", () => {
    const auditRow = {
      actor_name: "Ada Admin",
      actor_profile_id: adminId,
      created_at: "2026-11-02T00:00:00.000Z",
      details: { changes: { role: { from: "leader", to: "admin" } } },
      target_name: "Lee Leader",
      target_user_id: userId,
    };

    it("reads one newest-first window with an exact total", async () => {
      const { queries, service } = setupFakeSupabase({
        activityRows: [
          { ...auditRow, action: "user_updated", id: "event-2" },
          { ...auditRow, action: "future_action", id: "event-1" },
        ],
        auditTotal: 7,
      });

      const page = await service.listAuditPage({ limit: 2, offset: 4 });

      expect(page.items.map((event) => event.id)).toEqual(["event-2"]);
      expect(page.items[0]).toMatchObject({
        action: "user_updated",
        actorName: "Ada Admin",
        details: { changes: { role: { from: "leader", to: "admin" } } },
        targetName: "Lee Leader",
      });
      // The skipped unknown action still counts as a read row, so paging stays aligned.
      expect(page.meta).toEqual({ hasMore: true, limit: 2, offset: 4, total: 7 });

      const [query] = queries.filter((recorded) => recorded.table === "user_audit_events");
      expect(query?.operations).toContainEqual({
        args: [expect.any(String), { count: "exact" }],
        method: "select",
      });
      expect(query?.operations).toContainEqual({
        args: ["created_at", { ascending: false }],
        method: "order",
      });
      expect(query?.operations).toContainEqual({ args: ["id", { ascending: false }], method: "order" });
      expect(query?.operations).toContainEqual({ args: [4, 5], method: "range" });
      // The log is global: no per-user filter is applied.
      expect(hasOperation(query!, "or")).toBe(false);
      expect(hasOperation(query!, "eq")).toBe(false);
    });

    it("reports the last page when no rows remain", async () => {
      const { service } = setupFakeSupabase({
        activityRows: [{ ...auditRow, action: "user_created", id: "event-1" }],
        auditTotal: 3,
      });

      const page = await service.listAuditPage({ limit: 2, offset: 2 });
      expect(page.meta).toEqual({ hasMore: false, limit: 2, offset: 2, total: 3 });
    });

    it("hides database errors behind a service-unavailable error", async () => {
      const { service } = setupFakeSupabase({ auditError: { message: "boom" } });

      await expect(service.listAuditPage({ limit: 10, offset: 0 })).rejects.toMatchObject({
        code: "USER_SERVICE_UNAVAILABLE",
        status: 500,
      });
    });
  });

  describe("soft delete", () => {
    it("marks the Profile, replaces the sign-in, records the audit, then signs out", async () => {
      const { client, events, queries, service } = setupFakeSupabase();

      await expect(service.delete(admin, userId)).resolves.toEqual({ id: userId });
      expect(events).toEqual(["profile_update", "auth_update", "audit", "revoke"]);

      const profileUpdate = queries.find(
        (query) => query.table === "profiles" && hasOperation(query, "update"),
      );
      const updateArgs = profileUpdate?.operations.find((op) => op.method === "update")?.args[0];
      expect(updateArgs).toMatchObject({ is_active: false });
      expect(typeof (updateArgs as { deleted_at: unknown }).deleted_at).toBe("string");
      // The update only matches a Profile that is not already deleted.
      expect(profileUpdate?.operations).toContainEqual({ args: ["deleted_at", null], method: "is" });

      const [authId, attributes] = client.auth.admin.updateUserById.mock.calls[0] as unknown as [
        string,
        Record<string, unknown>,
      ];
      expect(authId).toBe(userId);
      expect(attributes).toMatchObject({
        app_metadata: {
          deleted: true,
          deleted_email: "lee@example.test",
          must_change_password: false,
          provider: "email",
        },
        ban_duration: "876000h",
        email: `deleted+${userId}@deleted.invalid`,
        email_confirm: true,
      });
      expect(String(attributes.password)).toHaveLength(64);

      const audit = queries.find(
        (query) => query.table === "user_audit_events" && hasOperation(query, "insert"),
      );
      expect(audit?.operations[0]?.args[0]).toMatchObject({
        action: "user_deleted",
        details: { email: "lee@example.test", mode: "soft", role: "leader", wasActive: true },
      });
      expect(client.auth.admin.deleteUser).not.toHaveBeenCalled();
    });

    it("restores the Profile when Supabase Auth rejects the change", async () => {
      const { client, events, queries, service } = setupFakeSupabase({
        profileOverrides: { is_active: false },
      });
      client.auth.admin.updateUserById.mockResolvedValueOnce({
        data: {},
        error: { code: "unexpected_failure", status: 500 },
      });

      await expect(service.delete(admin, userId)).rejects.toMatchObject({
        code: "USER_SERVICE_UNAVAILABLE",
      });
      // The mocked Auth failure replaces the recording implementation for this call.
      expect(events).toEqual(["profile_update", "profile_update"]);
      const revert = queries.filter(
        (query) => query.table === "profiles" && hasOperation(query, "update"),
      )[1];
      expect(revert?.operations[0]?.args[0]).toEqual({ deleted_at: null, is_active: false });
    });

    it("reports a concurrent delete as USER_DELETED without touching Auth", async () => {
      const { client, events, service } = setupFakeSupabase({ profileUpdateRows: [] });

      await expect(service.delete(admin, userId)).rejects.toMatchObject({
        code: "USER_DELETED",
        status: 409,
      });
      expect(events).toEqual(["profile_update"]);
      expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
    });

    it("rejects every change to a deleted user", async () => {
      const { client, events, service } = setupFakeSupabase({
        profileOverrides: { deleted_at: "2026-11-10T00:00:00.000Z", is_active: false },
      });

      for (const attempt of [
        () => service.delete(admin, userId),
        () => service.update(admin, userId, { name: "New Name" }),
        () => service.setActive(admin, userId, true),
        () => service.resetPassword(admin, userId, "Welcome2Horizon"),
      ]) {
        await expect(attempt()).rejects.toMatchObject({
          code: "USER_DELETED",
          message: "This user was deleted and can no longer be changed.",
          status: 409,
        });
      }
      expect(events).toEqual([]);
      expect(client.auth.admin.updateUserById).not.toHaveBeenCalled();
    });

    it("shows a deleted user with the email they used before deletion", async () => {
      const { client, service } = setupFakeSupabase({
        profileOverrides: { deleted_at: "2026-11-10T00:00:00.000Z", is_active: false },
      });
      client.auth.admin.getUserById.mockResolvedValueOnce({
        data: {
          user: {
            app_metadata: { deleted: true, deleted_email: "lee@example.test" },
            email: `deleted+${userId}@deleted.invalid`,
            id: userId,
            last_sign_in_at: null,
          },
        },
        error: null,
      });

      await expect(service.getById(userId)).resolves.toMatchObject({
        deletedAt: "2026-11-10T00:00:00.000Z",
        email: "lee@example.test",
        isActive: false,
      });
    });
  });

  it.each([
    ["active", [["is", "deleted_at", null], ["eq", "is_active", true]]],
    ["inactive", [["is", "deleted_at", null], ["eq", "is_active", false]]],
    ["all", [["is", "deleted_at", null]]],
    ["deleted", [["not", "deleted_at", "is", null]]],
  ] as const)("filters the %s status on deleted_at and is_active", async (status, filters) => {
    const { queries, service } = setupFakeSupabase();

    await service.list({ status });

    const profileQuery = queries.find((query) => query.table === "profiles");
    const filterOperations = profileQuery?.operations
      .filter((op) => ["eq", "is", "not"].includes(op.method))
      .map((op) => [op.method, ...op.args]);
    expect(filterOperations).toEqual(filters);
  });

  it("maps the last-active-Admin database rule to LAST_ACTIVE_ADMIN", async () => {
    const lastAdminError = {
      code: "23514",
      message: "profiles_active_admin_required: At least one active Admin is required",
    };
    const { events, service } = setupFakeSupabase({
      profileOverrides: { role: "admin" },
      profileUpdateError: lastAdminError,
    });

    for (const attempt of [
      () => service.setActive(admin, userId, false),
      () => service.update(admin, userId, { role: "leader" }),
      () => service.delete(admin, userId),
    ]) {
      await expect(attempt()).rejects.toMatchObject({
        code: "LAST_ACTIVE_ADMIN",
        message: "At least one active Admin is required.",
        status: 409,
      });
    }
    expect(events).toEqual(["profile_update", "profile_update", "profile_update"]);
  });

  it("keeps other check violations as a service failure", async () => {
    const { service } = setupFakeSupabase({
      profileUpdateError: { code: "23514", message: "profiles_name_not_blank" },
    });

    await expect(service.setActive(admin, userId, false)).rejects.toMatchObject({
      code: "USER_SERVICE_UNAVAILABLE",
    });
  });
});
