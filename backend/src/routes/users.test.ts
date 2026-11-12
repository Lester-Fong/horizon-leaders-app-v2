import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import {
  UserServiceError,
  type ManagedUser,
  type UserService,
} from "../users/types.js";

const adminId = "55555555-5555-4555-8555-555555555555";
const leaderId = "22222222-2222-4222-8222-222222222222";
const userId = "11111111-1111-4111-8111-111111111111";
const strongPassword = "Welcome2Horizon";

const actors: Record<"admin" | "leader", HorizonActor> = {
  admin: { id: adminId, isActive: true, name: "Ada Admin", role: "admin" },
  leader: { id: leaderId, isActive: true, name: "Lina Leader", role: "leader" },
};

const user: ManagedUser = {
  assignedLifeGroup: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  email: "new.leader@example.test",
  id: userId,
  isActive: true,
  lastSignInAt: null,
  name: "New Leader",
  role: "leader",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

function createAuthService(): AuthService {
  return {
    authenticate: vi.fn(async (token) => ({
      actor: token === "admin-token" ? actors.admin : actors.leader,
      ok: true as const,
    })),
  };
}

function createUserService(): UserService {
  return {
    create: vi.fn(async ({ email, name, role }) => ({ ...user, email, name, role })),
    delete: vi.fn(async (_actor, id) => ({ id })),
    getById: vi.fn(async () => user),
    list: vi.fn(async () => [user]),
    resetPassword: vi.fn(async (id) => ({ id })),
    setActive: vi.fn(async (_actor, _id, isActive) => ({ ...user, isActive })),
    update: vi.fn(async (_actor, _id, input) => ({ ...user, ...input })),
  };
}

function createTestApp(userService = createUserService()) {
  return {
    app: createApp({ authService: createAuthService(), userService }),
    userService,
  };
}

const asAdmin = { Authorization: "Bearer admin-token" };
const asLeader = { Authorization: "Bearer leader-token" };

describe("Users API authorization", () => {
  it("requires authentication", async () => {
    const { app, userService } = createTestApp();
    const response = await request(app).get("/api/users");

    expect(response.status).toBe(401);
    expect(userService.list).not.toHaveBeenCalled();
  });

  it("rejects Leaders on every Users route", async () => {
    const { app, userService } = createTestApp();
    const calls = [
      request(app).get("/api/users").set(asLeader),
      request(app).get(`/api/users/${userId}`).set(asLeader),
      request(app).post("/api/users").set(asLeader).send({
        email: "x@example.test",
        name: "X",
        password: strongPassword,
        role: "admin",
      }),
      request(app).patch(`/api/users/${userId}`).set(asLeader).send({ role: "admin" }),
      request(app).patch(`/api/users/${userId}/status`).set(asLeader).send({ isActive: false }),
      request(app).put(`/api/users/${userId}/password`).set(asLeader).send({ password: strongPassword }),
      request(app).delete(`/api/users/${userId}`).set(asLeader),
    ];

    for (const response of await Promise.all(calls)) {
      expect(response.status).toBe(403);
    }
    for (const method of Object.values(userService)) {
      expect(method).not.toHaveBeenCalled();
    }
  });
});

describe("Own profile", () => {
  it("returns the signed-in user's own profile for Admins and Leaders", async () => {
    const { app, userService } = createTestApp();

    const leaderResponse = await request(app).get("/api/me/profile").set(asLeader);
    const adminResponse = await request(app).get("/api/me/profile").set(asAdmin);

    expect(leaderResponse.status).toBe(200);
    expect(adminResponse.status).toBe(200);
    expect(leaderResponse.headers["cache-control"]).toBe("private, no-store");
    expect(userService.getById).toHaveBeenNthCalledWith(1, leaderId);
    expect(userService.getById).toHaveBeenNthCalledWith(2, adminId);
  });

  it("requires authentication and ignores any supplied id", async () => {
    const { app, userService } = createTestApp();

    const anonymous = await request(app).get("/api/me/profile");
    await request(app).get(`/api/me/profile?id=${userId}`).set(asLeader);

    expect(anonymous.status).toBe(401);
    expect(userService.getById).toHaveBeenCalledOnce();
    expect(userService.getById).toHaveBeenCalledWith(leaderId);
  });
});

describe("Users API reads", () => {
  it("lists active users by default with no-store caching", async () => {
    const { app, userService } = createTestApp();
    const response = await request(app).get("/api/users").set(asAdmin);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([user]);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(userService.list).toHaveBeenCalledWith({ search: undefined, status: "active" });
  });

  it("passes a trimmed search and explicit status", async () => {
    const { app, userService } = createTestApp();
    await request(app).get("/api/users?status=all&search=%20lina%20").set(asAdmin);

    expect(userService.list).toHaveBeenCalledWith({ search: "lina", status: "all" });
  });

  it("rejects an unknown status and an invalid id", async () => {
    const { app, userService } = createTestApp();
    const statusResponse = await request(app).get("/api/users?status=archived").set(asAdmin);
    const idResponse = await request(app).get("/api/users/not-a-uuid").set(asAdmin);

    expect(statusResponse.status).toBe(400);
    expect(idResponse.status).toBe(400);
    expect(userService.list).not.toHaveBeenCalled();
    expect(userService.getById).not.toHaveBeenCalled();
  });
});

describe("Users API mutations", () => {
  it("creates a user from normalized input", async () => {
    const { app, userService } = createTestApp();
    const response = await request(app).post("/api/users").set(asAdmin).send({
      email: "  New.Leader@Example.TEST ",
      name: "  New Leader ",
      password: strongPassword,
      role: "leader",
    });

    expect(response.status).toBe(201);
    expect(response.body.data).not.toHaveProperty("password");
    expect(userService.create).toHaveBeenCalledWith({
      email: "new.leader@example.test",
      name: "New Leader",
      password: strongPassword,
      role: "leader",
    });
  });

  it.each([
    [{ email: "bad", name: "A", password: strongPassword, role: "leader" }, 400],
    [{ email: "a@example.test", name: " ", password: strongPassword, role: "leader" }, 400],
    [{ email: "a@example.test", name: "A", password: strongPassword, role: "owner" }, 400],
    [{ email: "a@example.test", name: "A", password: strongPassword, role: "leader", isActive: false }, 400],
    [{ email: "a@example.test", name: "A", password: "short1A", role: "leader" }, 422],
    [{ email: "a@example.test", name: "A", password: "alllowercase123", role: "leader" }, 422],
  ])("rejects invalid create payload %#", async (body, status) => {
    const { app, userService } = createTestApp();
    const response = await request(app).post("/api/users").set(asAdmin).send(body);

    expect(response.status).toBe(status);
    expect(userService.create).not.toHaveBeenCalled();
  });

  it("updates only provided fields and rejects empty or unknown updates", async () => {
    const { app, userService } = createTestApp();
    const ok = await request(app)
      .patch(`/api/users/${userId}`)
      .set(asAdmin)
      .send({ name: " Renamed ", role: "admin" });
    const empty = await request(app).patch(`/api/users/${userId}`).set(asAdmin).send({});
    const unknown = await request(app)
      .patch(`/api/users/${userId}`)
      .set(asAdmin)
      .send({ password: strongPassword });

    expect(ok.status).toBe(200);
    expect(userService.update).toHaveBeenCalledWith(actors.admin, userId, {
      name: "Renamed",
      role: "admin",
    });
    expect(empty.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(userService.update).toHaveBeenCalledOnce();
  });

  it("changes status, resets passwords, and deletes", async () => {
    const { app, userService } = createTestApp();
    const status = await request(app)
      .patch(`/api/users/${userId}/status`)
      .set(asAdmin)
      .send({ isActive: false });
    const badStatus = await request(app)
      .patch(`/api/users/${userId}/status`)
      .set(asAdmin)
      .send({ isActive: "no" });
    const password = await request(app)
      .put(`/api/users/${userId}/password`)
      .set(asAdmin)
      .send({ password: strongPassword });
    const weak = await request(app)
      .put(`/api/users/${userId}/password`)
      .set(asAdmin)
      .send({ password: "weak" });
    const removed = await request(app).delete(`/api/users/${userId}`).set(asAdmin);

    expect(status.status).toBe(200);
    expect(status.body.data.isActive).toBe(false);
    expect(userService.setActive).toHaveBeenCalledWith(actors.admin, userId, false);
    expect(badStatus.status).toBe(400);
    expect(password.status).toBe(200);
    expect(password.body.data).toEqual({ id: userId });
    expect(weak.status).toBe(422);
    expect(weak.body.error.code).toBe("WEAK_PASSWORD");
    expect(userService.resetPassword).toHaveBeenCalledOnce();
    expect(removed.status).toBe(200);
    expect(userService.delete).toHaveBeenCalledWith(actors.admin, userId);
  });

  it("maps service errors to their HTTP status and code", async () => {
    const userService = createUserService();
    vi.mocked(userService.delete).mockRejectedValueOnce(
      new UserServiceError(409, "USER_HAS_HISTORY", "Deactivate instead."),
    );
    vi.mocked(userService.create).mockRejectedValueOnce(new Error("raw failure"));
    const { app } = createTestApp(userService);

    const conflict = await request(app).delete(`/api/users/${userId}`).set(asAdmin);
    const failure = await request(app).post("/api/users").set(asAdmin).send({
      email: "a@example.test",
      name: "A",
      password: strongPassword,
      role: "leader",
    });

    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("USER_HAS_HISTORY");
    expect(failure.status).toBe(500);
    expect(failure.body.error.code).toBe("USER_SERVICE_UNAVAILABLE");
    expect(JSON.stringify(failure.body)).not.toContain("raw failure");
  });
});
