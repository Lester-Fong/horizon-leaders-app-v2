import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import {
  LifeGroupServiceError,
  type LifeGroup,
  type LifeGroupService,
} from "../life-groups/types.js";

const groupId = "11111111-1111-4111-8111-111111111111";
const leaderId = "22222222-2222-4222-8222-222222222222";
const replacementLeaderId = "33333333-3333-4333-8333-333333333333";

const group: LifeGroup = {
  createdAt: "2026-08-15T01:00:00.000Z",
  description: "A weekday home gathering.",
  id: groupId,
  isActive: true,
  leader: { id: leaderId, isActive: true, name: "Lina Leader" },
  name: "North Life Group",
  updatedAt: "2026-08-15T01:00:00.000Z",
};

const actors: Record<"admin" | "leader", HorizonActor> = {
  admin: {
    id: "44444444-4444-4444-8444-444444444444",
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

function createAuthService(): AuthService {
  return {
    authenticate: vi.fn(async (token) => {
      const actor = token === "admin-token" ? actors.admin : actors.leader;
      return { actor, ok: true };
    }),
  };
}

function createLifeGroupService(): LifeGroupService {
  return {
    create: vi.fn(async () => group),
    getById: vi.fn(async () => group),
    list: vi.fn(async () => [group]),
    listLeaderOptions: vi.fn(async () => [
      {
        assignedLifeGroup: { id: groupId, isActive: true, name: group.name },
        id: leaderId,
        isActive: true,
        name: "Lina Leader",
      },
      {
        assignedLifeGroup: null,
        id: replacementLeaderId,
        isActive: true,
        name: "Rae Leader",
      },
    ]),
    setActive: vi.fn(async (_id, isActive) => ({ ...group, isActive })),
    update: vi.fn(async (_id, input) => ({
      ...group,
      description: input.description ?? group.description,
      name: input.name ?? group.name,
    })),
  };
}

function createTestApp(lifeGroupService = createLifeGroupService()) {
  return {
    app: createApp({ authService: createAuthService(), lifeGroupService }),
    lifeGroupService,
  };
}

describe("Life Group API authorization and reads", () => {
  it("requires authentication", async () => {
    const { app, lifeGroupService } = createTestApp();
    const response = await request(app).get("/api/life-groups");

    expect(response.status).toBe(401);
    expect(lifeGroupService.list).not.toHaveBeenCalled();
  });

  it("returns active groups to Leaders and all groups to Admins", async () => {
    const { app, lifeGroupService } = createTestApp();

    const leaderResponse = await request(app)
      .get("/api/life-groups")
      .set("Authorization", "Bearer leader-token");
    const adminResponse = await request(app)
      .get("/api/life-groups")
      .set("Authorization", "Bearer admin-token");

    expect(leaderResponse.status).toBe(200);
    expect(adminResponse.status).toBe(200);
    expect(lifeGroupService.list).toHaveBeenNthCalledWith(1, {
      includeInactive: false,
    });
    expect(lifeGroupService.list).toHaveBeenNthCalledWith(2, {
      includeInactive: true,
    });
    expect(leaderResponse.headers["cache-control"]).toBe("private, no-store");
  });

  it("allows only Admins to inspect eligible Leader options", async () => {
    const { app, lifeGroupService } = createTestApp();

    const leaderResponse = await request(app)
      .get("/api/life-groups/leaders")
      .set("Authorization", "Bearer leader-token");
    const adminResponse = await request(app)
      .get("/api/life-groups/leaders")
      .set("Authorization", "Bearer admin-token");

    expect(leaderResponse.status).toBe(403);
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.data).toHaveLength(2);
    expect(lifeGroupService.listLeaderOptions).toHaveBeenCalledOnce();
  });
});

describe("Life Group API Admin mutations", () => {
  it("creates a Life Group from trimmed, validated input", async () => {
    const { app, lifeGroupService } = createTestApp();
    const response = await request(app)
      .post("/api/life-groups")
      .set("Authorization", "Bearer admin-token")
      .send({
        description: "  A weekday home gathering.  ",
        leaderProfileId: leaderId,
        name: "  North Life Group  ",
      });

    expect(response.status).toBe(201);
    expect(lifeGroupService.create).toHaveBeenCalledWith({
      description: "A weekday home gathering.",
      leaderProfileId: leaderId,
      name: "North Life Group",
    });
  });

  it("rejects invalid create and empty update payloads", async () => {
    const { app, lifeGroupService } = createTestApp();
    const createResponse = await request(app)
      .post("/api/life-groups")
      .set("Authorization", "Bearer admin-token")
      .send({ leaderProfileId: "not-a-uuid", name: " " });
    const updateResponse = await request(app)
      .patch(`/api/life-groups/${groupId}`)
      .set("Authorization", "Bearer admin-token")
      .send({});

    expect(createResponse.status).toBe(400);
    expect(updateResponse.status).toBe(400);
    expect(lifeGroupService.create).not.toHaveBeenCalled();
    expect(lifeGroupService.update).not.toHaveBeenCalled();
  });

  it("edits, reassigns, archives, and reactivates without a DELETE route", async () => {
    const { app, lifeGroupService } = createTestApp();
    const editResponse = await request(app)
      .patch(`/api/life-groups/${groupId}`)
      .set("Authorization", "Bearer admin-token")
      .send({ leaderProfileId: replacementLeaderId, name: "Northside" });
    const archiveResponse = await request(app)
      .patch(`/api/life-groups/${groupId}/status`)
      .set("Authorization", "Bearer admin-token")
      .send({ isActive: false });
    const reactivateResponse = await request(app)
      .patch(`/api/life-groups/${groupId}/status`)
      .set("Authorization", "Bearer admin-token")
      .send({ isActive: true });
    const deleteResponse = await request(app)
      .delete(`/api/life-groups/${groupId}`)
      .set("Authorization", "Bearer admin-token");

    expect(editResponse.status).toBe(200);
    expect(archiveResponse.body.data.isActive).toBe(false);
    expect(reactivateResponse.body.data.isActive).toBe(true);
    expect(deleteResponse.status).toBe(404);
    expect(lifeGroupService.update).toHaveBeenCalledWith(groupId, {
      leaderProfileId: replacementLeaderId,
      name: "Northside",
    });
  });

  it("keeps all mutation routes unavailable to Leaders", async () => {
    const { app, lifeGroupService } = createTestApp();
    const responses = await Promise.all([
      request(app)
        .post("/api/life-groups")
        .set("Authorization", "Bearer leader-token")
        .send({ leaderProfileId: replacementLeaderId, name: "New group" }),
      request(app)
        .patch(`/api/life-groups/${groupId}`)
        .set("Authorization", "Bearer leader-token")
        .send({ name: "Changed" }),
      request(app)
        .patch(`/api/life-groups/${groupId}/status`)
        .set("Authorization", "Bearer leader-token")
        .send({ isActive: false }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([403, 403, 403]);
    expect(lifeGroupService.create).not.toHaveBeenCalled();
    expect(lifeGroupService.update).not.toHaveBeenCalled();
    expect(lifeGroupService.setActive).not.toHaveBeenCalled();
  });

  it("maps expected service conflicts without leaking internals", async () => {
    const lifeGroupService = createLifeGroupService();
    vi.mocked(lifeGroupService.create).mockRejectedValueOnce(
      new LifeGroupServiceError(
        409,
        "LEADER_ALREADY_ASSIGNED",
        "The selected Leader is already assigned to another Life Group.",
      ),
    );
    const { app } = createTestApp(lifeGroupService);
    const response = await request(app)
      .post("/api/life-groups")
      .set("Authorization", "Bearer admin-token")
      .send({ leaderProfileId: leaderId, name: "Another group" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("LEADER_ALREADY_ASSIGNED");
  });
});
