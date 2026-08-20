import { createClient } from "@supabase/supabase-js";

import type { HorizonActor } from "../auth/types.js";
import {
  generateMemberQrToken,
  isMemberQrTokenCollision,
  MEMBER_QR_TOKEN_COLLISION_RETRIES,
} from "../members/member-qr-token.js";
import type { MemberService } from "../members/types.js";
import type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "../types/database.types.js";
import {
  VisitorServiceError,
  type ListVisitorsOptions,
  type Visitor,
  type VisitorService,
} from "./types.js";

interface SupabaseVisitorServiceConfig {
  generateQrToken?: () => string;
  memberService: MemberService;
  serviceRoleKey: string;
  supabaseUrl: string;
}

type VisitorRow = Tables<"visitors">;
type MemberConflictRow = Pick<
  Tables<"members">,
  "first_name" | "id" | "is_active" | "last_name" | "life_group_id"
>;

const VISITOR_COLUMNS =
  "id, first_name, last_name, phone, email, normalized_phone, normalized_email, status, converted_member_id, created_at, updated_at";
const LIFE_GROUP_COLUMNS = "id, name, is_active, leader_profile_id";

function serviceUnavailable() {
  return new VisitorServiceError(
    500,
    "VISITOR_SERVICE_UNAVAILABLE",
    "Visitor data is temporarily unavailable.",
  );
}

function isConstraintError(
  error: { code?: string; message?: string },
  constraint: string,
) {
  return error.code === "23505" && error.message?.includes(constraint);
}

function mapVisitorWriteError(error: { code?: string; message?: string }) {
  if (isConstraintError(error, "visitors_normalized_email_key")) {
    return new VisitorServiceError(
      409,
      "DUPLICATE_VISITOR_EMAIL",
      "Another Visitor already uses this email address.",
    );
  }
  if (isConstraintError(error, "visitors_normalized_phone_key")) {
    return new VisitorServiceError(
      409,
      "DUPLICATE_VISITOR_PHONE",
      "Another Visitor already uses this phone number.",
    );
  }
  return serviceUnavailable();
}

function mapVisitor(visitor: VisitorRow): Visitor {
  return {
    convertedMemberId: visitor.converted_member_id,
    createdAt: visitor.created_at,
    email: visitor.email,
    firstName: visitor.first_name,
    id: visitor.id,
    lastName: visitor.last_name,
    phone: visitor.phone,
    status: visitor.status,
    updatedAt: visitor.updated_at,
  };
}

