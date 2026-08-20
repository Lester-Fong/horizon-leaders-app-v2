import type { HorizonActor } from "../auth/types.js";

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
}

export interface AttendanceMutationResult {
  isPresent: boolean;
  memberId: string;
}

export type GatheringErrorCode =
  | "ATTENDANCE_ALREADY_RECORDED"
  | "ATTENDANCE_NOT_FOUND"
  | "GATHERING_NOT_FOUND"
  | "GATHERING_SERVICE_UNAVAILABLE"
  | "INACTIVE_LIFE_GROUP"
  | "LIFE_GROUP_NOT_FOUND"
  | "MEMBER_NOT_ELIGIBLE"
  | "MEMBER_NOT_FOUND";

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
  list(actor: HorizonActor, lifeGroupId: string): Promise<GatheringDirectory>;
  removeAttendance(
    actor: HorizonActor,
    lifeGroupId: string,
    gatheringId: string,
    memberId: string,
  ): Promise<AttendanceMutationResult>;
  update(
    actor: HorizonActor,
    lifeGroupId: string,
    gatheringId: string,
    input: UpdateGatheringInput,
  ): Promise<LifeGroupGathering>;
}
