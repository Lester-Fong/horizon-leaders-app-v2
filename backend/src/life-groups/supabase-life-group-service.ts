import { createClient } from "@supabase/supabase-js";

import type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "../types/database.types.js";
import {
  LifeGroupServiceError,
  type LifeGroup,
  type LifeGroupService,
  type LeaderOption,
} from "./types.js";

interface SupabaseLifeGroupServiceConfig {
  serviceRoleKey: string;
  supabaseUrl: string;
}

type LifeGroupRow = Tables<"life_groups">;
type ProfileRow = Tables<"profiles">;

const LIFE_GROUP_COLUMNS =
  "id, name, description, leader_profile_id, is_active, created_at, updated_at";
const LEADER_COLUMNS = "id, name, is_active, role";

function serviceUnavailable() {
  return new LifeGroupServiceError(
    500,
    "LIFE_GROUP_SERVICE_UNAVAILABLE",
    "Life Group data is temporarily unavailable.",
  );
}

function mapLifeGroup(
  lifeGroup: LifeGroupRow,
  leader: Pick<ProfileRow, "id" | "is_active" | "name">,
): LifeGroup {
  return {
    createdAt: lifeGroup.created_at,
    description: lifeGroup.description,
    id: lifeGroup.id,
    isActive: lifeGroup.is_active,
    leader: {
      id: leader.id,
      isActive: leader.is_active,
      name: leader.name,
    },
    name: lifeGroup.name,
    updatedAt: lifeGroup.updated_at,
  };
}

