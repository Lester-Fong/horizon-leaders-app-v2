import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import type { HorizonActor } from "../auth/types.js";
import type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "../types/database.types.js";
import {
  MemberServiceError,
  type Member,
  type MemberService,
  type ListMembersOptions,
} from "./types.js";

interface SupabaseMemberServiceConfig {
  generateQrToken?: () => string;
  serviceRoleKey: string;
  supabaseUrl: string;
}

type LifeGroupRow = Pick<
  Tables<"life_groups">,
  "id" | "is_active" | "leader_profile_id" | "name"
>;
type MemberRow = Omit<Tables<"members">, "normalized_email" | "normalized_phone">;

const MEMBER_COLUMNS =
  "id, first_name, last_name, phone, email, address, birth_date, gender, life_group_id, qr_token, is_active, created_at, updated_at";
const LIFE_GROUP_COLUMNS = "id, name, is_active, leader_profile_id";
const QR_TOKEN_COLLISION_RETRIES = 3;

function defaultGenerateQrToken() {
  return randomBytes(32).toString("base64url");
}

function serviceUnavailable() {
  return new MemberServiceError(
    500,
    "MEMBER_SERVICE_UNAVAILABLE",
    "Member data is temporarily unavailable.",
  );
}

function isConstraintError(error: { code?: string; message?: string }, name: string) {
  return error.code === "23505" && error.message?.includes(name);
}

function mapWriteError(error: { code?: string; message?: string }) {
  if (isConstraintError(error, "members_normalized_email_key")) {
    return new MemberServiceError(
      409,
      "DUPLICATE_MEMBER_EMAIL",
      "Another Member already uses this email address.",
    );
  }

  if (isConstraintError(error, "members_normalized_phone_key")) {
    return new MemberServiceError(
      409,
      "DUPLICATE_MEMBER_PHONE",
      "Another Member already uses this phone number.",
    );
  }

  if (error.code === "23503") {
    return new MemberServiceError(
      422,
      "LIFE_GROUP_NOT_FOUND",
      "The selected Life Group does not exist.",
    );
  }

  return serviceUnavailable();
}

function mapMember(member: MemberRow, lifeGroup: LifeGroupRow): Member {
  return {
    address: member.address,
    birthDate: member.birth_date,
    createdAt: member.created_at,
    email: member.email,
    firstName: member.first_name,
    gender: member.gender,
    id: member.id,
    isActive: member.is_active,
    lastName: member.last_name,
    lifeGroup: {
      id: lifeGroup.id,
      isActive: lifeGroup.is_active,
      name: lifeGroup.name,
    },
    phone: member.phone,
    qrToken: member.qr_token,
    updatedAt: member.updated_at,
  };
}

