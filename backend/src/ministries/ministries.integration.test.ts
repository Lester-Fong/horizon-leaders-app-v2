import { randomBytes, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import { createSupabaseMemberService } from "../members/supabase-member-service.js";
import type { Database } from "../types/database.types.js";
import { createSupabaseMinistryService } from "./supabase-ministry-service.js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasLocalIntegrationConfig = Boolean(supabaseUrl && serviceRoleKey);
const integrationSupabaseUrl = supabaseUrl ?? "http://127.0.0.1:54321";
const integrationServiceRoleKey = serviceRoleKey ?? "integration-key-unavailable";
const describeWithLocalSupabase = hasLocalIntegrationConfig
  ? describe
  : describe.skip;

describeWithLocalSupabase("Ministry API with local Supabase", () => {
  const adminClient = createClient<Database>(
    integrationSupabaseUrl,
    integrationServiceRoleKey,
    { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } },
  );
  const createdUserIds: string[] = [];
  const createdLifeGroupIds: string[] = [];
  const createdMemberIds: string[] = [];
  const createdMinistryIds: string[] = [];

  afterEach(async () => {
    if (createdMinistryIds.length > 0) {
      const { error: assignmentError } = await adminClient
        .from("member_ministries")
        .delete()
        .in("ministry_id", createdMinistryIds);
      if (assignmentError) throw assignmentError;
      const { error } = await adminClient
        .from("ministries")
        .delete()
        .in("id", createdMinistryIds);
      if (error) throw error;
      createdMinistryIds.length = 0;
    }
    if (createdMemberIds.length > 0) {
      const { error } = await adminClient.from("members").delete().in("id", createdMemberIds);
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
      email: `ministries-${randomUUID()}@example.test`,
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

  async function createLifeGroup(name: string, leaderProfileId: string) {
    const { data, error } = await adminClient
      .from("life_groups")
      .insert({ leader_profile_id: leaderProfileId, name })
      .select("id")
      .single();
    if (error) throw error;
    createdLifeGroupIds.push(data.id);
    return data.id;
  }

  async function createMember(
    firstName: string,
    lastName: string,
    lifeGroupId: string,
    isActive = true,
  ) {
    const { data, error } = await adminClient
      .from("members")
      .insert({
        first_name: firstName,
        is_active: isActive,
        last_name: lastName,
        life_group_id: lifeGroupId,
        qr_token: randomBytes(32).toString("base64url"),
      })
      .select("id")
      .single();
    if (error) throw error;
    createdMemberIds.push(data.id);
    return data.id;
  }

  function trackMinistry(response: { body: { data?: { id?: string } } }) {
    const ministryId = response.body.data?.id;
    if (ministryId) createdMinistryIds.push(ministryId);
    return ministryId;
  }

  it("enforces Ministry visibility, mutations, assignments, and Member scope", async () => {
    const adminId = await createProfile("Ministry Admin", "admin");
    const leaderAId = await createProfile("Ministry Leader A", "leader");
    const leaderBId = await createProfile("Ministry Leader B", "leader");
    const groupAId = await createLifeGroup("Ministry Group A", leaderAId);
    const groupBId = await createLifeGroup("Ministry Group B", leaderBId);
    const ownVisibleId = await createMember("Own", "Visible", groupAId);
    const ownArchivedId = await createMember("Own", "Archived", groupAId);
    const otherGroupId = await createMember("Other", "Group", groupBId);
    const alreadyArchivedId = await createMember("Already", "Archived", groupAId, false);

    const actors: Record<string, HorizonActor> = {
      "admin-token": { id: adminId, isActive: true, name: "Ministry Admin", role: "admin" },
      "leader-a-token": { id: leaderAId, isActive: true, name: "Leader A", role: "leader" },
    };
    const authService: AuthService = {
      authenticate: async (token) => ({ actor: actors[token]!, ok: true }),
    };
    const memberService = createSupabaseMemberService({
      serviceRoleKey: integrationServiceRoleKey,
      supabaseUrl: integrationSupabaseUrl,
    });
    const ministryService = createSupabaseMinistryService({
      memberService,
      serviceRoleKey: integrationServiceRoleKey,
      supabaseUrl: integrationSupabaseUrl,
    });
    const app = createApp({ authService, memberService, ministryService });
    const asActor = (
      token: string,
      method: "delete" | "get" | "patch" | "post",
      path: string,
    ) => request(app)[method](path).set("Authorization", `Bearer ${token}`);

    const activeMinistry = await asActor("admin-token", "post", "/api/ministries").send({
      description: "A practical integration Ministry.",
      name: "Integration Ministry",
    });
    expect(activeMinistry.status).toBe(201);
    const activeMinistryId = trackMinistry(activeMinistry)!;

    const archivedMinistry = await asActor("admin-token", "post", "/api/ministries").send({
      name: "Archived Integration Ministry",
    });
    const archivedMinistryId = trackMinistry(archivedMinistry)!;
    expect(
      (await asActor("admin-token", "patch", `/api/ministries/${archivedMinistryId}/archive`)).status,
    ).toBe(200);

    const adminDefault = await asActor("admin-token", "get", "/api/ministries");
    const adminArchived = await asActor(
      "admin-token",
      "get",
      "/api/ministries?status=archived",
    );
    const leaderList = await asActor(
      "leader-a-token",
      "get",
      "/api/ministries?status=all",
    );
    expect(adminDefault.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: activeMinistryId })]),
    );
    expect(adminDefault.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: archivedMinistryId })]),
    );
    expect(adminArchived.body.data).toEqual([
      expect.objectContaining({ id: archivedMinistryId, isActive: false }),
    ]);
    expect(leaderList.body.data).toEqual([
      expect.objectContaining({ id: activeMinistryId, isActive: true }),
    ]);
    expect(
      (await asActor("admin-token", "get", `/api/ministries/${archivedMinistryId}`)).status,
    ).toBe(200);
    const leaderArchivedDetail = await asActor(
      "leader-a-token",
      "get",
      `/api/ministries/${archivedMinistryId}`,
    );
    expect(leaderArchivedDetail.status).toBe(404);
    expect(leaderArchivedDetail.body.error.code).toBe("MINISTRY_NOT_FOUND");

    const edited = await asActor(
      "admin-token",
      "patch",
      `/api/ministries/${activeMinistryId}`,
    ).send({ name: "Updated Integration Ministry" });
    expect(edited.status).toBe(200);
    expect(edited.body.data.name).toBe("Updated Integration Ministry");

    const leaderMutations = await Promise.all([
      asActor("leader-a-token", "post", "/api/ministries").send({ name: "No" }),
      asActor("leader-a-token", "patch", `/api/ministries/${activeMinistryId}`).send({ name: "No" }),
      asActor("leader-a-token", "patch", `/api/ministries/${activeMinistryId}/archive`),
    ]);
    expect(leaderMutations.map(({ status }) => status)).toEqual([403, 403, 403]);

    for (const memberId of [ownVisibleId, ownArchivedId, otherGroupId]) {
      const response = await asActor(
        "admin-token",
        "post",
        `/api/ministries/${activeMinistryId}/members`,
      ).send({ memberId });
      expect(response.status).toBe(201);
    }
    const duplicate = await asActor(
      "admin-token",
      "post",
      `/api/ministries/${activeMinistryId}/members`,
    ).send({ memberId: ownVisibleId });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("MEMBER_ALREADY_ASSIGNED");

    const archivedMemberAssignment = await asActor(
      "admin-token",
      "post",
      `/api/ministries/${activeMinistryId}/members`,
    ).send({ memberId: alreadyArchivedId });
    expect(archivedMemberAssignment.status).toBe(422);
    expect(archivedMemberAssignment.body.error.code).toBe("INACTIVE_MEMBER");

    expect(
      (await asActor("admin-token", "patch", `/api/members/${ownArchivedId}/archive`)).status,
    ).toBe(200);
    const adminRoster = await asActor(
      "admin-token",
      "get",
      `/api/ministries/${activeMinistryId}/members`,
    );
    expect(adminRoster.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: ownVisibleId, isActive: true }),
        expect.objectContaining({ id: ownArchivedId, isActive: false }),
        expect.objectContaining({ id: otherGroupId, isActive: true }),
      ]),
    );
    const leaderRoster = await asActor(
      "leader-a-token",
      "get",
      `/api/ministries/${activeMinistryId}/members`,
    );
    expect(leaderRoster.body.data).toEqual([
      expect.objectContaining({ id: ownVisibleId, isActive: true }),
    ]);

    const leaderAssignmentMutations = await Promise.all([
      asActor(
        "leader-a-token",
        "post",
        `/api/ministries/${activeMinistryId}/members`,
      ).send({ memberId: ownVisibleId }),
      asActor(
        "leader-a-token",
        "delete",
        `/api/ministries/${activeMinistryId}/members/${ownVisibleId}`,
      ),
    ]);
    expect(leaderAssignmentMutations.map(({ status }) => status)).toEqual([403, 403]);

    expect(
      (await asActor("admin-token", "patch", `/api/ministries/${activeMinistryId}/archive`)).status,
    ).toBe(200);
    const inactiveMinistryAssignment = await asActor(
      "admin-token",
      "post",
      `/api/ministries/${activeMinistryId}/members`,
    ).send({ memberId: alreadyArchivedId });
    expect(inactiveMinistryAssignment.status).toBe(422);
    expect(inactiveMinistryAssignment.body.error.code).toBe("INACTIVE_MINISTRY");

    const preservedAssignments = await asActor(
      "admin-token",
      "get",
      `/api/ministries/${activeMinistryId}/members`,
    );
    expect(preservedAssignments.body.data).toHaveLength(3);
    const removed = await asActor(
      "admin-token",
      "delete",
      `/api/ministries/${activeMinistryId}/members/${otherGroupId}`,
    );
    expect(removed.status).toBe(200);
    expect(removed.body.data.id).toBe(otherGroupId);
    expect(
      (await adminClient.from("members").select("id").eq("id", otherGroupId).single()).data?.id,
    ).toBe(otherGroupId);
  });
});
