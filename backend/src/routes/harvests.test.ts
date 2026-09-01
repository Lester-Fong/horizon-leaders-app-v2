import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import { HarvestServiceError, type HarvestEvent, type HarvestService } from "../harvests/types.js";

const eventId = "11111111-1111-4111-8111-111111111111";
const visitorId = "22222222-2222-4222-8222-222222222222";
const actors: Record<"admin" | "leader", HorizonActor> = {
  admin: { id: "33333333-3333-4333-8333-333333333333", isActive: true, name: "Ada Admin", role: "admin" },
  leader: { id: "44444444-4444-4444-8444-444444444444", isActive: true, name: "Lina Leader", role: "leader" },
};
const harvest: HarvestEvent = {
  countsForAbsence: false, createdAt: "2026-09-01T00:00:00Z",
  createdBy: { id: actors.admin.id, name: actors.admin.name }, description: null,
  eventDate: "2026-09-12", id: eventId, location: null, participationCount: 0,
  status: "open", title: "Harvest", type: "harvest", updatedAt: "2026-09-01T00:00:00Z",
};

function authService(): AuthService { return { authenticate: vi.fn(async (token) => ({ actor: token === "admin" ? actors.admin : actors.leader, ok: true })) }; }
function harvestService(): HarvestService {
  return {
    close: vi.fn(async () => ({ ...harvest, status: "closed" })),
    create: vi.fn(async () => harvest),
    getById: vi.fn(async () => harvest),
    list: vi.fn(async () => ({ events: [harvest] })),
    listParticipations: vi.fn(async () => ({ participations: [] })),
    recordInterest: vi.fn(async () => ({ followUpId: eventId, followUpResult: "created", result: "recorded_interested" })),
    registerExistingVisitor: vi.fn(async () => ({ result: "registered", visitorId })),
    registerNewVisitor: vi.fn(async () => ({ result: "registered", visitorId })),
    update: vi.fn(async () => harvest),
  };
}
function setup(service = harvestService()) { return { app: createApp({ authService: authService(), harvestService: service }), service }; }
const bearer = (builder: request.Test, actor = "admin") => builder.set("Authorization", `Bearer ${actor}`);

describe("Harvest Event API", () => {
  it("requires authentication and sets private cache headers on reads", async () => {
    const { app, service } = setup(); expect((await request(app).get("/api/events/harvest")).status).toBe(401);
    const list = await bearer(request(app).get("/api/events/harvest"), "leader"); const detail = await bearer(request(app).get(`/api/events/harvest/${eventId}`), "leader");
    expect([list.status, detail.status]).toEqual([200, 200]); expect(list.headers["cache-control"]).toBe("private, no-store"); expect(service.list).toHaveBeenCalledWith(actors.leader);
  });

  it("accepts only approved Harvest Event fields and uses actor context", async () => {
    const { app, service } = setup();
    const created = await bearer(request(app).post("/api/events/harvest")).send({ description: "  Outreach  ", eventDate: "2026-09-12", location: "  Main Hall  ", title: "  Harvest  " });
    const bad = await bearer(request(app).post("/api/events/harvest")).send({ countsForAbsence: false, eventDate: "2026-09-12", title: "Harvest" });
    expect(created.status).toBe(201); expect(bad.status).toBe(400); expect(service.create).toHaveBeenCalledWith(actors.admin, { description: "Outreach", eventDate: "2026-09-12", location: "Main Hall", title: "Harvest" });
  });

  it("routes existing and atomic-new Visitor registration without trusting client actor fields", async () => {
    const { app, service } = setup(); const path = `/api/events/harvest/${eventId}/participations`;
    const existing = await bearer(request(app).post(path), "leader").send({ visitorId });
    const created = await bearer(request(app).post(`${path}/new`), "leader").send({ email: " guest@example.test ", firstName: " Ana ", lastName: " Guest ", phone: null });
    expect([existing.status, created.status]).toEqual([201, 201]); expect(service.registerExistingVisitor).toHaveBeenCalledWith(actors.leader, eventId, visitorId); expect(service.registerNewVisitor).toHaveBeenCalledWith(actors.leader, eventId, { email: "guest@example.test", firstName: "Ana", lastName: "Guest", phone: null });
  });

  it("routes a strict boolean interest decision through the authenticated actor", async () => {
    const { app, service } = setup(); const path = `/api/events/harvest/${eventId}/participations/${visitorId}/interest`;
    const valid = await bearer(request(app).patch(path), "leader").send({ interested: true }); const invalid = await bearer(request(app).patch(path)).send({ interested: "true" });
    expect([valid.status, invalid.status]).toEqual([200, 400]); expect(service.recordInterest).toHaveBeenCalledWith(actors.leader, eventId, visitorId, true);
  });

  it("preserves structured safe conflict details", async () => {
    const service = harvestService(); vi.mocked(service.registerNewVisitor).mockRejectedValueOnce(new HarvestServiceError(409, "MEMBER_CONTACT_CONFLICT", "This email belongs to an existing Member.", { conflictField: "email" }));
    const { app } = setup(service); const response = await bearer(request(app).post(`/api/events/harvest/${eventId}/participations/new`), "leader").send({ email: "member@example.test", firstName: "Ana", lastName: "Guest", phone: null });
    expect(response.status).toBe(409); expect(response.body.error).toEqual({ code: "MEMBER_CONTACT_CONFLICT", details: { conflictField: "email" }, message: "This email belongs to an existing Member." });
  });

  it("exposes no participant deletion or Event reopen route", async () => {
    const { app } = setup(); expect((await bearer(request(app).delete(`/api/events/harvest/${eventId}/participations/${visitorId}`))).status).toBe(404); expect((await bearer(request(app).post(`/api/events/harvest/${eventId}/reopen`))).status).toBe(404);
  });
});
