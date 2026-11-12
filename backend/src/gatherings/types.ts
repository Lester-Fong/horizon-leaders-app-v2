import type { HorizonActor } from "../auth/types.js";
import type { PageMeta, PageRequest } from "../http/pagination.js";

export interface GatheringLifeGroup {
  id: string;
  isActive: boolean;
  name: string;
}

export interface GatheringCreator {
  id: string;
  name: string;
}

export interface LifeGroupGathering {
  attendanceCount: number;
  createdAt: string;
  createdBy: GatheringCreator;
  gatheringDate: string;
  id: string;
  lifeGroup: GatheringLifeGroup;
  location: string | null;
  notes: string | null;
  title: string | null;
  updatedAt: string;
}

export interface GatheringDirectory {
  gatherings: LifeGroupGathering[];
  lifeGroup: GatheringLifeGroup;
}

export interface GatheringInput {
  gatheringDate: string;
  location: string | null;
  notes: string | null;
  title: string | null;
}

export interface UpdateGatheringInput {
  gatheringDate?: string;
  location?: string | null;
  notes?: string | null;
  title?: string | null;
}

export interface GatheringAttendanceMember {
  currentLifeGroup: { id: string; name: string };
  email: string | null;
  firstName: string;
  id: string;
  isActive: boolean;
  isEligible: boolean;
  isPresent: boolean;
  lastName: string;
  phone: string | null;
}

export interface GatheringAttendanceRoster {
  members: GatheringAttendanceMember[];
  visitors: GatheringAttendanceVisitor[];
}

export interface GatheringAttendanceVisitor {
  currentLifeGroup: { id: string; name: string } | null;
  email: string | null;
  firstName: string;
  id: string;
  isEligible: boolean;
  isPresent: boolean;
  lastName: string;
  phone: string | null;
  status: "active" | "converted";
}

export interface AttendanceMutationResult {
  isPresent: boolean;
  memberId: string;
}

export interface VisitorAttendanceMutationResult {
  isPresent: boolean;
  visitorId: string;
}

export type GatheringErrorCode =
  | "ATTENDANCE_ALREADY_RECORDED"
  | "ATTENDANCE_NOT_FOUND"
  | "GATHERING_NOT_FOUND"
  | "GATHERING_SERVICE_UNAVAILABLE"
  | "INACTIVE_LIFE_GROUP"
  | "LIFE_GROUP_NOT_FOUND"
  | "MEMBER_NOT_ELIGIBLE"
  | "MEMBER_NOT_FOUND"
  | "VISITOR_NOT_ELIGIBLE"
  | "VISITOR_NOT_FOUND";

export class GatheringServiceError extends Error {
  readonly code: GatheringErrorCode;
  readonly status: 404 | 409 | 422 | 500;

  constructor(
    status: 404 | 409 | 422 | 500,
    code: GatheringErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GatheringServiceError";
    this.status = status;
    this.code = code;
  }
}

export interface GatheringService {
  addAttendance(
    actor: HorizonActor,
    lifeGroupId: string,
    gatheringId: string,
    memberId: string,
  ): Promise<AttendanceMutationResult>;
  create(
    actor: HorizonActor,
    lifeGroupId: string,
    input: GatheringInput,
  ): Promise<LifeGroupGathering>;
  addVisitorAttendance(
    actor: HorizonActor,
    lifeGroupId: string,
    gatheringId: string,
    visitorId: string,
  ): Promise<VisitorAttendanceMutationResult>;
  getById(
    actor: HorizonActor,
    lifeGroupId: string,
    gatheringId: string,
  ): Promise<LifeGroupGathering>;
  getAttendance(
    actor: HorizonActor,
    lifeGroupId: string,
    gatheringId: string,
  ): Promise<GatheringAttendanceRoster>;
  /** The Life Group with every Gathering, read in batches past the row cap. */
  list(actor: HorizonActor, lifeGroupId: string): Promise<GatheringDirectory>;
  /** The Life Group with one page of its Gatherings, with the exact total. */
  listPage(
    actor: HorizonActor,
    lifeGroupId: string,
    page: PageRequest,
  ): Promise<{ directory: GatheringDirectory; meta: PageMeta }>;
  removeAttendance(
    actor: HorizonActor,
    lifeGroupId: string,
    gatheringId: string,
    memberId: string,
  ): Promise<AttendanceMutationResult>;
  removeVisitorAttendance(
    actor: HorizonActor,
    lifeGroupId: string,
    gatheringId: string,
    visitorId: string,
  ): Promise<VisitorAttendanceMutationResult>;
  update(
    actor: HorizonActor,
    lifeGroupId: string,
    gatheringId: string,
    input: UpdateGatheringInput,
  ): Promise<LifeGroupGathering>;
}
