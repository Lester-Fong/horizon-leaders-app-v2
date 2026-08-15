import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import {
  MinistryServiceError,
  type Ministry,
  type MinistryMember,
  type MinistryService,
} from "../ministries/types.js";

const ministryId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";

const actors: Record<"admin" | "leader", HorizonActor> = {
  admin: {
    id: "33333333-3333-4333-8333-333333333333",
    isActive: true,
    name: "Ada Admin",
    role: "admin",
  },
  leader: {
    id: "44444444-4444-4444-8444-444444444444",
    isActive: true,
    name: "Lina Leader",
    role: "leader",
  },
};

const ministry: Ministry = {
  createdAt: "2026-08-15T01:00:00.000Z",
  description: "Supports gathered worship.",
  id: ministryId,
  isActive: true,
  name: "Worship Ministry",
  updatedAt: "2026-08-15T01:00:00.000Z",
};

const ministryMember: MinistryMember = {
  email: "mara@example.test",
  firstName: "Mara",
  id: memberId,
  isActive: true,
  lastName: "Member",
  lifeGroup: {
    id: "55555555-5555-4555-8555-555555555555",
    isActive: true,
    name: "North Group",
  },
  phone: "09171234567",
};

function createAuthService(): AuthService {
  return {
    authenticate: vi.fn(async (token) => ({
      actor: token === "admin-token" ? actors.admin : actors.leader,
      ok: true,
    })),
  };
}

function createMinistryService(): MinistryService {
  return {
    archive: vi.fn(async () => ({ ...ministry, isActive: false })),
    assignMember: vi.fn(async () => ministryMember),
    create: vi.fn(async () => ministry),
    getById: vi.fn(async () => ministry),
    list: vi.fn(async () => [ministry]),
    listMembers: vi.fn(async () => [ministryMember]),
    removeMember: vi.fn(async () => ministryMember),
    update: vi.fn(async () => ministry),
  };
}

function createTestApp(ministryService = createMinistryService()) {
  return {
    app: createApp({
      authService: createAuthService(),
      ministryService,
    }),
    ministryService,
  };
}

