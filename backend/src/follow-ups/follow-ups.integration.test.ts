import { randomBytes, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import type { Database } from "../types/database.types.js";
import { createSupabaseFollowUpService } from "./supabase-follow-up-service.js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(supabaseUrl && serviceRoleKey);
const localUrl = supabaseUrl ?? "http://127.0.0.1:54321";
const localKey = serviceRoleKey ?? "unavailable";
const describeLocal = configured ? describe : describe.skip;

describeLocal("Follow Up API with local Supabase", () => {
  const client = createClient<Database>(localUrl, localKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const userIds: string[] = [];
  const groupIds: string[] = [];
  const memberIds: string[] = [];
  const visitorIds: string[] = [];

  afterEach(async () => {
    if (memberIds.length) {
      const { error } = await client.from("follow_ups").delete().in("member_id", memberIds);
      if (error) throw error;
    }
    if (visitorIds.length) {
      const { error } = await client.from("follow_ups").delete().in("visitor_id", visitorIds);
      if (error) throw error;
    }
    if (visitorIds.length) {
      const { error } = await client.from("visitors").delete().in("id", visitorIds);
      if (error) throw error;
      visitorIds.length = 0;
    }
    if (memberIds.length) {
      const { error } = await client.from("members").delete().in("id", memberIds);
      if (error) throw error;
      memberIds.length = 0;
    }
    if (groupIds.length) {
      const { error } = await client.from("life_groups").delete().in("id", groupIds);
      if (error) throw error;
      groupIds.length = 0;
    }
    for (const id of userIds.splice(0).reverse()) {
      const { error } = await client.auth.admin.deleteUser(id);
      if (error) throw error;
    }
  });

  async function profile(name: string, role: "admin" | "leader") {
    const { data, error } = await client.auth.admin.createUser({
      email: `follow-${randomUUID()}@example.test`,
      email_confirm: true,
      password: `${randomUUID()}-Aa1!`,
      user_metadata: { name },
    });
    if (error || !data.user) throw error ?? new Error("User missing");
    userIds.push(data.user.id);
    const { error: updateError } = await client.from("profiles").update({ role }).eq("id", data.user.id);
    if (updateError) throw updateError;
    return data.user.id;
  }

  async function group(name: string, leaderId: string) {
    const { data, error } = await client.from("life_groups").insert({ leader_profile_id: leaderId, name }).select("id").single();
    if (error) throw error;
    groupIds.push(data.id);
    return data.id;
  }

  async function member(firstName: string, groupId: string) {
    const { data, error } = await client.from("members").insert({
      first_name: firstName,
      last_name: "Follow Member",
      life_group_id: groupId,
      qr_token: randomBytes(32).toString("base64url"),
    }).select("id").single();
    if (error) throw error;
    memberIds.push(data.id);
    return data.id;
  }

  async function visitor(firstName: string) {
    const { data, error } = await client.from("visitors").insert({ first_name: firstName, last_name: "Follow Visitor" }).select("id").single();
    if (error) throw error;
    visitorIds.push(data.id);
    return data.id;
  }

  it("shares active/history, suppresses repeats, trusts completion context, and preserves Visitor subjects", async () => {
    const adminId = await profile("Follow Admin", "admin");
    const leaderId = await profile("Follow Leader", "leader");
    const groupId = await group("Follow Group", leaderId);
    const subjectMemberId = await member("Mara", groupId);
    const convertedMemberId = await member("Converted", groupId);
    const subjectVisitorId = await visitor("Vera");
    const actors: Record<string, HorizonActor> = {
      admin: { id: adminId, isActive: true, name: "Follow Admin", role: "admin" },
      leader: { id: leaderId, isActive: true, name: "Follow Leader", role: "leader" },
    };
    const authService: AuthService = { authenticate: async (token) => ({ actor: actors[token]!, ok: true }) };
    const followUpService = createSupabaseFollowUpService({ serviceRoleKey: localKey, supabaseUrl: localUrl });
    const app = createApp({ authService, followUpService });
    const api = (actor: string, method: "get" | "patch" | "post", path: string) => request(app)[method](path).set("Authorization", `Bearer ${actor}`);

    const serviceIds = Array.from({ length: 5 }, () => randomUUID());
    const [first, concurrent] = await Promise.all([
      followUpService.triggerSundayAbsence(subjectMemberId, { qualifyingServiceIds: serviceIds, threshold: 5 }),
      followUpService.triggerSundayAbsence(subjectMemberId, { qualifyingServiceIds: serviceIds, threshold: 5 }),
    ]);
    expect([first.outcome, concurrent.outcome].sort()).toEqual(["created", "suppressed"]);
    const storedCreatedAt = first.followUp.createdAt;
    const repeated = await followUpService.triggerSundayAbsence(subjectMemberId, {
      qualifyingServiceIds: [...serviceIds, randomUUID()],
      threshold: 5,
    });
    expect(repeated.outcome).toBe("suppressed");
    expect(repeated.followUp.createdAt).toBe(storedCreatedAt);
    expect(repeated.followUp.context).toEqual({ qualifyingServiceIds: serviceIds, threshold: 5 });

    const { data: visitorTrigger, error: visitorTriggerError } = await client.rpc("create_follow_up_if_absent", {
      p_context: { programmeId: randomUUID(), attendanceCount: 6, percentage: 75 },
      p_member_id: null as unknown as string,
      p_reason: "opencell_high_participation",
      p_visitor_id: subjectVisitorId,
    });
    if (visitorTriggerError) throw visitorTriggerError;
    expect(visitorTrigger[0]?.outcome).toBe("created");

    const leaderActive = await api("leader", "get", "/api/follow-ups");
    const adminActive = await api("admin", "get", "/api/follow-ups?status=active");
    expect(leaderActive.status).toBe(200);
    expect(adminActive.body.data).toHaveLength(2);
    expect(leaderActive.body.data).toEqual(adminActive.body.data);
    expect(leaderActive.body.data[0].subject).not.toHaveProperty("email");
    expect(leaderActive.body.data[0].subject).not.toHaveProperty("lifeGroup");

    const memberFollowUpId = leaderActive.body.data.find((entry: { subject: { type: string } }) => entry.subject.type === "member").id as string;
    const completed = await api("leader", "patch", `/api/follow-ups/${memberFollowUpId}/complete`).send({ completionNote: "  Called and prayed together.  ", completedByProfileId: adminId });
    expect(completed.status).toBe(400);
    const validCompletion = await api("leader", "patch", `/api/follow-ups/${memberFollowUpId}/complete`).send({ completionNote: "  Called and prayed together.  " });
    expect(validCompletion.status).toBe(200);
    expect(validCompletion.body.data).toMatchObject({
      completedBy: { id: leaderId, name: "Follow Leader" },
      completionNote: "Called and prayed together.",
      status: "completed",
    });
    expect(Date.parse(validCompletion.body.data.completedAt)).toBeGreaterThan(0);
    expect((await api("admin", "get", "/api/follow-ups")).body.data).toHaveLength(1);
    const history = await api("leader", "get", "/api/follow-ups?status=completed");
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0].reasonLabel).toBe("Consecutive Sunday absences");
    expect((await api("admin", "patch", `/api/follow-ups/${memberFollowUpId}/complete`).send({})).status).toBe(409);

    const nextCycle = await followUpService.triggerSundayAbsence(subjectMemberId, { qualifyingServiceIds: serviceIds, threshold: 5 });
    expect(nextCycle.outcome).toBe("created");

    const { error: conversionError } = await client.from("visitors").update({
      converted_member_id: convertedMemberId,
      status: "converted",
    }).eq("id", subjectVisitorId);
    if (conversionError) throw conversionError;
    const afterConversion = await api("leader", "get", "/api/follow-ups");
    const visitorFollowUp = afterConversion.body.data.find((entry: { subject: { type: string } }) => entry.subject.type === "visitor");
    expect(visitorFollowUp.subject).toMatchObject({ id: subjectVisitorId, recordStatus: "converted", type: "visitor" });
    expect(visitorFollowUp.subject.id).not.toBe(convertedMemberId);
    expect((await api("admin", "post", "/api/follow-ups").send({ memberId: subjectMemberId })).status).toBe(404);
  });
});
