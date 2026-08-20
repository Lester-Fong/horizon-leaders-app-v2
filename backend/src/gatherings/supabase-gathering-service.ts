import { createClient } from "@supabase/supabase-js";

import type { HorizonActor } from "../auth/types.js";
import type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "../types/database.types.js";
import {
  GatheringServiceError,
  type GatheringAttendanceMember,
  type GatheringInput,
  type GatheringLifeGroup,
  type GatheringService,
  type LifeGroupGathering,
} from "./types.js";

interface SupabaseGatheringServiceConfig {
  serviceRoleKey: string;
  supabaseUrl: string;
}

type GatheringRow = Tables<"life_group_gatherings">;
type LifeGroupRow = Pick<
  Tables<"life_groups">,
  "id" | "is_active" | "leader_profile_id" | "name"
>;
type MemberRow = Pick<
  Tables<"members">,
  | "email"
  | "first_name"
  | "id"
  | "is_active"
  | "last_name"
  | "life_group_id"
  | "phone"
>;

const GATHERING_COLUMNS =
  "id, life_group_id, gathering_date, title, location, notes, created_by_profile_id, created_at, updated_at";
const LIFE_GROUP_COLUMNS = "id, name, is_active, leader_profile_id";
const MEMBER_COLUMNS =
  "id, first_name, last_name, phone, email, life_group_id, is_active";

function serviceUnavailable() {
  return new GatheringServiceError(
    500,
    "GATHERING_SERVICE_UNAVAILABLE",
    "Gathering data is temporarily unavailable.",
  );
}

function lifeGroupNotFound() {
  return new GatheringServiceError(
    404,
    "LIFE_GROUP_NOT_FOUND",
    "Life Group was not found.",
  );
}

function gatheringNotFound() {
  return new GatheringServiceError(
    404,
    "GATHERING_NOT_FOUND",
    "Gathering was not found.",
  );
}

function mapLifeGroup(lifeGroup: LifeGroupRow): GatheringLifeGroup {
  return {
    id: lifeGroup.id,
    isActive: lifeGroup.is_active,
    name: lifeGroup.name,
  };
}