export function createSupabaseVisitorService({
  generateQrToken = generateMemberQrToken,
  memberService,
  serviceRoleKey,
  supabaseUrl,
}: SupabaseVisitorServiceConfig): VisitorService {
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  async function getVisitorRow(visitorId: string) {
    const { data, error } = await supabase
      .from("visitors")
      .select(VISITOR_COLUMNS)
      .eq("id", visitorId)
      .maybeSingle();
    if (error) throw serviceUnavailable();
    if (!data) {
      throw new VisitorServiceError(
        404,
        "VISITOR_NOT_FOUND",
        "Visitor was not found.",
      );
    }
    return data;
  }

  async function getLifeGroup(lifeGroupId: string) {
    const { data, error } = await supabase
      .from("life_groups")
      .select(LIFE_GROUP_COLUMNS)
      .eq("id", lifeGroupId)
      .maybeSingle();
    if (error) throw serviceUnavailable();
    if (!data) {
      throw new VisitorServiceError(
        422,
        "LIFE_GROUP_NOT_FOUND",
        "The selected Life Group does not exist.",
      );
    }
    return data;
  }

  async function validateConversionGroup(
    actor: HorizonActor,
    lifeGroupId: string,
  ) {
    const lifeGroup = await getLifeGroup(lifeGroupId);
    if (!lifeGroup.is_active) {
      throw new VisitorServiceError(
        422,
        "INACTIVE_LIFE_GROUP",
        "Visitor conversion requires an active Life Group.",
      );
    }
    if (actor.role === "leader" && lifeGroup.leader_profile_id !== actor.id) {
      throw new VisitorServiceError(
        403,
        "VISITOR_SCOPE_FORBIDDEN",
        "Leaders may convert Visitors only into their own Life Group.",
      );
    }
    return lifeGroup;
  }

  function matchesSearch(visitor: Visitor, search: string | undefined) {
    if (!search) return true;
    const needle = search.toLocaleLowerCase();
    return [
      `${visitor.firstName} ${visitor.lastName}`,
      visitor.firstName,
      visitor.lastName,
      visitor.email,
      visitor.phone,
    ].some((value) => value?.toLocaleLowerCase().includes(needle));
  }

  async function findMemberConflict(
    visitor: VisitorRow,
    field: "email" | "phone",
  ): Promise<MemberConflictRow | null> {
    const normalizedValue =
      field === "email" ? visitor.normalized_email : visitor.normalized_phone;
    if (!normalizedValue) return null;
    const normalizedColumn =
      field === "email" ? "normalized_email" : "normalized_phone";
    const { data, error } = await supabase
      .from("members")
      .select("id, first_name, last_name, life_group_id, is_active")
      .eq(normalizedColumn, normalizedValue)
      .maybeSingle();
    if (error) throw serviceUnavailable();
    return data;
  }

  async function duplicateMemberError(
    actor: HorizonActor,
    visitor: VisitorRow,
    field: "email" | "phone",
    knownMemberId?: string | null,
  ) {
    let member: MemberConflictRow | null = null;
    if (knownMemberId) {
      const { data, error } = await supabase
        .from("members")
        .select("id, first_name, last_name, life_group_id, is_active")
        .eq("id", knownMemberId)
        .maybeSingle();
      if (error) throw serviceUnavailable();
      member = data;
    }
    member ??= await findMemberConflict(visitor, field);

    const fieldLabel = field === "email" ? "email address" : "phone number";
    let message = `A Member with this ${fieldLabel} already exists. Conversion cannot continue.`;

    if (member) {
      const lifeGroup = await getLifeGroup(member.life_group_id);
      const canView =
        actor.role === "admin" ||
        (member.is_active && lifeGroup.leader_profile_id === actor.id);
      if (canView) {
        message = `A Member with this ${fieldLabel} already exists: ${member.first_name} ${member.last_name} — ${lifeGroup.name}. Conversion cannot continue.`;
      }
    }

    return new VisitorServiceError(
      409,
      field === "email" ? "DUPLICATE_MEMBER_EMAIL" : "DUPLICATE_MEMBER_PHONE",
      message,
    );
  }

  async function handleConversionConstraint(
    actor: HorizonActor,
    visitor: VisitorRow,
    error: { code?: string; message?: string },
  ): Promise<never> {
    if (isConstraintError(error, "members_normalized_email_key")) {
      throw await duplicateMemberError(actor, visitor, "email");
    }
    if (isConstraintError(error, "members_normalized_phone_key")) {
      throw await duplicateMemberError(actor, visitor, "phone");
    }
    throw serviceUnavailable();
  }

  return {
    async list(actor, options: ListVisitorsOptions) {
      let query = supabase
        .from("visitors")
        .select(VISITOR_COLUMNS)
        .order("last_name")
        .order("first_name");
      if (actor.role === "leader") {
        query = query.eq("status", "active");
      } else if (options.status !== "all") {
        query = query.eq("status", options.status);
      }
      const { data, error } = await query;
      if (error) throw serviceUnavailable();
      return data.map(mapVisitor).filter((visitor) =>
        matchesSearch(visitor, options.search),
      );
    },

    async getById(actor, visitorId) {
      if (actor.role === "admin") return mapVisitor(await getVisitorRow(visitorId));
      const { data, error } = await supabase
        .from("visitors")
        .select(VISITOR_COLUMNS)
        .eq("id", visitorId)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw serviceUnavailable();
      if (!data) {
        throw new VisitorServiceError(
          404,
          "VISITOR_NOT_FOUND",
          "Visitor was not found.",
        );
      }
      return mapVisitor(data);
    },

    async create(input) {
      const insert: TablesInsert<"visitors"> = {
        email: input.email,
        first_name: input.firstName,
        last_name: input.lastName,
        phone: input.phone,
      };
      const { data, error } = await supabase
        .from("visitors")
        .insert(insert)
        .select(VISITOR_COLUMNS)
        .single();
      if (error) throw mapVisitorWriteError(error);
      return mapVisitor(data);
    },

    async update(actor, visitorId, input) {
      const visitor = await getVisitorRow(visitorId);
      if (visitor.status !== "active") {
        if (actor.role === "leader") {
          throw new VisitorServiceError(
            404,
            "VISITOR_NOT_FOUND",
            "Visitor was not found.",
          );
        }
        throw new VisitorServiceError(
          409,
          "VISITOR_NOT_ACTIVE",
          "Converted Visitors cannot be edited.",
        );
      }
      const update: TablesUpdate<"visitors"> = {};
      if (input.firstName !== undefined) update.first_name = input.firstName;
      if (input.lastName !== undefined) update.last_name = input.lastName;
      if (input.phone !== undefined) update.phone = input.phone;
      if (input.email !== undefined) update.email = input.email;
      const { data, error } = await supabase
        .from("visitors")
        .update(update)
        .eq("id", visitorId)
        .eq("status", "active")
        .select(VISITOR_COLUMNS)
        .single();
      if (error) throw mapVisitorWriteError(error);
      return mapVisitor(data);
    },

    async convert(actor, visitorId, lifeGroupId) {
      const visitor = await getVisitorRow(visitorId);
      if (visitor.status !== "active") {
        if (actor.role === "leader") {
          throw new VisitorServiceError(
            404,
            "VISITOR_NOT_FOUND",
            "Visitor was not found.",
          );
        }
        throw new VisitorServiceError(
          409,
          "VISITOR_NOT_ACTIVE",
          "This Visitor has already been converted.",
        );
      }
      await validateConversionGroup(actor, lifeGroupId);

      for (
        let attempt = 0;
        attempt < MEMBER_QR_TOKEN_COLLISION_RETRIES;
        attempt += 1
      ) {
        const { data, error } = await supabase.rpc("convert_visitor_to_member", {
          p_life_group_id: lifeGroupId,
          p_qr_token: generateQrToken(),
          p_visitor_id: visitorId,
        });

        if (error) {
          if (isMemberQrTokenCollision(error)) continue;
          await handleConversionConstraint(actor, visitor, error);
        }

        const result = data?.[0];
        if (!result) throw serviceUnavailable();
        if (result.outcome === "duplicate_member") {
          const field = result.conflict_field === "email" ? "email" : "phone";
          throw await duplicateMemberError(
            actor,
            visitor,
            field,
            result.conflicting_member_id,
          );
        }
        if (result.outcome === "visitor_not_found") {
          throw new VisitorServiceError(
            404,
            "VISITOR_NOT_FOUND",
            "Visitor was not found.",
          );
        }
        if (result.outcome === "visitor_not_active") {
          throw new VisitorServiceError(
            actor.role === "leader" ? 404 : 409,
            actor.role === "leader" ? "VISITOR_NOT_FOUND" : "VISITOR_NOT_ACTIVE",
            actor.role === "leader"
              ? "Visitor was not found."
              : "This Visitor has already been converted.",
          );
        }
        if (result.outcome === "life_group_not_found") {
          throw new VisitorServiceError(
            422,
            "LIFE_GROUP_NOT_FOUND",
            "The selected Life Group does not exist.",
          );
        }
        if (result.outcome === "inactive_life_group") {
          throw new VisitorServiceError(
            422,
            "INACTIVE_LIFE_GROUP",
            "Visitor conversion requires an active Life Group.",
          );
        }
        if (result.outcome !== "converted" || !result.created_member_id) {
          throw serviceUnavailable();
        }

        const [convertedVisitor, member] = await Promise.all([
          getVisitorRow(visitorId),
          memberService.getById(actor, result.created_member_id),
        ]);
        return { member, visitor: mapVisitor(convertedVisitor) };
      }

      throw serviceUnavailable();
    },
  };
}
