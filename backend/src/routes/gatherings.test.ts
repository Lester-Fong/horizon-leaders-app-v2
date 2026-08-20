import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import {
  GatheringServiceError,
  type GatheringService,
  type LifeGroupGathering,
} from "../gatherings/types.js";

const lifeGroupId = "11111111-1111-4111-8111-111111111111";
const gatheringId = "22222222-2222-4222-8222-222222222222";
const memberId = "33333333-3333-4333-8333-333333333333";
const leaderId = "44444444-4444-4444-8444-444444444444";

const actors: Record<"admin" | "leader", HorizonActor> = {
  admin: {
    id: "55555555-5555-4555-8555-555555555555",
    isActive: true,
    name: "Ada Admin",
    role: "admin",
  },
  leader: {
    id: leaderId,
    isActive: true,
    name: "Lina Leader",
    role: "leader",
  },
};

const gathering: LifeGroupGathering = {
  attendanceCount: 1,
  createdAt: "2026-08-19T01:00:00.000Z",
  createdBy: { id: leaderId, name: "Lina Leader" },
  gatheringDate: "2026-08-19",
  id: gatheringId,
  lifeGroup: { id: lifeGroupId, isActive: true, name: "North Life Group" },
  location: "North Hall",
  notes: "Discussed care needs.",
  title: "Weekly Gathering",
  updatedAt: "2026-08-19T01:00:00.000Z",
};

function createAuthService(): AuthService {
  return {
    authenticate: vi.fn(async (token) => ({
      actor: token === "admin-token" ? actors.admin : actors.leader,
      ok: true,
    })),
  };
}

function createGatheringService(): GatheringService {
  return {
    addAttendance: vi.fn(async () => ({ isPresent: true, memberId })),
    create: vi.fn(async () => gathering),
    getAttendance: vi.fn(async () => ({
      members: [
        {
          currentLifeGroup: { id: lifeGroupId, name: "North Life Group" },
          email: null,
          firstName: "Mara",
          id: memberId,
          isActive: true,
          isEligible: true,
          isPresent: true,
          lastName: "Member",
          phone: null,
        },
      ],
    })),
    getById: vi.fn(async () => gathering),
    list: vi.fn(async () => ({
      gatherings: [gathering],
      lifeGroup: gathering.lifeGroup,
    })),
    removeAttendance: vi.fn(async () => ({ isPresent: false, memberId })),
    update: vi.fn(async () => gathering),
  };
}

function createTestApp(gatheringService = createGatheringService()) {
  return {
    app: createApp({
      authService: createAuthService(),
      gatheringService,
    }),
    gatheringService,
  };
}

const path = `/api/life-groups/${lifeGroupId}/gatherings`;

