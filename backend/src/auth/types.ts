import type { Enums } from "../types/database.types.js";

export type AppRole = Enums<"app_role">;

export interface HorizonActor {
  id: string;
  isActive: true;
  name: string;
  role: AppRole;
  /** True after an Admin sets the password; only password-change routes work until it is changed. */
  mustChangePassword?: boolean;
}

export type AuthFailureCode =
  | "ACCOUNT_INACTIVE"
  | "AUTH_SERVICE_UNAVAILABLE"
  | "INVALID_TOKEN"
  | "PASSWORD_CHANGE_REQUIRED"
  | "PROFILE_NOT_FOUND";

export type AuthResult =
  | {
      actor: HorizonActor;
      ok: true;
    }
  | {
      code: AuthFailureCode;
      message: string;
      ok: false;
      status: 401 | 403 | 500;
    };

export interface AuthService {
  authenticate(accessToken: string): Promise<AuthResult>;
}