describe("Ministry API authorization and validation", () => {
  it("requires authentication for Ministry reads and mutations", async () => {
    const { app, ministryService } = createTestApp();
    const responses = await Promise.all([
      request(app).get("/api/ministries"),
      request(app).get(`/api/ministries/${ministryId}`),
      request(app).get(`/api/ministries/${ministryId}/members`),
      request(app).post("/api/ministries").send({}),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([401, 401, 401, 401]);
    expect(ministryService.list).not.toHaveBeenCalled();
  });

  it("applies Admin list defaults and validated filters", async () => {
    const { app, ministryService } = createTestApp();
    const defaultResponse = await request(app)
      .get("/api/ministries")
      .set("Authorization", "Bearer admin-token");
    const filteredResponse = await request(app)
      .get("/api/ministries?status=archived&search=%20Worship%20")
      .set("Authorization", "Bearer admin-token");

    expect(defaultResponse.status).toBe(200);
    expect(defaultResponse.headers["cache-control"]).toBe("private, no-store");
    expect(filteredResponse.status).toBe(200);
    expect(ministryService.list).toHaveBeenNthCalledWith(1, actors.admin, {
      status: "active",
    });
    expect(ministryService.list).toHaveBeenNthCalledWith(2, actors.admin, {
      search: "Worship",
      status: "archived",
    });
  });

  it("keeps Leader lists active even when broadening parameters are supplied", async () => {
    const { app, ministryService } = createTestApp();
    const response = await request(app)
      .get("/api/ministries?status=all&search=Worship")
      .set("Authorization", "Bearer leader-token");

    expect(response.status).toBe(200);
    expect(ministryService.list).toHaveBeenCalledWith(actors.leader, {
      search: "Worship",
      status: "active",
    });
  });

  it("loads detail and a Member-scoped roster with the request actor", async () => {
    const { app, ministryService } = createTestApp();
    const detail = await request(app)
      .get(`/api/ministries/${ministryId}`)
      .set("Authorization", "Bearer leader-token");
    const roster = await request(app)
      .get(`/api/ministries/${ministryId}/members`)
      .set("Authorization", "Bearer leader-token");

    expect(detail.status).toBe(200);
    expect(roster.status).toBe(200);
    expect(ministryService.getById).toHaveBeenCalledWith(
      actors.leader,
      ministryId,
    );
    expect(ministryService.listMembers).toHaveBeenCalledWith(
      actors.leader,
      ministryId,
    );
  });

  it("allows Admin create, edit, and archive with approved fields", async () => {
    const { app, ministryService } = createTestApp();
    const created = await request(app)
      .post("/api/ministries")
      .set("Authorization", "Bearer admin-token")
      .send({ name: "  Worship Ministry  ", description: "  Worship  " });
    const updated = await request(app)
      .patch(`/api/ministries/${ministryId}`)
      .set("Authorization", "Bearer admin-token")
      .send({ description: null, name: "  Worship and Arts  " });
    const archived = await request(app)
      .patch(`/api/ministries/${ministryId}/archive`)
      .set("Authorization", "Bearer admin-token");

    expect(created.status).toBe(201);
    expect(updated.status).toBe(200);
    expect(archived.status).toBe(200);
    expect(ministryService.create).toHaveBeenCalledWith({
      description: "Worship",
      name: "Worship Ministry",
    });
    expect(ministryService.update).toHaveBeenCalledWith(ministryId, {
      description: null,
      name: "Worship and Arts",
    });
    expect(ministryService.archive).toHaveBeenCalledWith(ministryId);
  });

  it("rejects invalid Ministry bodies and unapproved lifecycle routes", async () => {
    const { app, ministryService } = createTestApp();
    const responses = await Promise.all([
      request(app)
        .post("/api/ministries")
        .set("Authorization", "Bearer admin-token")
        .send({ name: " " }),
      request(app)
        .post("/api/ministries")
        .set("Authorization", "Bearer admin-token")
        .send({ name: "Valid", ownerId: memberId }),
      request(app)
        .patch(`/api/ministries/${ministryId}`)
        .set("Authorization", "Bearer admin-token")
        .send({}),
      request(app)
        .delete(`/api/ministries/${ministryId}`)
        .set("Authorization", "Bearer admin-token"),
      request(app)
        .patch(`/api/ministries/${ministryId}/status`)
        .set("Authorization", "Bearer admin-token")
        .send({ isActive: true }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([400, 400, 400, 404, 404]);
    expect(ministryService.create).not.toHaveBeenCalled();
    expect(ministryService.update).not.toHaveBeenCalled();
  });

  it("allows only Admin to create, edit, and archive", async () => {
    const { app, ministryService } = createTestApp();
    const responses = await Promise.all([
      request(app)
        .post("/api/ministries")
        .set("Authorization", "Bearer leader-token")
        .send({ name: "Worship" }),
      request(app)
        .patch(`/api/ministries/${ministryId}`)
        .set("Authorization", "Bearer leader-token")
        .send({ name: "Worship" }),
      request(app)
        .patch(`/api/ministries/${ministryId}/archive`)
        .set("Authorization", "Bearer leader-token"),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([403, 403, 403]);
    expect(ministryService.create).not.toHaveBeenCalled();
    expect(ministryService.update).not.toHaveBeenCalled();
    expect(ministryService.archive).not.toHaveBeenCalled();
  });

  it("allows Admin to assign and remove only the join relationship", async () => {
    const { app, ministryService } = createTestApp();
    const assigned = await request(app)
      .post(`/api/ministries/${ministryId}/members`)
      .set("Authorization", "Bearer admin-token")
      .send({ memberId });
    const removed = await request(app)
      .delete(`/api/ministries/${ministryId}/members/${memberId}`)
      .set("Authorization", "Bearer admin-token");

    expect(assigned.status).toBe(201);
    expect(removed.status).toBe(200);
    expect(ministryService.assignMember).toHaveBeenCalledWith(
      actors.admin,
      ministryId,
      memberId,
    );
    expect(ministryService.removeMember).toHaveBeenCalledWith(
      actors.admin,
      ministryId,
      memberId,
    );
  });

  it("forbids Leader assignment management", async () => {
    const { app, ministryService } = createTestApp();
    const assigned = await request(app)
      .post(`/api/ministries/${ministryId}/members`)
      .set("Authorization", "Bearer leader-token")
      .send({ memberId });
    const removed = await request(app)
      .delete(`/api/ministries/${ministryId}/members/${memberId}`)
      .set("Authorization", "Bearer leader-token");

    expect(assigned.status).toBe(403);
    expect(removed.status).toBe(403);
    expect(ministryService.assignMember).not.toHaveBeenCalled();
    expect(ministryService.removeMember).not.toHaveBeenCalled();
  });

  it("returns stable assignment conflict responses", async () => {
    const ministryService = createMinistryService();
    vi.mocked(ministryService.assignMember).mockRejectedValueOnce(
      new MinistryServiceError(
        409,
        "MEMBER_ALREADY_ASSIGNED",
        "This Member is already assigned to the Ministry.",
      ),
    );
    const { app } = createTestApp(ministryService);
    const response = await request(app)
      .post(`/api/ministries/${ministryId}/members`)
      .set("Authorization", "Bearer admin-token")
      .send({ memberId });

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: "MEMBER_ALREADY_ASSIGNED",
      message: "This Member is already assigned to the Ministry.",
    });
  });
});
