import { createClient } from "@supabase/supabase-js";

import type { HorizonActor } from "../auth/types.js";
import type { Database, Json, Tables } from "../types/database.types.js";
import {
  FOLLOW_UP_REASON_LABELS,
  FollowUpServiceError,
  type FollowUp,
  type FollowUpService,
  type FollowUpStatus,
  type SundayAbsenceFollowUpContext,
} from "./types.js";

interface SupabaseFollowUpServiceConfig {
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
  serviceRoleKey,
  supabaseUrl,
}: SupabaseFollowUpServiceConfig): FollowUpService {
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  async function getRows(status: FollowUpStatus, followUpId?: string) {
    let query = supabase
      .from("follow_ups")
      .select(FOLLOW_UP_COLUMNS)
      .eq("status", status);

    if (followUpId) query = query.eq("id", followUpId);
    query = status === "active"
      ? query.order("created_at").order("id")
      : query.order("completed_at", { ascending: false }).order("id");

    const { data, error } = await query;
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
      memberIds.length
        ? supabase.from("members").select("id, first_name, last_name, is_active").in("id", memberIds)
        : Promise.resolve({ data: [] as MemberSubjectRow[], error: null }),
      visitorIds.length
        ? supabase.from("visitors").select("id, first_name, last_name, status").in("id", visitorIds)
        : Promise.resolve({ data: [] as VisitorSubjectRow[], error: null }),
      profileIds.length
        ? supabase.from("profiles").select("id, name").in("id", profileIds)
        : Promise.resolve({ data: [] as ProfileRow[], error: null }),
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
    async list(_actor: HorizonActor, status: FollowUpStatus) {
      return mapRows(await getRows(status));
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
        // Generated function-argument types do not represent nullable PostgreSQL inputs.
        p_member_id: memberId,
        p_reason: "consecutive_sunday_absence",
        p_visitor_id: null as unknown as string,
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
