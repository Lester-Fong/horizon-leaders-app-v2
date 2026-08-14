import { createClient } from "@supabase/supabase-js";

import type { Database } from "../types/database.types.js";
import type { AuthService } from "./types.js";

interface SupabaseAuthServiceConfig {
  serviceRoleKey: string;
  supabaseUrl: string;
}

const PROFILE_COLUMNS = "id, name, role, is_active";

export function createSupabaseAuthService({
  serviceRoleKey,
  supabaseUrl,
}: SupabaseAuthServiceConfig): AuthService {
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  return {
    async authenticate(accessToken) {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(accessToken);

      if (authError || !user) {
        return {
          code: "INVALID_TOKEN",
          message: "Authentication is required.",
          ok: false,
          status: 401,
        };
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        return {
          code: "AUTH_SERVICE_UNAVAILABLE",
          message: "Authentication is temporarily unavailable.",
          ok: false,
          status: 500,
        };
      }

      if (!profile) {
        return {
          code: "PROFILE_NOT_FOUND",
          message: "Horizon access is not configured for this account.",
          ok: false,
          status: 403,
        };
      }

      if (!profile.is_active) {
        return {
          code: "ACCOUNT_INACTIVE",
          message: "Horizon access is disabled for this account.",
          ok: false,
          status: 403,
        };
      }

      return {
        actor: {
          id: profile.id,
          isActive: true,
          name: profile.name,
          role: profile.role,
        },
        ok: true,
      };
    },
  };
}
