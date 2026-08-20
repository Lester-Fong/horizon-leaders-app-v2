import type { HorizonActor } from "../auth/types.js";
import type { Member } from "../members/types.js";
import type { Enums } from "../types/database.types.js";

export type VisitorStatus = Enums<"visitor_status">;
export type VisitorListStatus = VisitorStatus | "all";

export interface Visitor {
  convertedMemberId: string | null;
  createdAt: string;
  email: string | null;
  firstName: string;
  id: string;
  lastName: string;
  phone: string | null;
  status: VisitorStatus;
  updatedAt: string;
}

export interface VisitorInput {
  email: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
}

export interface UpdateVisitorInput {
  email?: string | null;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
}

export interface ListVisitorsOptions {
  search?: string;
  status: VisitorListStatus;
}

export interface VisitorConversionResult {
  member: Member;
  visitor: Visitor;
}

export type VisitorErrorCode =
  | "DUPLICATE_MEMBER_EMAIL"
  | "DUPLICATE_MEMBER_PHONE"
  | "DUPLICATE_VISITOR_EMAIL"
  | "DUPLICATE_VISITOR_PHONE"
  | "INACTIVE_LIFE_GROUP"
  | "LIFE_GROUP_NOT_FOUND"
  | "VISITOR_NOT_ACTIVE"
  | "VISITOR_NOT_FOUND"
  | "VISITOR_SCOPE_FORBIDDEN"
  | "VISITOR_SERVICE_UNAVAILABLE";

export class VisitorServiceError extends Error {
  readonly code: VisitorErrorCode;
  readonly status: 403 | 404 | 409 | 422 | 500;

  constructor(
    status: 403 | 404 | 409 | 422 | 500,
    code: VisitorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VisitorServiceError";
    this.status = status;
    this.code = code;
  }
}

export interface VisitorService {
  convert(
    actor: HorizonActor,
    visitorId: string,
    lifeGroupId: string,
  ): Promise<VisitorConversionResult>;
  create(input: VisitorInput): Promise<Visitor>;
  getById(actor: HorizonActor, visitorId: string): Promise<Visitor>;
  list(actor: HorizonActor, options: ListVisitorsOptions): Promise<Visitor[]>;
  update(
    actor: HorizonActor,
    visitorId: string,
    input: UpdateVisitorInput,
  ): Promise<Visitor>;
}
