import { createClient } from "@supabase/supabase-js";

import type { HorizonActor } from "../auth/types.js";
import { churchDate } from "../config/church-date.js";
import { CHURCH_TIME_ZONE } from "../config/constants.js";
import type { Database } from "../types/database.overrides.js";
import type { Tables } from "../types/database.types.js";
import { FOLLOW_UP_REASON_LABELS, type FollowUpReason } from "../follow-ups/types.js";
import {
  DashboardServiceError,
  type AutomationRunStatus,
  type DashboardAutomationStatus,
  type DashboardBreakdown,
  type DashboardData,
  type DashboardService,
} from "./types.js";

interface Config { fetchImpl?: typeof globalThis.fetch; serviceRoleKey: string; supabaseUrl: string }
type EventRow = Pick<Tables<"events">, "counts_for_absence" | "event_date" | "id" | "status" | "title" | "type">;

const SUNDAY_RECONCILIATION_JOB = "sunday_reconciliation";
const PENDING_SERVICE_LIMIT = 5;
const AUTOMATION_RUN_STATUSES: readonly AutomationRunStatus[] = ["running", "succeeded", "partial", "failed"];

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

/** The current church-calendar month as [start, end) instants; Asia/Manila is a fixed +08:00 offset. */
export function localMonthBounds(now = new Date()) {
  const parts = localDateParts(now);
  const year = Number(parts.year);
  const month = Number(parts.month);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const monthStart = (y: number, m: number) => new Date(`${y}-${String(m).padStart(2, "0")}-01T00:00:00+08:00`).toISOString();
  return { end: monthStart(nextYear, nextMonth), start: monthStart(year, month) };
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

export function createSupabaseDashboardService({ fetchImpl, serviceRoleKey, supabaseUrl }: Config): DashboardService {
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
  });

  /** Admin: undefined. Leader: their Life Group ID, or null when they lead no Life Group. */
  async function leaderGroup(actor: HorizonActor) {
    if (actor.role !== "leader") return undefined;
    const { data, error } = await supabase.from("life_groups").select("id").eq("leader_profile_id", actor.id).maybeSingle();
    if (error) unavailable();
    return data?.id ?? null;
  }

  /** Latest Sunday reconciliation run plus the closed counting Services it still has to evaluate. */
  async function automationStatus(): Promise<DashboardAutomationStatus> {
    const [runResult, pendingResult] = await Promise.all([
      supabase.from("automation_runs")
        .select("job_name, status, started_at, finished_at, processed_count, error_count, error_summary")
        .eq("job_name", SUNDAY_RECONCILIATION_JOB)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("events")
        .select("id, event_date, title, sunday_service_evaluations!left(event_id)", { count: "exact" })
        .eq("type", "service").eq("status", "closed").eq("counts_for_absence", true)
        .is("sunday_service_evaluations", null)
        .order("event_date", { ascending: true }).order("id", { ascending: true })
        .limit(PENDING_SERVICE_LIMIT),
    ]);
    if (runResult.error || pendingResult.error) unavailable();
    const run = runResult.data;
    if (run && !AUTOMATION_RUN_STATUSES.includes(run.status as AutomationRunStatus)) unavailable();
    return {
      lastRun: run
        ? {
          errorCount: run.error_count,
          errorSummary: run.error_summary,
          finishedAt: run.finished_at,
          jobName: run.job_name,
          processedCount: run.processed_count,
          startedAt: run.started_at,
          status: run.status as AutomationRunStatus,
        }
        : null,
      pendingServiceCount: pendingResult.count ?? 0,
      pendingServices: (pendingResult.data ?? []).map((row) => ({ date: row.event_date, eventId: row.id, title: row.title })),
    };
  }

  return {
    async get(actor, options): Promise<DashboardData> {
      const ownGroup = await leaderGroup(actor);
      // A Leader without a Life Group has no group-scoped data: zero/empty values, never church-wide rows.
      const isUnassignedLeader = ownGroup === null;
      const groupId = actor.role === "leader" ? ownGroup ?? undefined : undefined;
      const chartGroupId = actor.role === "leader" ? ownGroup ?? undefined : options.lifeGroupId;
      const today = localToday();
      const month = localMonthBounds();
      const noRows = { data: [], error: null };
      const visitorQuery = isUnassignedLeader
        ? Promise.resolve({ count: 0, error: null })
        : groupId
          ? supabase.from("visitors").select("id", { count: "exact", head: true }).eq("status", "active").eq("life_group_id", groupId)
          : supabase.from("visitors").select("id", { count: "exact", head: true }).eq("status", "active");
      const newVisitorsQuery = actor.role === "admin"
        ? supabase.from("visitors").select("id", { count: "exact", head: true }).gte("created_at", month.start).lt("created_at", month.end)
        : Promise.resolve({ count: 0, error: null });
      const [demographicsResult, visitorsResult, activeProgrammeCountResult, activeEnrollmentCountResult, newVisitorsResult, followUpResults] = await Promise.all([
        isUnassignedLeader
          ? Promise.resolve(noRows)
          : supabase.rpc("dashboard_member_demographics", {
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
      const eventsResult = isUnassignedLeader ? noRows : await eventQuery;
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
        isUnassignedLeader ? noRows : gatheringQuery,
        supabase.from("opencell_programmes").select("id, name, finished_at").eq("status", "finished").order("finished_at", { ascending: false }).limit(6),
      ]);
      if (upcomingEvents.error || upcomingSessions.error || gatheringsResult.error || finishedResult.error) unavailable();
      // Leaders never query or receive automation data (DEC-079).
      const automation = actor.role === "admin" ? await automationStatus() : undefined;
      const upcoming = [
        ...(upcomingEvents.data ?? []).map((row) => ({ context: row.type === "service" ? "Sunday Service" : "Harvest", date: row.event_date, href: row.type === "service" ? `/events/${row.id}` : `/events/harvest/${row.id}`, id: row.id, kind: row.type, status: row.status, title: row.title })),
        ...(upcomingSessions.data ?? []).map((row) => ({ context: "OpenCell", date: row.session_date, href: "/opencell", id: row.id, kind: "opencell_session", status: "upcoming", title: row.title ?? "OpenCell session" })),
      ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
      const recent = [
        ...(gatheringsResult.data ?? []).map((row) => ({ context: "Life Group Gathering", date: row.gathering_date, href: `/life-groups/${row.life_group_id}/gatherings`, id: row.id, kind: "gathering", status: "recent", title: row.title ?? "Life Group Gathering" })),
        ...(finishedResult.data ?? []).filter((row) => row.finished_at).map((row) => ({ context: "OpenCell", date: churchDate(new Date(row.finished_at!)), href: "/opencell", id: row.id, kind: "opencell_programme", status: "finished", title: row.name })),
      ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

      return {
        ...(automation ? { automation } : {}),
        isUnassignedLeader,
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
