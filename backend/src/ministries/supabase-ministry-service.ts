import { createClient } from "@supabase/supabase-js";

import type { HorizonActor } from "../auth/types.js";
import {
  MemberServiceError,
  type Member,
  type MemberService,
} from "../members/types.js";
import type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "../types/database.types.js";
import {
  MinistryServiceError,
  type ListMinistriesOptions,
  type Ministry,
  type MinistryMember,
  type MinistryService,
} from "./types.js";

interface SupabaseMinistryServiceConfig {
  memberService: MemberService;
  serviceRoleKey: string;
  supabaseUrl: string;
}

type MinistryRow = Tables<"ministries">;

const MINISTRY_COLUMNS =
  "id, name, description, is_active, created_at, updated_at";

function serviceUnavailable() {
  return new MinistryServiceError(
    500,
    "MINISTRY_SERVICE_UNAVAILABLE",
    "Ministry data is temporarily unavailable.",
  );
}

function ministryNotFound() {
  return new MinistryServiceError(
    404,
    "MINISTRY_NOT_FOUND",
    "Ministry was not found.",
  );
}

function mapMinistry(ministry: MinistryRow): Ministry {
  return {
    createdAt: ministry.created_at,
    description: ministry.description,
    id: ministry.id,
    isActive: ministry.is_active,
    name: ministry.name,
    updatedAt: ministry.updated_at,
  };
}

function mapMember(member: Member): MinistryMember {
  return {
    email: member.email,
    firstName: member.firstName,
    id: member.id,
    isActive: member.isActive,
    lastName: member.lastName,
    lifeGroup: member.lifeGroup,
    phone: member.phone,
  };
}

export function createSupabaseMinistryService({
  memberService,
  serviceRoleKey,
  supabaseUrl,
}: SupabaseMinistryServiceConfig): MinistryService {
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  async function getMinistryRow(ministryId: string) {
    const { data, error } = await supabase
      .from("ministries")
      .select(MINISTRY_COLUMNS)
      .eq("id", ministryId)
      .maybeSingle();

    if (error) throw serviceUnavailable();
    if (!data) throw ministryNotFound();
    return data;
  }

  async function getVisibleMinistryRow(
    actor: HorizonActor,
    ministryId: string,
  ) {
    let query = supabase
      .from("ministries")
      .select(MINISTRY_COLUMNS)
      .eq("id", ministryId);

    if (actor.role === "leader") query = query.eq("is_active", true);

    const { data, error } = await query.maybeSingle();
    if (error) throw serviceUnavailable();
    if (!data) throw ministryNotFound();
    return data;
  }

  async function getVisibleMembers(actor: HorizonActor) {
    try {
      return await memberService.list(actor, { status: "all" });
    } catch {
      throw serviceUnavailable();
    }
  }

  async function getAssignableMember(actor: HorizonActor, memberId: string) {
    try {
      return await memberService.getById(actor, memberId);
    } catch (error) {
      if (
        error instanceof MemberServiceError &&
        error.code === "MEMBER_NOT_FOUND"
      ) {
        throw new MinistryServiceError(
          404,
          "MEMBER_NOT_FOUND",
          "Member was not found.",
        );
      }
      throw serviceUnavailable();
    }
  }

  async function getAssignedMemberIds(ministryId: string) {
    const { data, error } = await supabase
      .from("member_ministries")
      .select("member_id")
      .eq("ministry_id", ministryId);

    if (error) throw serviceUnavailable();
    return new Set(data.map((assignment) => assignment.member_id));
  }

  return {
    async list(actor, options: ListMinistriesOptions) {
      let query = supabase
        .from("ministries")
        .select(MINISTRY_COLUMNS)
        .order("name");

      if (actor.role === "leader") {
        query = query.eq("is_active", true);
      } else if (options.status !== "all") {
        query = query.eq("is_active", options.status === "active");
      }

      const { data, error } = await query;
      if (error) throw serviceUnavailable();

      const ministries = data.map(mapMinistry);
      if (!options.search) return ministries;
      const search = options.search.toLocaleLowerCase();
      return ministries.filter((ministry) =>
        ministry.name.toLocaleLowerCase().includes(search),
      );
    },

    async getById(actor, ministryId) {
      return mapMinistry(await getVisibleMinistryRow(actor, ministryId));
    },

    async create(input) {
      const insert: TablesInsert<"ministries"> = {
        description: input.description,
        name: input.name,
      };
      const { data, error } = await supabase
        .from("ministries")
        .insert(insert)
        .select(MINISTRY_COLUMNS)
        .single();

      if (error) throw serviceUnavailable();
      return mapMinistry(data);
    },

    async update(ministryId, input) {
      await getMinistryRow(ministryId);
      const update: TablesUpdate<"ministries"> = {};
      if (input.name !== undefined) update.name = input.name;
      if (input.description !== undefined) update.description = input.description;

      const { data, error } = await supabase
        .from("ministries")
        .update(update)
        .eq("id", ministryId)
        .select(MINISTRY_COLUMNS)
        .single();

      if (error) throw serviceUnavailable();
      return mapMinistry(data);
    },

    async archive(ministryId) {
      await getMinistryRow(ministryId);
      const { data, error } = await supabase
        .from("ministries")
        .update({ is_active: false })
        .eq("id", ministryId)
        .select(MINISTRY_COLUMNS)
        .single();

      if (error) throw serviceUnavailable();
      return mapMinistry(data);
    },

    async listMembers(actor, ministryId) {
      await getVisibleMinistryRow(actor, ministryId);
      const assignedMemberIds = await getAssignedMemberIds(ministryId);
      if (assignedMemberIds.size === 0) return [];
      const visibleMembers = await getVisibleMembers(actor);
      return visibleMembers
        .filter((member) => assignedMemberIds.has(member.id))
        .map(mapMember);
    },

    async assignMember(actor, ministryId, memberId) {
      const ministry = await getMinistryRow(ministryId);
      if (!ministry.is_active) {
        throw new MinistryServiceError(
          422,
          "INACTIVE_MINISTRY",
          "New assignments require an active Ministry.",
        );
      }

      const member = await getAssignableMember(actor, memberId);
      if (!member.isActive) {
        throw new MinistryServiceError(
          422,
          "INACTIVE_MEMBER",
          "New assignments require an active Member.",
        );
      }

      const insert: TablesInsert<"member_ministries"> = {
        member_id: memberId,
        ministry_id: ministryId,
      };
      const { error } = await supabase.from("member_ministries").insert(insert);
      if (error?.code === "23505") {
        throw new MinistryServiceError(
          409,
          "MEMBER_ALREADY_ASSIGNED",
          "This Member is already assigned to the Ministry.",
        );
      }
      if (error?.code === "23503") {
        throw ministryNotFound();
      }
      if (error) throw serviceUnavailable();
      return mapMember(member);
    },

    async removeMember(actor, ministryId, memberId) {
      await getMinistryRow(ministryId);
      const member = await getAssignableMember(actor, memberId);
      const { data, error } = await supabase
        .from("member_ministries")
        .delete()
        .eq("ministry_id", ministryId)
        .eq("member_id", memberId)
        .select("member_id")
        .maybeSingle();

      if (error) throw serviceUnavailable();
      if (!data) {
        throw new MinistryServiceError(
          404,
          "MINISTRY_ASSIGNMENT_NOT_FOUND",
          "Member is not assigned to this Ministry.",
        );
      }

      return mapMember(member);
    },
  };
}
