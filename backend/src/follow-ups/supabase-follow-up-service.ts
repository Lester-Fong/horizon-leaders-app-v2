import { createClient } from "@supabase/supabase-js";

import type { HorizonActor } from "../auth/types.js";
import {
  fetchAllRows,
  fetchRowPage,
  fetchRowsByIds,
  type CountOptions,
} from "../db/range-queries.js";
import { buildPageMeta } from "../http/pagination.js";
import type { Database } from "../types/database.overrides.js";
import type { Json, Tables } from "../types/database.types.js";
import {
  FOLLOW_UP_REASON_LABELS,
  FollowUpServiceError,
  type FollowUp,
  type FollowUpListFilters,
  type FollowUpService,
  type FollowUpStatus,
  type SundayAbsenceFollowUpContext,
} from "./types.js";

interface SupabaseFollowUpServiceConfig {
  /** Test seam: replaces the HTTP client PostgREST requests go through. */
  fetchImpl?: typeof globalThis.fetch;
  serviceRoleKey: string;
  supabaseUrl: string;
}

type FollowUpRow = Tables<"follow_ups">;
type MemberSubjectRow = Pick<
  Tables<"members">,
  "first_name" | "id" | "is_active" | "last_name"
>;
type VisitorSubjectRow = Pick<
  Tables<"visitors">,
  "first_name" | "id" | "last_name" | "status"
>;
type ProfileRow = Pick<Tables<"profiles">, "id" | "name">;

const FOLLOW_UP_COLUMNS =
  "id, member_id, visitor_id, reason, context, status, created_at, completed_by_profile_id, completed_at, completion_note";
/** Adds left embeds of the subject so a Life Group filter can match either subject type. */
const FOLLOW_UP_COLUMNS_WITH_SUBJECT_GROUPS =
  `${FOLLOW_UP_COLUMNS}, members!left(id), visitors!left(id)` as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function serviceUnavailable() {
  return new FollowUpServiceError(
    500,
    "FOLLOW_UP_SERVICE_UNAVAILABLE",
    "Follow Up data is temporarily unavailable.",
  );
}

function followUpNotFound() {
  return new FollowUpServiceError(
    404,
    "FOLLOW_UP_NOT_FOUND",
    "Follow Up was not found.",
  );
}

/** Asia/Manila is a fixed +08:00 offset, so a calendar date maps to one exact instant range. */
function manilaDayStart(calendarDate: string) {
  return new Date(`${calendarDate}T00:00:00+08:00`).toISOString();
}

