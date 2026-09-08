import { createClient } from "@supabase/supabase-js";

import type { HorizonActor } from "../auth/types.js";
import { CHURCH_TIME_ZONE } from "../config/constants.js";
import type { Database, Tables } from "../types/database.types.js";
import { FOLLOW_UP_REASON_LABELS, type FollowUpReason } from "../follow-ups/types.js";
import {
  DashboardServiceError,
  type DashboardBreakdown,
  type DashboardData,
  type DashboardService,
} from "./types.js";

interface Config { serviceRoleKey: string; supabaseUrl: string }
type MemberRow = Pick<Tables<"members">, "birth_date" | "gender" | "is_active" | "life_group_id">;
type EventRow = Pick<Tables<"events">, "counts_for_absence" | "event_date" | "id" | "status" | "title" | "type">;

const REASONS: FollowUpReason[] = [
  "consecutive_sunday_absence",
  "opencell_high_participation",
  "harvest_sunday_interest",
];

function unavailable(): never {
  throw new DashboardServiceError(500, "DASHBOARD_SERVICE_UNAVAILABLE", "Dashboard data is temporarily unavailable.");
}

function localDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHURCH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])) as Record<string, string>;
}

function localToday() {
  const parts = localDateParts();
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function localYearStart() {
  return `${localDateParts().year}-01-01`;
}

function localMonthBounds() {
  const parts = localDateParts();
  const start = `${parts.year}-${parts.month}-01`;
  const nextMonth = new Date(Date.UTC(Number(parts.year), Number(parts.month), 1));
  return { end: nextMonth.toISOString(), start: new Date(`${start}T00:00:00+08:00`).toISOString() };
}

function ageForDate(birthDate: string | null, today: string) {
  if (!birthDate) return null;
  let age = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4));
  if (today.slice(5) < birthDate.slice(5)) age -= 1;
  return age;
}

function ageKey(age: number | null) {
  if (age === null) return "not_set";
  if (age < 18) return "under_18";
  if (age <= 24) return "18_24";
  if (age <= 34) return "25_34";
  if (age <= 44) return "35_44";
  if (age <= 54) return "45_54";
  return "55_plus";
}

const AGE_LABELS: Record<string, string> = {
  under_18: "Under 18", "18_24": "18–24", "25_34": "25–34", "35_44": "35–44",
  "45_54": "45–54", "55_plus": "55+", not_set: "Not set",
};
const GENDER_LABELS: Record<string, string> = { male: "Male", female: "Female", not_set: "Not set" };

function breakdown(keys: string[], counts: Map<string, number>, labels: Record<string, string>, total: number): DashboardBreakdown[] {
  return keys.map((key) => ({
    count: counts.get(key) ?? 0,
    key,
    label: labels[key] ?? key,
    percentage: total ? Math.round(((counts.get(key) ?? 0) / total) * 100) : 0,
  }));
}

