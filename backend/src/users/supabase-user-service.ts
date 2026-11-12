import { createClient, type User } from "@supabase/supabase-js";

import type { Database, Tables, TablesUpdate } from "../types/database.types.js";
import {
  UserServiceError,
  type ManagedUser,
  type UserAssignedLifeGroup,
  type UserService,
} from "./types.js";

interface SupabaseUserServiceConfig {
  serviceRoleKey: string;
  supabaseUrl: string;
}

type ProfileRow = Tables<"profiles">;

const PROFILE_COLUMNS = "id, name, role, is_active, created_at, updated_at";
const LIST_PAGE_SIZE = 1000;

interface AuthErrorLike {
  code?: string | undefined;
  status?: number | undefined;
}

function serviceUnavailable() {
  return new UserServiceError(
    500,
    "USER_SERVICE_UNAVAILABLE",
    "User data is temporarily unavailable.",
  );
}

function userNotFound() {
  return new UserServiceError(404, "USER_NOT_FOUND", "User was not found.");
}

function ownAccount(message: string) {
  return new UserServiceError(409, "CANNOT_MODIFY_OWN_ACCOUNT", message);
}

/** Maps Supabase Auth failures to stable codes without exposing raw Auth errors. */
function mapAuthError(error: AuthErrorLike) {
  if (error.code === "email_exists" || error.code === "user_already_exists") {
    return new UserServiceError(
      409,
      "EMAIL_ALREADY_REGISTERED",
      "Another account already uses this email address.",
    );
  }

  if (error.code === "weak_password") {
    return new UserServiceError(
      422,
      "WEAK_PASSWORD",
      "The password does not meet the account password requirements.",
    );
  }

  if (error.code === "user_not_found" || error.status === 404) {
    return userNotFound();
  }

  return serviceUnavailable();
}

function mapUser(
  profile: ProfileRow,
  authUser: Pick<User, "email" | "last_sign_in_at"> | undefined,
  assignedLifeGroup: UserAssignedLifeGroup | null,
): ManagedUser {
  return {
    assignedLifeGroup,
    createdAt: profile.created_at,
    email: authUser?.email ?? null,
    id: profile.id,
    isActive: profile.is_active,
    lastSignInAt: authUser?.last_sign_in_at ?? null,
    name: profile.name,
    role: profile.role,
    updatedAt: profile.updated_at,
  };
}

function matchesSearch(user: ManagedUser, search: string | undefined) {
  if (!search) return true;
  const needle = search.toLocaleLowerCase();
  return (
    user.name.toLocaleLowerCase().includes(needle) ||
    (user.email?.toLocaleLowerCase().includes(needle) ?? false)
  );
}