describe("Gathering API", () => {
  it("requires authentication", async () => {
    const { app, gatheringService } = createTestApp();
    expect((await request(app).get(path)).status).toBe(401);
    expect(gatheringService.list).not.toHaveBeenCalled();
  });

  it("passes the authenticated actor and nested Life Group to list and detail", async () => {
    const { app, gatheringService } = createTestApp();
    const list = await request(app)
      .get(path)
      .set("Authorization", "Bearer leader-token");
    const detail = await request(app)
      .get(`${path}/${gatheringId}`)
      .set("Authorization", "Bearer admin-token");
    expect(list.status).toBe(200);
    expect(detail.status).toBe(200);
    expect(list.headers["cache-control"]).toBe("private, no-store");
    expect(gatheringService.list).toHaveBeenCalledWith(actors.leader, lifeGroupId);
    expect(gatheringService.getById).toHaveBeenCalledWith(
      actors.admin,
      lifeGroupId,
      gatheringId,
    );
  });

  it("creates with trimmed approved fields and trusted actor context", async () => {
    const { app, gatheringService } = createTestApp();
    const response = await request(app)
      .post(path)
      .set("Authorization", "Bearer leader-token")
      .send({
        gatheringDate: "2026-08-19",
        location: "  North Hall  ",
        notes: "  Notes  ",
        title: "  Weekly Gathering  ",
      });
    expect(response.status).toBe(201);
    expect(gatheringService.create).toHaveBeenCalledWith(
      actors.leader,
      lifeGroupId,
      {
        gatheringDate: "2026-08-19",
        location: "North Hall",
        notes: "Notes",
        title: "Weekly Gathering",
      },
    );
  });

  it("rejects invalid dates and client-controlled creator or Life Group fields", async () => {
    const { app, gatheringService } = createTestApp();
    const badDate = await request(app)
      .post(path)
      .set("Authorization", "Bearer admin-token")
      .send({ gatheringDate: "2026-02-31" });
    const creator = await request(app)
      .post(path)
      .set("Authorization", "Bearer admin-token")
      .send({ createdByProfileId: leaderId, gatheringDate: "2026-08-19" });
    const group = await request(app)
      .post(path)
      .set("Authorization", "Bearer admin-token")
      .send({ gatheringDate: "2026-08-19", lifeGroupId });
    expect([badDate.status, creator.status, group.status]).toEqual([400, 400, 400]);
    expect(gatheringService.create).not.toHaveBeenCalled();
  });

  it("updates only mutable Gathering details", async () => {
    const { app, gatheringService } = createTestApp();
    const response = await request(app)
      .patch(`${path}/${gatheringId}`)
      .set("Authorization", "Bearer leader-token")
      .send({ location: "  Updated room  ", title: null });
    expect(response.status).toBe(200);
    expect(gatheringService.update).toHaveBeenCalledWith(
      actors.leader,
      lifeGroupId,
      gatheringId,
      { location: "Updated room", title: null },
    );
  });

  it("rejects immutable edit fields, empty edits, and Gathering deletion", async () => {
    const { app, gatheringService } = createTestApp();
    const immutable = await request(app)
      .patch(`${path}/${gatheringId}`)
      .set("Authorization", "Bearer admin-token")
      .send({ createdByProfileId: leaderId });
    const empty = await request(app)
      .patch(`${path}/${gatheringId}`)
      .set("Authorization", "Bearer admin-token")
      .send({});
    const deletion = await request(app)
      .delete(`${path}/${gatheringId}`)
      .set("Authorization", "Bearer admin-token");
    expect([immutable.status, empty.status, deletion.status]).toEqual([400, 400, 404]);
    expect(gatheringService.update).not.toHaveBeenCalled();
  });

  it("reads, adds, and removes manual attendance with the authenticated actor", async () => {
    const { app, gatheringService } = createTestApp();
    const attendancePath = `${path}/${gatheringId}/attendance`;
    const roster = await request(app)
      .get(attendancePath)
      .set("Authorization", "Bearer leader-token");
    const add = await request(app)
      .post(attendancePath)
      .set("Authorization", "Bearer leader-token")
      .send({ memberId });
    const remove = await request(app)
      .delete(`${attendancePath}/${memberId}`)
      .set("Authorization", "Bearer leader-token");
    expect([roster.status, add.status, remove.status]).toEqual([200, 201, 200]);
    expect(gatheringService.getAttendance).toHaveBeenCalledWith(
      actors.leader,
      lifeGroupId,
      gatheringId,
    );
    expect(gatheringService.addAttendance).toHaveBeenCalledWith(
      actors.leader,
      lifeGroupId,
      gatheringId,
      memberId,
    );
    expect(gatheringService.removeAttendance).toHaveBeenCalledWith(
      actors.leader,
      lifeGroupId,
      gatheringId,
      memberId,
    );
  });

  it("rejects malformed nested and attendance IDs", async () => {
    const { app, gatheringService } = createTestApp();
    const badGroup = await request(app)
      .get("/api/life-groups/not-a-uuid/gatherings")
      .set("Authorization", "Bearer admin-token");
    const badMember = await request(app)
      .post(`${path}/${gatheringId}/attendance`)
      .set("Authorization", "Bearer admin-token")
      .send({ memberId: "bad" });
    expect([badGroup.status, badMember.status]).toEqual([400, 400]);
    expect(gatheringService.list).not.toHaveBeenCalled();
    expect(gatheringService.addAttendance).not.toHaveBeenCalled();
  });

  it("returns stable domain conflict errors", async () => {
    const service = createGatheringService();
    vi.mocked(service.addAttendance).mockRejectedValueOnce(
      new GatheringServiceError(
        409,
        "ATTENDANCE_ALREADY_RECORDED",
        "This Member is already marked present.",
      ),
    );
    const { app } = createTestApp(service);
    const response = await request(app)
      .post(`${path}/${gatheringId}/attendance`)
      .set("Authorization", "Bearer admin-token")
      .send({ memberId });
    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: "ATTENDANCE_ALREADY_RECORDED",
      message: "This Member is already marked present.",
    });
  });
});
