import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import { EventServiceError, type EventService, type SundayService } from "../events/types.js";

const eventId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const visitorId = "33333333-3333-4333-8333-333333333333";
const actors: Record<"admin" | "leader", HorizonActor> = {
  admin: { id: "44444444-4444-4444-8444-444444444444", isActive: true, name: "Ada Admin", role: "admin" },
  leader: { id: "55555555-5555-4555-8555-555555555555", isActive: true, name: "Lina Leader", role: "leader" },
};
const sundayService: SundayService = {
  attendanceCount: 1, countsForAbsence: true, createdAt: "2026-08-20T00:00:00Z",
  createdBy: { id: actors.admin.id, name: actors.admin.name }, description: null,
  eligibilityCount: 0, eventDate: "2026-08-23", id: eventId, location: null,
  status: "open", title: "Sunday Service", updatedAt: "2026-08-20T00:00:00Z", visitorCount: 0,
};

function authService(): AuthService { return { authenticate: vi.fn(async (token) => ({ actor: token === "admin" ? actors.admin : actors.leader, ok: true })) }; }
function eventService(): EventService {
  return {
    addAttendance: vi.fn(async () => ({ memberId, result: "recorded" })),
    addAttendanceByQr: vi.fn(async () => ({ member: { attendanceStatus: "present", email: null, firstName: "Mara", id: memberId, isActive: true, isPresent: true, lastName: "Member", lifeGroup: { id: eventId, name: "North" }, phone: null }, result: "recorded" })),
    close: vi.fn(async () => ({ ...sundayService, status: "closed" })),
    create: vi.fn(async () => sundayService), getAttendance: vi.fn(async () => ({ members: [] })),
    getById: vi.fn(async () => sundayService), list: vi.fn(async () => ({ events: [sundayService] })),
    listVisitors: vi.fn(async () => ({ registrations: [] })),
    registerExistingVisitor: vi.fn(async () => ({ result: "registered", visitorId })),
    registerNewVisitor: vi.fn(async () => ({ result: "registered", visitorId })),
    removeAttendance: vi.fn(async () => ({ memberId, result: "removed" })),
    removeVisitor: vi.fn(async () => ({ result: "removed", visitorId })),
    update: vi.fn(async () => sundayService),
  };
}
function setup(service = eventService()) { return { app: createApp({ authService: authService(), eventService: service }), service }; }
const bearer = (builder: request.Test, actor = "admin") => builder.set("Authorization", `Bearer ${actor}`);

describe("Sunday Service Event API", () => {
  it("requires authentication for the directory", async () => { const { app, service } = setup(); expect((await request(app).get("/api/events")).status).toBe(401); expect(service.list).not.toHaveBeenCalled(); });

  it("lists and reads Services with private caching", async () => {
    const { app, service } = setup(); const list = await bearer(request(app).get("/api/events"), "leader"); const detail = await bearer(request(app).get(`/api/events/${eventId}`));
    expect([list.status, detail.status]).toEqual([200, 200]); expect(list.headers["cache-control"]).toBe("private, no-store");
    expect(service.list).toHaveBeenCalledWith(actors.leader); expect(service.getById).toHaveBeenCalledWith(actors.admin, eventId);
  });

  it("accepts only approved Service fields and trusted actor context", async () => {
    const { app, service } = setup(); const created = await bearer(request(app).post("/api/events")).send({ countsForAbsence: true, description: "  Weekly worship  ", eventDate: "2026-08-23", location: "  Main Hall  ", title: "  Sunday Service  " });
    const clientType = await bearer(request(app).post("/api/events")).send({ countsForAbsence: true, eventDate: "2026-08-23", title: "Service", type: "harvest" });
    expect(created.status).toBe(201); expect(clientType.status).toBe(400); expect(service.create).toHaveBeenCalledWith(actors.admin, { countsForAbsence: true, description: "Weekly worship", eventDate: "2026-08-23", location: "Main Hall", title: "Sunday Service" });
  });

  it("routes manual, QR, and removal attendance through the authenticated actor", async () => {
    const { app, service } = setup(); const path = `/api/events/${eventId}/attendance`;
    const add = await bearer(request(app).post(path), "leader").send({ memberId }); const qr = await bearer(request(app).post(`${path}/qr`), "leader").send({ qrToken: "opaque-token" }); const remove = await bearer(request(app).delete(`${path}/${memberId}`), "leader");
    expect([add.status, qr.status, remove.status]).toEqual([201, 201, 200]); expect(service.addAttendance).toHaveBeenCalledWith(actors.leader, eventId, memberId); expect(service.addAttendanceByQr).toHaveBeenCalledWith(actors.leader, eventId, "opaque-token"); expect(service.removeAttendance).toHaveBeenCalledWith(actors.leader, eventId, memberId);
  });

  it("routes existing/new Visitor registration and removal without client actor fields", async () => {
    const { app, service } = setup(); const path = `/api/events/${eventId}/visitors`;
    const existing = await bearer(request(app).post(path), "leader").send({ visitorId }); const created = await bearer(request(app).post(`${path}/new`), "leader").send({ firstName: " Ana ", lastName: " Guest ", phone: null, email: " ana@example.test " }); const removed = await bearer(request(app).delete(`${path}/${visitorId}`));
    expect([existing.status, created.status, removed.status]).toEqual([201, 201, 200]); expect(service.registerExistingVisitor).toHaveBeenCalledWith(actors.leader, eventId, visitorId); expect(service.registerNewVisitor).toHaveBeenCalledWith(actors.leader, eventId, { email: "ana@example.test", firstName: "Ana", lastName: "Guest", phone: null });
  });

  it("preserves structured actionable domain errors", async () => {
    const service = eventService(); vi.mocked(service.registerNewVisitor).mockRejectedValueOnce(new EventServiceError(409, "VISITOR_CONTACT_CONFLICT", "Use the existing Visitor.", { conflictField: "email", existingVisitor: { id: visitorId, name: "Ana Guest" } }));
    const { app } = setup(service); const response = await bearer(request(app).post(`/api/events/${eventId}/visitors/new`)).send({ firstName: "Ana", lastName: "Guest", phone: null, email: "ana@example.test" });
    expect(response.status).toBe(409); expect(response.body.error).toEqual({ code: "VISITOR_CONTACT_CONFLICT", details: { conflictField: "email", existingVisitor: { id: visitorId, name: "Ana Guest" } }, message: "Use the existing Visitor." });
  });

  it("does not expose Event hard-delete or reopen routes", async () => { const { app } = setup(); expect((await bearer(request(app).delete(`/api/events/${eventId}`))).status).toBe(404); expect((await bearer(request(app).post(`/api/events/${eventId}/reopen`))).status).toBe(404); });
});
