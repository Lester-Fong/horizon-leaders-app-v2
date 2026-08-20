import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import {
  FollowUpServiceError,
  type FollowUp,
  type FollowUpService,
} from "../follow-ups/types.js";

const followUpId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const actors: Record<"admin" | "leader", HorizonActor> = {
  admin: { id: "33333333-3333-4333-8333-333333333333", isActive: true, name: "Ada Admin", role: "admin" },
  leader: { id: "44444444-4444-4444-8444-444444444444", isActive: true, name: "Lina Leader", role: "leader" },
};
const followUp: FollowUp = {
  completedAt: null,
  completedBy: null,
  completionNote: null,
  context: { qualifyingServiceIds: ["55555555-5555-4555-8555-555555555555"], threshold: 1 },
  createdAt: "2026-08-21T04:00:00.000Z",
  id: followUpId,
  reason: "consecutive_sunday_absence",
  reasonLabel: "Consecutive Sunday absences",
  status: "active",
  subject: { id: memberId, name: "Mara Reyes", recordStatus: "active", type: "member" },
};

function authService(): AuthService {
  return {
    authenticate: vi.fn(async (token) => ({
      actor: token === "admin-token" ? actors.admin : actors.leader,
      ok: true,
    })),
  };
}

function service(): FollowUpService {
  return {
    complete: vi.fn(async (actor, _id, note) => ({
      ...followUp,
      completedAt: "2026-08-21T05:00:00.000Z",
      completedBy: { id: actor.id, name: actor.name },
      completionNote: note,
      status: "completed",
    })),
    list: vi.fn(async () => [followUp]),
    triggerSundayAbsence: vi.fn(async () => ({ followUp, outcome: "created" })),
  };
}

function testApp(followUpService = service()) {
  return {
    app: createApp({ authService: authService(), followUpService }),
    followUpService,
  };
}

describe("Follow Up API", () => {
  it("requires authentication for shared reads and completion", async () => {
    const { app, followUpService } = testApp();
    const responses = await Promise.all([
      request(app).get("/api/follow-ups"),
      request(app).patch(`/api/follow-ups/${followUpId}/complete`).send({}),
    ]);
    expect(responses.map(({ status }) => status)).toEqual([401, 401]);
    expect(followUpService.list).not.toHaveBeenCalled();
    expect(followUpService.complete).not.toHaveBeenCalled();
  });

  it("defaults to active and allows both roles to request shared history", async () => {
    const { app, followUpService } = testApp();
    const active = await request(app).get("/api/follow-ups").set("Authorization", "Bearer leader-token");
    const history = await request(app).get("/api/follow-ups?status=completed").set("Authorization", "Bearer admin-token");
    expect([active.status, history.status]).toEqual([200, 200]);
    expect(active.headers["cache-control"]).toBe("private, no-store");
    expect(followUpService.list).toHaveBeenNthCalledWith(1, actors.leader, "active");
    expect(followUpService.list).toHaveBeenNthCalledWith(2, actors.admin, "completed");
  });

  it("rejects invalid list status deterministically", async () => {
    const { app, followUpService } = testApp();
    const response = await request(app).get("/api/follow-ups?status=all").set("Authorization", "Bearer leader-token");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
    expect(followUpService.list).not.toHaveBeenCalled();
  });

  it("completes through the trusted actor with a trimmed optional note", async () => {
    const { app, followUpService } = testApp();
    const response = await request(app)
      .patch(`/api/follow-ups/${followUpId}/complete`)
      .set("Authorization", "Bearer leader-token")
      .send({ completionNote: "  Contacted by phone.  " });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      completedBy: { id: actors.leader.id, name: actors.leader.name },
      completionNote: "Contacted by phone.",
      status: "completed",
    });
    expect(followUpService.complete).toHaveBeenCalledWith(
      actors.leader,
      followUpId,
      "Contacted by phone.",
    );
  });

  it("allows no completion note but rejects client-selected actor/time and oversized notes", async () => {
    const { app, followUpService } = testApp();
    const withoutNote = await request(app)
      .patch(`/api/follow-ups/${followUpId}/complete`)
      .set("Authorization", "Bearer admin-token")
      .send({});
    const controlled = await request(app)
      .patch(`/api/follow-ups/${followUpId}/complete`)
      .set("Authorization", "Bearer leader-token")
      .send({ completedByProfileId: actors.admin.id, completedAt: "2000-01-01T00:00:00Z" });
    const oversized = await request(app)
      .patch(`/api/follow-ups/${followUpId}/complete`)
      .set("Authorization", "Bearer leader-token")
      .send({ completionNote: "x".repeat(2001) });
    expect([withoutNote.status, controlled.status, oversized.status]).toEqual([200, 400, 400]);
    expect(followUpService.complete).toHaveBeenCalledTimes(1);
    expect(followUpService.complete).toHaveBeenCalledWith(actors.admin, followUpId, null);
  });

  it("returns stable completion errors and exposes no manual creation API", async () => {
    const followUpService = service();
    vi.mocked(followUpService.complete).mockRejectedValueOnce(
      new FollowUpServiceError(409, "FOLLOW_UP_ALREADY_COMPLETED", "This Follow Up has already been completed."),
    );
    const { app } = testApp(followUpService);
    const repeated = await request(app)
      .patch(`/api/follow-ups/${followUpId}/complete`)
      .set("Authorization", "Bearer leader-token")
      .send({});
    const manual = await request(app)
      .post("/api/follow-ups")
      .set("Authorization", "Bearer admin-token")
      .send({ memberId, reason: "consecutive_sunday_absence" });
    expect(repeated.status).toBe(409);
    expect(repeated.body.error.code).toBe("FOLLOW_UP_ALREADY_COMPLETED");
    expect(manual.status).toBe(404);
  });
});
