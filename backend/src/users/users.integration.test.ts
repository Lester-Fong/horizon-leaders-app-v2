import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { createSupabaseAuthService } from "../auth/supabase-auth-service.js";
import { createSupabaseLifeGroupService } from "../life-groups/supabase-life-group-service.js";
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
  const lifeGroupService = createSupabaseLifeGroupService({
    serviceRoleKey: integrationServiceRoleKey,
    supabaseUrl: integrationSupabaseUrl,
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

    const temporaryLogin = await signIn(email, initialPassword);
    expect(temporaryLogin.error).toBeNull();
    const temporaryAuth = { Authorization: `Bearer ${temporaryLogin.token}` };
    const me = await request(app).get("/api/me").set(temporaryAuth);
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ mustChangePassword: true, role: "leader" });

    // An Admin-set password only unlocks the password-change routes.
    const gated = await request(app).get("/api/members").set(temporaryAuth);
    expect(gated.status).toBe(403);
    expect(gated.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect((await request(app).get("/api/me/profile").set(temporaryAuth)).status).toBe(200);

    const wrongCurrent = await request(app)
      .put("/api/me/password")
      .set(temporaryAuth)
      .send({ currentPassword: "Wrong2Horizon", newPassword: "Personal3Horizon" });
    expect(wrongCurrent.status).toBe(422);
    expect(wrongCurrent.body.error.code).toBe("CURRENT_PASSWORD_INCORRECT");

    const personalPassword = "Personal3Horizon";
    const changedOwn = await request(app)
      .put("/api/me/password")
      .set(temporaryAuth)
      .send({ currentPassword: initialPassword, newPassword: personalPassword });
    expect(changedOwn.status).toBe(200);
    expect((await request(app).get("/api/me").set(temporaryAuth)).status).toBe(401);

    const firstLogin = await signIn(email, personalPassword);
    expect(firstLogin.error).toBeNull();
    const unlocked = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${firstLogin.token}`);
    expect(unlocked.body.data.mustChangePassword).toBe(false);

    const listed = await request(app).get(`/api/users?status=all&search=${email}`).set(auth);
    expect(listed.status).toBe(200);
    expect(listed.body.data.map((user: { id: string }) => user.id)).toEqual([userId]);

    const updated = await request(app)
      .patch(`/api/users/${userId}`)
      .set(auth)
      .send({ name: "Renamed Leader", role: "admin" });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ name: "Renamed Leader", role: "admin" });

    // A rejected email change leaves the Profile untouched.
    const otherAdmin = await createAdminSession();
    const { data: otherAuth } = await adminClient.auth.admin.getUserById(otherAdmin.id);
    const conflicting = await request(app)
      .patch(`/api/users/${userId}`)
      .set(auth)
      .send({ email: otherAuth.user?.email, name: "Should Roll Back" });
    expect(conflicting.status).toBe(409);
    expect(conflicting.body.error.code).toBe("EMAIL_ALREADY_REGISTERED");
    const unchanged = await request(app).get(`/api/users/${userId}`).set(auth);
    expect(unchanged.body.data).toMatchObject({ email, name: "Renamed Leader" });

    const deactivated = await request(app)
      .patch(`/api/users/${userId}/status`)
      .set(auth)
      .send({ isActive: false });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.data.isActive).toBe(false);
    // Deactivation signs the user out everywhere, so the old session cannot resume.
    const revoked = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${firstLogin.token}`);
    expect(revoked.status).toBe(401);
    const inactiveLogin = await signIn(email, personalPassword);
    const blocked = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${inactiveLogin.token}`);
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
    // A password reset signs out sessions created with the old password.
    const afterReset = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${inactiveLogin.token}`);
    expect(afterReset.status).toBe(401);
    expect((await signIn(email, personalPassword)).error).not.toBeNull();
    expect((await signIn(email, newPassword)).error).toBeNull();
    // The reset password is temporary again.
    const { data: resetAuthUser } = await adminClient.auth.admin.getUserById(userId);
    expect(resetAuthUser.user?.app_metadata.must_change_password).toBe(true);

    const activity = await request(app).get(`/api/users/${userId}/activity`).set(auth);
    expect(activity.status).toBe(200);
    expect(activity.body.data.map((event: { action: string }) => event.action).sort()).toEqual([
      "password_changed",
      "password_reset",
      "user_created",
      "user_deactivated",
      "user_updated",
    ]);
    const roleChange = activity.body.data.find(
      (event: { action: string }) => event.action === "user_updated",
    );
    expect(roleChange).toMatchObject({
      actorId: admin.id,
      details: { changes: { role: { from: "leader", to: "admin" } } },
    });

    // Deleting a user with no Horizon history is a soft delete too: the Profile is kept.
    const removed = await request(app).delete(`/api/users/${userId}`).set(auth);
    expect(removed.status).toBe(200);
    const { data: profile } = await adminClient
      .from("profiles")
      .select("id, is_active, deleted_at")
      .eq("id", userId)
      .single();
    expect(profile).toMatchObject({ id: userId, is_active: false });
    expect(profile?.deleted_at).not.toBeNull();
    const kept = await request(app).get(`/api/users/${userId}`).set(auth);
    expect(kept.status).toBe(200);
    expect(kept.body.data).toMatchObject({ email, isActive: false });
    expect(kept.body.data.deletedAt).not.toBeNull();
  });

  it("deletes a Leader's sign-in but keeps their history", async () => {
    const admin = await createAdminSession();
    const auth = { Authorization: `Bearer ${admin.token}` };
    const email = uniqueEmail("history");
    const password = "Welcome2Horizon";

    const leader = await request(app).post("/api/users").set(auth).send({
      email,
      name: "History Leader",
      password,
      role: "leader",
    });
    expect(leader.status).toBe(201);
    const leaderId: string = leader.body.data.id;
    createdUserIds.add(leaderId);

    const { data: group, error: groupError } = await adminClient
      .from("life_groups")
      .insert({ leader_profile_id: leaderId, name: `Users Group ${randomUUID()}` })
      .select("id")
      .single();
    if (groupError) throw groupError;
    createdLifeGroupIds.push(group.id);

    const leaderLogin = await signIn(email, password);
    expect(leaderLogin.error).toBeNull();
    const leaderAuth = { Authorization: `Bearer ${leaderLogin.token}` };
    expect((await request(app).get("/api/me").set(leaderAuth)).status).toBe(200);

    const removed = await request(app).delete(`/api/users/${leaderId}`).set(auth);
    expect(removed.status).toBe(200);

    const { data: profile } = await adminClient
      .from("profiles")
      .select("is_active, deleted_at")
      .eq("id", leaderId)
      .single();
    expect(profile?.is_active).toBe(false);
    expect(profile?.deleted_at).not.toBeNull();

    const { data: authAfter } = await adminClient.auth.admin.getUserById(leaderId);
    expect(authAfter.user?.email).toBe(`deleted+${leaderId}@deleted.invalid`);
    expect(authAfter.user?.app_metadata).toMatchObject({ deleted: true, deleted_email: email });
    expect(Date.parse(authAfter.user?.banned_until ?? "")).toBeGreaterThan(
      Date.now() + 50 * 365 * 24 * 60 * 60 * 1000,
    );

    // The old password and the pre-delete session no longer work.
    expect((await signIn(email, password)).error).not.toBeNull();
    expect([401, 403]).toContain((await request(app).get("/api/me").set(leaderAuth)).status);

    // The Life Group still points at the deleted Leader, who is flagged as deleted.
    const { data: groupAfter } = await adminClient
      .from("life_groups")
      .select("leader_profile_id")
      .eq("id", group.id)
      .single();
    expect(groupAfter?.leader_profile_id).toBe(leaderId);
    const lifeGroup = await lifeGroupService.getById(group.id);
    expect(lifeGroup.leader).toMatchObject({ id: leaderId, isActive: false, isDeleted: true });
    const options = await lifeGroupService.listLeaderOptions();
    expect(options.find((option) => option.id === leaderId)?.isDeleted).toBe(true);

    const deletedList = await request(app)
      .get(`/api/users?status=deleted&search=${encodeURIComponent(email)}`)
      .set(auth);
    expect(deletedList.status).toBe(200);
    expect(deletedList.body.data).toHaveLength(1);
    expect(deletedList.body.data[0]).toMatchObject({ email, id: leaderId, isActive: false });
    for (const status of ["all", "inactive", "active"]) {
      const listed = await request(app)
        .get(`/api/users?status=${status}&search=${encodeURIComponent(email)}`)
        .set(auth);
      expect(listed.body.data).toEqual([]);
    }

    const mutations = [
      await request(app).patch(`/api/users/${leaderId}`).set(auth).send({ name: "Changed" }),
      await request(app).patch(`/api/users/${leaderId}/status`).set(auth).send({ isActive: true }),
      await request(app).put(`/api/users/${leaderId}/password`).set(auth).send({ password }),
      await request(app).delete(`/api/users/${leaderId}`).set(auth),
    ];
    for (const response of mutations) {
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("USER_DELETED");
    }

    const activity = await request(app).get(`/api/users/${leaderId}/activity`).set(auth);
    expect(activity.status).toBe(200);
    const deletion = activity.body.data.find(
      (event: { action: string }) => event.action === "user_deleted",
    );
    expect(deletion).toMatchObject({
      actorId: admin.id,
      details: { email, mode: "soft", role: "leader", wasActive: true },
    });

    // The original email is free for a new account.
    const replacement = await request(app).post("/api/users").set(auth).send({
      email,
      name: "Replacement Leader",
      password,
      role: "leader",
    });
    expect(replacement.status).toBe(201);
    createdUserIds.add(replacement.body.data.id);
    expect(replacement.body.data.id).not.toBe(leaderId);
    expect((await signIn(email, password)).error).toBeNull();
  });

  it("lets an Admin deactivate another Admin while an active Admin remains", async () => {
    const admin = await createAdminSession();
    const otherAdmin = await createAdminSession();
    const auth = { Authorization: `Bearer ${admin.token}` };

    const deactivated = await request(app)
      .patch(`/api/users/${otherAdmin.id}/status`)
      .set(auth)
      .send({ isActive: false });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.data).toMatchObject({ isActive: false, role: "admin" });
  });

  it("keeps assigned and own accounts safe", async () => {
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
    // Both skip re-authentication, so an Admin cannot use them on their own account.
    const ownReset = await request(app)
      .put(`/api/users/${admin.id}/password`)
      .set(auth)
      .send({ password: "Changed2Horizon" });
    const ownEmail = await request(app)
      .patch(`/api/users/${admin.id}`)
      .set(auth)
      .send({ email: uniqueEmail("self") });
    for (const response of [ownRole, ownStatus, ownDelete, ownReset, ownEmail]) {
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("CANNOT_MODIFY_OWN_ACCOUNT");
    }
    expect(ownReset.body.error.message).toBe("Use My profile to change your own password.");
    expect(ownEmail.body.error.message).toBe("Ask another Admin to change your sign-in email.");

    // The Admin's session survived both rejections, and renaming yourself still works.
    const { data: ownAuth } = await adminClient.auth.admin.getUserById(admin.id);
    const ownRename = await request(app)
      .patch(`/api/users/${admin.id}`)
      .set(auth)
      .send({ email: ownAuth.user?.email, name: "Renamed Admin" });
    expect(ownRename.status).toBe(200);
    expect(ownRename.body.data).toMatchObject({
      email: ownAuth.user?.email,
      name: "Renamed Admin",
    });
  });
});
