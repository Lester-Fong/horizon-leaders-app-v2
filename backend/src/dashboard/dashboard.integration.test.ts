import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import type { HorizonActor } from "../auth/types.js";
import type { Database } from "../types/database.types.js";
import { churchDate } from "../config/church-date.js";
import { createSupabaseDashboardService } from "./supabase-dashboard-service.js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const suite = url && key ? describe : describe.skip;

suite("Dashboard OpenCell aggregation with local Supabase", () => {
  const db = createClient<Database>(url ?? "http://127.0.0.1:54321", key ?? "missing", {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const users: string[] = [];
  const programmeIds: string[] = [];
  const sessionIds: string[] = [];
  const visitorIds: string[] = [];
  const groupIds: string[] = [];
  const memberIds: string[] = [];
  const eventIds: string[] = [];

  afterEach(async () => {
    if (sessionIds.length) {
      await db.from("opencell_attendance").delete().in("session_id", sessionIds);
    }
    if (programmeIds.length) {
      await db.from("opencell_enrollments").delete().in("programme_id", programmeIds);
      await db.from("opencell_sessions").delete().in("id", sessionIds);
      await db.from("opencell_programmes").delete().in("id", programmeIds);
    }
    if (visitorIds.length) {
      await db.from("follow_ups").delete().in("visitor_id", visitorIds);
      await db.from("visitors").delete().in("id", visitorIds);
    }
    if (eventIds.length) {
      await db.from("sunday_service_presence").delete().in("event_id", eventIds);
      await db.from("sunday_service_eligibility").delete().in("event_id", eventIds);
      await db.from("events").delete().in("id", eventIds);
    }
    if (groupIds.length) {
      await db.from("members").delete().in("life_group_id", groupIds);
    }
    if (memberIds.length) {
      await db.from("follow_ups").delete().in("member_id", memberIds);
      await db.from("members").delete().in("id", memberIds);
    }
    if (groupIds.length) {
      await db.from("life_groups").delete().in("id", groupIds);
    }
    for (const userId of users.splice(0).reverse()) {
      await db.auth.admin.deleteUser(userId);
    }
    programmeIds.splice(0);
    sessionIds.splice(0);
    visitorIds.splice(0);
    groupIds.splice(0);
    memberIds.splice(0);
    eventIds.splice(0);
  });

  it("counts active participants and upcoming sessions beyond the first 100 programmes", async () => {
    const createdUser = await db.auth.admin.createUser({
      email: `dashboard-${Date.now()}@example.test`,
      email_confirm: true,
      password: "Dashboard-Aa1!",
    });
    if (createdUser.error || !createdUser.data.user) throw createdUser.error ?? new Error("User missing");
    const actorId = createdUser.data.user.id;
    users.push(actorId);
    const actor: HorizonActor = { id: actorId, isActive: true, name: "Dashboard Admin", role: "admin" };
    const service = createSupabaseDashboardService({ serviceRoleKey: key!, supabaseUrl: url! });
    const before = await service.get(actor, { period: "8" });

    const programmeRows = Array.from({ length: 101 }, (_, index) => ({
      name: index === 0 ? "Dashboard overflow target" : `Dashboard overflow ${index}`,
      description: null,
      status: "active" as const,
      created_by_profile_id: actorId,
      created_at: new Date(Date.UTC(2025, 0, 1 + index)).toISOString(),
    }));
    const inserted = await db.from("opencell_programmes").insert(programmeRows).select("id, name");
    if (inserted.error) throw inserted.error;
    programmeIds.push(...inserted.data.map((row) => row.id));
    const target = inserted.data.find((row) => row.name === "Dashboard overflow target");
    if (!target) throw new Error("Target Programme missing");

    const visitor = await db.from("visitors").insert({ first_name: "Dashboard", last_name: "Participant", status: "active" }).select("id").single();
    if (visitor.error) throw visitor.error;
    visitorIds.push(visitor.data.id);
    const enrollment = await db.from("opencell_enrollments").insert({
      programme_id: target.id,
      visitor_id: visitor.data.id,
      enrolled_on: churchDate(),
      enrolled_by_profile_id: actorId,
    });
    if (enrollment.error) throw enrollment.error;
    const session = await db.from("opencell_sessions").insert({ programme_id: target.id, session_date: churchDate(), title: "Overflow target session" }).select("id").single();
    if (session.error) throw session.error;
    sessionIds.push(session.data.id);

    const after = await service.get(actor, { period: "8" });
    expect(after.openCell.activeProgrammes).toBe(before.openCell.activeProgrammes + 101);
    expect(after.openCell.currentParticipants).toBe(before.openCell.currentParticipants + 1);
    expect(after.recentUpcoming.upcoming.some((item) => item.id === session.data.id)).toBe(true);
  });

  it("keeps Leader metrics scoped to the own Life Group despite filter input", async () => {
    const leaderUser = await db.auth.admin.createUser({
      email: `dashboard-leader-${Date.now()}@example.test`,
      email_confirm: true,
      password: "Dashboard-Aa1!",
    });
    if (leaderUser.error || !leaderUser.data.user) throw leaderUser.error ?? new Error("Leader missing");
    users.push(leaderUser.data.user.id);
    const otherLeader = await db.auth.admin.createUser({
      email: `dashboard-other-${Date.now()}@example.test`,
      email_confirm: true,
      password: "Dashboard-Aa1!",
    });
    if (otherLeader.error || !otherLeader.data.user) throw otherLeader.error ?? new Error("Other leader missing");
    users.push(otherLeader.data.user.id);

    const groups = await db.from("life_groups").insert([
      { name: "Dashboard Leader Group", leader_profile_id: leaderUser.data.user.id },
      { name: "Dashboard Other Group", leader_profile_id: otherLeader.data.user.id },
    ]).select("id, leader_profile_id");
    if (groups.error) throw groups.error;
    groupIds.push(...groups.data.map((group) => group.id));
    const ownGroup = groups.data.find((group) => group.leader_profile_id === leaderUser.data.user!.id)!;
    const otherGroup = groups.data.find((group) => group.leader_profile_id === otherLeader.data.user!.id)!;

    const members = await db.from("members").insert([
      { first_name: "Own", last_name: "Member", life_group_id: ownGroup.id, qr_token: randomUUID() },
      { first_name: "Other", last_name: "Member", life_group_id: otherGroup.id, qr_token: randomUUID() },
    ]).select("id");
    if (members.error) throw members.error;
    memberIds.push(...members.data.map((member) => member.id));
    const visitors = await db.from("visitors").insert([
      { first_name: "Own", last_name: "Visitor", life_group_id: ownGroup.id, status: "active" },
      { first_name: "Other", last_name: "Visitor", life_group_id: otherGroup.id, status: "active" },
    ]).select("id");
    if (visitors.error) throw visitors.error;
    visitorIds.push(...visitors.data.map((visitor) => visitor.id));

    const service = createSupabaseDashboardService({ serviceRoleKey: key!, supabaseUrl: url! });
    const actor: HorizonActor = { id: leaderUser.data.user.id, isActive: true, name: "Dashboard Leader", role: "leader" };
    const data = await service.get(actor, { period: "8", lifeGroupId: otherGroup.id });
    expect(data.metrics.myLifeGroupMembers).toBe(1);
    expect(data.metrics.myLifeGroupVisitors).toBe(1);
    expect(data.memberSnapshot.gender.reduce((total, row) => total + row.count, 0)).toBe(1);
  });

  it("keeps Member and Sunday aggregates correct beyond the PostgREST row limit", async () => {
    const createdUser = await db.auth.admin.createUser({
      email: `dashboard-volume-${Date.now()}@example.test`,
      email_confirm: true,
      password: "Dashboard-Aa1!",
    });
    if (createdUser.error || !createdUser.data.user) throw createdUser.error ?? new Error("User missing");
    const actorId = createdUser.data.user.id;
    users.push(actorId);
    const actor: HorizonActor = { id: actorId, isActive: true, name: "Dashboard Volume Admin", role: "admin" };

    const group = await db.from("life_groups").insert({
      name: `Dashboard Volume ${Date.now()}`,
      leader_profile_id: actorId,
    }).select("id").single();
    if (group.error) throw group.error;
    groupIds.push(group.data.id);

    const service = createSupabaseDashboardService({ serviceRoleKey: key!, supabaseUrl: url! });
    const before = await service.get(actor, { period: "year" });
    const fixtureMembers = Array.from({ length: 1001 }, (_, index) => ({
      id: randomUUID(),
      first_name: "Volume",
      last_name: `Member ${index}`,
      life_group_id: group.data.id,
      qr_token: randomUUID(),
      gender: index % 2 === 0 ? "female" as const : "male" as const,
      birth_date: "2000-01-01",
    }));
    for (let index = 0; index < fixtureMembers.length; index += 400) {
      const insertedMembers = await db.from("members").insert(fixtureMembers.slice(index, index + 400));
      if (insertedMembers.error) throw insertedMembers.error;
    }

    const existingServices = await db.from("events")
      .select("event_date")
      .eq("type", "service")
      .eq("counts_for_absence", true);
    if (existingServices.error) throw existingServices.error;
    const usedServiceDates = new Set(existingServices.data.map((row) => row.event_date));
    const today = new Date(`${churchDate()}T00:00:00Z`);
    today.setUTCDate(today.getUTCDate() - today.getUTCDay());
    let serviceDate: string | undefined;
    for (let week = 0; week < 53; week += 1) {
      const candidate = today.toISOString().slice(0, 10);
      if (!usedServiceDates.has(candidate)) {
        serviceDate = candidate;
        break;
      }
      today.setUTCDate(today.getUTCDate() - 7);
    }
    if (!serviceDate) throw new Error("No isolated Sunday Service date is available in the current year");

    const event = await db.from("events").insert({
      type: "service",
      status: "closed",
      title: "Dashboard Volume Service",
      event_date: serviceDate,
      counts_for_absence: true,
      created_by_profile_id: actorId,
    }).select("id").single();
    if (event.error) throw event.error;
    eventIds.push(event.data.id);

    const eligibility = fixtureMembers.map((member) => ({
      event_id: event.data.id,
      member_id: member.id,
      life_group_id_at_close: group.data.id,
    }));
    const presence = fixtureMembers.slice(0, 751).map((member) => ({
      event_id: event.data.id,
      member_id: member.id,
    }));
    for (let index = 0; index < eligibility.length; index += 400) {
      const insertedEligibility = await db.from("sunday_service_eligibility").insert(eligibility.slice(index, index + 400));
      if (insertedEligibility.error) throw insertedEligibility.error;
    }
    for (let index = 0; index < presence.length; index += 400) {
      const insertedPresence = await db.from("sunday_service_presence").insert(presence.slice(index, index + 400));
      if (insertedPresence.error) throw insertedPresence.error;
    }

    const after = await service.get(actor, { period: "year" });
    expect(after.metrics.activeMembers).toBe(before.metrics.activeMembers + 1001);
    expect(after.memberSnapshot.gender.reduce((total, row) => total + row.count, 0)).toBe(
      before.memberSnapshot.gender.reduce((total, row) => total + row.count, 0) + 1001,
    );
    expect(after.sundayAttendance.points.find((point) => point.eventId === event.data.id)).toEqual({
      date: serviceDate,
      eligibleCount: 1001,
      eventId: event.data.id,
      presentCount: 751,
      rate: 75,
    });
  });
});
