import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import { createSupabaseMemberService } from "../members/supabase-member-service.js";
import type { Database } from "../types/database.types.js";
import { createSupabaseVisitorService } from "../visitors/supabase-visitor-service.js";
import { createSupabaseOpenCellService } from "./supabase-opencell-service.js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeLocal = supabaseUrl && serviceRoleKey ? describe : describe.skip;

describeLocal("OpenCell concurrency with local Supabase", () => {
  const client = createClient<Database>(supabaseUrl!, serviceRoleKey!, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const userIds: string[] = [];
  const lifeGroupIds: string[] = [];
  const memberIds: string[] = [];
  const programmeIds: string[] = [];
  const visitorIds: string[] = [];

  afterEach(async () => {
    if (programmeIds.length) {
      const { error } = await client
        .from("opencell_enrollments")
        .delete()
        .in("programme_id", programmeIds);
      if (error) throw error;
      const { error: programmeError } = await client
        .from("opencell_programmes")
        .delete()
        .in("id", programmeIds.splice(0));
      if (programmeError) throw programmeError;
    }
    if (visitorIds.length) {
      const { error } = await client.from("visitors").delete().in("id", visitorIds.splice(0));
      if (error) throw error;
    }
    if (memberIds.length) {
      const { error } = await client.from("members").delete().in("id", memberIds.splice(0));
      if (error) throw error;
    }
    if (lifeGroupIds.length) {
      const { error } = await client
        .from("life_groups")
        .delete()
        .in("id", lifeGroupIds.splice(0));
      if (error) throw error;
    }
    for (const userId of userIds.splice(0).reverse()) {
      const { error } = await client.auth.admin.deleteUser(userId);
      if (error) throw error;
    }
  });

  it("allows exactly one outcome when enrollment races Visitor conversion", async () => {
    const { data: authData, error: authError } = await client.auth.admin.createUser({
      email: `opencell-race-${randomUUID()}@example.test`,
      email_confirm: true,
      password: `${randomUUID()}-Aa1!`,
      user_metadata: { name: "OpenCell Race Leader" },
    });
    if (authError || !authData.user) throw authError ?? new Error("User missing");
    userIds.push(authData.user.id);
    const { error: profileError } = await client
      .from("profiles")
      .update({ role: "leader" })
      .eq("id", authData.user.id);
    if (profileError) throw profileError;

    const { data: group, error: groupError } = await client
      .from("life_groups")
      .insert({
        leader_profile_id: authData.user.id,
        name: `OpenCell Race ${randomUUID()}`,
      })
      .select("id")
      .single();
    if (groupError) throw groupError;
    lifeGroupIds.push(group.id);

    const actor: HorizonActor = {
      id: authData.user.id,
      isActive: true,
      name: "OpenCell Race Leader",
      role: "leader",
    };
    const authService: AuthService = {
      authenticate: async () => ({ actor, ok: true }),
    };
    const memberService = createSupabaseMemberService({
      serviceRoleKey: serviceRoleKey!,
      supabaseUrl: supabaseUrl!,
    });
    const openCellService = createSupabaseOpenCellService({
      serviceRoleKey: serviceRoleKey!,
      supabaseUrl: supabaseUrl!,
    });
    const visitorService = createSupabaseVisitorService({
      memberService,
      serviceRoleKey: serviceRoleKey!,
      supabaseUrl: supabaseUrl!,
    });
    const app = createApp({ authService, memberService, openCellService, visitorService });
    const api = (path: string) =>
      request(app).post(path).set("Authorization", "Bearer concurrency-token");

    const programme = await api("/api/opencell/programmes").send({
      description: null,
      name: "Race Programme",
    });
    expect(programme.status).toBe(201);
    const programmeId = programme.body.data.id as string;
    programmeIds.push(programmeId);
    const { data: visitor, error: visitorError } = await client
      .from("visitors")
      .insert({ first_name: "Race", last_name: "Visitor", status: "active" })
      .select("id")
      .single();
    if (visitorError) throw visitorError;
    visitorIds.push(visitor.id);

    const [enrollment, conversion] = await Promise.all([
      api(`/api/opencell/programmes/${programmeId}/participants`).send({
        enrolledOn: "2026-09-01",
        visitorId: visitor.id,
      }),
      api(`/api/visitors/${visitor.id}/convert`).send({ lifeGroupId: group.id }),
    ]);

    const visitorState = await client
      .from("visitors")
      .select("converted_at, converted_member_id, status")
      .eq("id", visitor.id)
      .single();
    if (visitorState.error) throw visitorState.error;
    const enrollmentCount = await client
      .from("opencell_enrollments")
      .select("visitor_id", { count: "exact", head: true })
      .eq("programme_id", programmeId)
      .eq("visitor_id", visitor.id);
    if (enrollmentCount.error) throw enrollmentCount.error;

    if (enrollment.status === 201) {
      expect(conversion.status).toBe(409);
      expect(conversion.body.error.code).toBe("ACTIVE_OPENCELL_ENROLLMENT");
      expect(visitorState.data).toEqual({ converted_at: null, converted_member_id: null, status: "active" });
      expect(enrollmentCount.count).toBe(1);
      return;
    }

    expect(enrollment.status).toBe(422);
    expect(enrollment.body.error.code).toBe("VISITOR_NOT_ACTIVE");
    expect(conversion.status).toBe(201);
    expect(visitorState.data.status).toBe("converted");
    expect(visitorState.data.converted_member_id).toEqual(expect.any(String));
    expect(visitorState.data.converted_at).toEqual(expect.any(String));
    memberIds.push(visitorState.data.converted_member_id!);
    expect(enrollmentCount.count).toBe(0);
  });
});
