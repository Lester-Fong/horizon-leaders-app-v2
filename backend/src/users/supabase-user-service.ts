import { createClient, type User } from "@supabase/supabase-js";

import type { HorizonActor } from "../auth/types.js";
import { USER_ACTIVITY_LIMIT } from "../config/constants.js";
import { fetchAllRows } from "../db/range-queries.js";
import type { Database, Json, Tables, TablesUpdate } from "../types/database.types.js";
import {
  UserServiceError,
  type ManagedUser,
  type UserActivityAction,
  type UserActivityEvent,
  type UserAssignedLifeGroup,
  type UserService,
} from "./types.js";

interface SupabaseUserServiceConfig {
  serviceRoleKey: string;
  supabaseUrl: string;
}

type ProfileRow = Tables<"profiles">;

const PROFILE_COLUMNS = "id, name, role, is_active, created_at, updated_at";
const AUDIT_COLUMNS =
  "id, action, actor_profile_id, actor_name, target_user_id, target_name, details, created_at";
const LIST_PAGE_SIZE = 1000;
/** Upper bound of Auth user pages read (100,000 accounts), guarding against a paging loop. */
const MAX_AUTH_USER_PAGES = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_ACTIVITY_ACTIONS: ReadonlySet<string> = new Set<UserActivityAction>([
  "password_changed",
  "password_reset",
  "user_created",
  "user_deactivated",
  "user_deleted",
  "user_reactivated",
  "user_updated",
]);
const CLIENT_OPTIONS = {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
};

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

function emailAlreadyRegistered() {
  return new UserServiceError(
    409,
    "EMAIL_ALREADY_REGISTERED",
    "Another account already uses this email address.",
  );
}