export function createSupabaseUserService({
  serviceRoleKey,
  supabaseUrl,
}: SupabaseUserServiceConfig): UserService {
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  async function listAuthUsers() {
    const users = new Map<string, User>();

    for (let page = 1; ; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage: LIST_PAGE_SIZE,
      });

      if (error) throw serviceUnavailable();

      for (const user of data.users) users.set(user.id, user);
      if (data.users.length < LIST_PAGE_SIZE) return users;
    }
  }

  async function getProfile(userId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", userId)
      .maybeSingle();

    if (error) throw serviceUnavailable();
    if (!data) throw userNotFound();

    return data;
  }

  async function getAssignedLifeGroup(userId: string) {
    const { data, error } = await supabase
      .from("life_groups")
      .select("id, name, is_active")
      .eq("leader_profile_id", userId)
      .maybeSingle();

    if (error) throw serviceUnavailable();

    return data
      ? { id: data.id, isActive: data.is_active, name: data.name }
      : null;
  }

  async function loadUser(userId: string): Promise<ManagedUser> {
    const profile = await getProfile(userId);
    const [{ data, error }, assignedLifeGroup] = await Promise.all([
      supabase.auth.admin.getUserById(userId),
      getAssignedLifeGroup(userId),
    ]);

    if (error) throw mapAuthError(error);

    return mapUser(profile, data.user, assignedLifeGroup);
  }

  async function updateProfile(userId: string, update: TablesUpdate<"profiles">) {
    const { error } = await supabase
      .from("profiles")
      .update(update)
      .eq("id", userId);

    if (error) throw serviceUnavailable();
  }

  async function hasReferences(userId: string) {
    const { data, error } = await supabase.rpc("profile_has_references", {
      p_profile_id: userId,
    });

    if (error) throw serviceUnavailable();

    return data;
  }

  return {
    async list({ search, status }) {
      let profileQuery = supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .order("name");

      if (status !== "all") {
        profileQuery = profileQuery.eq("is_active", status === "active");
      }

      const [authUsers, profilesResult, groupsResult] = await Promise.all([
        listAuthUsers(),
        profileQuery,
        supabase.from("life_groups").select("id, name, is_active, leader_profile_id"),
      ]);

      if (profilesResult.error || groupsResult.error) throw serviceUnavailable();

      const assignments = new Map(
        groupsResult.data.map((group) => [
          group.leader_profile_id,
          { id: group.id, isActive: group.is_active, name: group.name },
        ]),
      );

      return profilesResult.data
        .map((profile) =>
          mapUser(
            profile,
            authUsers.get(profile.id),
            assignments.get(profile.id) ?? null,
          ),
        )
        .filter((user) => matchesSearch(user, search));
    },

    async getById(userId) {
      return loadUser(userId);
    },

    async create(input) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: input.email,
        email_confirm: true,
        password: input.password,
        user_metadata: { name: input.name },
      });

      if (error || !data.user) throw mapAuthError(error ?? {});

      const userId = data.user.id;

      try {
        // The Auth trigger creates an active Leader Profile; apply the requested role and name.
        await updateProfile(userId, { name: input.name, role: input.role });
      } catch (profileError) {
        await supabase.auth.admin.deleteUser(userId).catch(() => undefined);
        throw profileError;
      }

      return loadUser(userId);
    },

    async update(actor, userId, input) {
      await getProfile(userId);

      if (input.role !== undefined && userId === actor.id && input.role !== actor.role) {
        throw ownAccount("You cannot change the role of your own account.");
      }

      if (input.email !== undefined) {
        const { error } = await supabase.auth.admin.updateUserById(userId, {
          email: input.email,
          email_confirm: true,
        });
        if (error) throw mapAuthError(error);
      }

      const update: TablesUpdate<"profiles"> = {};
      if (input.name !== undefined) update.name = input.name;
      if (input.role !== undefined) update.role = input.role;

      if (Object.keys(update).length > 0) {
        await updateProfile(userId, update);
      }

      return loadUser(userId);
    },

    async setActive(actor, userId, isActive) {
      await getProfile(userId);

      if (userId === actor.id && !isActive) {
        throw ownAccount("You cannot deactivate your own account.");
      }

      await updateProfile(userId, { is_active: isActive });

      return loadUser(userId);
    },

    async resetPassword(userId, password) {
      await getProfile(userId);

      const { error } = await supabase.auth.admin.updateUserById(userId, {
        password,
      });
      if (error) throw mapAuthError(error);

      return { id: userId };
    },

    async delete(actor, userId) {
      await getProfile(userId);

      if (userId === actor.id) {
        throw ownAccount("You cannot delete your own account.");
      }

      const historyError = new UserServiceError(
        409,
        "USER_HAS_HISTORY",
        "This user has Horizon history and cannot be deleted. Deactivate the account instead.",
      );

      if (await hasReferences(userId)) throw historyError;

      // Deleting the Auth user cascades to the Profile.
      const { error } = await supabase.auth.admin.deleteUser(userId);

      if (error) {
        // A reference may have been created after the check; RESTRICT keys then block the cascade.
        if (await hasReferences(userId)) throw historyError;
        throw mapAuthError(error);
      }

      return { id: userId };
    },
  };
}
