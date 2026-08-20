import { randomBytes, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import type { Database } from "../types/database.types.js";
import { createSupabaseGatheringService } from "./supabase-gathering-service.js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasLocalIntegrationConfig = Boolean(supabaseUrl && serviceRoleKey);
const integrationSupabaseUrl = supabaseUrl ?? "http://127.0.0.1:54321";
const integrationServiceRoleKey = serviceRoleKey ?? "integration-key-unavailable";
const describeWithLocalSupabase = hasLocalIntegrationConfig
  ? describe
  : describe.skip;

describeWithLocalSupabase("Gathering API with local Supabase", () => {
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
  const createdGatheringIds: string[] = [];

  afterEach(async () => {
    if (createdGatheringIds.length > 0) {
      const { error: attendanceError } = await adminClient
        .from("life_group_gathering_attendance")
        .delete()
        .in("gathering_id", createdGatheringIds);
      if (attendanceError) throw attendanceError;
      const { error } = await adminClient
        .from("life_group_gatherings")
        .delete()
        .in("id", createdGatheringIds);
      if (error) throw error;
      createdGatheringIds.length = 0;
    }
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
      email: `gatherings-${randomUUID()}@example.test`,
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
    lifeGroupId: string,
  ) {
    const { data, error } = await adminClient
      .from("members")
      .insert({
        first_name: firstName,
        last_name: "Gathering Member",
        life_group_id: lifeGroupId,
        qr_token: randomBytes(32).toString("base64url"),
      })
      .select("id")
      .single();
    if (error) throw error;
    createdMemberIds.push(data.id);
    return data.id;
  }

  function trackGathering(response: { body: { data?: { id?: string } } }) {
    const id = response.body.data?.id;
    if (id) createdGatheringIds.push(id);
    return id;
  }

  it("enforces scoped Gathering history and presence attendance", async () => {
    const adminId = await createProfile("Gathering Admin", "admin");
    const leaderAId = await createProfile("Gathering Leader A", "leader");
    const leaderBId = await createProfile("Gathering Leader B", "leader");
    const groupAId = await createLifeGroup("Gathering Group A", leaderAId);
    const groupBId = await createLifeGroup("Gathering Group B", leaderBId);
    const memberAId = await createMember("Ana", groupAId);
    const movedWithoutAttendanceId = await createMember("Mia", groupAId);
    const memberBId = await createMember("Ben", groupBId);

    const actors: Record<string, HorizonActor> = {
      "admin-token": {
        id: adminId,
        isActive: true,
        name: "Gathering Admin",
        role: "admin",
      },
      "leader-a-token": {
        id: leaderAId,
        isActive: true,
        name: "Gathering Leader A",
        role: "leader",
      },
      "leader-b-token": {
        id: leaderBId,
        isActive: true,
        name: "Gathering Leader B",
        role: "leader",
      },
    };
    const authService: AuthService = {
      authenticate: async (token) => ({ actor: actors[token]!, ok: true }),
    };
    const gatheringService = createSupabaseGatheringService({
      serviceRoleKey: integrationServiceRoleKey,
      supabaseUrl: integrationSupabaseUrl,
    });
    const app = createApp({ authService, gatheringService });
    const asActor = (
      token: string,
      method: "delete" | "get" | "patch" | "post",
      path: string,
    ) => request(app)[method](path).set("Authorization", `Bearer ${token}`);
    const groupAPath = `/api/life-groups/${groupAId}/gatherings`;
    const groupBPath = `/api/life-groups/${groupBId}/gatherings`;

    const leaderCreated = await asActor("leader-a-token", "post", groupAPath).send({
      gatheringDate: "2026-08-18",
      location: "Home A",
      notes: "Leader-created notes",
      title: "Leader A Gathering",
    });
    expect(leaderCreated.status).toBe(201);
    const gatheringAId = trackGathering(leaderCreated)!;
    expect(leaderCreated.body.data.createdBy.id).toBe(leaderAId);
    expect(leaderCreated.body.data.lifeGroup.id).toBe(groupAId);

    const adminCreated = await asActor("admin-token", "post", groupBPath).send({
      gatheringDate: "2026-08-19",
      title: "Admin-created Gathering",
    });
    expect(adminCreated.status).toBe(201);
    const gatheringBId = trackGathering(adminCreated)!;
    expect(adminCreated.body.data.createdBy.id).toBe(adminId);

    const adminLists = await Promise.all([
      asActor("admin-token", "get", groupAPath),
      asActor("admin-token", "get", groupBPath),
    ]);
    expect(adminLists.map(({ status }) => status)).toEqual([200, 200]);
    expect(adminLists[0].body.data.gatherings[0].id).toBe(gatheringAId);
    expect(adminLists[1].body.data.gatherings[0].id).toBe(gatheringBId);

    const leaderOwn = await asActor("leader-a-token", "get", groupAPath);
    const leaderOtherList = await asActor("leader-a-token", "get", groupBPath);
    const leaderOtherDetail = await asActor(
      "leader-a-token",
      "get",
      `${groupBPath}/${gatheringBId}`,
    );
    expect(leaderOwn.status).toBe(200);
    expect(leaderOtherList.status).toBe(404);
    expect(leaderOtherDetail.status).toBe(404);
    expect(leaderOtherList.body.error.code).toBe("LIFE_GROUP_NOT_FOUND");

    const edited = await asActor(
      "leader-a-token",
      "patch",
      `${groupAPath}/${gatheringAId}`,
    ).send({ gatheringDate: "2026-08-17", title: "Corrected Gathering" });
    expect(edited.status).toBe(200);
    expect(edited.body.data.gatheringDate).toBe("2026-08-17");
    expect(edited.body.data.createdBy.id).toBe(leaderAId);
    expect(edited.body.data.lifeGroup.id).toBe(groupAId);

    const otherMutations = await Promise.all([
      asActor("leader-a-token", "post", groupBPath).send({
        gatheringDate: "2026-08-19",
      }),
      asActor("leader-a-token", "patch", `${groupBPath}/${gatheringBId}`).send({
        title: "Forbidden",
      }),
      asActor(
        "leader-a-token",
        "get",
        `${groupBPath}/${gatheringBId}/attendance`,
      ),
      asActor(
        "leader-a-token",
        "post",
        `${groupBPath}/${gatheringBId}/attendance`,
      ).send({ memberId: memberBId }),
    ]);
    expect(otherMutations.map(({ status }) => status)).toEqual([404, 404, 404, 404]);

    const attendanceAPath = `${groupAPath}/${gatheringAId}/attendance`;
    const attendanceBPath = `${groupBPath}/${gatheringBId}/attendance`;
    const addedOwn = await asActor("leader-a-token", "post", attendanceAPath).send({
      memberId: memberAId,
    });
    expect(addedOwn.status).toBe(201);
    const duplicate = await asActor("admin-token", "post", attendanceAPath).send({
      memberId: memberAId,
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("ATTENDANCE_ALREADY_RECORDED");
    const wrongGroup = await asActor("admin-token", "post", attendanceAPath).send({
      memberId: memberBId,
    });
    expect(wrongGroup.status).toBe(422);
    expect(wrongGroup.body.error.code).toBe("MEMBER_NOT_ELIGIBLE");

    const leaderBAdd = await asActor("leader-b-token", "post", attendanceBPath).send({
      memberId: memberBId,
    });
    expect(leaderBAdd.status).toBe(201);
    const adminRosterB = await asActor("admin-token", "get", attendanceBPath);
    expect(adminRosterB.body.data.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: memberBId, isEligible: true, isPresent: true }),
      ]),
    );
    expect(
      (
        await asActor(
          "leader-b-token",
          "delete",
          `${attendanceBPath}/${memberBId}`,
        )
      ).status,
    ).toBe(200);

    const { error: moveError } = await adminClient
      .from("members")
      .update({ life_group_id: groupBId })
      .in("id", [memberAId, movedWithoutAttendanceId]);
    if (moveError) throw moveError;

    const historicalRoster = await asActor("leader-a-token", "get", attendanceAPath);
    expect(historicalRoster.status).toBe(200);
    expect(historicalRoster.body.data.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          currentLifeGroup: expect.objectContaining({ id: groupBId }),
          id: memberAId,
          isEligible: false,
          isPresent: true,
        }),
      ]),
    );
    const movedNewAttendance = await asActor(
      "admin-token",
      "post",
      attendanceAPath,
    ).send({ memberId: movedWithoutAttendanceId });
    expect(movedNewAttendance.status).toBe(422);
    const removedHistorical = await asActor(
      "leader-a-token",
      "delete",
      `${attendanceAPath}/${memberAId}`,
    );
    expect(removedHistorical.status).toBe(200);

    const { error: archiveError } = await adminClient
      .from("life_groups")
      .update({ is_active: false })
      .eq("id", groupBId);
    if (archiveError) throw archiveError;
    const inactiveCreate = await asActor("admin-token", "post", groupBPath).send({
      gatheringDate: "2026-08-20",
    });
    expect(inactiveCreate.status).toBe(422);
    expect(inactiveCreate.body.error.code).toBe("INACTIVE_LIFE_GROUP");
    expect((await asActor("admin-token", "get", `${groupBPath}/${gatheringBId}`)).status).toBe(200);
    expect((await asActor("leader-b-token", "get", `${groupBPath}/${gatheringBId}`)).status).toBe(200);
    expect(
      (
        await asActor("leader-b-token", "patch", `${groupBPath}/${gatheringBId}`).send({
          notes: "Historical correction after group archive",
        })
      ).status,
    ).toBe(200);
  });
});
