import { randomBytes, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import type { Database } from "../types/database.types.js";
import { createSupabaseEventService } from "./supabase-event-service.js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(supabaseUrl && serviceRoleKey);
const localUrl = supabaseUrl ?? "http://127.0.0.1:54321";
const localKey = serviceRoleKey ?? "unavailable";
const describeLocal = configured ? describe : describe.skip;

describeLocal("Sunday Service API with local Supabase", () => {
  const client = createClient<Database>(localUrl, localKey, { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } });
  const userIds: string[] = []; const groupIds: string[] = []; const memberIds: string[] = []; const visitorIds: string[] = []; const eventIds: string[] = [];

  afterEach(async () => {
    if (eventIds.length) {
      for (const table of ["sunday_service_visitor_registrations", "sunday_service_presence", "sunday_service_eligibility"] as const) {
        const { error } = await client.from(table).delete().in("event_id", eventIds); if (error) throw error;
      }
      const { error } = await client.from("events").delete().in("id", eventIds); if (error) throw error; eventIds.length = 0;
    }
    if (visitorIds.length) { const { error } = await client.from("visitors").delete().in("id", visitorIds); if (error) throw error; visitorIds.length = 0; }
    if (memberIds.length) { const { error } = await client.from("members").delete().in("id", memberIds); if (error) throw error; memberIds.length = 0; }
    if (groupIds.length) { const { error } = await client.from("life_groups").delete().in("id", groupIds); if (error) throw error; groupIds.length = 0; }
    for (const id of userIds.splice(0).reverse()) { const { error } = await client.auth.admin.deleteUser(id); if (error) throw error; }
  });

  async function profile(name: string, role: "admin" | "leader") {
    const { data, error } = await client.auth.admin.createUser({ email: `services-${randomUUID()}@example.test`, email_confirm: true, password: `${randomUUID()}-Aa1!`, user_metadata: { name } });
    if (error || !data.user) throw error ?? new Error("User missing"); userIds.push(data.user.id);
    const { error: updateError } = await client.from("profiles").update({ role }).eq("id", data.user.id); if (updateError) throw updateError; return data.user.id;
  }
  async function group(name: string, leaderId: string) { const { data, error } = await client.from("life_groups").insert({ leader_profile_id: leaderId, name }).select("id").single(); if (error) throw error; groupIds.push(data.id); return data.id; }
  async function member(firstName: string, groupId: string, email?: string) { const qrToken = randomBytes(32).toString("base64url"); const { data, error } = await client.from("members").insert({ email: email ?? null, first_name: firstName, last_name: "Service Member", life_group_id: groupId, qr_token: qrToken }).select("id").single(); if (error) throw error; memberIds.push(data.id); return { id: data.id, qrToken }; }
  async function visitor(firstName: string, createdAt?: string) { const { data, error } = await client.from("visitors").insert({ created_at: createdAt, first_name: firstName, last_name: "Service Visitor" }).select("id").single(); if (error) throw error; visitorIds.push(data.id); return data.id; }

  it("enforces lifecycle, scoped attendance, QR, snapshots, and Sunday Visitor rules", async () => {
    const adminId = await profile("Service Admin", "admin"); const leaderAId = await profile("Service Leader A", "leader"); const leaderBId = await profile("Service Leader B", "leader");
    const groupA = await group("Service Group A", leaderAId); const groupB = await group("Service Group B", leaderBId);
    const memberA = await member("Ana", groupA); const memberB = await member("Ben", groupB, `member-${randomUUID()}@example.test`);
    const actors: Record<string, HorizonActor> = {
      admin: { id: adminId, isActive: true, name: "Service Admin", role: "admin" },
      leaderA: { id: leaderAId, isActive: true, name: "Service Leader A", role: "leader" },
      leaderB: { id: leaderBId, isActive: true, name: "Service Leader B", role: "leader" },
    };
    const authService: AuthService = { authenticate: async (token) => ({ actor: actors[token]!, ok: true }) };
    const app = createApp({ authService, eventService: createSupabaseEventService({ serviceRoleKey: localKey, supabaseUrl: localUrl }) });
    const api = (actor: string, method: "delete" | "get" | "patch" | "post", path: string) => request(app)[method](path).set("Authorization", `Bearer ${actor}`);

    const leaderCreate = await api("leaderA", "post", "/api/events").send({ countsForAbsence: true, description: null, eventDate: "2026-08-23", location: null, title: "Forbidden" });
    expect(leaderCreate.status).toBe(403);
    const created = await api("admin", "post", "/api/events").send({ countsForAbsence: true, description: "Weekly worship", eventDate: "2026-08-23", location: "Main Hall", title: "Sunday Service" });
    expect(created.status).toBe(201); const eventId = created.body.data.id as string; eventIds.push(eventId);
    expect(created.body.data).toMatchObject({ countsForAbsence: true, status: "open", title: "Sunday Service" });
    expect((await api("leaderA", "get", "/api/events")).body.data.events.some((event: { id: string }) => event.id === eventId)).toBe(true);
    expect((await api("leaderB", "get", `/api/events/${eventId}`)).status).toBe(200);
    expect((await api("leaderA", "patch", `/api/events/${eventId}`).send({ title: "No" })).status).toBe(403);
    expect((await api("leaderA", "post", `/api/events/${eventId}/close`)).status).toBe(403);

    const attendancePath = `/api/events/${eventId}/attendance`;
    expect((await api("leaderA", "post", attendancePath).send({ memberId: memberA.id })).status).toBe(201);
    const duplicateQr = await api("leaderA", "post", `${attendancePath}/qr`).send({ qrToken: memberA.qrToken });
    expect(duplicateQr.status).toBe(201); expect(duplicateQr.body.data.result).toBe("already_present");
    const otherQr = await api("leaderA", "post", `${attendancePath}/qr`).send({ qrToken: memberB.qrToken });
    expect(otherQr.status).toBe(404); expect(otherQr.body.error.code).toBe("MEMBER_NOT_ELIGIBLE");
    expect((await api("admin", "post", attendancePath).send({ memberId: memberB.id })).status).toBe(201);
    const leaderRoster = await api("leaderA", "get", attendancePath); expect(leaderRoster.body.data.members.map((entry: { id: string }) => entry.id)).toEqual([memberA.id]);
    const adminRoster = await api("admin", "get", attendancePath); expect(adminRoster.body.data.members).toHaveLength(2);

    const existingVisitor = await visitor("Vera"); const lateVisitor = await visitor("Late", "2026-08-24T00:00:00+08:00");
    expect((await api("leaderA", "post", `/api/events/${eventId}/visitors`).send({ visitorId: existingVisitor })).status).toBe(201);
    const duplicateVisitor = await api("leaderA", "post", `/api/events/${eventId}/visitors`).send({ visitorId: existingVisitor }); expect(duplicateVisitor.body.data.result).toBe("already_registered");
    const newVisitor = await api("leaderA", "post", `/api/events/${eventId}/visitors/new`).send({ email: null, firstName: "New", lastName: "Guest", phone: `0917${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}` });
    expect(newVisitor.status).toBe(201); visitorIds.push(newVisitor.body.data.visitorId);
    const concurrentPhone = `0918${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
    const concurrentVisitors = await Promise.all([
      api("admin", "post", `/api/events/${eventId}/visitors/new`).send({ email: null, firstName: "Concurrent", lastName: "One", phone: concurrentPhone }),
      api("leaderA", "post", `/api/events/${eventId}/visitors/new`).send({ email: null, firstName: "Concurrent", lastName: "Two", phone: concurrentPhone }),
    ]);
    expect(concurrentVisitors.map(({ status }) => status).sort()).toEqual([201, 409]);
    const concurrentCreated = concurrentVisitors.find(({ status }) => status === 201)!; visitorIds.push(concurrentCreated.body.data.visitorId);
    expect(concurrentVisitors.find(({ status }) => status === 409)!.body.error.code).toBe("VISITOR_CONTACT_CONFLICT");
    const memberConflict = await api("leaderA", "post", `/api/events/${eventId}/visitors/new`).send({ email: (await client.from("members").select("email").eq("id", memberB.id).single()).data!.email, firstName: "Duplicate", lastName: "Contact", phone: null });
    expect(memberConflict.status).toBe(409); expect(memberConflict.body.error.code).toBe("MEMBER_CONTACT_CONFLICT"); expect(memberConflict.body.error.details).not.toHaveProperty("memberId");

    const dateLocked = await api("admin", "patch", `/api/events/${eventId}`).send({ eventDate: "2026-08-30" }); expect(dateLocked.status).toBe(422); expect(dateLocked.body.error.code).toBe("EVENT_ACTIVITY_LOCKS_DATE");
    const concurrentClose = await Promise.all([api("admin", "post", `/api/events/${eventId}/close`), api("admin", "post", `/api/events/${eventId}/close`)]);
    expect(concurrentClose.map(({ status }) => status).sort()).toEqual([200, 409]);
    const closed = concurrentClose.find(({ status }) => status === 200)!; expect(closed.body.data.status).toBe("closed"); expect(closed.body.data.eligibilityCount).toBe(2);
    expect((await api("admin", "patch", `/api/events/${eventId}`).send({ eventDate: "2026-08-30" })).status).toBe(422);
    const corrected = await api("admin", "patch", `/api/events/${eventId}`).send({ title: "Corrected Service" }); expect(corrected.status).toBe(200); expect(corrected.body.data.title).toBe("Corrected Service");

    await client.from("members").update({ is_active: false, life_group_id: groupB }).eq("id", memberA.id);
    const closedLeaderRoster = await api("leaderA", "get", attendancePath); expect(closedLeaderRoster.body.data.members).toHaveLength(1); expect(closedLeaderRoster.body.data.members[0].lifeGroup.id).toBe(groupA);
    expect((await api("leaderA", "delete", `${attendancePath}/${memberA.id}`)).status).toBe(403);
    expect((await api("admin", "delete", `${attendancePath}/${memberA.id}`)).status).toBe(200);
    expect((await api("admin", "post", attendancePath).send({ memberId: memberA.id })).status).toBe(201);
    expect((await api("leaderA", "delete", `/api/events/${eventId}/visitors/${existingVisitor}`)).status).toBe(403);
    expect((await api("admin", "post", `/api/events/${eventId}/visitors`).send({ visitorId: lateVisitor })).status).toBe(422);
    expect((await api("admin", "post", `/api/events/${eventId}/visitors/new`).send({ email: null, firstName: "Closed", lastName: "Guest", phone: null })).status).toBe(409);

    await client.from("visitors").update({ converted_member_id: memberB.id, status: "converted" }).eq("id", existingVisitor);
    const historical = await api("leaderA", "get", `/api/events/${eventId}/visitors`); expect(historical.status).toBe(200); expect(historical.body.data.registrations.find((entry: { visitor: { id: string; status: string } }) => entry.visitor.id === existingVisitor).visitor.status).toBe("converted");

    const excluded = await api("admin", "post", "/api/events").send({ countsForAbsence: false, description: null, eventDate: "2026-08-25", location: null, title: "Excluded Service" }); expect(excluded.status).toBe(201); const excludedId = excluded.body.data.id as string; eventIds.push(excludedId);
    expect((await api("admin", "post", `/api/events/${excludedId}/close`)).status).toBe(200);
    const excludedRoster = await api("admin", "get", `/api/events/${excludedId}/attendance`); expect(excludedRoster.body.data.members.every((entry: { attendanceStatus: string }) => entry.isPresent || entry.attendanceStatus === "not_counted")).toBe(true);
  });
});
