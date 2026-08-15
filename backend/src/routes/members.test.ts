import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import {
  MemberServiceError,
  type Member,
  type MemberService,
} from "../members/types.js";

const memberId = "11111111-1111-4111-8111-111111111111";
const leaderId = "22222222-2222-4222-8222-222222222222";
const groupId = "33333333-3333-4333-8333-333333333333";
const otherGroupId = "44444444-4444-4444-8444-444444444444";

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

const member: Member = {
  address: "Manila",
  birthDate: "1990-04-12",
  createdAt: "2026-08-15T01:00:00.000Z",
  email: "ana@example.test",
  firstName: "Ana",
  gender: "female",
  id: memberId,
  isActive: true,
  lastName: "Santos",
  lifeGroup: { id: groupId, isActive: true, name: "North Group" },
  phone: "0917 123 4567",
  qrToken: "opaque-token",
  updatedAt: "2026-08-15T01:00:00.000Z",
};

function createAuthService(): AuthService {
  return {
    authenticate: vi.fn(async (token) => ({
      actor: token === "admin-token" ? actors.admin : actors.leader,
      ok: true,
    })),
  };
}

function createMemberService(): MemberService {
  return {
    archive: vi.fn(async () => ({ ...member, isActive: false })),
    create: vi.fn(async () => member),
    getById: vi.fn(async () => member),
    list: vi.fn(async () => [member]),
    update: vi.fn(async () => member),
  };
}

function createTestApp(memberService = createMemberService()) {
  return {
    app: createApp({ authService: createAuthService(), memberService }),
    memberService,
  };
}

