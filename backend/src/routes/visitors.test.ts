import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import type { Member } from "../members/types.js";
import {
  VisitorServiceError,
  type Visitor,
  type VisitorService,
} from "../visitors/types.js";

const visitorId = "11111111-1111-4111-8111-111111111111";
const groupId = "22222222-2222-4222-8222-222222222222";
const memberId = "33333333-3333-4333-8333-333333333333";
const actors: Record<"admin" | "leader", HorizonActor> = {
  admin: { id: "44444444-4444-4444-8444-444444444444", isActive: true, name: "Ada Admin", role: "admin" },
  leader: { id: "55555555-5555-4555-8555-555555555555", isActive: true, name: "Lina Leader", role: "leader" },
};
const visitor: Visitor = {
  convertedMemberId: null,
  createdAt: "2026-08-19T04:00:00.000Z",
  email: "mara@example.test",
  firstName: "Mara",
  id: visitorId,
  lastName: "Reyes",
  phone: "0917 123 4567",
  status: "active",
  updatedAt: "2026-08-19T04:00:00.000Z",
};
const member: Member = {
  address: null,
  birthDate: null,
  createdAt: visitor.createdAt,
  email: visitor.email,
  firstName: visitor.firstName,
  gender: null,
  id: memberId,
  isActive: true,
  lastName: visitor.lastName,
  lifeGroup: { id: groupId, isActive: true, name: "North" },
  phone: visitor.phone,
  qrToken: "opaque-server-token",
  updatedAt: visitor.updatedAt,
};

function createAuthService(): AuthService {
  return {
    authenticate: vi.fn(async (token) => ({
      actor: token === "admin-token" ? actors.admin : actors.leader,
      ok: true,
    })),
  };
}

function createVisitorService(): VisitorService {
  return {
    convert: vi.fn(async () => ({ member, visitor: { ...visitor, convertedMemberId: memberId, status: "converted" } })),
    create: vi.fn(async () => visitor),
    getById: vi.fn(async () => visitor),
    list: vi.fn(async () => [visitor]),
    update: vi.fn(async () => visitor),
  };
}

function createTestApp(visitorService = createVisitorService()) {
  return { app: createApp({ authService: createAuthService(), visitorService }), visitorService };
}

