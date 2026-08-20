import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import { createSupabaseMemberService } from "../members/supabase-member-service.js";
import type { Database } from "../types/database.types.js";
import { createSupabaseVisitorService } from "./supabase-visitor-service.js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasLocalIntegrationConfig = Boolean(supabaseUrl && serviceRoleKey);
const integrationSupabaseUrl = supabaseUrl ?? "http://127.0.0.1:54321";
const integrationServiceRoleKey = serviceRoleKey ?? "integration-key-unavailable";
const describeWithLocalSupabase = hasLocalIntegrationConfig ? describe : describe.skip;

describeWithLocalSupabase("Visitor API with local Supabase", () => {
  const adminClient = createClient<Database>(integrationSupabaseUrl, integrationServiceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const createdUserIds: string[] = [];
  const createdLifeGroupIds: string[] = [];
  const createdVisitorIds: string[] = [];
  const createdMemberIds: string[] = [];

  afterEach(async () => {
    if (createdVisitorIds.length) {
      const { error } = await adminClient.from("visitors").delete().in("id", createdVisitorIds);
      if (error) throw error;
      createdVisitorIds.length = 0;
    }
    if (createdMemberIds.length) {
      const { error } = await adminClient.from("members").delete().in("id", createdMemberIds);
      if (error) throw error;
      createdMemberIds.length = 0;
    }
    if (createdLifeGroupIds.length) {
      const { error } = await adminClient.from("life_groups").delete().in("id", createdLifeGroupIds);
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
      email: `visitors-${randomUUID()}@example.test`, email_confirm: true,
      password: `${randomUUID()}-Aa1!`, user_metadata: { name },
    });
    if (error || !data.user) throw error ?? new Error("User was not created.");
    createdUserIds.push(data.user.id);
    const { error: profileError } = await adminClient.from("profiles").update({ role }).eq("id", data.user.id);
    if (profileError) throw profileError;
    return data.user.id;
  }

  async function createLifeGroup(name: string, leaderProfileId: string, isActive = true) {
    const { data, error } = await adminClient.from("life_groups")
      .insert({ is_active: isActive, leader_profile_id: leaderProfileId, name }).select("id").single();
    if (error) throw error;
    createdLifeGroupIds.push(data.id);
    return data.id;
  }

  function trackVisitor(response: { body: { data?: { id?: string; visitor?: { id?: string }; member?: { id?: string } } } }) {
    const visitorId = response.body.data?.visitor?.id ?? response.body.data?.id;
    const memberId = response.body.data?.member?.id;
    if (visitorId && !createdVisitorIds.includes(visitorId)) createdVisitorIds.push(visitorId);
    if (memberId && !createdMemberIds.includes(memberId)) createdMemberIds.push(memberId);
    return visitorId;
  }

  it("enforces lifecycle, duplicates, visibility, conversion scope, conflicts, and atomic concurrency", async () => {
    const adminId = await createProfile("Visitor Admin", "admin");
    const leaderAId = await createProfile("Visitor Leader A", "leader");
    const leaderBId = await createProfile("Visitor Leader B", "leader");
    const inactiveLeaderId = await createProfile("Visitor Inactive Leader", "leader");
    const groupAId = await createLifeGroup("Visitor Group A", leaderAId);
    const groupBId = await createLifeGroup("Visitor Group B", leaderBId);
    const inactiveGroupId = await createLifeGroup("Visitor Inactive", inactiveLeaderId, false);
    const actors: Record<string, HorizonActor> = {
      "admin-token": { id: adminId, isActive: true, name: "Visitor Admin", role: "admin" },
      "leader-a-token": { id: leaderAId, isActive: true, name: "Visitor Leader A", role: "leader" },
      "leader-b-token": { id: leaderBId, isActive: true, name: "Visitor Leader B", role: "leader" },
    };
    const authService: AuthService = { authenticate: async (token) => ({ actor: actors[token]!, ok: true }) };
    const memberService = createSupabaseMemberService({ serviceRoleKey: integrationServiceRoleKey, supabaseUrl: integrationSupabaseUrl });
    const visitorService = createSupabaseVisitorService({ memberService, serviceRoleKey: integrationServiceRoleKey, supabaseUrl: integrationSupabaseUrl });
    const app = createApp({ authService, memberService, visitorService });
    const asActor = (token: string, method: "get" | "patch" | "post", path: string) =>
      request(app)[method](path).set("Authorization", `Bearer ${token}`);

    const first = await asActor("leader-a-token", "post", "/api/visitors").send({
      email: "  VISITOR.ONE@Example.Test ", firstName: "Visitor", lastName: "One", phone: "0917 111 2233",
    });
    expect(first.status).toBe(201);
    const firstId = trackVisitor(first)!;
    const nameOnly = await asActor("admin-token", "post", "/api/visitors").send({ firstName: "Visitor", lastName: "One" });
    expect(nameOnly.status).toBe(201);
    trackVisitor(nameOnly);

    const duplicateEmail = await asActor("admin-token", "post", "/api/visitors").send({ email: "visitor.one@example.test", firstName: "Other", lastName: "Email" });
    const duplicatePhone = await asActor("admin-token", "post", "/api/visitors").send({ firstName: "Other", lastName: "Phone", phone: "+63 (917) 111-2233" });
    expect(duplicateEmail.body.error.code).toBe("DUPLICATE_VISITOR_EMAIL");
    expect(duplicatePhone.body.error.code).toBe("DUPLICATE_VISITOR_PHONE");

    const edited = await asActor("leader-a-token", "patch", `/api/visitors/${firstId}`).send({ firstName: "Maria" });
    expect(edited.status).toBe(200);
    const leaderList = await asActor("leader-a-token", "get", "/api/visitors?status=converted&search=Maria");
    expect(leaderList.body.data).toEqual([expect.objectContaining({ id: firstId, status: "active" })]);

    const wrongGroup = await asActor("leader-a-token", "post", `/api/visitors/${firstId}/convert`).send({ lifeGroupId: groupBId });
    const inactiveGroup = await asActor("admin-token", "post", `/api/visitors/${firstId}/convert`).send({ lifeGroupId: inactiveGroupId });
    expect(wrongGroup.status).toBe(403);
    expect(inactiveGroup.status).toBe(422);

    const converted = await asActor("leader-a-token", "post", `/api/visitors/${firstId}/convert`).send({ lifeGroupId: groupAId });
    expect(converted.status).toBe(201);
    trackVisitor(converted);
    expect(converted.body.data.visitor).toMatchObject({ convertedMemberId: converted.body.data.member.id, id: firstId, status: "converted" });
    expect(converted.body.data.member).toMatchObject({ address: null, birthDate: null, email: "VISITOR.ONE@Example.Test", firstName: "Maria", gender: null, isActive: true, lastName: "One", lifeGroup: { id: groupAId }, phone: "0917 111 2233" });
    expect(converted.body.data.member.qrToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const leaderHiddenList = await asActor("leader-a-token", "get", "/api/visitors?status=all&search=Maria");
    const leaderHiddenDetail = await asActor("leader-a-token", "get", `/api/visitors/${firstId}`);
    const adminConvertedList = await asActor("admin-token", "get", "/api/visitors?status=converted&search=Maria");
    const adminConvertedDetail = await asActor("admin-token", "get", `/api/visitors/${firstId}`);
    expect(leaderHiddenList.body.data).toEqual([]);
    expect(leaderHiddenDetail.status).toBe(404);
    expect(adminConvertedList.body.data).toEqual([expect.objectContaining({ id: firstId, status: "converted" })]);
    expect(adminConvertedDetail.status).toBe(200);
    expect((await asActor("admin-token", "patch", `/api/visitors/${firstId}`).send({ firstName: "No" })).status).toBe(409);
    expect((await asActor("admin-token", "post", `/api/visitors/${firstId}/convert`).send({ lifeGroupId: groupAId })).status).toBe(409);

    const conflictEmail = `member-conflict-${randomUUID()}@example.test`;
    const { data: conflictMember, error: conflictError } = await adminClient.from("members").insert({
      email: conflictEmail, first_name: "Existing", is_active: false, last_name: "Archived", life_group_id: groupBId, qr_token: randomUUID(),
    }).select("id").single();
    if (conflictError) throw conflictError;
    createdMemberIds.push(conflictMember.id);
    const conflictVisitor = await asActor("leader-a-token", "post", "/api/visitors").send({ email: conflictEmail.toUpperCase(), firstName: "Needs", lastName: "Conversion" });
    const conflictVisitorId = trackVisitor(conflictVisitor)!;
    const conflictResult = await asActor("leader-a-token", "post", `/api/visitors/${conflictVisitorId}/convert`).send({ lifeGroupId: groupAId });
    expect(conflictResult.status).toBe(409);
    expect(conflictResult.body.error.code).toBe("DUPLICATE_MEMBER_EMAIL");
    expect(conflictResult.body.error.message).toBe("A Member with this email address already exists. Conversion cannot continue.");
    const { data: unchangedVisitor } = await adminClient.from("visitors").select("status, converted_member_id").eq("id", conflictVisitorId).single();
    expect(unchangedVisitor).toEqual({ converted_member_id: null, status: "active" });

    const visiblePhone = `0918${Math.floor(1000000 + Math.random() * 8999999)}`;
    const { data: visibleMember, error: visibleMemberError } = await adminClient.from("members").insert({
      first_name: "Existing", last_name: "Visible", life_group_id: groupAId,
      phone: visiblePhone, qr_token: randomUUID(),
    }).select("id").single();
    if (visibleMemberError) throw visibleMemberError;
    createdMemberIds.push(visibleMember.id);
    const visibleConflictVisitor = await asActor("leader-a-token", "post", "/api/visitors").send({
      firstName: "Visible", lastName: "Conflict", phone: `+63${visiblePhone.slice(1)}`,
    });
    const visibleConflictVisitorId = trackVisitor(visibleConflictVisitor)!;
    const visibleConflict = await asActor("leader-a-token", "post", `/api/visitors/${visibleConflictVisitorId}/convert`).send({ lifeGroupId: groupAId });
    expect(visibleConflict.status).toBe(409);
    expect(visibleConflict.body.error.code).toBe("DUPLICATE_MEMBER_PHONE");
    expect(visibleConflict.body.error.message).toContain("Existing Visible");
    expect(visibleConflict.body.error.message).toContain("Visitor Group A");

    const concurrentVisitor = await asActor("admin-token", "post", "/api/visitors").send({ firstName: "Concurrent", lastName: "Convert" });
    const concurrentId = trackVisitor(concurrentVisitor)!;
    const concurrent = await Promise.all([
      asActor("admin-token", "post", `/api/visitors/${concurrentId}/convert`).send({ lifeGroupId: groupAId }),
      asActor("admin-token", "post", `/api/visitors/${concurrentId}/convert`).send({ lifeGroupId: groupAId }),
    ]);
    expect(concurrent.map(({ status }) => status).sort()).toEqual([201, 409]);
    concurrent.forEach(trackVisitor);
    const { count, error: countError } = await adminClient.from("members").select("id", { count: "exact", head: true }).eq("first_name", "Concurrent").eq("last_name", "Convert");
    if (countError) throw countError;
    expect(count).toBe(1);
  });
});
