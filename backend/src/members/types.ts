import type { HorizonActor } from "../auth/types.js";
import type { Enums } from "../types/database.types.js";

export type MemberGender = Enums<"member_gender">;

export interface MemberLifeGroup {
  id: string;
  isActive: boolean;
  name: string;
}

export interface Member {
  address: string | null;
  birthDate: string | null;
  createdAt: string;
  email: string | null;
  firstName: string;
  gender: MemberGender | null;
  id: string;
  isActive: boolean;
  lastName: string;
  lifeGroup: MemberLifeGroup;
  phone: string | null;
  qrToken: string;
  updatedAt: string;
}

export interface CreateMemberInput {
  address: string | null;
  birthDate: string | null;
  email: string | null;
  firstName: string;
  gender: MemberGender | null;
  lastName: string;
  lifeGroupId: string;
  phone: string | null;
}

export interface UpdateMemberInput {
  address?: string | null;
  birthDate?: string | null;
  email?: string | null;
  firstName?: string;
  gender?: MemberGender | null;
  lastName?: string;
  lifeGroupId?: string;
  phone?: string | null;
}

export type MemberListStatus = "active" | "archived" | "all";

export interface ListMembersOptions {
  lifeGroupId?: string;
  search?: string;
  status: MemberListStatus;
}

export type MemberErrorCode =
  | "DUPLICATE_MEMBER_EMAIL"
  | "DUPLICATE_MEMBER_PHONE"
  | "INACTIVE_LIFE_GROUP"
  | "LIFE_GROUP_NOT_FOUND"
  | "LIFE_GROUP_REASSIGNMENT_FORBIDDEN"
  | "MEMBER_NOT_FOUND"
  | "MEMBER_SCOPE_FORBIDDEN"
  | "MEMBER_SERVICE_UNAVAILABLE";

export class MemberServiceError extends Error {
  readonly code: MemberErrorCode;
  readonly status: 403 | 404 | 409 | 422 | 500;

  constructor(
    status: 403 | 404 | 409 | 422 | 500,
    code: MemberErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MemberServiceError";
    this.status = status;
    this.code = code;
  }
}

export interface MemberService {
  archive(memberId: string): Promise<Member>;
  create(actor: HorizonActor, input: CreateMemberInput): Promise<Member>;
  getById(actor: HorizonActor, memberId: string): Promise<Member>;
  list(actor: HorizonActor, options: ListMembersOptions): Promise<Member[]>;
  update(
    actor: HorizonActor,
    memberId: string,
    input: UpdateMemberInput,
  ): Promise<Member>;
}
