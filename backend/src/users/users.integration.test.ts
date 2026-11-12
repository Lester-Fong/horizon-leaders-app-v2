import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { createSupabaseAuthService } from "../auth/supabase-auth-service.js";
import type { Database } from "../types/database.types.js";
import { createSupabaseUserService } from "./supabase-user-service.js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
const hasLocalIntegrationConfig = Boolean(supabaseUrl && serviceRoleKey && publicKey);
const integrationSupabaseUrl = supabaseUrl ?? "http://127.0.0.1:54321";
const integrationServiceRoleKey = serviceRoleKey ?? "integration-key-unavailable";
const integrationPublicKey = publicKey ?? "integration-key-unavailable";
const describeWithLocalSupabase = hasLocalIntegrationConfig ? describe : describe.skip;

const clientOptions = {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
};

describeWithLocalSupabase("Users API with local Supabase", () => {
  const adminClient = createClient<Database>(
    integrationSupabaseUrl,
    integrationServiceRoleKey,
    clientOptions,
  );
  const app = createApp({
    authService: createSupabaseAuthService({
      serviceRoleKey: integrationServiceRoleKey,
      supabaseUrl: integrationSupabaseUrl,
    }),
    userService: createSupabaseUserService({
      serviceRoleKey: integrationServiceRoleKey,
      supabaseUrl: integrationSupabaseUrl,
    }),
  });
  const createdUserIds = new Set<string>();
  const createdLifeGroupIds: string[] = [];

  afterEach(async () => {
    if (createdLifeGroupIds.length > 0) {
      const { error } = await adminClient
        .from("life_groups")
        .delete()
        .in("id", createdLifeGroupIds.splice(0));
      if (error) throw error;
    }
    for (const userId of createdUserIds) {
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error && error.status !== 404) throw error;
    }
    createdUserIds.clear();
  });

  function uniqueEmail(label: string) {
    return `users-${label}-${randomUUID()}@example.test`;
  }

  async function signIn(email: string, password: string) {
    const browserClient = createClient<Database>(
      integrationSupabaseUrl,
      integrationPublicKey,
      clientOptions,
    );
    const { data, error } = await browserClient.auth.signInWithPassword({ email, password });
    return { error, token: data.session?.access_token };
  }

  async function createAdminSession() {
    const email = uniqueEmail("admin");
    const password = `Aa1-${randomUUID()}`;
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
      user_metadata: { name: "Integration Admin" },
    });
    if (error || !data.user) throw error ?? new Error("Admin was not created.");
    createdUserIds.add(data.user.id);

    const { error: roleError } = await adminClient
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", data.user.id);
    if (roleError) throw roleError;

    const { token } = await signIn(email, password);
    if (!token) throw new Error("Admin could not sign in.");

    return { id: data.user.id, token };
  }

  it("manages a staff account through its whole lifecycle", async () => {
    const admin = await createAdminSession();
    const auth = { Authorization: `Bearer ${admin.token}` };
    const email = uniqueEmail("leader");
    const initialPassword = "Welcome2Horizon";

    const created = await request(app).post("/api/users").set(auth).send({
      email: email.toUpperCase(),
      name: "Integration Leader",
      password: initialPassword,
      role: "leader",
    });
    expect(created.status).toBe(201);
    const userId: string = created.body.data.id;
    createdUserIds.add(userId);
    expect(created.body.data).toMatchObject({
      assignedLifeGroup: null,
      email,
      isActive: true,
      name: "Integration Leader",
      role: "leader",
    });

    const duplicate = await request(app).post("/api/users").set(auth).send({
      email,
      name: "Duplicate",
      password: initialPassword,
      role: "leader",
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("EMAIL_ALREADY_REGISTERED");

    const firstLogin = await signIn(email, initialPassword);
    expect(firstLogin.error).toBeNull();
    const me = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${firstLogin.token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.role).toBe("leader");

    const listed = await request(app).get(`/api/users?status=all&search=${email}`).set(auth);
    expect(listed.status).toBe(200);
    expect(listed.body.data.map((user: { id: string }) => user.id)).toEqual([userId]);

    const updated = await request(app)
      .patch(`/api/users/${userId}`)
      .set(auth)
      .send({ name: "Renamed Leader", role: "admin" });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ name: "Renamed Leader", role: "admin" });

    const deactivated = await request(app)
      .patch(`/api/users/${userId}/status`)
      .set(auth)
      .send({ isActive: false });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.data.isActive).toBe(false);
    const blocked = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${firstLogin.token}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("ACCOUNT_INACTIVE");

    const inactiveList = await request(app).get(`/api/users?status=inactive&search=${email}`).set(auth);
    expect(inactiveList.body.data).toHaveLength(1);

    const newPassword = "Changed2Horizon";
    const reset = await request(app)
      .put(`/api/users/${userId}/password`)
      .set(auth)
      .send({ password: newPassword });
    expect(reset.status).toBe(200);
    expect((await signIn(email, initialPassword)).error).not.toBeNull();
    expect((await signIn(email, newPassword)).error).toBeNull();

    const removed = await request(app).delete(`/api/users/${userId}`).set(auth);
    expect(removed.status).toBe(200);
    const { data: profile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    expect(profile).toBeNull();
    const missing = await request(app).get(`/api/users/${userId}`).set(auth);
    expect(missing.status).toBe(404);
  });

  it("keeps history-bearing and own accounts safe", async () => {
    const admin = await createAdminSession();
    const auth = { Authorization: `Bearer ${admin.token}` };

    const leader = await request(app).post("/api/users").set(auth).send({
      email: uniqueEmail("assigned"),
      name: "Assigned Leader",
      password: "Welcome2Horizon",
      role: "leader",
    });
    expect(leader.status).toBe(201);
    const leaderId: string = leader.body.data.id;
    createdUserIds.add(leaderId);

    const { data: group, error: groupError } = await adminClient
      .from("life_groups")
      .insert({ leader_profile_id: leaderId, name: `Users Group ${randomUUID()}` })
      .select("id, name")
      .single();
    if (groupError) throw groupError;
    createdLifeGroupIds.push(group.id);

    const assigned = await request(app).get(`/api/users/${leaderId}`).set(auth);
    expect(assigned.body.data.assignedLifeGroup).toMatchObject({ id: group.id, name: group.name });

    const blockedDelete = await request(app).delete(`/api/users/${leaderId}`).set(auth);
    expect(blockedDelete.status).toBe(409);
    expect(blockedDelete.body.error.code).toBe("USER_HAS_HISTORY");

    // Allowed with a UI warning: the Life Group keeps its pointer until reassigned.
    const promoted = await request(app)
      .patch(`/api/users/${leaderId}`)
      .set(auth)
      .send({ role: "admin" });
    expect(promoted.status).toBe(200);
    expect(promoted.body.data.assignedLifeGroup?.id).toBe(group.id);

    const ownRole = await request(app)
      .patch(`/api/users/${admin.id}`)
      .set(auth)
      .send({ role: "leader" });
    const ownStatus = await request(app)
      .patch(`/api/users/${admin.id}/status`)
      .set(auth)
      .send({ isActive: false });
    const ownDelete = await request(app).delete(`/api/users/${admin.id}`).set(auth);
    for (const response of [ownRole, ownStatus, ownDelete]) {
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("CANNOT_MODIFY_OWN_ACCOUNT");
    }
  });
});
