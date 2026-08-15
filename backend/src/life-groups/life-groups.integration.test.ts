import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import type { Database } from "../types/database.types.js";
import { createSupabaseLifeGroupService } from "./supabase-life-group-service.js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasLocalIntegrationConfig = Boolean(supabaseUrl && serviceRoleKey);
const integrationSupabaseUrl = supabaseUrl ?? "http://127.0.0.1:54321";
const integrationServiceRoleKey = serviceRoleKey ?? "integration-key-unavailable";
const describeWithLocalSupabase = hasLocalIntegrationConfig
  ? describe
  : describe.skip;

describeWithLocalSupabase("Life Group API with local Supabase", () => {
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

  afterEach(async () => {
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

  async function createProfile(
    name: string,
    role: "admin" | "leader" = "leader",
    isActive = true,
  ) {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: `life-groups-${randomUUID()}@example.test`,
      email_confirm: true,
      password: `${randomUUID()}-Aa1!`,
      user_metadata: { name },
    });
    if (error || !data.user) throw error ?? new Error("User was not created.");
    createdUserIds.push(data.user.id);

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ is_active: isActive, role })
      .eq("id", data.user.id);
    if (profileError) throw profileError;

    return data.user.id;
  }

  it("enforces the Admin lifecycle and Leader read-only boundary", async () => {
    const adminId = await createProfile("Integration Admin", "admin");
    const leaderAId = await createProfile("Leader A");
    const inactiveLeaderId = await createProfile(
      "Inactive Leader",
      "leader",
      false,
    );
    const leaderBId = await createProfile("Leader B");
    const leaderCId = await createProfile("Leader C");

    const actors: Record<string, HorizonActor> = {
      "admin-token": {
        id: adminId,
        isActive: true,
        name: "Integration Admin",
        role: "admin",
      },
      "leader-token": {
        id: leaderAId,
        isActive: true,
        name: "Leader A",
        role: "leader",
      },
    };
    const authService: AuthService = {
      authenticate: async (token) => ({ actor: actors[token]!, ok: true }),
    };
    const lifeGroupService = createSupabaseLifeGroupService({
      serviceRoleKey: integrationServiceRoleKey,
      supabaseUrl: integrationSupabaseUrl,
    });
    const app = createApp({ authService, lifeGroupService });
    const asAdmin = (method: "get" | "patch" | "post", path: string) =>
      request(app)[method](path).set("Authorization", "Bearer admin-token");
    const asLeader = (method: "get" | "patch" | "post", path: string) =>
      request(app)[method](path).set("Authorization", "Bearer leader-token");

    const created = await asAdmin("post", "/api/life-groups").send({
      description: "Integration lifecycle group",
      leaderProfileId: leaderAId,
      name: "Integration North",
    });
    expect(created.status).toBe(201);
    createdLifeGroupIds.push(created.body.data.id);

    const duplicate = await asAdmin("post", "/api/life-groups").send({
      description: null,
      leaderProfileId: leaderAId,
      name: "Duplicate assignment",
    });
    const inactive = await asAdmin("post", "/api/life-groups").send({
      description: null,
      leaderProfileId: inactiveLeaderId,
      name: "Inactive assignment",
    });
    const wrongRole = await asAdmin("post", "/api/life-groups").send({
      description: null,
      leaderProfileId: adminId,
      name: "Admin assignment",
    });
    const missing = await asAdmin("post", "/api/life-groups").send({
      description: null,
      leaderProfileId: randomUUID(),
      name: "Missing assignment",
    });
    expect(duplicate.body.error.code).toBe("LEADER_ALREADY_ASSIGNED");
    expect(inactive.body.error.code).toBe("LEADER_INACTIVE");
    expect(wrongRole.body.error.code).toBe("LEADER_ROLE_REQUIRED");
    expect(missing.body.error.code).toBe("LEADER_NOT_FOUND");

    const second = await asAdmin("post", "/api/life-groups").send({
      description: null,
      leaderProfileId: leaderBId,
      name: "Integration South",
    });
    expect(second.status).toBe(201);
    createdLifeGroupIds.push(second.body.data.id);

    const conflictingReassignment = await asAdmin(
      "patch",
      `/api/life-groups/${created.body.data.id}`,
    ).send({ leaderProfileId: leaderBId });
    expect(conflictingReassignment.status).toBe(409);

    const edited = await asAdmin(
      "patch",
      `/api/life-groups/${created.body.data.id}`,
    ).send({
      description: "Updated description",
      leaderProfileId: leaderCId,
      name: "Integration North Updated",
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data.leader.id).toBe(leaderCId);

    const archived = await asAdmin(
      "patch",
      `/api/life-groups/${created.body.data.id}/status`,
    ).send({ isActive: false });
    expect(archived.body.data.isActive).toBe(false);

    const adminList = await asAdmin("get", "/api/life-groups");
    const leaderList = await asLeader("get", "/api/life-groups");
    const leaderArchivedDetail = await asLeader(
      "get",
      `/api/life-groups/${created.body.data.id}`,
    );
    const leaderMutation = await asLeader(
      "patch",
      `/api/life-groups/${second.body.data.id}`,
    ).send({ name: "Forbidden change" });
    expect(adminList.body.data).toHaveLength(2);
    expect(leaderList.body.data).toHaveLength(1);
    expect(leaderArchivedDetail.status).toBe(404);
    expect(leaderMutation.status).toBe(403);

    const reactivated = await asAdmin(
      "patch",
      `/api/life-groups/${created.body.data.id}/status`,
    ).send({ isActive: true });
    expect(reactivated.body.data.isActive).toBe(true);

    const options = await asAdmin("get", "/api/life-groups/leaders");
    expect(options.status).toBe(200);
    expect(options.body.data).toHaveLength(4);
    expect(options.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: adminId })]),
    );
  });
});