export function createSupabaseGatheringService({
  serviceRoleKey,
  supabaseUrl,
}: SupabaseGatheringServiceConfig): GatheringService {
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  async function getScopedLifeGroup(actor: HorizonActor, lifeGroupId: string) {
    const { data, error } = await supabase
      .from("life_groups")
      .select(LIFE_GROUP_COLUMNS)
      .eq("id", lifeGroupId)
      .maybeSingle();

    if (error) throw serviceUnavailable();
    if (!data || (actor.role === "leader" && data.leader_profile_id !== actor.id)) {
      throw lifeGroupNotFound();
    }
    return data;
  }

  async function getScopedGathering(
    actor: HorizonActor,
    lifeGroupId: string,
    gatheringId: string,
  ) {
    const lifeGroup = await getScopedLifeGroup(actor, lifeGroupId);
    const { data, error } = await supabase
      .from("life_group_gatherings")
      .select(GATHERING_COLUMNS)
      .eq("id", gatheringId)
      .eq("life_group_id", lifeGroupId)
      .maybeSingle();

    if (error) throw serviceUnavailable();
    if (!data) throw gatheringNotFound();
    return { gathering: data, lifeGroup };
  }

  async function attendanceCounts(gatheringIds: string[]) {
    if (gatheringIds.length === 0) return new Map<string, number>();
    const { data, error } = await supabase
      .from("life_group_gathering_attendance")
      .select("gathering_id")
      .in("gathering_id", gatheringIds);
    if (error) throw serviceUnavailable();
    const counts = new Map<string, number>();
    for (const attendance of data) {
      counts.set(
        attendance.gathering_id,
        (counts.get(attendance.gathering_id) ?? 0) + 1,
      );
    }
    return counts;
  }

  async function creators(profileIds: string[]) {
    const ids = [...new Set(profileIds)];
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", ids);
    if (error || data.length !== ids.length) throw serviceUnavailable();
    return new Map(data.map((profile) => [profile.id, profile.name]));
  }

  async function hydrate(
    rows: GatheringRow[],
    lifeGroup: LifeGroupRow,
  ): Promise<LifeGroupGathering[]> {
    if (rows.length === 0) return [];
    const [counts, creatorNames] = await Promise.all([
      attendanceCounts(rows.map((row) => row.id)),
      creators(rows.map((row) => row.created_by_profile_id)),
    ]);
    return rows.map((row) => {
      const creatorName = creatorNames.get(row.created_by_profile_id);
      if (!creatorName) throw serviceUnavailable();
      return {
        attendanceCount: counts.get(row.id) ?? 0,
        createdAt: row.created_at,
        createdBy: { id: row.created_by_profile_id, name: creatorName },
        gatheringDate: row.gathering_date,
        id: row.id,
        lifeGroup: mapLifeGroup(lifeGroup),
        location: row.location,
        notes: row.notes,
        title: row.title,
        updatedAt: row.updated_at,
      };
    });
  }

  async function hydrateSingle(row: GatheringRow, lifeGroup: LifeGroupRow) {
    const [gathering] = await hydrate([row], lifeGroup);
    if (!gathering) throw serviceUnavailable();
    return gathering;
  }

  async function loadMembers(memberIds?: string[]) {
    let query = supabase.from("members").select(MEMBER_COLUMNS);
    if (memberIds) {
      if (memberIds.length === 0) return [];
      query = query.in("id", memberIds);
    }
    const { data, error } = await query;
    if (error) throw serviceUnavailable();
    return data;
  }

  async function lifeGroupNames(lifeGroupIds: string[]) {
    const ids = [...new Set(lifeGroupIds)];
    const { data, error } = await supabase
      .from("life_groups")
      .select("id, name")
      .in("id", ids);
    if (error || data.length !== ids.length) throw serviceUnavailable();
    return new Map(data.map((group) => [group.id, group.name]));
  }

  async function mapAttendanceMembers(
    members: MemberRow[],
    gatheringLifeGroupId: string,
    presentIds: Set<string>,
  ) {
    const groupNames = await lifeGroupNames(
      members.map((member) => member.life_group_id),
    );
    return members
      .map<GatheringAttendanceMember>((member) => ({
        currentLifeGroup: {
          id: member.life_group_id,
          name: groupNames.get(member.life_group_id) ?? "Unknown Life Group",
        },
        email: member.email,
        firstName: member.first_name,
        id: member.id,
        isActive: member.is_active,
        isEligible: member.life_group_id === gatheringLifeGroupId,
        isPresent: presentIds.has(member.id),
        lastName: member.last_name,
        phone: member.phone,
      }))
      .sort((left, right) =>
        `${left.lastName} ${left.firstName}`.localeCompare(
          `${right.lastName} ${right.firstName}`,
        ),
      );
  }

  return {
    async list(actor, lifeGroupId) {
      const lifeGroup = await getScopedLifeGroup(actor, lifeGroupId);
      const { data, error } = await supabase
        .from("life_group_gatherings")
        .select(GATHERING_COLUMNS)
        .eq("life_group_id", lifeGroupId)
        .order("gathering_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw serviceUnavailable();
      return {
        gatherings: await hydrate(data, lifeGroup),
        lifeGroup: mapLifeGroup(lifeGroup),
      };
    },

    async getById(actor, lifeGroupId, gatheringId) {
      const { gathering, lifeGroup } = await getScopedGathering(
        actor,
        lifeGroupId,
        gatheringId,
      );
      return hydrateSingle(gathering, lifeGroup);
    },

    async create(actor, lifeGroupId, input: GatheringInput) {
      const lifeGroup = await getScopedLifeGroup(actor, lifeGroupId);
      if (!lifeGroup.is_active) {
        throw new GatheringServiceError(
          422,
          "INACTIVE_LIFE_GROUP",
          "New Gatherings require an active Life Group.",
        );
      }
      const insert: TablesInsert<"life_group_gatherings"> = {
        created_by_profile_id: actor.id,
        gathering_date: input.gatheringDate,
        life_group_id: lifeGroupId,
        location: input.location,
        notes: input.notes,
        title: input.title,
      };
      const { data, error } = await supabase
        .from("life_group_gatherings")
        .insert(insert)
        .select(GATHERING_COLUMNS)
        .single();
      if (error) throw serviceUnavailable();
      return hydrateSingle(data, lifeGroup);
    },

    async update(actor, lifeGroupId, gatheringId, input) {
      const { lifeGroup } = await getScopedGathering(
        actor,
        lifeGroupId,
        gatheringId,
      );
      const update: TablesUpdate<"life_group_gatherings"> = {};
      if (input.gatheringDate !== undefined) {
        update.gathering_date = input.gatheringDate;
      }
      if (input.location !== undefined) update.location = input.location;
      if (input.notes !== undefined) update.notes = input.notes;
      if (input.title !== undefined) update.title = input.title;
      const { data, error } = await supabase
        .from("life_group_gatherings")
        .update(update)
        .eq("id", gatheringId)
        .eq("life_group_id", lifeGroupId)
        .select(GATHERING_COLUMNS)
        .single();
      if (error) throw serviceUnavailable();
      return hydrateSingle(data, lifeGroup);
    },

    async getAttendance(actor, lifeGroupId, gatheringId) {
      await getScopedGathering(actor, lifeGroupId, gatheringId);
      const { data: attendance, error: attendanceError } = await supabase
        .from("life_group_gathering_attendance")
        .select("member_id")
        .eq("gathering_id", gatheringId);
      if (attendanceError) throw serviceUnavailable();
      const presentIds = new Set(attendance.map((row) => row.member_id));
      const { data: currentMembers, error: currentError } = await supabase
        .from("members")
        .select(MEMBER_COLUMNS)
        .eq("life_group_id", lifeGroupId);
      if (currentError) throw serviceUnavailable();
      const currentIds = new Set(currentMembers.map((member) => member.id));
      const historicalIds = [...presentIds].filter((id) => !currentIds.has(id));
      const historicalMembers = await loadMembers(historicalIds);
      return {
        members: await mapAttendanceMembers(
          [...currentMembers, ...historicalMembers],
          lifeGroupId,
          presentIds,
        ),
      };
    },

    async addAttendance(actor, lifeGroupId, gatheringId, memberId) {
      await getScopedGathering(actor, lifeGroupId, gatheringId);
      const { data: member, error: memberError } = await supabase
        .from("members")
        .select("id, life_group_id")
        .eq("id", memberId)
        .maybeSingle();
      if (memberError) throw serviceUnavailable();
      if (!member) {
        throw new GatheringServiceError(404, "MEMBER_NOT_FOUND", "Member was not found.");
      }
      if (member.life_group_id !== lifeGroupId) {
        throw new GatheringServiceError(
          422,
          "MEMBER_NOT_ELIGIBLE",
          "Only Members currently assigned to this Life Group may be marked present.",
        );
      }
      const insert: TablesInsert<"life_group_gathering_attendance"> = {
        gathering_id: gatheringId,
        member_id: memberId,
      };
      const { error } = await supabase
        .from("life_group_gathering_attendance")
        .insert(insert);
      if (error?.code === "23505") {
        throw new GatheringServiceError(
          409,
          "ATTENDANCE_ALREADY_RECORDED",
          "This Member is already marked present.",
        );
      }
      if (error) throw serviceUnavailable();
      return { isPresent: true, memberId };
    },

    async removeAttendance(actor, lifeGroupId, gatheringId, memberId) {
      await getScopedGathering(actor, lifeGroupId, gatheringId);
      const { data, error } = await supabase
        .from("life_group_gathering_attendance")
        .delete()
        .eq("gathering_id", gatheringId)
        .eq("member_id", memberId)
        .select("member_id")
        .maybeSingle();
      if (error) throw serviceUnavailable();
      if (!data) {
        throw new GatheringServiceError(
          404,
          "ATTENDANCE_NOT_FOUND",
          "This Member is not marked present.",
        );
      }
      return { isPresent: false, memberId };
    },
  };
}
