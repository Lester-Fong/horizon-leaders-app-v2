export interface LifeGroupLeader {
  id: string;
  isActive: boolean;
  name: string;
}

export interface LifeGroup {
  createdAt: string;
  description: string | null;
  id: string;
  isActive: boolean;
  leader: LifeGroupLeader;
  name: string;
  updatedAt: string;
}

export interface AssignedLifeGroupSummary {
  id: string;
  isActive: boolean;
  name: string;
}

export interface LeaderOption extends LifeGroupLeader {
  assignedLifeGroup: AssignedLifeGroupSummary | null;
}

export interface CreateLifeGroupInput {
  description: string | null;
  leaderProfileId: string;
  name: string;
}

export interface UpdateLifeGroupInput {
  description?: string | null;
  leaderProfileId?: string;
  name?: string;
}

export type LifeGroupErrorCode =
  | "LEADER_ALREADY_ASSIGNED"
  | "LEADER_INACTIVE"
  | "LEADER_NOT_FOUND"
  | "LEADER_ROLE_REQUIRED"
  | "LIFE_GROUP_NOT_FOUND"
  | "LIFE_GROUP_SERVICE_UNAVAILABLE";

export class LifeGroupServiceError extends Error {
  readonly code: LifeGroupErrorCode;
  readonly status: 404 | 409 | 422 | 500;

  constructor(
    status: 404 | 409 | 422 | 500,
    code: LifeGroupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LifeGroupServiceError";
    this.status = status;
    this.code = code;
  }
}

export interface LifeGroupService {
  create(input: CreateLifeGroupInput): Promise<LifeGroup>;
  getById(lifeGroupId: string): Promise<LifeGroup>;
  list(options: { includeInactive: boolean }): Promise<LifeGroup[]>;
  listLeaderOptions(): Promise<LeaderOption[]>;
  setActive(lifeGroupId: string, isActive: boolean): Promise<LifeGroup>;
  update(
    lifeGroupId: string,
    input: UpdateLifeGroupInput,
  ): Promise<LifeGroup>;
}
