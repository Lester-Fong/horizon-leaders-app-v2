import { randomBytes } from "node:crypto";

import { createClient, type User } from "@supabase/supabase-js";

import type { HorizonActor } from "../auth/types.js";
import { USER_ACTIVITY_LIMIT } from "../config/constants.js";
import { fetchAllRows } from "../db/range-queries.js";
import type { Database, Json, Tables, TablesUpdate } from "../types/database.types.js";
import {
  DELETED_EMAIL_DOMAIN,
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

const PROFILE_COLUMNS = "id, name, role, is_active, deleted_at, created_at, updated_at";
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
/** Roughly 100 years: Supabase Auth has no permanent ban, so a deleted sign-in is banned for good. */
const DELETED_USER_BAN_DURATION = "876000h";
const ACTIVE_ADMIN_CONSTRAINT = "profiles_active_admin_required";
const CLIENT_OPTIONS = {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
};

interface PostgrestErrorLike {
  code?: string | undefined;
  message?: string | undefined;
}

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

function userDeleted() {
  return new UserServiceError(
    409,
    "USER_DELETED",
    "This user was deleted and can no longer be changed.",
  );
}

function lastActiveAdmin() {
  return new UserServiceError(409, "LAST_ACTIVE_ADMIN", "At least one active Admin is required.");
}

/** The database rejects any Profile update that would leave no active Admin. */
function isLastActiveAdminError(error: PostgrestErrorLike) {
  return error.code === "23514" && (error.message?.includes(ACTIVE_ADMIN_CONSTRAINT) ?? false);
}

function deletedEmailFor(userId: string) {
  return `deleted+${userId}@${DELETED_EMAIL_DOMAIN}`;
}

/** A random 64-character password nobody knows, so the deleted sign-in cannot be used. */
function unusablePassword() {
  return randomBytes(48).toString("base64url");
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

function readDeletedEmail(authUser: Pick<User, "app_metadata"> | undefined) {
  const deletedEmail: unknown = authUser?.app_metadata?.deleted_email;
  return typeof deletedEmail === "string" ? deletedEmail : null;
}

function mapUser(
  profile: ProfileRow,
  authUser: Pick<User, "app_metadata" | "email" | "last_sign_in_at"> | undefined,
  assignedLifeGroup: UserAssignedLifeGroup | null,
): ManagedUser {
  return {
    assignedLifeGroup,
    createdAt: profile.created_at,
    deletedAt: profile.deleted_at,
    // A deleted user's Auth email is a placeholder; show the email they used instead.
    email: profile.deleted_at ? readDeletedEmail(authUser) : (authUser?.email ?? null),
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

  /** Loads a Profile that may still be changed; a deleted user is read-only. */
  async function getMutableProfile(userId: string) {
    const profile = await getProfile(userId);
    if (profile.deleted_at) throw userDeleted();
    return profile;
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

  /**
   * Updates one Profile that has not been deleted. Zero matched rows means it was
   * deleted meanwhile, which is never reported as a silent success.
   */
  async function updateProfile(userId: string, update: TablesUpdate<"profiles">) {
    const { data, error } = await supabase
      .from("profiles")
      .update(update)
      .eq("id", userId)
      .is("deleted_at", null)
      .select("id");

    if (error) {
      throw isLastActiveAdminError(error) ? lastActiveAdmin() : serviceUnavailable();
    }
    if (data.length === 0) throw userDeleted();
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
        if (status === "deleted") return query.not("deleted_at", "is", null);
        const notDeleted = query.is("deleted_at", null);
        return status === "all" ? notDeleted : notDeleted.eq("is_active", status === "active");
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
        // A brand-new Profile cannot be deleted; a missing row means the Auth trigger failed.
        const isMissingProfile =
          profileError instanceof UserServiceError && profileError.code === "USER_DELETED";
        throw isMissingProfile ? serviceUnavailable() : profileError;
      }

      await recordActivity(actor, "user_created", { id: userId, name: input.name }, {
        email: input.email,
        role: input.role,
      });

      return loadUser(userId);
    },

    async update(actor, userId, input) {
      const previous = await getMutableProfile(userId);

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
      const profile = await getMutableProfile(userId);

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

      const profile = await getMutableProfile(userId);

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

    /**
     * Soft delete: the sign-in is removed for good but the Profile and its history
     * stay, so past records keep the user's name. The Profile is marked first (the
     * last-active-Admin rule can reject it, and it is easy to undo), then the Auth
     * user gets a placeholder email, an unknown password, and a permanent ban, which
     * also frees the original email for a new account.
     */
    async delete(actor, userId) {
      const profile = await getMutableProfile(userId);

      if (userId === actor.id) {
        throw ownAccount("You cannot delete your own account.");
      }

      const authUser = await getAuthUser(userId);
      const originalEmail = authUser.email ?? null;

      await updateProfile(userId, { deleted_at: new Date().toISOString(), is_active: false });

      const { error } = await supabase.auth.admin.updateUserById(userId, {
        app_metadata: {
          ...authUser.app_metadata,
          deleted: true,
          deleted_email: originalEmail,
          must_change_password: false,
        },
        ban_duration: DELETED_USER_BAN_DURATION,
        email: deletedEmailFor(userId),
        email_confirm: true,
        password: unusablePassword(),
      });

      if (error) {
        // Undo the Profile change so the user is not left half-deleted.
        const { error: revertError } = await supabase
          .from("profiles")
          .update({ deleted_at: null, is_active: profile.is_active })
          .eq("id", userId);
        if (revertError) {
          console.error(`[users] Could not undo the deletion of ${userId}.`);
        }
        throw mapAuthError(error);
      }

      await recordActivity(actor, "user_deleted", { id: userId, name: profile.name }, {
        email: originalEmail,
        mode: "soft",
        role: profile.role,
        wasActive: profile.is_active,
      });
      await revokeSessions(userId);

      return { id: userId };
    },
  };
}
