import cors from "cors";
import express from "express";

import type { AuthService } from "./auth/types.js";
import { EventServiceError, type EventService } from "./events/types.js";
import {
  GatheringServiceError,
  type GatheringService,
} from "./gatherings/types.js";
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
import { createEventsRouter } from "./routes/events.js";
import { createGatheringsRouter } from "./routes/gatherings.js";
import { createLifeGroupsRouter } from "./routes/life-groups.js";
import { createMeRouter } from "./routes/me.js";
import { createMembersRouter } from "./routes/members.js";
import { createMinistriesRouter } from "./routes/ministries.js";
import { createVisitorsRouter } from "./routes/visitors.js";
import {
  VisitorServiceError,
  type VisitorService,
} from "./visitors/types.js";

export interface AppDependencies {
  authService: AuthService;
  eventService?: EventService;
  frontendOrigin?: string;
  gatheringService?: GatheringService;
  lifeGroupService?: LifeGroupService;
  memberService?: MemberService;
  ministryService?: MinistryService;
  visitorService?: VisitorService;
}

const DEFAULT_FRONTEND_ORIGIN = "http://127.0.0.1:5173";

const unavailableEventService: EventService = {
  addAttendance: async () => unavailableEvent(),
  addAttendanceByQr: async () => unavailableEvent(),
  close: async () => unavailableEvent(),
  create: async () => unavailableEvent(),
  getAttendance: async () => unavailableEvent(),
  getById: async () => unavailableEvent(),
  list: async () => unavailableEvent(),
  listVisitors: async () => unavailableEvent(),
  registerExistingVisitor: async () => unavailableEvent(),
  registerNewVisitor: async () => unavailableEvent(),
  removeAttendance: async () => unavailableEvent(),
  removeVisitor: async () => unavailableEvent(),
  update: async () => unavailableEvent(),
};

const unavailableLifeGroupService: LifeGroupService = {
  create: async () => unavailable(),
  getById: async () => unavailable(),
  list: async () => unavailable(),
  listLeaderOptions: async () => unavailable(),
  setActive: async () => unavailable(),
  update: async () => unavailable(),
};

const unavailableGatheringService: GatheringService = {
  addAttendance: async () => unavailableGathering(),
  create: async () => unavailableGathering(),
  getAttendance: async () => unavailableGathering(),
  getById: async () => unavailableGathering(),
  list: async () => unavailableGathering(),
  removeAttendance: async () => unavailableGathering(),
  update: async () => unavailableGathering(),
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

const unavailableVisitorService: VisitorService = {
  convert: async () => unavailableVisitor(),
  create: async () => unavailableVisitor(),
  getById: async () => unavailableVisitor(),
  list: async () => unavailableVisitor(),
  update: async () => unavailableVisitor(),
};

function unavailable(): never {
  throw new LifeGroupServiceError(
    500,
    "LIFE_GROUP_SERVICE_UNAVAILABLE",
    "Life Group data is temporarily unavailable.",
  );
}

function unavailableEvent(): never {
  throw new EventServiceError(500, "EVENT_SERVICE_UNAVAILABLE", "Sunday Service data is temporarily unavailable.");
}

function unavailableMember(): never {
  throw new MemberServiceError(
    500,
    "MEMBER_SERVICE_UNAVAILABLE",
    "Member data is temporarily unavailable.",
  );
}

function unavailableGathering(): never {
  throw new GatheringServiceError(
    500,
    "GATHERING_SERVICE_UNAVAILABLE",
    "Gathering data is temporarily unavailable.",
  );
}

function unavailableMinistry(): never {
  throw new MinistryServiceError(
    500,
    "MINISTRY_SERVICE_UNAVAILABLE",
    "Ministry data is temporarily unavailable.",
  );
}

function unavailableVisitor(): never {
  throw new VisitorServiceError(
    500,
    "VISITOR_SERVICE_UNAVAILABLE",
    "Visitor data is temporarily unavailable.",
  );
}

export function createApp({
  authService,
  eventService = unavailableEventService,
  frontendOrigin = DEFAULT_FRONTEND_ORIGIN,
  gatheringService = unavailableGatheringService,
  lifeGroupService = unavailableLifeGroupService,
  memberService = unavailableMemberService,
  ministryService = unavailableMinistryService,
  visitorService = unavailableVisitorService,
}: AppDependencies) {
  const app = express();

  app.use(cors({ origin: frontendOrigin }));
  app.use(express.json());
  app.use("/api", healthRouter);
  app.use("/api", createMeRouter(authService));
  app.use("/api", createEventsRouter(authService, eventService));
  app.use("/api", createLifeGroupsRouter(authService, lifeGroupService));
  app.use("/api", createGatheringsRouter(authService, gatheringService));
  app.use("/api", createMembersRouter(authService, memberService));
  app.use("/api", createMinistriesRouter(authService, ministryService));
  app.use("/api", createVisitorsRouter(authService, visitorService));

  return app;
}
