import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAuthService } from "../auth/supabase-auth-service.js";
import { createSupabaseDashboardService } from "../dashboard/supabase-dashboard-service.js";
import type { OpenCellEvaluation } from "../opencell/types.js";
import { OPENCELL_PARTICIPATION_THRESHOLD_PERCENT } from "../config/constants.js";
import { admin, checkResult, type DemoContext } from "./context.js";
import { DEMO_ADMIN, LEADER_PASSWORD } from "./users.js";
import { churchDate } from "./dates.js";

export async function verifyDemo(context: DemoContext) {
  const { db } = context;
  const counts: Record<string, number> = {};
  for (const table of ["profiles", "life_groups", "members", "visitors", "ministries", "member_ministries", "life_group_gatherings", "life_group_gathering_attendance", "life_group_gathering_visitor_attendance", "events", "sunday_service_presence", "sunday_service_eligibility", "sunday_service_evaluations", "sunday_absence_threshold_occurrences", "harvest_participations", "opencell_programmes", "opencell_sessions", "opencell_enrollments", "opencell_attendance", "follow_ups"] as const) {
    const result = await db.from(table).select("*", { count: "exact", head: true });
    checkResult(result, `Verifying ${table}`);
    assert.ok(result.count !== null && result.count > 0, `Expected ${table} fixtures`);
    counts[table] = result.count;
  }
  assert.equal(counts.profiles, 8);
  assert.equal(counts.life_groups, 7);
  assert.equal(counts.members, 46);
  assert.equal(counts.visitors, 18);
  assert.equal(counts.ministries, 5);
  assert.equal(counts.life_group_gatherings, 28);
  assert.equal(counts.events, 16);
  assert.equal(counts.opencell_programmes, 3);
  assert.equal(counts.opencell_sessions, 15);
  assert.equal(counts.opencell_enrollments, 15);

  const profiles = await db.from("profiles").select("id,role,is_active");
  checkResult(profiles, "Verifying roles");
  assert.equal(profiles.data!.filter((profile) => profile.role === "admin").length, 1);
  assert.equal(profiles.data!.filter((profile) => profile.role === "leader").length, 7);
  const groups = await db.from("life_groups").select("id,leader_profile_id,is_active");
  checkResult(groups, "Verifying Life Groups");
  assert.equal(new Set(groups.data!.map((group) => group.leader_profile_id)).size, 7);
  assert.ok(groups.data!.every((group) => group.is_active && context.actors.slice(1).some((actor) => actor.id === group.leader_profile_id)));

  const members = await db.from("members").select("id,life_group_id,normalized_email,normalized_phone,qr_token,is_active");
  checkResult(members, "Verifying Members");
  assert.ok(members.data!.every((member) => groups.data!.some((group) => group.id === member.life_group_id)));
  assert.equal(members.data!.filter((member) => member.is_active).length, 44);
  for (const field of ["normalized_email", "normalized_phone", "qr_token"] as const) {
    const values = members.data!.map((member) => member[field]).filter((value) => value !== null);
    assert.equal(new Set(values).size, values.length, `Unique ${field}`);
  }
  assert.ok(members.data!.every((member) => /^[A-Za-z0-9_-]{43}$/.test(member.qr_token) && member.qr_token !== member.id));

  const visitors = await db.from("visitors").select("id,status,converted_member_id,life_group_id,created_at");
  checkResult(visitors, "Verifying Visitors");
  assert.equal(visitors.data!.filter((visitor) => visitor.status === "active").length, 16);
  const converted = visitors.data!.filter((visitor) => visitor.status === "converted");
  assert.equal(converted.length, 2);
  assert.ok(converted.every((visitor) => members.data!.some((member) => member.id === visitor.converted_member_id && member.life_group_id === visitor.life_group_id)));
  assert.ok(visitors.data!.some((visitor) => churchDate(new Date(visitor.created_at)).slice(0, 7) === context.today.slice(0, 7)));
  const visitorAttendance = await db.from("life_group_gathering_visitor_attendance").select("visitor_id");
  checkResult(visitorAttendance, "Verifying preserved converted Visitor attendance");
  assert.ok(converted.every((visitor) => visitorAttendance.data!.some((presence) => presence.visitor_id === visitor.id)));

  const events = await db.from("events").select("id,type,status,counts_for_absence,event_date");
  checkResult(events, "Verifying Event lifecycle");
  assert.ok(events.data!.every((event) => event.type !== "other"));
  const history = events.data!.filter((event) => event.type === "service" && event.status === "closed" && event.counts_for_absence);
  assert.equal(history.length, 12);
  const eligibility = await db.from("sunday_service_eligibility").select("event_id,member_id,life_group_id_at_close");
  checkResult(eligibility, "Verifying Sunday snapshots");
  for (const event of history) assert.equal(eligibility.data!.filter((row) => row.event_id === event.id).length, 44);
  const presence = await db.from("sunday_service_presence").select("event_id,member_id");
  checkResult(presence, "Verifying Sunday presence");
  assert.ok(presence.data!.every((row) => eligibility.data!.some((snapshot) => snapshot.event_id === row.event_id && snapshot.member_id === row.member_id)));
  const followUps = await db.from("follow_ups").select("reason,status,member_id,visitor_id,completed_by_profile_id,completed_at");
  checkResult(followUps, "Verifying generated Follow Ups");
  for (const reason of ["consecutive_sunday_absence", "opencell_high_participation", "harvest_sunday_interest"]) {
    assert.ok(followUps.data!.some((row) => row.reason === reason && row.status === "active"), `Active ${reason}`);
  }
  assert.ok(followUps.data!.some((row) => row.status === "completed" && row.completed_at && row.completed_by_profile_id));
  assert.ok(followUps.data!.some((row) => row.member_id === context.members[1]!.id && row.reason === "consecutive_sunday_absence"));
  assert.ok(!followUps.data!.some((row) => row.member_id === context.members[0]!.id || row.member_id === context.members[2]!.id), "Consistent attendance and reset examples must not trigger absence Follow Up");
  const activeKeys = followUps.data!.filter((row) => row.status === "active").map((row) => `${row.member_id ?? row.visitor_id}:${row.reason}`);
  assert.equal(new Set(activeKeys).size, activeKeys.length);
  const harvest = await db.from("harvest_participations").select("sunday_interest");
  checkResult(harvest, "Verifying Harvest interest states");
  assert.deepEqual(new Set(harvest.data!.map((row) => row.sunday_interest)), new Set([null, false, true]));

  assert.ok(context.finished);
  assert.equal(context.finished.programme.status, "finished");
  assert.ok(context.finished.programme.finishedAt);
  for (const [index, expected] of [[0, [4, 4]], [1, [3, 4]], [2, [2, 4]], [3, [0, 2]]] as const) {
    const evaluation: OpenCellEvaluation | undefined = context.finished.evaluations.find((row) => row.visitorId === context.visitors[index]!.id);
    assert.ok(evaluation);
    assert.deepEqual([evaluation.attendedCount, evaluation.eligibleSessionCount], expected);
    assert.equal(evaluation.qualified, expected[0] * 100 >= expected[1] * OPENCELL_PARTICIPATION_THRESHOLD_PERCENT);
    assert.equal(evaluation.followUpOutcome, evaluation.qualified ? "created" : null);
  }
  const sessions = await db.from("opencell_sessions").select("id,is_cancelled");
  checkResult(sessions, "Verifying cancelled Sessions");
  assert.equal(sessions.data!.filter((session) => session.is_cancelled).length, 3);
  const attendance = await db.from("opencell_attendance").select("session_id");
  checkResult(attendance, "Verifying OpenCell attendance");
  assert.ok(attendance.data!.every((row) => sessions.data!.some((session) => session.id === row.session_id && !session.is_cancelled)));

  const dashboard = createSupabaseDashboardService(context.config);
  for (const period of ["4", "8", "12"] as const) {
    const data = await dashboard.get(admin(context), { period });
    assert.equal(data.sundayAttendance.points.length, Number(period));
    assert.ok(new Set(data.sundayAttendance.points.map((point) => point.rate)).size > 1, "Varied Sunday line chart");
    assert.equal(data.metrics.activeMembers, 44);
    assert.equal(data.metrics.activeVisitors, 16);
    assert.equal(data.metrics.activeOpenCellProgrammes, 2);
    assert.equal(data.openCell.currentParticipants, 11);
    assert.ok((data.metrics.newVisitorsThisMonth ?? 0) > 0);
    assert.ok([...data.memberSnapshot.age, ...data.memberSnapshot.gender].every((row) => row.count > 0), "All demographic buckets populated");
    assert.ok(data.recentUpcoming.upcoming.length > 0 && data.recentUpcoming.recent.length > 0);
  }
  // Real password authentication and the same trusted Profile lookup as /api/me.
  const auth = createSupabaseAuthService(context.config);
  for (const account of [DEMO_ADMIN, { email: "leader1@example.test", password: LEADER_PASSWORD }]) {
    const client = createClient(context.config.supabaseUrl, context.config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const login = await client.auth.signInWithPassword(account);
    checkResult(login, `Signing in ${account.email}`);
    assert.ok(login.data.session);
    const result = await auth.authenticate(login.data.session.access_token);
    assert.ok(result.ok);
    assert.equal(result.actor.role, account.email === DEMO_ADMIN.email ? "admin" : "leader");
    checkResult(await client.auth.signOut(), "Signing out verification session");
  }
  return counts;
}
