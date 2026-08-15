import type { HorizonActor } from "../auth/types.js";

export interface Ministry {
  createdAt: string;
  description: string | null;
  id: string;
  isActive: boolean;
  name: string;
  updatedAt: string;
}

export interface MinistryMemberLifeGroup {
  id: string;
  isActive: boolean;
  name: string;
}

export interface MinistryMember {
  email: string | null;
  firstName: string;
  id: string;
  isActive: boolean;
  lastName: string;
  lifeGroup: MinistryMemberLifeGroup;
  phone: string | null;
}

export interface MinistryInput {
  description: string | null;
  name: string;
}

export interface UpdateMinistryInput {
  description?: string | null;
  name?: string;
}

export type MinistryListStatus = "active" | "archived" | "all";

export interface ListMinistriesOptions {
  search?: string;
  status: MinistryListStatus;
}

export type MinistryErrorCode =
  | "INACTIVE_MEMBER"
  | "INACTIVE_MINISTRY"
  | "MEMBER_ALREADY_ASSIGNED"
  | "MEMBER_NOT_FOUND"
  | "MINISTRY_ASSIGNMENT_NOT_FOUND"
  | "MINISTRY_NOT_FOUND"
  | "MINISTRY_SERVICE_UNAVAILABLE";

export class MinistryServiceError extends Error {
  readonly code: MinistryErrorCode;
  readonly status: 404 | 409 | 422 | 500;

  constructor(
    status: 404 | 409 | 422 | 500,
    code: MinistryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MinistryServiceError";
    this.status = status;
    this.code = code;
  }
}

export interface MinistryService {
  archive(ministryId: string): Promise<Ministry>;
  assignMember(
    actor: HorizonActor,
    ministryId: string,
    memberId: string,
  ): Promise<MinistryMember>;
  create(input: MinistryInput): Promise<Ministry>;
  getById(actor: HorizonActor, ministryId: string): Promise<Ministry>;
  list(
    actor: HorizonActor,
    options: ListMinistriesOptions,
  ): Promise<Ministry[]>;
  listMembers(
    actor: HorizonActor,
    ministryId: string,
  ): Promise<MinistryMember[]>;
  removeMember(
    actor: HorizonActor,
    ministryId: string,
    memberId: string,
  ): Promise<MinistryMember>;
  update(ministryId: string, input: UpdateMinistryInput): Promise<Ministry>;
}