describe("Visitor API", () => {
  it("requires authentication for reads and mutations", async () => {
    const { app, visitorService } = createTestApp();
    const responses = await Promise.all([
      request(app).get("/api/visitors"),
      request(app).post("/api/visitors").send({}),
      request(app).get(`/api/visitors/${visitorId}`),
      request(app).post(`/api/visitors/${visitorId}/convert`).send({ lifeGroupId: groupId }),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([401, 401, 401, 401]);
    expect(visitorService.list).not.toHaveBeenCalled();
  });

  it("defaults Admin to active and accepts deterministic status/search filters", async () => {
    const { app, visitorService } = createTestApp();
    await request(app).get("/api/visitors").set("Authorization", "Bearer admin-token");
    const filtered = await request(app)
      .get("/api/visitors?status=converted&search=%20Mara%20")
      .set("Authorization", "Bearer admin-token");
    expect(filtered.status).toBe(200);
    expect(filtered.headers["cache-control"]).toBe("private, no-store");
    expect(visitorService.list).toHaveBeenNthCalledWith(1, actors.admin, { status: "active" });
    expect(visitorService.list).toHaveBeenNthCalledWith(2, actors.admin, { search: "Mara", status: "converted" });
  });

  it("forces Leader directory reads to active even when query parameters request converted", async () => {
    const { app, visitorService } = createTestApp();
    const response = await request(app)
      .get("/api/visitors?status=all&search=Mara")
      .set("Authorization", "Bearer leader-token");
    expect(response.status).toBe(200);
    expect(visitorService.list).toHaveBeenCalledWith(actors.leader, { search: "Mara", status: "active" });
  });

  it("gets detail through the actor-scoped service and rejects invalid list/detail inputs", async () => {
    const { app, visitorService } = createTestApp();
    const detail = await request(app).get(`/api/visitors/${visitorId}`).set("Authorization", "Bearer leader-token");
    const badId = await request(app).get("/api/visitors/nope").set("Authorization", "Bearer admin-token");
    const badStatus = await request(app).get("/api/visitors?status=archived").set("Authorization", "Bearer admin-token");
    expect([detail.status, badId.status, badStatus.status]).toEqual([200, 400, 400]);
    expect(visitorService.getById).toHaveBeenCalledWith(actors.leader, visitorId);
  });

  it("creates the exact approved fields for both roles", async () => {
    const { app, visitorService } = createTestApp();
    const body = { email: "  MARA@example.test  ", firstName: " Mara ", lastName: " Reyes ", phone: " 0917 123 4567 " };
    const admin = await request(app).post("/api/visitors").set("Authorization", "Bearer admin-token").send(body);
    const leader = await request(app).post("/api/visitors").set("Authorization", "Bearer leader-token").send(body);
    expect([admin.status, leader.status]).toEqual([201, 201]);
    expect(visitorService.create).toHaveBeenNthCalledWith(1, { email: "MARA@example.test", firstName: "Mara", lastName: "Reyes", phone: "0917 123 4567" });
  });

  it("rejects blank names and client control of lifecycle/linkage", async () => {
    const { app, visitorService } = createTestApp();
    const responses = await Promise.all([
      request(app).post("/api/visitors").set("Authorization", "Bearer admin-token").send({ firstName: " ", lastName: "Reyes" }),
      request(app).post("/api/visitors").set("Authorization", "Bearer admin-token").send({ firstName: "Mara", lastName: "Reyes", status: "converted" }),
      request(app).patch(`/api/visitors/${visitorId}`).set("Authorization", "Bearer admin-token").send({ convertedMemberId: memberId }),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([400, 400, 400]);
    expect(visitorService.create).not.toHaveBeenCalled();
    expect(visitorService.update).not.toHaveBeenCalled();
  });

  it("updates approved identity/contact fields and offers no delete/archive route", async () => {
    const { app, visitorService } = createTestApp();
    const updated = await request(app).patch(`/api/visitors/${visitorId}`).set("Authorization", "Bearer leader-token").send({ email: null, firstName: " Maria " });
    const removed = await request(app).delete(`/api/visitors/${visitorId}`).set("Authorization", "Bearer admin-token");
    expect(updated.status).toBe(200);
    expect(removed.status).toBe(404);
    expect(visitorService.update).toHaveBeenCalledWith(actors.leader, visitorId, { email: null, firstName: "Maria" });
  });

  it("converts through the actor-scoped service without accepting extra fields", async () => {
    const { app, visitorService } = createTestApp();
    const converted = await request(app).post(`/api/visitors/${visitorId}/convert`).set("Authorization", "Bearer leader-token").send({ lifeGroupId: groupId });
    const controlled = await request(app).post(`/api/visitors/${visitorId}/convert`).set("Authorization", "Bearer admin-token").send({ lifeGroupId: groupId, qrToken: "chosen" });
    expect(converted.status).toBe(201);
    expect(converted.body.data.member.qrToken).toBe("opaque-server-token");
    expect(controlled.status).toBe(400);
    expect(visitorService.convert).toHaveBeenCalledTimes(1);
    expect(visitorService.convert).toHaveBeenCalledWith(actors.leader, visitorId, groupId);
  });

  it("returns stable duplicate and converted-state errors", async () => {
    const visitorService = createVisitorService();
    vi.mocked(visitorService.create).mockRejectedValueOnce(new VisitorServiceError(409, "DUPLICATE_VISITOR_EMAIL", "Another Visitor already uses this email address."));
    vi.mocked(visitorService.convert).mockRejectedValueOnce(new VisitorServiceError(409, "VISITOR_NOT_ACTIVE", "This Visitor has already been converted."));
    const { app } = createTestApp(visitorService);
    const duplicate = await request(app).post("/api/visitors").set("Authorization", "Bearer admin-token").send({ email: "mara@example.test", firstName: "Mara", lastName: "Reyes" });
    const repeated = await request(app).post(`/api/visitors/${visitorId}/convert`).set("Authorization", "Bearer admin-token").send({ lifeGroupId: groupId });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("DUPLICATE_VISITOR_EMAIL");
    expect(repeated.status).toBe(409);
    expect(repeated.body.error.code).toBe("VISITOR_NOT_ACTIVE");
  });
});
