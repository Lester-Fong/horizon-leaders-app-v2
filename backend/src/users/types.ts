import type { AppRole, HorizonActor } from "../auth/types.js";

export interface UserAssignedLifeGroup {
  id: string;
  isActive: boolean;
  name: string;
}

export interface ManagedUser {
  assignedLifeGroup: UserAssignedLifeGroup | null;
  createdAt: string;
  email: string | null;
  id: string;
  isActive: boolean;
  lastSignInAt: string | null;
  name: string;
  role: AppRole;
  updatedAt: string;
}

export type UserListStatus = "active" | "all" | "inactive";

export interface ListUsersOptions {
  search?: string | undefined;
  status: UserListStatus;
}

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: AppRole;
}

export interface UpdateUserInput {
  email?: string;
  name?: string;
  role?: AppRole;
}

export type UserActivityAction =
  | "password_changed"
  | "password_reset"
  | "user_created"
  | "user_deactivated"
  | "user_deleted"
  | "user_reactivated"
  | "user_updated";

export interface UserActivityEvent {
  action: UserActivityAction;
  actorId: string;
  actorName: string;
  createdAt: string;
  details: Record<string, unknown>;
  id: string;
  targetName: string;
  targetUserId: string;
}

export type UserErrorCode =
  | "CANNOT_MODIFY_OWN_ACCOUNT"
  | "CURRENT_PASSWORD_INCORRECT"
  | "PASSWORD_UNCHANGED"
  | "EMAIL_ALREADY_REGISTERED"
  | "USER_HAS_HISTORY"
  | "USER_NOT_FOUND"
  | "USER_SERVICE_UNAVAILABLE"
  | "WEAK_PASSWORD";

export type UserErrorStatus = 404 | 409 | 422 | 500;

export class UserServiceError extends Error {
  readonly code: UserErrorCode;
  readonly status: UserErrorStatus;

  constructor(status: UserErrorStatus, code: UserErrorCode, message: string) {
    super(message);
    this.name = "UserServiceError";
    this.status = status;
    this.code = code;
  }
}

export interface UserService {
  changeOwnPassword(
    actor: HorizonActor,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ id: string }>;
  create(actor: HorizonActor, input: CreateUserInput): Promise<ManagedUser>;
  delete(actor: HorizonActor, userId: string): Promise<{ id: string }>;
  getById(userId: string): Promise<ManagedUser>;
  list(options: ListUsersOptions): Promise<ManagedUser[]>;
  listActivity(userId: string): Promise<UserActivityEvent[]>;
  resetPassword(
    actor: HorizonActor,
    userId: string,
    password: string,
  ): Promise<{ id: string }>;
  setActive(
    actor: HorizonActor,
    userId: string,
    isActive: boolean,
  ): Promise<ManagedUser>;
  update(
    actor: HorizonActor,
    userId: string,
    input: UpdateUserInput,
  ): Promise<ManagedUser>;
}