export function createSupabaseLifeGroupService({
  serviceRoleKey,
  supabaseUrl,
}: SupabaseLifeGroupServiceConfig): LifeGroupService {
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  async function loadLeaders(profileIds: string[]) {
    const uniqueProfileIds = [...new Set(profileIds)];

    if (uniqueProfileIds.length === 0) {
      return new Map<string, ProfileRow>();
    }

    const { data, error } = await supabase
      .from("profiles")
      .select(LEADER_COLUMNS)
      .in("id", uniqueProfileIds);

    if (error || data.length !== uniqueProfileIds.length) {
      throw serviceUnavailable();
    }

    return new Map(data.map((profile) => [profile.id, profile]));
  }

  async function hydrateLifeGroups(rows: LifeGroupRow[]) {
    const leaders = await loadLeaders(rows.map((row) => row.leader_profile_id));

    return rows.map((row) => {
      const leader = leaders.get(row.leader_profile_id);

      if (!leader) {
        throw serviceUnavailable();
      }

      return mapLifeGroup(row, leader);
    });
  }

  async function getLifeGroupRow(lifeGroupId: string) {
    const { data, error } = await supabase
      .from("life_groups")
      .select(LIFE_GROUP_COLUMNS)
      .eq("id", lifeGroupId)
      .maybeSingle();

    if (error) {
      throw serviceUnavailable();
    }

    if (!data) {
      throw new LifeGroupServiceError(
        404,
        "LIFE_GROUP_NOT_FOUND",
        "Life Group was not found.",
      );
    }

    return data;
  }

  async function validateLeader(
    leaderProfileId: string,
    currentLifeGroupId?: string,
  ) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(LEADER_COLUMNS)
      .eq("id", leaderProfileId)
      .maybeSingle();

    if (profileError) {
      throw serviceUnavailable();
    }

    if (!profile) {
      throw new LifeGroupServiceError(
        422,
        "LEADER_NOT_FOUND",
        "The selected Leader Profile does not exist.",
      );
    }

    if (profile.role !== "leader") {
      throw new LifeGroupServiceError(
        422,
        "LEADER_ROLE_REQUIRED",
        "The selected Profile must have the Leader role.",
      );
    }

    if (!profile.is_active) {
      throw new LifeGroupServiceError(
        422,
        "LEADER_INACTIVE",
        "The selected Leader Profile is inactive.",
      );
    }

    let assignmentQuery = supabase
      .from("life_groups")
      .select("id, name")
      .eq("leader_profile_id", leaderProfileId);

    if (currentLifeGroupId) {
      assignmentQuery = assignmentQuery.neq("id", currentLifeGroupId);
    }

    const { data: assignment, error: assignmentError } =
      await assignmentQuery.maybeSingle();

    if (assignmentError) {
      throw serviceUnavailable();
    }

    if (assignment) {
      throw new LifeGroupServiceError(
        409,
        "LEADER_ALREADY_ASSIGNED",
        `The selected Leader is already assigned to ${assignment.name}.`,
      );
    }
  }

  function mapWriteError(error: { code?: string }) {
    if (error.code === "23505") {
      return new LifeGroupServiceError(
        409,
        "LEADER_ALREADY_ASSIGNED",
        "The selected Leader is already assigned to another Life Group.",
      );
    }

    if (error.code === "23503") {
      return new LifeGroupServiceError(
        422,
        "LEADER_NOT_FOUND",
        "The selected Leader Profile does not exist.",
      );
    }

    return serviceUnavailable();
  }

  async function hydrateSingle(row: LifeGroupRow) {
    const [lifeGroup] = await hydrateLifeGroups([row]);

    if (!lifeGroup) {
      throw serviceUnavailable();
    }

    return lifeGroup;
  }

  return {
    async list({ includeInactive }) {
      let query = supabase
        .from("life_groups")
        .select(LIFE_GROUP_COLUMNS)
        .order("name");

      if (!includeInactive) {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query;

      if (error) {
        throw serviceUnavailable();
      }

      return hydrateLifeGroups(data);
    },

    async getById(lifeGroupId) {
      return hydrateSingle(await getLifeGroupRow(lifeGroupId));
    },

    async listLeaderOptions(): Promise<LeaderOption[]> {
      const [{ data: profiles, error: profilesError }, { data: groups, error: groupsError }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select(LEADER_COLUMNS)
            .eq("role", "leader")
            .order("name"),
          supabase
            .from("life_groups")
            .select("id, name, is_active, leader_profile_id"),
        ]);

      if (profilesError || groupsError) {
        throw serviceUnavailable();
      }

      const assignments = new Map(
        groups.map((group) => [
          group.leader_profile_id,
          {
            id: group.id,
            isActive: group.is_active,
            name: group.name,
          },
        ]),
      );

      return profiles.map((profile) => ({
        assignedLifeGroup: assignments.get(profile.id) ?? null,
        id: profile.id,
        isActive: profile.is_active,
        name: profile.name,
      }));
    },

    async create(input) {
      await validateLeader(input.leaderProfileId);

      const insert: TablesInsert<"life_groups"> = {
        description: input.description,
        leader_profile_id: input.leaderProfileId,
        name: input.name,
      };
      const { data, error } = await supabase
        .from("life_groups")
        .insert(insert)
        .select(LIFE_GROUP_COLUMNS)
        .single();

      if (error) {
        throw mapWriteError(error);
      }

      return hydrateSingle(data);
    },

    async update(lifeGroupId, input) {
      await getLifeGroupRow(lifeGroupId);

      if (input.leaderProfileId) {
        await validateLeader(input.leaderProfileId, lifeGroupId);
      }

      const update: TablesUpdate<"life_groups"> = {};

      if (input.name !== undefined) update.name = input.name;
      if (input.description !== undefined) update.description = input.description;
      if (input.leaderProfileId !== undefined) {
        update.leader_profile_id = input.leaderProfileId;
      }

      const { data, error } = await supabase
        .from("life_groups")
        .update(update)
        .eq("id", lifeGroupId)
        .select(LIFE_GROUP_COLUMNS)
        .single();

      if (error) {
        throw mapWriteError(error);
      }

      return hydrateSingle(data);
    },

    async setActive(lifeGroupId, isActive) {
      await getLifeGroupRow(lifeGroupId);

      const { data, error } = await supabase
        .from("life_groups")
        .update({ is_active: isActive })
        .eq("id", lifeGroupId)
        .select(LIFE_GROUP_COLUMNS)
        .single();

      if (error) {
        throw mapWriteError(error);
      }

      return hydrateSingle(data);
    },
  };
}
