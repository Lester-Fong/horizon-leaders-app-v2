import { randomBytes, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import { createSupabaseMemberService } from "../members/supabase-member-service.js";
import type { Database } from "../types/database.types.js";
import { createSupabaseHarvestService } from "./supabase-harvest-service.js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(supabaseUrl && serviceRoleKey);
const localUrl = supabaseUrl ?? "http://127.0.0.1:54321";
const localKey = serviceRoleKey ?? "unavailable";
const describeLocal = configured ? describe : describe.skip;

describeLocal("Harvest API with local Supabase", () => {
  const client = createClient<Database>(localUrl, localKey, { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } });
  const userIds: string[] = []; const groupIds: string[] = []; const memberIds: string[] = []; const visitorIds: string[] = []; const eventIds: string[] = [];

  afterEach(async () => {
    if (visitorIds.length) { const { error } = await client.from("follow_ups").delete().in("visitor_id", visitorIds); if (error) throw error; }
    if (eventIds.length) { const { error } = await client.from("harvest_participations").delete().in("event_id", eventIds); if (error) throw error; const { error: eventError } = await client.from("events").delete().in("id", eventIds); if (eventError) throw eventError; eventIds.length = 0; }
    if (visitorIds.length) { const { error } = await client.from("visitors").delete().in("id", visitorIds); if (error) throw error; visitorIds.length = 0; }
    if (memberIds.length) { const { error } = await client.from("members").delete().in("id", memberIds); if (error) throw error; memberIds.length = 0; }
    if (groupIds.length) { const { error } = await client.from("life_groups").delete().in("id", groupIds); if (error) throw error; groupIds.length = 0; }
    for (const id of userIds.splice(0).reverse()) { const { error } = await client.auth.admin.deleteUser(id); if (error) throw error; }
  });

  async function profile(name: string, role: "admin" | "leader") {
    const { data, error } = await client.auth.admin.createUser({ email: `harvest-${randomUUID()}@example.test`, email_confirm: true, password: `${randomUUID()}-Aa1!`, user_metadata: { name } });
    if (error || !data.user) throw error ?? new Error("User missing"); userIds.push(data.user.id);
    const { error: updateError } = await client.from("profiles").update({ role }).eq("id", data.user.id); if (updateError) throw updateError; return data.user.id;
  }
  async function group(name: string, leaderId: string) { const { data, error } = await client.from("life_groups").insert({ leader_profile_id: leaderId, name }).select("id").single(); if (error) throw error; groupIds.push(data.id); return data.id; }
  async function member(firstName: string, groupId: string, email?: string, isActive = true) { const { data, error } = await client.from("members").insert({ email: email ?? null, first_name: firstName, is_active: isActive, last_name: "Harvest Member", life_group_id: groupId, qr_token: randomBytes(32).toString("base64url") }).select("id").single(); if (error) throw error; memberIds.push(data.id); return data.id; }
  async function visitor(firstName: string, phone?: string) { const { data, error } = await client.from("visitors").insert({ first_name: firstName, last_name: "Harvest Visitor", phone: phone ?? null }).select("id").single(); if (error) throw error; visitorIds.push(data.id); return data.id; }

  it("enforces Harvest lifecycle, permissions, duplicate rules, atomic interest Follow Up, and conversion history", async () => {
    const adminId = await profile("Harvest Admin", "admin"); const leaderAId = await profile("Harvest Leader A", "leader"); const leaderBId = await profile("Harvest Leader B", "leader");
    const groupA = await group("Harvest Group A", leaderAId); const groupB = await group("Harvest Group B", leaderBId);
    const visibleMemberEmail = `visible-${randomUUID()}@example.test`; const hiddenMemberEmail = `hidden-${randomUUID()}@example.test`;
    await member("Visible", groupA, visibleMemberEmail); await member("Hidden", groupB, hiddenMemberEmail, false);
    const conversionMemberId = await member("Converted", groupA);
    const actors: Record<string, HorizonActor> = {
      admin: { id: adminId, isActive: true, name: "Harvest Admin", role: "admin" },
      leaderA: { id: leaderAId, isActive: true, name: "Harvest Leader A", role: "leader" },
      leaderB: { id: leaderBId, isActive: true, name: "Harvest Leader B", role: "leader" },
    };
    const authService: AuthService = { authenticate: async (token) => ({ actor: actors[token]!, ok: true }) };
    const memberService = createSupabaseMemberService({ serviceRoleKey: localKey, supabaseUrl: localUrl });
    const harvestService = createSupabaseHarvestService({ memberService, serviceRoleKey: localKey, supabaseUrl: localUrl });
    const app = createApp({ authService, harvestService, memberService });
    const api = (actor: string, method: "get" | "patch" | "post", path: string) => request(app)[method](path).set("Authorization", `Bearer ${actor}`);

    expect((await api("leaderA", "post", "/api/events/harvest").send({ description: null, eventDate: "2026-09-12", location: null, title: "Forbidden" })).status).toBe(403);
    const created = await api("admin", "post", "/api/events/harvest").send({ description: "Visitor outreach", eventDate: "2026-09-12", location: "Main Hall", title: "Harvest Night" });
    expect(created.status).toBe(201); expect(created.body.data).toMatchObject({ countsForAbsence: false, status: "open", type: "harvest" }); const eventId = created.body.data.id as string; eventIds.push(eventId);
    expect((await api("leaderA", "get", "/api/events/harvest")).body.data.events.some((event: { id: string }) => event.id === eventId)).toBe(true);
    expect((await api("leaderB", "get", `/api/events/harvest/${eventId}`)).status).toBe(200);
    expect((await api("leaderA", "patch", `/api/events/harvest/${eventId}`).send({ title: "No" })).status).toBe(403);
    expect((await api("leaderA", "post", `/api/events/harvest/${eventId}/close`)).status).toBe(403);

    const existingVisitorId = await visitor("Existing"); const participationPath = `/api/events/harvest/${eventId}/participations`;
    expect((await api("leaderA", "post", participationPath).send({ visitorId: existingVisitorId })).status).toBe(201);
    const duplicate = await api("admin", "post", participationPath).send({ visitorId: existingVisitorId }); expect(duplicate.body.data.result).toBe("already_registered");
    expect((await client.from("follow_ups").select("id", { count: "exact", head: true }).eq("visitor_id", existingVisitorId)).count).toBe(0);

    const concurrentPhone = `0917${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
    const concurrentNew = await Promise.all([
      api("admin", "post", `${participationPath}/new`).send({ email: null, firstName: "Concurrent", lastName: "One", phone: concurrentPhone }),
      api("leaderA", "post", `${participationPath}/new`).send({ email: null, firstName: "Concurrent", lastName: "Two", phone: concurrentPhone }),
    ]);
    expect(concurrentNew.map(({ status }) => status).sort()).toEqual([201, 409]); const createdVisitorId = concurrentNew.find(({ status }) => status === 201)!.body.data.visitorId as string; visitorIds.push(createdVisitorId);
    const visitorConflict = concurrentNew.find(({ status }) => status === 409)!; expect(visitorConflict.body.error.code).toBe("VISITOR_CONTACT_CONFLICT"); expect(visitorConflict.body.error.details.existingVisitor.id).toBe(createdVisitorId);

    const visibleConflict = await api("leaderA", "post", `${participationPath}/new`).send({ email: visibleMemberEmail.toUpperCase(), firstName: "Member", lastName: "Visible", phone: null });
    expect(visibleConflict.status).toBe(409); expect(visibleConflict.body.error.details.conflictingMember.name).toContain("Visible");
    const hiddenConflict = await api("leaderA", "post", `${participationPath}/new`).send({ email: hiddenMemberEmail, firstName: "Member", lastName: "Hidden", phone: null });
    expect(hiddenConflict.status).toBe(409); expect(hiddenConflict.body.error.details).not.toHaveProperty("conflictingMember");

    const noInterest = await api("leaderA", "patch", `${participationPath}/${existingVisitorId}/interest`).send({ interested: false }); expect(noInterest.body.data.result).toBe("recorded_not_interested");
    expect((await client.from("follow_ups").select("id", { count: "exact", head: true }).eq("visitor_id", existingVisitorId)).count).toBe(0);
    const concurrentInterest = await Promise.all([
      api("admin", "patch", `${participationPath}/${existingVisitorId}/interest`).send({ interested: true }),
      api("leaderA", "patch", `${participationPath}/${existingVisitorId}/interest`).send({ interested: true }),
    ]);
    expect(concurrentInterest.every(({ status }) => status === 200)).toBe(true); expect(concurrentInterest.map(({ body }) => body.data.result).sort()).toEqual(["already_interested", "recorded_interested"]);
    const followUps = await client.from("follow_ups").select("id, context, status").eq("visitor_id", existingVisitorId).eq("reason", "harvest_sunday_interest"); expect(followUps.data).toHaveLength(1); expect(followUps.data![0]!.context).toMatchObject({ harvestEventId: eventId, harvestEventTitle: "Harvest Night" });
    expect((await api("leaderA", "patch", `${participationPath}/${existingVisitorId}/interest`).send({ interested: false })).status).toBe(409);

    expect((await api("admin", "patch", `/api/events/harvest/${eventId}`).send({ eventDate: "2026-09-13" })).status).toBe(422);
    const closed = await api("admin", "post", `/api/events/harvest/${eventId}/close`); expect(closed.status).toBe(200); expect(closed.body.data.status).toBe("closed");
    expect((await api("leaderA", "post", participationPath).send({ visitorId: createdVisitorId })).status).toBe(409);
    expect((await api("admin", "post", `${participationPath}/new`).send({ email: null, firstName: "Closed", lastName: "Visitor", phone: null })).status).toBe(409);

    await client.from("visitors").update({ converted_member_id: conversionMemberId, status: "converted" }).eq("id", existingVisitorId);
    const history = await api("leaderA", "get", participationPath); expect(history.status).toBe(200); const historical = history.body.data.participations.find((entry: { visitor: { id: string } }) => entry.visitor.id === existingVisitorId); expect(historical.visitor.status).toBe("converted"); expect(historical.followUp.status).toBe("active");
    expect((await api("admin", "post", participationPath).send({ visitorId: existingVisitorId })).status).toBe(409);

    const lateDecisionVisitor = await visitor("Late Decision");
    const second = await client.from("events").insert({ counts_for_absence: false, created_by_profile_id: adminId, event_date: "2026-09-20", title: "Second Harvest", type: "harvest" }).select("id").single(); if (second.error) throw second.error; eventIds.push(second.data.id);
    expect((await api("leaderB", "post", `/api/events/harvest/${second.data.id}/participations`).send({ visitorId: lateDecisionVisitor })).status).toBe(201);
    expect((await api("admin", "post", `/api/events/harvest/${second.data.id}/close`)).status).toBe(200);
    const afterCloseInterest = await api("leaderB", "patch", `/api/events/harvest/${second.data.id}/participations/${lateDecisionVisitor}/interest`).send({ interested: true }); expect(afterCloseInterest.status).toBe(200); expect(afterCloseInterest.body.data.followUpResult).toBe("created");
  });
});
