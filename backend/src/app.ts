import cors from "cors";
import express from "express";

import type { AuthService } from "./auth/types.js";
import {
  LifeGroupServiceError,
  type LifeGroupService,
} from "./life-groups/types.js";
import { MemberServiceError, type MemberService } from "./members/types.js";
import {
  MinistryServiceError,
  type MinistryService,
} from "./ministries/types.js";
import { healthRouter } from "./routes/health.js";
import { createLifeGroupsRouter } from "./routes/life-groups.js";
import { createMeRouter } from "./routes/me.js";
import { createMembersRouter } from "./routes/members.js";
import { createMinistriesRouter } from "./routes/ministries.js";

export interface AppDependencies {
  authService: AuthService;
  frontendOrigin?: string;
  lifeGroupService?: LifeGroupService;
  memberService?: MemberService;
  ministryService?: MinistryService;
}

const DEFAULT_FRONTEND_ORIGIN = "http://127.0.0.1:5173";

const unavailableLifeGroupService: LifeGroupService = {
  create: async () => unavailable(),
  getById: async () => unavailable(),
  list: async () => unavailable(),
  listLeaderOptions: async () => unavailable(),
  setActive: async () => unavailable(),
  update: async () => unavailable(),
};

const unavailableMemberService: MemberService = {
  archive: async () => unavailableMember(),
  create: async () => unavailableMember(),
  getById: async () => unavailableMember(),
  list: async () => unavailableMember(),
  update: async () => unavailableMember(),
};

const unavailableMinistryService: MinistryService = {
  archive: async () => unavailableMinistry(),
  assignMember: async () => unavailableMinistry(),
  create: async () => unavailableMinistry(),
  getById: async () => unavailableMinistry(),
  list: async () => unavailableMinistry(),
  listMembers: async () => unavailableMinistry(),
  removeMember: async () => unavailableMinistry(),
  update: async () => unavailableMinistry(),
};

function unavailable(): never {
  throw new LifeGroupServiceError(
    500,
    "LIFE_GROUP_SERVICE_UNAVAILABLE",
    "Life Group data is temporarily unavailable.",
  );
}

function unavailableMember(): never {
  throw new MemberServiceError(
    500,
    "MEMBER_SERVICE_UNAVAILABLE",
    "Member data is temporarily unavailable.",
  );
}

function unavailableMinistry(): never {
  throw new MinistryServiceError(
    500,
    "MINISTRY_SERVICE_UNAVAILABLE",
    "Ministry data is temporarily unavailable.",
  );
}

export function createApp({
  authService,
  frontendOrigin = DEFAULT_FRONTEND_ORIGIN,
  lifeGroupService = unavailableLifeGroupService,
  memberService = unavailableMemberService,
  ministryService = unavailableMinistryService,
}: AppDependencies) {
  const app = express();

  app.use(cors({ origin: frontendOrigin }));
  app.use(express.json());
  app.use("/api", healthRouter);
  app.use("/api", createMeRouter(authService));
  app.use("/api", createLifeGroupsRouter(authService, lifeGroupService));
  app.use("/api", createMembersRouter(authService, memberService));
  app.use("/api", createMinistriesRouter(authService, ministryService));

  return app;
}
