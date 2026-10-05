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
      const month = localMonthBounds();
      const visitorQuery = supabase.from("visitors").select("id", { count: "exact", head: true }).eq("status", "active");
      if (groupId) visitorQuery.eq("life_group_id", groupId);
      const newVisitorsQuery = actor.role === "admin"
        ? supabase.from("visitors").select("id", { count: "exact", head: true }).gte("created_at", month.start).lt("created_at", month.end)
        : Promise.resolve({ count: 0, error: null });
      const [demographicsResult, visitorsResult, activeProgrammeCountResult, activeEnrollmentCountResult, newVisitorsResult, followUpResults] = await Promise.all([
        supabase.rpc("dashboard_member_demographics", {
          p_as_of_date: today,
          p_life_group_id: groupId ?? null,
        }),
        visitorQuery,
        supabase.from("opencell_programmes").select("id", { count: "exact", head: true }).eq("status", "active"),
        // One active enrollment per Visitor is enforced by the OpenCell schema,
        // so an exact row count is the authoritative current-participant count.
        supabase.from("opencell_enrollments").select("visitor_id, opencell_programmes!inner(status)", { count: "exact", head: true }).eq("opencell_programmes.status", "active"),
        newVisitorsQuery,
        Promise.all(REASONS.map((reason) =>
          supabase.from("follow_ups").select("id", { count: "exact", head: true }).eq("status", "active").eq("reason", reason),
        )),
      ]);
      if (
        demographicsResult.error || visitorsResult.error ||
        activeProgrammeCountResult.error || activeEnrollmentCountResult.error ||
        newVisitorsResult.error || followUpResults.some((result) => result.error)
      ) unavailable();
      const activeVisitorCount = visitorsResult.count ?? 0;
      const activeProgrammeCount = activeProgrammeCountResult.count ?? 0;
      const activeParticipantCount = activeEnrollmentCountResult.count ?? 0;

      const followUpCounts = new Map<string, number>();
      REASONS.forEach((reason, index) => {
        followUpCounts.set(reason, followUpResults[index]?.count ?? 0);
      });
      const memberGender = new Map<string, number>();
      const memberAge = new Map<string, number>();
      for (const row of demographicsResult.data ?? []) {
        const target = row.dimension === "gender" ? memberGender : memberAge;
        target.set(row.bucket_key, Number(row.bucket_count));
      }
      const activeMemberCount = [...memberGender.values()].reduce((sum, count) => sum + count, 0);
      const activeFollowUpCount = [...followUpCounts.values()].reduce((sum, count) => sum + count, 0);

      const periodLimit = options.period === "year" ? 53 : Number(options.period);
      const eventQuery = supabase.from("events").select("id, event_date, title, type, status, counts_for_absence")
        .eq("type", "service").eq("status", "closed").eq("counts_for_absence", true)
        .lte("event_date", today).order("event_date", { ascending: false }).limit(periodLimit);
      if (options.period === "year") eventQuery.gte("event_date", localYearStart()).lte("event_date", today);
      const eventsResult = await eventQuery;
      if (eventsResult.error) unavailable();
      const events = (eventsResult.data ?? []) as EventRow[];
      const eventIds = events.map((event) => event.id);
      const attendanceResult = eventIds.length
        ? await supabase.rpc("dashboard_sunday_attendance", {
          p_event_ids: eventIds,
            p_life_group_id: chartGroupId ?? null,
          })
        : { data: [], error: null };
      if (attendanceResult.error) unavailable();
      const attendance = new Map(
        (attendanceResult.data ?? []).map((row) => [row.event_id, row]),
      );
      const points = [...events].reverse().map((event) => {
        const counts = attendance.get(event.id);
        const eligibleCount = Number(counts?.eligible_count ?? 0);
        const presentCount = Number(counts?.present_count ?? 0);
        return { date: event.event_date, eligibleCount, eventId: event.id, presentCount, rate: eligibleCount ? Math.round((presentCount / eligibleCount) * 100) : null };
      });
      const validRates = points.filter((point) => point.rate !== null).map((point) => point.rate as number);

      const upcomingEvents = await supabase.from("events").select("id, event_date, title, type, status").in("type", ["service", "harvest"]).gte("event_date", today).order("event_date", { ascending: true }).limit(6);
      const upcomingSessions = await supabase.from("opencell_sessions").select("id, programme_id, session_date, title, opencell_programmes!inner(status)").eq("opencell_programmes.status", "active").eq("is_cancelled", false).gte("session_date", today).order("session_date", { ascending: true }).limit(6);
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
        memberSnapshot: { age: breakdown(["under_18", "18_24", "25_34", "35_44", "45_54", "55_plus", "not_set"], memberAge, AGE_LABELS, activeMemberCount), gender: breakdown(["male", "female", "not_set"], memberGender, GENDER_LABELS, activeMemberCount) },
        metrics: actor.role === "admin"
          ? { activeFollowUps: activeFollowUpCount, activeMembers: activeMemberCount, activeOpenCellProgrammes: activeProgrammeCount, activeVisitors: activeVisitorCount, newVisitorsThisMonth: newVisitorsResult.count ?? 0 }
          : { activeFollowUps: activeFollowUpCount, activeOpenCellProgrammes: activeProgrammeCount, myLifeGroupMembers: activeMemberCount, myLifeGroupVisitors: activeVisitorCount },
        needsAttention: { byReason: breakdown(REASONS, followUpCounts, FOLLOW_UP_REASON_LABELS, activeFollowUpCount), total: activeFollowUpCount },
        openCell: { activeProgrammes: activeProgrammeCount, currentParticipants: activeParticipantCount },
        recentUpcoming: { recent, upcoming },
        sundayAttendance: { averageRate: validRates.length ? Math.round(validRates.reduce((sum, rate) => sum + rate, 0) / validRates.length) : null, points },
      };
    },
  };
}