function manilaDayAfter(calendarDate: string) {
  const start = new Date(`${calendarDate}T00:00:00+08:00`);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

/** The Life Group a filter resolves to; `null` means the filter matches nothing. */
type ResolvedFilters = Omit<FollowUpListFilters, "lifeGroup"> & { lifeGroupId?: string | null };

function validateSundayContext(context: SundayAbsenceFollowUpContext) {
  return (
    Number.isInteger(context.threshold) &&
    context.threshold > 0 &&
    Array.isArray(context.qualifyingServiceIds) &&
    context.qualifyingServiceIds.length >= context.threshold &&
    context.qualifyingServiceIds.every((serviceId) => UUID_PATTERN.test(serviceId))
  );
}

export function createSupabaseFollowUpService({
  fetchImpl,
  serviceRoleKey,
  supabaseUrl,
}: SupabaseFollowUpServiceConfig): FollowUpService {
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  /**
   * Active oldest first; History most recently completed first; `id` breaks ties.
   * Date filters apply to `created_at` for active and `completed_at` for History.
   * A Life Group filter matches a Member subject whose current Life Group, or a
   * Visitor subject whose current affiliation (DEC-064), is that group.
   */
  function buildStatusQuery(
    status: FollowUpStatus,
    countOptions?: CountOptions,
    filters: ResolvedFilters = {},
  ) {
    const { fromDate, lifeGroupId, reason, toDate } = filters;
    let query = lifeGroupId
      ? supabase
          .from("follow_ups")
          .select(FOLLOW_UP_COLUMNS_WITH_SUBJECT_GROUPS, countOptions)
          .eq("status", status)
          .eq("members.life_group_id", lifeGroupId)
          .eq("visitors.life_group_id", lifeGroupId)
          .or("members.not.is.null,visitors.not.is.null")
      : supabase
          .from("follow_ups")
          .select(FOLLOW_UP_COLUMNS, countOptions)
          .eq("status", status);
    const dateColumn = status === "active" ? "created_at" : "completed_at";
    if (reason) query = query.eq("reason", reason);
    if (fromDate) query = query.gte(dateColumn, manilaDayStart(fromDate));
    if (toDate) query = query.lt(dateColumn, manilaDayAfter(toDate));
    return status === "active"
      ? query.order("created_at").order("id")
      : query.order("completed_at", { ascending: false }).order("id");
  }

  /** Resolves `lifeGroup: mine` to the Life Group the actor leads, if any. */
  async function resolveFilters(
    actor: HorizonActor,
    filters: FollowUpListFilters = {},
  ): Promise<ResolvedFilters> {
    const { lifeGroup, ...rest } = filters;
    if (!lifeGroup) return rest;
    if (lifeGroup.type === "lifeGroup") return { ...rest, lifeGroupId: lifeGroup.lifeGroupId };
    const { data, error } = await supabase
      .from("life_groups")
      .select("id")
      .eq("leader_profile_id", actor.id)
      .maybeSingle();
    if (error) throw serviceUnavailable();
    return { ...rest, lifeGroupId: data?.id ?? null };
  }

  async function getRows(status: FollowUpStatus, followUpId?: string) {
    const { data, error } = followUpId
      ? await buildStatusQuery(status).eq("id", followUpId)
      : await fetchAllRows(() => buildStatusQuery(status));
    if (error) throw serviceUnavailable();
    return data;
  }

  async function mapRows(rows: FollowUpRow[]): Promise<FollowUp[]> {
    const memberIds = rows.flatMap((row) => row.member_id ? [row.member_id] : []);
    const visitorIds = rows.flatMap((row) => row.visitor_id ? [row.visitor_id] : []);
    const profileIds = rows.flatMap((row) =>
      row.completed_by_profile_id ? [row.completed_by_profile_id] : [],
    );

    const [memberResult, visitorResult, profileResult] = await Promise.all([
      fetchRowsByIds<MemberSubjectRow>(memberIds, (ids) =>
        supabase.from("members").select("id, first_name, last_name, is_active").in("id", ids),
      ),
      fetchRowsByIds<VisitorSubjectRow>(visitorIds, (ids) =>
        supabase.from("visitors").select("id, first_name, last_name, status").in("id", ids),
      ),
      fetchRowsByIds<ProfileRow>(profileIds, (ids) =>
        supabase.from("profiles").select("id, name").in("id", ids),
      ),
    ]);

    if (memberResult.error || visitorResult.error || profileResult.error) {
      throw serviceUnavailable();
    }

    const members = new Map(memberResult.data.map((member) => [member.id, member]));
    const visitors = new Map(visitorResult.data.map((visitor) => [visitor.id, visitor]));
    const profiles = new Map(profileResult.data.map((profile) => [profile.id, profile]));

    return rows.map((row) => {
      const member = row.member_id ? members.get(row.member_id) : undefined;
      const visitor = row.visitor_id ? visitors.get(row.visitor_id) : undefined;
      const completedBy = row.completed_by_profile_id
        ? profiles.get(row.completed_by_profile_id)
        : undefined;
      const subject = member
        ? {
            id: member.id,
            name: `${member.first_name} ${member.last_name}`,
            recordStatus: member.is_active ? "active" as const : "archived" as const,
            type: "member" as const,
          }
        : visitor
          ? {
              id: visitor.id,
              name: `${visitor.first_name} ${visitor.last_name}`,
              recordStatus: visitor.status,
              type: "visitor" as const,
            }
          : undefined;

      if (!subject || (row.completed_by_profile_id && !completedBy)) {
        throw serviceUnavailable();
      }

      return {
        completedAt: row.completed_at,
        completedBy: completedBy ? { id: completedBy.id, name: completedBy.name } : null,
        completionNote: row.completion_note,
        context: row.context,
        createdAt: row.created_at,
        id: row.id,
        reason: row.reason,
        reasonLabel: FOLLOW_UP_REASON_LABELS[row.reason],
        status: row.status,
        subject,
      };
    });
  }

  async function getById(followUpId: string) {
    const [activeRows, completedRows] = await Promise.all([
      getRows("active", followUpId),
      getRows("completed", followUpId),
    ]);
    const mapped = await mapRows([...activeRows, ...completedRows]);
    if (!mapped[0]) throw followUpNotFound();
    return mapped[0];
  }

  return {
    async list(actor: HorizonActor, status: FollowUpStatus, filters) {
      const resolved = await resolveFilters(actor, filters);
      if (resolved.lifeGroupId === null) return [];
      const { data, error } = await fetchAllRows(() => buildStatusQuery(status, undefined, resolved));
      if (error) throw serviceUnavailable();
      return mapRows(data);
    },

    async listPage(actor: HorizonActor, status: FollowUpStatus, page, filters) {
      const resolved = await resolveFilters(actor, filters);
      if (resolved.lifeGroupId === null) {
        return { items: [], meta: buildPageMeta(page, 0, 0) };
      }
      const { data, error } = await fetchRowPage(
        (countOptions) => buildStatusQuery(status, countOptions, resolved),
        page,
      );
      if (error) throw serviceUnavailable();
      const items = await mapRows(data.rows);
      return { items, meta: buildPageMeta(page, data.total, items.length) };
    },

    async complete(actor, followUpId, completionNote) {
      const { data, error } = await supabase.rpc("complete_follow_up", {
        p_completed_by_profile_id: actor.id,
        p_completion_note: completionNote ?? "",
        p_follow_up_id: followUpId,
      });
      if (error) throw serviceUnavailable();
      const outcome = data[0]?.outcome;
      if (outcome === "not_found") throw followUpNotFound();
      if (outcome === "already_completed") {
        throw new FollowUpServiceError(
          409,
          "FOLLOW_UP_ALREADY_COMPLETED",
          "This Follow Up has already been completed.",
        );
      }
      if (outcome !== "completed") throw serviceUnavailable();
      return getById(followUpId);
    },

    async triggerSundayAbsence(memberId, context) {
      if (!validateSundayContext(context)) {
        throw new FollowUpServiceError(
          422,
          "INVALID_TRIGGER_CONTEXT",
          "Sunday absence Follow Up context is invalid.",
        );
      }

      const rpcArguments: Database["public"]["Functions"]["create_follow_up_if_absent"]["Args"] = {
        p_context: context as unknown as Json,
        p_member_id: memberId,
        p_reason: "consecutive_sunday_absence",
        p_visitor_id: null,
      };
      const { data, error } = await supabase.rpc("create_follow_up_if_absent", rpcArguments);
      if (error?.code === "23503") throw followUpNotFound();
      if (error) throw serviceUnavailable();
      const result = data[0];
      if (!result || (result.outcome !== "created" && result.outcome !== "suppressed")) {
        throw serviceUnavailable();
      }
      return {
        followUp: await getById(result.follow_up_id),
        outcome: result.outcome,
      };
    },
  };
}
