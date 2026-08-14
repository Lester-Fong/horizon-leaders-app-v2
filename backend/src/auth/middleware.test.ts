import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import { requireAuth, requireRole } from "./middleware.js";
import type { AuthResult, AuthService, HorizonActor } from "./types.js";

const adminActor: HorizonActor = {
  id: "11111111-1111-4111-8111-111111111111",
  isActive: true,
  name: "Ada Admin",
  role: "admin",
};

const leaderActor: HorizonActor = {
  id: "22222222-2222-4222-8222-222222222222",
  isActive: true,
  name: "Lina Leader",
  role: "leader",
};

const tokenResults: Record<string, AuthResult> = {
  "admin-token": { actor: adminActor, ok: true },
  "inactive-token": {
    code: "ACCOUNT_INACTIVE",
    message: "Horizon access is disabled for this account.",
    ok: false,
    status: 403,
  },
  "invalid-token": {
    code: "INVALID_TOKEN",
    message: "Authentication is required.",
    ok: false,
    status: 401,
  },
  "leader-token": { actor: leaderActor, ok: true },
  "missing-profile-token": {
    code: "PROFILE_NOT_FOUND",
    message: "Horizon access is not configured for this account.",
    ok: false,
    status: 403,
  },
};

function createFakeAuthService() {
  return {
    authenticate: vi.fn<AuthService["authenticate"]>(async (accessToken) => {
      return tokenResults[accessToken] ?? tokenResults["invalid-token"]!;
    }),
  } satisfies AuthService;
}

describe("authentication boundary", () => {
  it("rejects a missing bearer token with 401", async () => {
    const authService = createFakeAuthService();
    const response = await request(createApp({ authService })).get("/api/me");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication is required.",
      },
    });
    expect(authService.authenticate).not.toHaveBeenCalled();
  });

  it("rejects malformed and invalid bearer tokens with 401", async () => {
    const authService = createFakeAuthService();
    const app = createApp({ authService });

    const malformedResponse = await request(app)
      .get("/api/me")
      .set("Authorization", "Token invalid-token");
    const invalidResponse = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer invalid-token");

    expect(malformedResponse.status).toBe(401);
    expect(invalidResponse.status).toBe(401);
    expect(invalidResponse.body.error.code).toBe("INVALID_TOKEN");
  });

  it.each([
    ["Admin", "admin-token", adminActor],
    ["Leader", "leader-token", leaderActor],
  ])("authenticates an active %s", async (_label, token, actor) => {
    const authService = createFakeAuthService();
    const response = await request(createApp({ authService }))
      .get("/api/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: actor });
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });

  it("rejects an inactive Horizon profile with 403", async () => {
    const response = await request(
      createApp({ authService: createFakeAuthService() }),
    )
      .get("/api/me")
      .set("Authorization", "Bearer inactive-token");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ACCOUNT_INACTIVE");
  });

  it("rejects a valid Auth identity without a profile predictably", async () => {
    const response = await request(
      createApp({ authService: createFakeAuthService() }),
    )
      .get("/api/me")
      .set("Authorization", "Bearer missing-profile-token");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: {
        code: "PROFILE_NOT_FOUND",
        message: "Horizon access is not configured for this account.",
      },
    });
  });

  it("returns trusted profile fields only from /api/me", async () => {
    const response = await request(
      createApp({ authService: createFakeAuthService() }),
    )
      .get("/api/me")
      .set("Authorization", "Bearer admin-token");

    expect(Object.keys(response.body.data).sort()).toEqual([
      "id",
      "isActive",
      "name",
      "role",
    ]);
    expect(response.body).not.toHaveProperty("accessToken");
    expect(response.body).not.toHaveProperty("userMetadata");
  });
});

describe("requireRole", () => {
  function createAdminOnlyTestApp(authService: AuthService) {
    const app = express();
    app.get(
      "/admin-only",
      requireAuth(authService),
      requireRole("admin"),
      (_request, response) => response.status(204).send(),
    );
    return app;
  }

  it("allows an authenticated Admin", async () => {
    const response = await request(
      createAdminOnlyTestApp(createFakeAuthService()),
    )
      .get("/admin-only")
      .set("Authorization", "Bearer admin-token");

    expect(response.status).toBe(204);
  });

  it("rejects an authenticated Leader with 403", async () => {
    const response = await request(
      createAdminOnlyTestApp(createFakeAuthService()),
    )
      .get("/admin-only")
      .set("Authorization", "Bearer leader-token");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("keeps an unauthenticated request at 401", async () => {
    const response = await request(
      createAdminOnlyTestApp(createFakeAuthService()),
    ).get("/admin-only");

    expect(response.status).toBe(401);
  });
});
