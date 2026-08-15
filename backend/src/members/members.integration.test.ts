import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import type { Database } from "../types/database.types.js";
import { createSupabaseMemberService } from "./supabase-member-service.js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasLocalIntegrationConfig = Boolean(supabaseUrl && serviceRoleKey);
const integrationSupabaseUrl = supabaseUrl ?? "http://127.0.0.1:54321";
const integrationServiceRoleKey = serviceRoleKey ?? "integration-key-unavailable";
const describeWithLocalSupabase = hasLocalIntegrationConfig
  ? describe
  : describe.skip;

describeWithLocalSupabase("Member API with local Supabase", () => {
  const adminClient = createClient<Database>(
    integrationSupabaseUrl,
    integrationServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  const createdUserIds: string[] = [];
  const createdLifeGroupIds: string[] = [];
  const createdMemberIds: string[] = [];

  afterEach(async () => {
    if (createdMemberIds.length > 0) {
      const { error } = await adminClient
        .from("members")
        .delete()
        .in("id", createdMemberIds);
      if (error) throw error;
      createdMemberIds.length = 0;
    }

    if (createdLifeGroupIds.length > 0) {
      const { error } = await adminClient
        .from("life_groups")
        .delete()
        .in("id", createdLifeGroupIds);
      if (error) throw error;
      createdLifeGroupIds.length = 0;
    }

    for (const userId of createdUserIds.splice(0).reverse()) {
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) throw error;
    }
  });

  async function createProfile(name: string, role: "admin" | "leader") {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: `members-${randomUUID()}@example.test`,
      email_confirm: true,
      password: `${randomUUID()}-Aa1!`,
      user_metadata: { name },
    });
    if (error || !data.user) throw error ?? new Error("User was not created.");
    createdUserIds.push(data.user.id);

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ role })
      .eq("id", data.user.id);
    if (profileError) throw profileError;
    return data.user.id;
  }

  async function createLifeGroup(
    name: string,
    leaderProfileId: string,
    isActive = true,
  ) {
    const { data, error } = await adminClient
      .from("life_groups")
      .insert({ is_active: isActive, leader_profile_id: leaderProfileId, name })
      .select("id")
      .single();
    if (error) throw error;
    createdLifeGroupIds.push(data.id);
    return data.id;
  }

  function trackMember(response: { body: { data?: { id?: string } } }) {
    const memberId = response.body.data?.id;
    if (memberId) createdMemberIds.push(memberId);
    return memberId;
  }

  it("enforces Member mutations, normalization, QR permanence, and role scope", async () => {
    const adminId = await createProfile("Integration Admin", "admin");
    const leaderAId = await createProfile("Leader A", "leader");
    const leaderBId = await createProfile("Leader B", "leader");
    const inactiveLeaderId = await createProfile("Inactive Group Leader", "leader");
    const groupAId = await createLifeGroup("Group A", leaderAId);
    const groupBId = await createLifeGroup("Group B", leaderBId);
    const inactiveGroupId = await createLifeGroup(
      "Inactive Group",
      inactiveLeaderId,
      false,
    );

    const actors: Record<string, HorizonActor> = {
      "admin-token": {
        id: adminId,
        isActive: true,
        name: "Integration Admin",
        role: "admin",
      },
      "leader-a-token": {
        id: leaderAId,
        isActive: true,
        name: "Leader A",
        role: "leader",
      },
      "leader-b-token": {
        id: leaderBId,
        isActive: true,
        name: "Leader B",
        role: "leader",
      },
    };
    const authService: AuthService = {
      authenticate: async (token) => ({ actor: actors[token]!, ok: true }),
    };
    const memberService = createSupabaseMemberService({
      serviceRoleKey: integrationServiceRoleKey,
      supabaseUrl: integrationSupabaseUrl,
    });
    const app = createApp({ authService, memberService });
    const asActor = (
      token: string,
      method: "get" | "patch" | "post",
      path: string,
    ) => request(app)[method](path).set("Authorization", `Bearer ${token}`);

    const adminCreated = await asActor("admin-token", "post", "/api/members").send({
      email: "  ANA.ADMIN@Example.Test  ",
      firstName: "Ana",
      gender: "female",
      lastName: "Santos",
      lifeGroupId: groupBId,
      phone: "0917 123 4567",
    });
    expect(adminCreated.status).toBe(201);
    const adminMemberId = trackMember(adminCreated)!;
    expect(adminCreated.body.data.lifeGroup.id).toBe(groupBId);
    expect(adminCreated.body.data.qrToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const permanentQrToken = adminCreated.body.data.qrToken;

    const leaderCreated = await asActor(
      "leader-a-token",
      "post",
      "/api/members",
    ).send({
      firstName: "Ben",
      lastName: "Cruz",
      lifeGroupId: groupAId,
    });
    expect(leaderCreated.status).toBe(201);
    const leaderMemberId = trackMember(leaderCreated)!;

    const ownArchived = await asActor(
      "admin-token",
      "post",
      "/api/members",
    ).send({
      email: "archived-own@example.test",
      firstName: "Archived",
      lastName: "Own Group",
      lifeGroupId: groupAId,
    });
    expect(ownArchived.status).toBe(201);
    const ownArchivedId = trackMember(ownArchived)!;
    const ownArchivedResult = await asActor(
      "admin-token",
      "patch",
      `/api/members/${ownArchivedId}/archive`,
    );
    expect(ownArchivedResult.status).toBe(200);

    const adminDefaultList = await asActor(
      "admin-token",
      "get",
      "/api/members",
    );
    const adminArchivedList = await asActor(
      "admin-token",
      "get",
      "/api/members?status=archived",
    );
    const adminGroupList = await asActor(
      "admin-token",
      "get",
      `/api/members?status=all&lifeGroupId=${groupBId}`,
    );
    expect(adminDefaultList.status).toBe(200);
    expect(adminDefaultList.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: adminMemberId }),
        expect.objectContaining({ id: leaderMemberId }),
      ]),
    );
    expect(adminDefaultList.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ownArchivedId })]),
    );
    expect(adminArchivedList.body.data).toEqual([
      expect.objectContaining({ id: ownArchivedId, isActive: false }),
    ]);
    expect(adminGroupList.body.data).toEqual([
      expect.objectContaining({ id: adminMemberId, lifeGroup: expect.objectContaining({ id: groupBId }) }),
    ]);

    const adminOtherGroupDetail = await asActor(
      "admin-token",
      "get",
      `/api/members/${adminMemberId}`,
    );
    const adminArchivedDetail = await asActor(
      "admin-token",
      "get",
      `/api/members/${ownArchivedId}`,
    );
    expect(adminOtherGroupDetail.status).toBe(200);
    expect(adminArchivedDetail.status).toBe(200);
    expect(adminArchivedDetail.body.data.isActive).toBe(false);

    const leaderList = await asActor(
      "leader-a-token",
      "get",
      "/api/members",
    );
    const leaderSearchEscape = await asActor(
      "leader-a-token",
      "get",
      "/api/members?search=0917%20123%204567",
    );
    const leaderFilterEscape = await asActor(
      "leader-a-token",
      "get",
      `/api/members?status=all&lifeGroupId=${groupBId}`,
    );
    expect(leaderList.body.data).toEqual([
      expect.objectContaining({ id: leaderMemberId, isActive: true }),
    ]);
    expect(leaderSearchEscape.body.data).toEqual([]);
    expect(leaderFilterEscape.body.data).toEqual([
      expect.objectContaining({ id: leaderMemberId, isActive: true }),
    ]);

    const leaderOwnDetail = await asActor(
      "leader-a-token",
      "get",
      `/api/members/${leaderMemberId}`,
    );
    const leaderOtherGroupDetail = await asActor(
      "leader-a-token",
      "get",
      `/api/members/${adminMemberId}`,
    );
    const leaderArchivedDetail = await asActor(
      "leader-a-token",
      "get",
      `/api/members/${ownArchivedId}`,
    );
    expect(leaderOwnDetail.status).toBe(200);
    expect(leaderOtherGroupDetail.status).toBe(404);
    expect(leaderOtherGroupDetail.body.error.code).toBe("MEMBER_NOT_FOUND");
    expect(leaderArchivedDetail.status).toBe(404);
    expect(leaderArchivedDetail.body.error).toEqual(
      leaderOtherGroupDetail.body.error,
    );
    const leaderArchivedEdit = await asActor(
      "leader-a-token",
      "patch",
      `/api/members/${ownArchivedId}`,
    ).send({ address: "Hidden archived edit" });
    expect(leaderArchivedEdit.status).toBe(404);

    const wrongGroup = await asActor(
      "leader-a-token",
      "post",
      "/api/members",
    ).send({ firstName: "Wrong", lastName: "Group", lifeGroupId: groupBId });
    const inactiveGroup = await asActor(
      "admin-token",
      "post",
      "/api/members",
    ).send({
      firstName: "Inactive",
      lastName: "Assignment",
      lifeGroupId: inactiveGroupId,
    });
    expect(wrongGroup.status).toBe(403);
    expect(wrongGroup.body.error.code).toBe("MEMBER_SCOPE_FORBIDDEN");
    expect(inactiveGroup.status).toBe(422);
    expect(inactiveGroup.body.error.code).toBe("INACTIVE_LIFE_GROUP");

    const duplicateEmail = await asActor(
      "admin-token",
      "post",
      "/api/members",
    ).send({
      email: "ana.admin@example.test",
      firstName: "Different",
      lastName: "Name",
      lifeGroupId: groupAId,
    });
    const duplicatePhone = await asActor(
      "admin-token",
      "post",
      "/api/members",
    ).send({
      firstName: "Another",
      lastName: "Person",
      lifeGroupId: groupAId,
      phone: "+63 (917) 123-4567",
    });
    expect(duplicateEmail.status).toBe(409);
    expect(duplicateEmail.body.error.code).toBe("DUPLICATE_MEMBER_EMAIL");
    expect(duplicatePhone.status).toBe(409);
    expect(duplicatePhone.body.error.code).toBe("DUPLICATE_MEMBER_PHONE");

    const duplicateName = await asActor(
      "admin-token",
      "post",
      "/api/members",
    ).send({ firstName: "Ana", lastName: "Santos", lifeGroupId: groupAId });
    expect(duplicateName.status).toBe(201);
    trackMember(duplicateName);

    const ownGroupEdit = await asActor(
      "leader-a-token",
      "patch",
      `/api/members/${leaderMemberId}`,
    ).send({ address: "Updated by own Leader", phone: null });
    const otherGroupEdit = await asActor(
      "leader-a-token",
      "patch",
      `/api/members/${adminMemberId}`,
    ).send({ address: "Forbidden" });
    const leaderMove = await asActor(
      "leader-a-token",
      "patch",
      `/api/members/${leaderMemberId}`,
    ).send({ lifeGroupId: groupBId });
    expect(ownGroupEdit.status).toBe(200);
    expect(otherGroupEdit.status).toBe(403);
    expect(otherGroupEdit.body.error.code).toBe("MEMBER_SCOPE_FORBIDDEN");
    expect(leaderMove.status).toBe(403);
    expect(leaderMove.body.error.code).toBe("LIFE_GROUP_REASSIGNMENT_FORBIDDEN");

    const adminEditAndMove = await asActor(
      "admin-token",
      "patch",
      `/api/members/${adminMemberId}`,
    ).send({ firstName: "Ana Maria", lifeGroupId: groupAId });
    expect(adminEditAndMove.status).toBe(200);
    expect(adminEditAndMove.body.data.lifeGroup.id).toBe(groupAId);
    expect(adminEditAndMove.body.data.qrToken).toBe(permanentQrToken);

    const leaderArchive = await asActor(
      "leader-a-token",
      "patch",
      `/api/members/${adminMemberId}/archive`,
    );
    const adminArchive = await asActor(
      "admin-token",
      "patch",
      `/api/members/${adminMemberId}/archive`,
    );
    expect(leaderArchive.status).toBe(403);
    expect(adminArchive.status).toBe(200);
    expect(adminArchive.body.data.isActive).toBe(false);
    expect(adminArchive.body.data.qrToken).toBe(permanentQrToken);

    const badGender = await asActor("admin-token", "post", "/api/members").send({
      firstName: "Bad",
      gender: "other",
      lastName: "Gender",
      lifeGroupId: groupAId,
    });
    const blankName = await asActor("admin-token", "post", "/api/members").send({
      firstName: " ",
      lastName: "Name",
      lifeGroupId: groupAId,
    });
    const clientQr = await asActor("admin-token", "post", "/api/members").send({
      firstName: "Client",
      lastName: "Token",
      lifeGroupId: groupAId,
      qrToken: "not-allowed",
    });
    expect(badGender.status).toBe(400);
    expect(blankName.status).toBe(400);
    expect(clientQr.body.error.code).toBe("QR_TOKEN_CLIENT_CONTROLLED");

    const concurrentEmail = `concurrent-${randomUUID()}@example.test`;
    const concurrentResponses = await Promise.all([
      asActor("admin-token", "post", "/api/members").send({
        email: concurrentEmail,
        firstName: "Concurrent",
        lastName: "One",
        lifeGroupId: groupAId,
      }),
      asActor("admin-token", "post", "/api/members").send({
        email: concurrentEmail.toUpperCase(),
        firstName: "Concurrent",
        lastName: "Two",
        lifeGroupId: groupAId,
      }),
    ]);
    expect(concurrentResponses.map(({ status }) => status).sort()).toEqual([
      201, 409,
    ]);
    concurrentResponses.forEach(trackMember);

    const qrTokens = ["fixed-collision-token", "fixed-collision-token", "fresh-token"];
    const generateQrToken = vi.fn(() => qrTokens.shift() ?? "fallback-token");
    const collisionService = createSupabaseMemberService({
      generateQrToken,
      serviceRoleKey: integrationServiceRoleKey,
      supabaseUrl: integrationSupabaseUrl,
    });
    const collisionApp = createApp({ authService, memberService: collisionService });
    const firstCollisionMember = await request(collisionApp)
      .post("/api/members")
      .set("Authorization", "Bearer admin-token")
      .send({ firstName: "QR", lastName: "One", lifeGroupId: groupAId });
    trackMember(firstCollisionMember);
    const retriedCollisionMember = await request(collisionApp)
      .post("/api/members")
      .set("Authorization", "Bearer admin-token")
      .send({ firstName: "QR", lastName: "Two", lifeGroupId: groupAId });
    trackMember(retriedCollisionMember);
    expect(firstCollisionMember.status).toBe(201);
    expect(retriedCollisionMember.status).toBe(201);
    expect(retriedCollisionMember.body.data.qrToken).toBe("fresh-token");
    expect(generateQrToken).toHaveBeenCalledTimes(3);

    const { data: storedMember, error: storedMemberError } = await adminClient
      .from("members")
      .select("first_name, life_group_id, is_active, qr_token")
      .eq("id", adminMemberId)
      .single();
    if (storedMemberError) throw storedMemberError;
    expect(storedMember).toEqual({
      first_name: "Ana Maria",
      is_active: false,
      life_group_id: groupAId,
      qr_token: permanentQrToken,
    });
  });
});