export function createSupabaseDashboardService({ serviceRoleKey, supabaseUrl }: Config): DashboardService {
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false } });

  async function leaderGroup(actor: HorizonActor) {
    if (actor.role !== "leader") return undefined;
    const { data, error } = await supabase.from("life_groups").select("id").eq("leader_profile_id", actor.id).maybeSingle();
    if (error) unavailable();
    if (!data) throw new DashboardServiceError(404, "LIFE_GROUP_SCOPE_NOT_FOUND", "Your assigned Life Group was not found.");
    return data.id;
  }

  return {
    async get(actor, options): Promise<DashboardData> {
      const ownGroup = await leaderGroup(actor);
      const groupId = actor.role === "leader" ? ownGroup : undefined;
      const chartGroupId = actor.role === "leader" ? ownGroup : options.lifeGroupId;
      const today = localToday();
      const memberQuery = supabase.from("members").select("birth_date, gender, is_active, life_group_id").eq("is_active", true);
      if (groupId) memberQuery.eq("life_group_id", groupId);
      const visitorQuery = supabase.from("visitors").select("id", { count: "exact", head: true }).eq("status", "active");
      if (groupId) visitorQuery.eq("life_group_id", groupId);
      const [membersResult, visitorsResult, followUpsResult, programmesResult] = await Promise.all([
        memberQuery,
        visitorQuery,
        supabase.from("follow_ups").select("reason").eq("status", "active"),
        supabase.from("opencell_programmes").select("id, name, finished_at, status").order("created_at", { ascending: false }).limit(100),
      ]);
      if (membersResult.error || visitorsResult.error || followUpsResult.error || programmesResult.error) unavailable();
      const members = (membersResult.data ?? []) as MemberRow[];
      const activeVisitorCount = visitorsResult.count ?? 0;
      const activeProgrammes = (programmesResult.data ?? []).filter((row) => row.status === "active");
      const activeProgrammeCountResult = await supabase.from("opencell_programmes").select("id", { count: "exact", head: true }).eq("status", "active");
      if (activeProgrammeCountResult.error) unavailable();
      const activeProgrammeCount = activeProgrammeCountResult.count ?? activeProgrammes.length;
      const programmeIds = activeProgrammes.map((row) => row.id);
      const enrollmentsResult = programmeIds.length
        ? await supabase.from("opencell_enrollments").select("visitor_id").in("programme_id", programmeIds)
        : { data: [], error: null };
      if (enrollmentsResult.error) unavailable();

      const month = localMonthBounds();
      const newVisitorsQuery = actor.role === "admin"
        ? supabase.from("visitors").select("id", { count: "exact", head: true }).gte("created_at", month.start).lt("created_at", month.end)
        : null;
      const newVisitorsResult = newVisitorsQuery ? await newVisitorsQuery : { count: 0, error: null };
      if (newVisitorsResult.error) unavailable();

      const followUpCounts = new Map<string, number>();
      for (const row of followUpsResult.data ?? []) followUpCounts.set(row.reason, (followUpCounts.get(row.reason) ?? 0) + 1);
      const memberGender = new Map<string, number>();
      const memberAge = new Map<string, number>();
      for (const member of members) {
        const gender = member.gender ?? "not_set";
        memberGender.set(gender, (memberGender.get(gender) ?? 0) + 1);
        const age = ageKey(ageForDate(member.birth_date, today));
        memberAge.set(age, (memberAge.get(age) ?? 0) + 1);
      }

      const periodLimit = options.period === "year" ? 53 : Number(options.period);
      const eventQuery = supabase.from("events").select("id, event_date, title, type, status, counts_for_absence")
        .eq("type", "service").eq("status", "closed").eq("counts_for_absence", true)
        .lte("event_date", today).order("event_date", { ascending: false }).limit(periodLimit);
      if (options.period === "year") eventQuery.gte("event_date", localYearStart()).lte("event_date", today);
      const eventsResult = await eventQuery;
      if (eventsResult.error) unavailable();
      const events = (eventsResult.data ?? []) as EventRow[];
      const eventIds = events.map((event) => event.id);
      const eligibilityQuery = eventIds.length
        ? supabase.from("sunday_service_eligibility").select("event_id, member_id, life_group_id_at_close").in("event_id", eventIds)
        : null;
      const presenceQuery = eventIds.length
        ? supabase.from("sunday_service_presence").select("event_id, member_id").in("event_id", eventIds)
        : null;
      const [eligibilityResult, presenceResult] = await Promise.all([
        eligibilityQuery ?? Promise.resolve({ data: [], error: null }),
        presenceQuery ?? Promise.resolve({ data: [], error: null }),
      ]);
      if (eligibilityResult.error || presenceResult.error) unavailable();
      const eligible = new Map<string, Set<string>>();
      for (const row of eligibilityResult.data ?? []) {
        if (chartGroupId && row.life_group_id_at_close !== chartGroupId) continue;
        const set = eligible.get(row.event_id) ?? new Set<string>();
        set.add(row.member_id); eligible.set(row.event_id, set);
      }
      const present = new Map<string, Set<string>>();
      for (const row of presenceResult.data ?? []) {
        const set = present.get(row.event_id) ?? new Set<string>();
        set.add(row.member_id); present.set(row.event_id, set);
      }
      const points = [...events].reverse().map((event) => {
        const eligibleSet = eligible.get(event.id) ?? new Set<string>();
        const presentSet = new Set([...present.get(event.id) ?? []].filter((id) => eligibleSet.has(id)));
        return { date: event.event_date, eligibleCount: eligibleSet.size, eventId: event.id, presentCount: presentSet.size, rate: eligibleSet.size ? Math.round((presentSet.size / eligibleSet.size) * 100) : null };
      });
      const validRates = points.filter((point) => point.rate !== null).map((point) => point.rate as number);

      const upcomingEvents = await supabase.from("events").select("id, event_date, title, type, status").in("type", ["service", "harvest"]).gte("event_date", today).order("event_date", { ascending: true }).limit(6);
      const upcomingSessions = programmeIds.length ? await supabase.from("opencell_sessions").select("id, programme_id, session_date, title").in("programme_id", programmeIds).eq("is_cancelled", false).gte("session_date", today).order("session_date", { ascending: true }).limit(6) : { data: [], error: null };
      const gatheringQuery = supabase.from("life_group_gatherings").select("id, gathering_date, title, life_group_id").lt("gathering_date", today).order("gathering_date", { ascending: false }).limit(6);
      if (groupId) gatheringQuery.eq("life_group_id", groupId);
      const [gatheringsResult, finishedResult] = await Promise.all([
        gatheringQuery,
        supabase.from("opencell_programmes").select("id, name, finished_at").eq("status", "finished").order("finished_at", { ascending: false }).limit(6),
      ]);
      if (upcomingEvents.error || upcomingSessions.error || gatheringsResult.error || finishedResult.error) unavailable();
      const upcoming = [
        ...(upcomingEvents.data ?? []).map((row) => ({ context: row.type === "service" ? "Sunday Service" : "Harvest", date: row.event_date, href: row.type === "service" ? `/events/${row.id}` : `/events/harvest/${row.id}`, id: row.id, kind: row.type, status: row.status, title: row.title })),
        ...(upcomingSessions.data ?? []).map((row) => ({ context: "OpenCell", date: row.session_date, href: "/opencell", id: row.id, kind: "opencell_session", status: "upcoming", title: row.title ?? "OpenCell session" })),
      ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
      const recent = [
        ...(gatheringsResult.data ?? []).map((row) => ({ context: "Life Group Gathering", date: row.gathering_date, href: `/life-groups/${row.life_group_id}/gatherings`, id: row.id, kind: "gathering", status: "recent", title: row.title ?? "Life Group Gathering" })),
        ...(finishedResult.data ?? []).filter((row) => row.finished_at).map((row) => ({ context: "OpenCell", date: row.finished_at!.slice(0, 10), href: "/opencell", id: row.id, kind: "opencell_programme", status: "finished", title: row.name })),
      ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

      return {
        memberSnapshot: { age: breakdown(["under_18", "18_24", "25_34", "35_44", "45_54", "55_plus", "not_set"], memberAge, AGE_LABELS, members.length), gender: breakdown(["male", "female", "not_set"], memberGender, GENDER_LABELS, members.length) },
        metrics: actor.role === "admin"
          ? { activeFollowUps: followUpsResult.data?.length ?? 0, activeMembers: members.length, activeOpenCellProgrammes: activeProgrammeCount, activeVisitors: activeVisitorCount, newVisitorsThisMonth: newVisitorsResult.count ?? 0 }
          : { activeFollowUps: followUpsResult.data?.length ?? 0, activeOpenCellProgrammes: activeProgrammeCount, myLifeGroupMembers: members.length, myLifeGroupVisitors: activeVisitorCount },
        needsAttention: { byReason: breakdown(REASONS, followUpCounts, FOLLOW_UP_REASON_LABELS, followUpsResult.data?.length ?? 0), total: followUpsResult.data?.length ?? 0 },
        openCell: { activeProgrammes: activeProgrammeCount, currentParticipants: new Set((enrollmentsResult.data ?? []).map((row) => row.visitor_id)).size },
        recentUpcoming: { recent, upcoming },
        sundayAttendance: { averageRate: validRates.length ? Math.round(validRates.reduce((sum, rate) => sum + rate, 0) / validRates.length) : null, points },
      };
    },
  };
}