export function createSupabaseMemberService({
  generateQrToken = defaultGenerateQrToken,
  serviceRoleKey,
  supabaseUrl,
}: SupabaseMemberServiceConfig): MemberService {
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  async function getLifeGroup(lifeGroupId: string) {
    const { data, error } = await supabase
      .from("life_groups")
      .select(LIFE_GROUP_COLUMNS)
      .eq("id", lifeGroupId)
      .maybeSingle();

    if (error) throw serviceUnavailable();
    if (!data) {
      throw new MemberServiceError(
        422,
        "LIFE_GROUP_NOT_FOUND",
        "The selected Life Group does not exist.",
      );
    }

    return data;
  }

  async function validateNewAssignment(actor: HorizonActor, lifeGroupId: string) {
    const lifeGroup = await getLifeGroup(lifeGroupId);

    if (!lifeGroup.is_active) {
      throw new MemberServiceError(
        422,
        "INACTIVE_LIFE_GROUP",
        "New Members must be assigned to an active Life Group.",
      );
    }

    if (actor.role === "leader" && lifeGroup.leader_profile_id !== actor.id) {
      throw new MemberServiceError(
        403,
        "MEMBER_SCOPE_FORBIDDEN",
        "Leaders may assign Members only to their own Life Group.",
      );
    }

    return lifeGroup;
  }

  async function getMemberRow(memberId: string) {
    const { data, error } = await supabase
      .from("members")
      .select(MEMBER_COLUMNS)
      .eq("id", memberId)
      .maybeSingle();

    if (error) throw serviceUnavailable();
    if (!data) {
      throw new MemberServiceError(
        404,
        "MEMBER_NOT_FOUND",
        "Member was not found.",
      );
    }

    return data;
  }

  async function getLeaderLifeGroupId(actor: HorizonActor) {
    const { data, error } = await supabase
      .from("life_groups")
      .select("id")
      .eq("leader_profile_id", actor.id)
      .maybeSingle();

    if (error) throw serviceUnavailable();
    return data?.id;
  }

  function matchesSearch(member: Member, search: string | undefined) {
    if (!search) return true;
    const needle = search.toLocaleLowerCase();
    return [
      `${member.firstName} ${member.lastName}`,
      member.firstName,
      member.lastName,
      member.email,
      member.phone,
      member.address,
    ].some((value) => value?.toLocaleLowerCase().includes(needle));
  }

  async function listRows(
    actor: HorizonActor,
    options: ListMembersOptions,
  ) {
    let query = supabase
      .from("members")
      .select(MEMBER_COLUMNS)
      .order("last_name")
      .order("first_name");

    if (actor.role === "leader") {
      const lifeGroupId = await getLeaderLifeGroupId(actor);
      if (!lifeGroupId) return [];
      query = query.eq("life_group_id", lifeGroupId).eq("is_active", true);
    } else {
      if (options.lifeGroupId) {
        query = query.eq("life_group_id", options.lifeGroupId);
      }
      if (options.status !== "all") {
        query = query.eq("is_active", options.status === "active");
      }
    }

    const { data, error } = await query;
    if (error) throw serviceUnavailable();
    return data;
  }

  async function hydrateMember(member: MemberRow) {
    return mapMember(member, await getLifeGroup(member.life_group_id));
  }

  async function assertLeaderCanEdit(actor: HorizonActor, member: MemberRow) {
    if (actor.role === "admin") return;

    if (!member.is_active) {
      throw new MemberServiceError(
        404,
        "MEMBER_NOT_FOUND",
        "Member was not found.",
      );
    }

    const lifeGroup = await getLifeGroup(member.life_group_id);
    if (lifeGroup.leader_profile_id !== actor.id) {
      throw new MemberServiceError(
        403,
        "MEMBER_SCOPE_FORBIDDEN",
        "Leaders may edit Members only in their own Life Group.",
      );
    }
  }

  return {
    async list(actor, options) {
      const rows = await listRows(actor, options);
      const members = await Promise.all(rows.map(hydrateMember));
      return members.filter((member) => matchesSearch(member, options.search));
    },

    async getById(actor, memberId) {
      if (actor.role === "admin") {
        return hydrateMember(await getMemberRow(memberId));
      }

      const lifeGroupId = await getLeaderLifeGroupId(actor);
      if (!lifeGroupId) {
        throw new MemberServiceError(
          404,
          "MEMBER_NOT_FOUND",
          "Member was not found.",
        );
      }

      const { data, error } = await supabase
        .from("members")
        .select(MEMBER_COLUMNS)
        .eq("id", memberId)
        .eq("life_group_id", lifeGroupId)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw serviceUnavailable();
      if (!data) {
        throw new MemberServiceError(
          404,
          "MEMBER_NOT_FOUND",
          "Member was not found.",
        );
      }

      return hydrateMember(data);
    },

    async create(actor, input) {
      await validateNewAssignment(actor, input.lifeGroupId);

      for (let attempt = 0; attempt < QR_TOKEN_COLLISION_RETRIES; attempt += 1) {
        const insert: TablesInsert<"members"> = {
          address: input.address,
          birth_date: input.birthDate,
          email: input.email,
          first_name: input.firstName,
          gender: input.gender,
          last_name: input.lastName,
          life_group_id: input.lifeGroupId,
          phone: input.phone,
          qr_token: generateQrToken(),
        };
        const { data, error } = await supabase
          .from("members")
          .insert(insert)
          .select(MEMBER_COLUMNS)
          .single();

        if (!error) return hydrateMember(data);

        if (isConstraintError(error, "members_qr_token_key")) {
          continue;
        }

        throw mapWriteError(error);
      }

      throw serviceUnavailable();
    },

    async update(actor, memberId, input) {
      const member = await getMemberRow(memberId);
      await assertLeaderCanEdit(actor, member);

      const update: TablesUpdate<"members"> = {};
      if (input.firstName !== undefined) update.first_name = input.firstName;
      if (input.lastName !== undefined) update.last_name = input.lastName;
      if (input.phone !== undefined) update.phone = input.phone;
      if (input.email !== undefined) update.email = input.email;
      if (input.address !== undefined) update.address = input.address;
      if (input.birthDate !== undefined) update.birth_date = input.birthDate;
      if (input.gender !== undefined) update.gender = input.gender;

      if (
        input.lifeGroupId !== undefined &&
        input.lifeGroupId !== member.life_group_id
      ) {
        if (actor.role !== "admin") {
          throw new MemberServiceError(
            403,
            "LIFE_GROUP_REASSIGNMENT_FORBIDDEN",
            "Only Admins may change a Member's Life Group.",
          );
        }
        await validateNewAssignment(actor, input.lifeGroupId);
        update.life_group_id = input.lifeGroupId;
      }

      const { data, error } = await supabase
        .from("members")
        .update(update)
        .eq("id", memberId)
        .select(MEMBER_COLUMNS)
        .single();

      if (error) throw mapWriteError(error);
      return hydrateMember(data);
    },

    async archive(memberId) {
      await getMemberRow(memberId);
      const { data, error } = await supabase
        .from("members")
        .update({ is_active: false })
        .eq("id", memberId)
        .select(MEMBER_COLUMNS)
        .single();

      if (error) throw mapWriteError(error);
      return hydrateMember(data);
    },
  };
}