/** Maps Supabase Auth failures to stable codes without exposing raw Auth errors. */
function mapAuthError(error: AuthErrorLike) {
  if (error.code === "email_exists" || error.code === "user_already_exists") {
    return emailAlreadyRegistered();
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

function isUserActivityAction(value: string): value is UserActivityAction {
  return USER_ACTIVITY_ACTIONS.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createSupabaseUserService({
  serviceRoleKey,
  supabaseUrl,
}: SupabaseUserServiceConfig): UserService {
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, CLIENT_OPTIONS);

  /**
   * Reads every Auth user page by page. It follows Auth's `nextPage` when that
   * is reported and otherwise stops on a short page. A page with no new users
   * (a server that ignores `page`) or the hard page cap also ends the loop, so
   * a misbehaving response can never page forever.
   */
  async function listAuthUsers() {
    const users = new Map<string, User>();

    for (let page = 1; page <= MAX_AUTH_USER_PAGES; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage: LIST_PAGE_SIZE,
      });

      if (error) throw serviceUnavailable();

      const knownCount = users.size;
      for (const user of data.users) users.set(user.id, user);

      const nextPage: unknown = data.nextPage;
      const isLastPage =
        nextPage === null ||
        (typeof nextPage !== "number" && data.users.length < LIST_PAGE_SIZE);
      if (isLastPage || users.size === knownCount) return users;
    }

    throw serviceUnavailable();
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

  async function getAuthUser(userId: string) {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error) throw mapAuthError(error);
    return data.user;
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
    const [authUser, assignedLifeGroup] = await Promise.all([
      getAuthUser(userId),
      getAssignedLifeGroup(userId),
    ]);

    return mapUser(profile, authUser, assignedLifeGroup);
  }

  /** Updates one Profile; zero matched rows is a failure, never a silent success. */
  async function updateProfile(userId: string, update: TablesUpdate<"profiles">) {
    const { data, error } = await supabase
      .from("profiles")
      .update(update)
      .eq("id", userId)
      .select("id");

    if (error || data.length === 0) throw serviceUnavailable();
  }

  async function hasReferences(userId: string) {
    const { data, error } = await supabase.rpc("profile_has_references", {
      p_profile_id: userId,
    });

    if (error) throw serviceUnavailable();

    return data;
  }

  /**
   * Signs the user out of every device; their next API request returns 401.
   * Best-effort: it runs after the Auth/Profile change has committed and the audit
   * row is written, so a failure here must not report that completed change as a
   * 500. The log line tells operators to retry the sign-out.
   */
  async function revokeSessions(userId: string) {
    try {
      const { error } = await supabase.rpc("revoke_user_sessions", {
        p_user_id: userId,
      });
      if (!error) return;
    } catch {
      // Fall through to the log line below.
    }

    console.error(`[users] Could not revoke sessions for ${userId}.`);
  }

  /**
   * Best-effort audit write. The account change has already happened in Supabase
   * Auth, which cannot share a transaction with this insert, so a failed write is
   * logged for operators instead of reporting the completed change as failed.
   */
  async function recordActivity(
    actor: HorizonActor,
    action: UserActivityAction,
    target: { id: string; name: string },
    details: Record<string, Json> = {},
  ) {
    const { error } = await supabase.from("user_audit_events").insert({
      action,
      actor_name: actor.name,
      actor_profile_id: actor.id,
      details,
      target_name: target.name,
      target_user_id: target.id,
    });

    if (error) {
      console.error(`[users] Could not record ${action} activity for ${target.id}.`);
    }
  }

  return {
    async list({ search, status }) {
      const buildProfileQuery = () => {
        const query = supabase
          .from("profiles")
          .select(PROFILE_COLUMNS)
          .order("name")
          .order("id");
        return status === "all" ? query : query.eq("is_active", status === "active");
      };

      const [authUsers, profilesResult, groupsResult] = await Promise.all([
        listAuthUsers(),
        fetchAllRows(buildProfileQuery),
        fetchAllRows(() =>
          supabase
            .from("life_groups")
            .select("id, name, is_active, leader_profile_id")
            .order("id"),
        ),
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

    async listActivity(userId) {
      // Defence in depth: the id is interpolated into a PostgREST filter below.
      if (!UUID_PATTERN.test(userId)) throw userNotFound();
      await getProfile(userId);

      const { data, error } = await supabase
        .from("user_audit_events")
        .select(AUDIT_COLUMNS)
        .or(`target_user_id.eq.${userId},actor_profile_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(USER_ACTIVITY_LIMIT);

      if (error) throw serviceUnavailable();

      return data.flatMap((row): UserActivityEvent[] => {
        // Skip actions this API version does not know rather than mislabel them.
        if (!isUserActivityAction(row.action)) return [];
        return [
          {
            action: row.action,
            actorId: row.actor_profile_id,
            actorName: row.actor_name,
            createdAt: row.created_at,
            details: isRecord(row.details) ? row.details : {},
            id: row.id,
            targetName: row.target_name,
            targetUserId: row.target_user_id,
          },
        ];
      });
    },

    async create(actor, input) {
      const { data, error } = await supabase.auth.admin.createUser({
        // Admin-chosen passwords are temporary: the user must replace it on first sign-in.
        app_metadata: { must_change_password: true },
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

      await recordActivity(actor, "user_created", { id: userId, name: input.name }, {
        email: input.email,
        role: input.role,
      });

      return loadUser(userId);
    },

    async update(actor, userId, input) {
      const previous = await getProfile(userId);

      if (input.role !== undefined && userId === actor.id && input.role !== actor.role) {
        throw ownAccount("You cannot change the role of your own account.");
      }

      let previousEmail: string | null = null;

      if (input.email !== undefined) {
        const authUsers = await listAuthUsers();
        previousEmail = authUsers.get(userId)?.email?.toLowerCase() ?? null;

        // This route does not re-authenticate, so another Admin must change your sign-in email.
        if (userId === actor.id && input.email !== previousEmail) {
          throw ownAccount("Ask another Admin to change your sign-in email.");
        }

        // Supabase Auth reports a duplicate email on admin update only as a generic 500.
        const emailTaken = [...authUsers.values()].some(
          (authUser) =>
            authUser.id !== userId && authUser.email?.toLowerCase() === input.email,
        );
        if (emailTaken) throw emailAlreadyRegistered();
      }

      const update: TablesUpdate<"profiles"> = {};
      if (input.name !== undefined) update.name = input.name;
      if (input.role !== undefined) update.role = input.role;
      const hasProfileUpdate = Object.keys(update).length > 0;

      // Profile first: it is the step most likely to fail and is easy to undo.
      if (hasProfileUpdate) {
        await updateProfile(userId, update);
      }

      const newEmail =
        input.email !== undefined && input.email !== previousEmail ? input.email : undefined;

      if (newEmail !== undefined) {
        const { error } = await supabase.auth.admin.updateUserById(userId, {
          email: newEmail,
          email_confirm: true,
        });

        if (error) {
          if (hasProfileUpdate) {
            // Keep the Profile and Auth email consistent when the email change is rejected.
            await updateProfile(userId, {
              name: previous.name,
              role: previous.role,
            }).catch(() => undefined);
          }
          throw mapAuthError(error);
        }
      }

      const changes: Record<string, Json> = {};
      if (input.name !== undefined && input.name !== previous.name) {
        changes.name = { from: previous.name, to: input.name };
      }
      if (input.role !== undefined && input.role !== previous.role) {
        changes.role = { from: previous.role, to: input.role };
      }
      if (newEmail !== undefined) {
        changes.email = { from: previousEmail, to: newEmail };
      }

      if (Object.keys(changes).length > 0) {
        await recordActivity(
          actor,
          "user_updated",
          { id: userId, name: input.name ?? previous.name },
          { changes },
        );
      }

      // The sign-in identity changed, so existing sessions must sign in again.
      if (newEmail !== undefined) await revokeSessions(userId);

      return loadUser(userId);
    },

    async setActive(actor, userId, isActive) {
      const profile = await getProfile(userId);

      if (userId === actor.id && !isActive) {
        throw ownAccount("You cannot deactivate your own account.");
      }

      await updateProfile(userId, { is_active: isActive });

      if (profile.is_active !== isActive) {
        await recordActivity(
          actor,
          isActive ? "user_reactivated" : "user_deactivated",
          { id: userId, name: profile.name },
        );
      }

      // Old sessions must not resume if the account is reactivated later.
      if (!isActive) await revokeSessions(userId);

      return loadUser(userId);
    },

    async resetPassword(actor, userId, password) {
      // A reset skips the current-password check, so Admins change their own on My profile.
      if (userId === actor.id) {
        throw ownAccount("Use My profile to change your own password.");
      }

      const profile = await getProfile(userId);

      const { error } = await supabase.auth.admin.updateUserById(userId, {
        app_metadata: { must_change_password: true },
        password,
      });
      if (error) throw mapAuthError(error);

      await recordActivity(actor, "password_reset", { id: userId, name: profile.name });
      await revokeSessions(userId);

      return { id: userId };
    },

    async changeOwnPassword(actor, currentPassword, newPassword) {
      if (currentPassword === newPassword) {
        throw new UserServiceError(
          422,
          "PASSWORD_UNCHANGED",
          "Choose a new password that is different from the current one.",
        );
      }

      const authUser = await getAuthUser(actor.id);
      if (!authUser.email) throw serviceUnavailable();

      // Verify the current password with a throwaway client; its session is revoked below
      // on success (all sessions) and on failure (this session only).
      const verifier = createClient<Database>(supabaseUrl, serviceRoleKey, CLIENT_OPTIONS);
      const { error: verifyError } = await verifier.auth.signInWithPassword({
        email: authUser.email,
        password: currentPassword,
      });

      if (verifyError) {
        if (verifyError.code === "invalid_credentials") {
          throw new UserServiceError(
            422,
            "CURRENT_PASSWORD_INCORRECT",
            "Your current password is incorrect.",
          );
        }
        throw serviceUnavailable();
      }

      const { error } = await supabase.auth.admin.updateUserById(actor.id, {
        app_metadata: { must_change_password: false },
        password: newPassword,
      });
      if (error) {
        await verifier.auth.signOut({ scope: "local" }).catch(() => undefined);
        throw mapAuthError(error);
      }

      await recordActivity(actor, "password_changed", { id: actor.id, name: actor.name });
      // Every device, including this one, signs in again with the new password.
      await revokeSessions(actor.id);

      return { id: actor.id };
    },

    async delete(actor, userId) {
      const profile = await getProfile(userId);

      if (userId === actor.id) {
        throw ownAccount("You cannot delete your own account.");
      }

      const historyError = new UserServiceError(
        409,
        "USER_HAS_HISTORY",
        "This user has Horizon history and cannot be deleted. Deactivate the account instead.",
      );

      if (await hasReferences(userId)) throw historyError;

      const authUser = await getAuthUser(userId);

      // Deleting the Auth user cascades to the Profile.
      const { error } = await supabase.auth.admin.deleteUser(userId);

      if (error) {
        // A reference may have been created after the check; RESTRICT keys then block the cascade.
        if (await hasReferences(userId)) throw historyError;
        throw mapAuthError(error);
      }

      await recordActivity(actor, "user_deleted", { id: userId, name: profile.name }, {
        email: authUser.email ?? null,
        role: profile.role,
      });

      return { id: userId };
    },
  };
}