describe("Member API read and mutation boundary", () => {
  it("requires authentication for Member reads and mutations", async () => {
    const { app, memberService } = createTestApp();

    const unauthenticated = await request(app).post("/api/members").send({});
    const list = await request(app).get("/api/members");
    const detail = await request(app).get(`/api/members/${memberId}`);

    expect(unauthenticated.status).toBe(401);
    expect(list.status).toBe(401);
    expect(detail.status).toBe(401);
    expect(memberService.create).not.toHaveBeenCalled();
    expect(memberService.list).not.toHaveBeenCalled();
    expect(memberService.getById).not.toHaveBeenCalled();
  });

  it("applies Admin defaults and validated list filters", async () => {
    const { app, memberService } = createTestApp();

    const defaultResponse = await request(app)
      .get("/api/members")
      .set("Authorization", "Bearer admin-token");
    const filteredResponse = await request(app)
      .get(
        `/api/members?status=archived&lifeGroupId=${groupId}&search=%20Ana%20`,
      )
      .set("Authorization", "Bearer admin-token");

    expect(defaultResponse.status).toBe(200);
    expect(defaultResponse.headers["cache-control"]).toBe("private, no-store");
    expect(filteredResponse.status).toBe(200);
    expect(memberService.list).toHaveBeenNthCalledWith(1, actors.admin, {
      status: "active",
    });
    expect(memberService.list).toHaveBeenNthCalledWith(2, actors.admin, {
      lifeGroupId: groupId,
      search: "Ana",
      status: "archived",
    });
  });

  it("does not pass Leader Life Group or status query overrides", async () => {
    const { app, memberService } = createTestApp();
    const response = await request(app)
      .get(`/api/members?status=all&lifeGroupId=${otherGroupId}&search=Ana`)
      .set("Authorization", "Bearer leader-token");

    expect(response.status).toBe(200);
    expect(memberService.list).toHaveBeenCalledWith(actors.leader, {
      search: "Ana",
      status: "active",
    });
  });

  it("returns scoped Member details and validates read parameters", async () => {
    const { app, memberService } = createTestApp();
    const detailResponse = await request(app)
      .get(`/api/members/${memberId}`)
      .set("Authorization", "Bearer leader-token");
    const invalidStatus = await request(app)
      .get("/api/members?status=inactive")
      .set("Authorization", "Bearer admin-token");
    const invalidGroup = await request(app)
      .get("/api/members?lifeGroupId=not-a-uuid")
      .set("Authorization", "Bearer admin-token");

    expect(detailResponse.status).toBe(200);
    expect(memberService.getById).toHaveBeenCalledWith(
      actors.leader,
      memberId,
    );
    expect(invalidStatus.status).toBe(400);
    expect(invalidGroup.status).toBe(400);
  });

  it("creates for Admin and Leader using trimmed approved fields only", async () => {
    const { app, memberService } = createTestApp();
    const input = {
      address: "  Manila  ",
      birthDate: "1990-04-12",
      email: "  ANA@example.test  ",
      firstName: "  Ana  ",
      gender: "female",
      lastName: "  Santos  ",
      lifeGroupId: groupId,
      phone: "  0917 123 4567  ",
    };

    const adminResponse = await request(app)
      .post("/api/members")
      .set("Authorization", "Bearer admin-token")
      .send(input);
    const leaderResponse = await request(app)
      .post("/api/members")
      .set("Authorization", "Bearer leader-token")
      .send(input);

    expect(adminResponse.status).toBe(201);
    expect(leaderResponse.status).toBe(201);
    expect(memberService.create).toHaveBeenNthCalledWith(1, actors.admin, {
      address: "Manila",
      birthDate: "1990-04-12",
      email: "ANA@example.test",
      firstName: "Ana",
      gender: "female",
      lastName: "Santos",
      lifeGroupId: groupId,
      phone: "0917 123 4567",
    });
    expect(memberService.create).toHaveBeenNthCalledWith(
      2,
      actors.leader,
      expect.any(Object),
    );
  });

  it("rejects blank names, invalid gender, invalid dates, and client QR control", async () => {
    const { app, memberService } = createTestApp();
    const base = {
      firstName: "Ana",
      lastName: "Santos",
      lifeGroupId: groupId,
    };

    const responses = await Promise.all([
      request(app)
        .post("/api/members")
        .set("Authorization", "Bearer admin-token")
        .send({ ...base, firstName: " " }),
      request(app)
        .post("/api/members")
        .set("Authorization", "Bearer admin-token")
        .send({ ...base, gender: "other" }),
      request(app)
        .post("/api/members")
        .set("Authorization", "Bearer admin-token")
        .send({ ...base, birthDate: "2026-02-31" }),
      request(app)
        .post("/api/members")
        .set("Authorization", "Bearer admin-token")
        .send({ ...base, qrToken: "chosen-by-client" }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([400, 400, 400, 400]);
    expect(responses[3]?.body.error.code).toBe("QR_TOKEN_CLIENT_CONTROLLED");
    expect(memberService.create).not.toHaveBeenCalled();
  });

  it("accepts normal edits and Admin Life Group reassignment", async () => {
    const { app, memberService } = createTestApp();

    const adminResponse = await request(app)
      .patch(`/api/members/${memberId}`)
      .set("Authorization", "Bearer admin-token")
      .send({ firstName: "  Ann  ", lifeGroupId: otherGroupId });
    const leaderResponse = await request(app)
      .patch(`/api/members/${memberId}`)
      .set("Authorization", "Bearer leader-token")
      .send({ phone: null });

    expect(adminResponse.status).toBe(200);
    expect(leaderResponse.status).toBe(200);
    expect(memberService.update).toHaveBeenNthCalledWith(1, actors.admin, memberId, {
      firstName: "Ann",
      lifeGroupId: otherGroupId,
    });
    expect(memberService.update).toHaveBeenNthCalledWith(2, actors.leader, memberId, {
      phone: null,
    });
  });

  it("rejects QR mutation, empty updates, hard delete, and unapproved reactivation", async () => {
    const { app, memberService } = createTestApp();

    const qrResponse = await request(app)
      .patch(`/api/members/${memberId}`)
      .set("Authorization", "Bearer admin-token")
      .send({ qrToken: "replacement" });
    const emptyResponse = await request(app)
      .patch(`/api/members/${memberId}`)
      .set("Authorization", "Bearer admin-token")
      .send({});
    const deleteResponse = await request(app)
      .delete(`/api/members/${memberId}`)
      .set("Authorization", "Bearer admin-token");
    const reactivateResponse = await request(app)
      .patch(`/api/members/${memberId}/status`)
      .set("Authorization", "Bearer admin-token")
      .send({ isActive: true });

    expect(qrResponse.body.error.code).toBe("QR_TOKEN_IMMUTABLE");
    expect(emptyResponse.status).toBe(400);
    expect(deleteResponse.status).toBe(404);
    expect(reactivateResponse.status).toBe(404);
    expect(memberService.update).not.toHaveBeenCalled();
  });

  it("allows only Admins to archive", async () => {
    const { app, memberService } = createTestApp();

    const leaderResponse = await request(app)
      .patch(`/api/members/${memberId}/archive`)
      .set("Authorization", "Bearer leader-token");
    const adminResponse = await request(app)
      .patch(`/api/members/${memberId}/archive`)
      .set("Authorization", "Bearer admin-token");

    expect(leaderResponse.status).toBe(403);
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.data.isActive).toBe(false);
    expect(memberService.archive).toHaveBeenCalledOnce();
  });

  it("returns actionable duplicate conflict errors without leaking internals", async () => {
    const memberService = createMemberService();
    vi.mocked(memberService.create).mockRejectedValueOnce(
      new MemberServiceError(
        409,
        "DUPLICATE_MEMBER_EMAIL",
        "Another Member already uses this email address.",
      ),
    );
    const { app } = createTestApp(memberService);
    const response = await request(app)
      .post("/api/members")
      .set("Authorization", "Bearer admin-token")
      .send({ firstName: "Ana", lastName: "Santos", lifeGroupId: groupId });

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({
      code: "DUPLICATE_MEMBER_EMAIL",
      message: "Another Member already uses this email address.",
    });
  });
});
