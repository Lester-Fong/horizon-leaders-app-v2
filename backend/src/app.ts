import cors from "cors";
import express from "express";

import type { AuthService } from "./auth/types.js";
import { EventServiceError, type EventService } from "./events/types.js";
import {
  FollowUpServiceError,
  type FollowUpService,
} from "./follow-ups/types.js";
import {
  GatheringServiceError,
  type GatheringService,
} from "./gatherings/types.js";
import { HarvestServiceError, type HarvestService } from "./harvests/types.js";
import {
  LifeGroupServiceError,
  type LifeGroupService,
} from "./life-groups/types.js";
import { MemberServiceError, type MemberService } from "./members/types.js";
import { OpenCellServiceError, type OpenCellService } from "./opencell/types.js";
import {
  MinistryServiceError,
  type MinistryService,
} from "./ministries/types.js";
import { healthRouter } from "./routes/health.js";
import { createEventsRouter } from "./routes/events.js";
import { createFollowUpsRouter } from "./routes/follow-ups.js";
import { createGatheringsRouter } from "./routes/gatherings.js";
import { createHarvestsRouter } from "./routes/harvests.js";
import { createLifeGroupsRouter } from "./routes/life-groups.js";
import { createMeRouter } from "./routes/me.js";
import { createMembersRouter } from "./routes/members.js";
import { createMinistriesRouter } from "./routes/ministries.js";
import { createOpenCellRouter } from "./routes/opencell.js";
import { createVisitorsRouter } from "./routes/visitors.js";
import { createDashboardRouter } from "./routes/dashboard.js";
import {
  VisitorServiceError,
  type VisitorService,
} from "./visitors/types.js";
import { DashboardServiceError, type DashboardService } from "./dashboard/types.js";

export interface AppDependencies {
  authService: AuthService;
  eventService?: EventService;
  followUpService?: FollowUpService;
  frontendOrigin?: string;
  gatheringService?: GatheringService;
  harvestService?: HarvestService;
  lifeGroupService?: LifeGroupService;
  memberService?: MemberService;
  ministryService?: MinistryService;
  openCellService?: OpenCellService;
  visitorService?: VisitorService;
  dashboardService?: DashboardService;
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
  getRoster: async () => unavailable(),
  list: async () => unavailable(),
  listLeaderOptions: async () => unavailable(),
  setActive: async () => unavailable(),
  update: async () => unavailable(),
};

const unavailableFollowUpService: FollowUpService = {
  complete: async () => unavailableFollowUp(),
  list: async () => unavailableFollowUp(),
  triggerSundayAbsence: async () => unavailableFollowUp(),
};

const unavailableGatheringService: GatheringService = {
  addAttendance: async () => unavailableGathering(),
  addVisitorAttendance: async () => unavailableGathering(),
  create: async () => unavailableGathering(),
  getAttendance: async () => unavailableGathering(),
  getById: async () => unavailableGathering(),
  list: async () => unavailableGathering(),
  removeAttendance: async () => unavailableGathering(),
  removeVisitorAttendance: async () => unavailableGathering(),
  update: async () => unavailableGathering(),
};

const unavailableHarvestService: HarvestService = {
  close: async () => unavailableHarvest(),
  create: async () => unavailableHarvest(),
  getById: async () => unavailableHarvest(),
  list: async () => unavailableHarvest(),
  listParticipations: async () => unavailableHarvest(),
  recordInterest: async () => unavailableHarvest(),
  registerExistingVisitor: async () => unavailableHarvest(),
  registerNewVisitor: async () => unavailableHarvest(),
  update: async () => unavailableHarvest(),
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
  setLifeGroup: async () => unavailableVisitor(),
  update: async () => unavailableVisitor(),
};
const unavailableOpenCellService: OpenCellService = {
  list: async () => unavailableOpenCell(), getById: async () => unavailableOpenCell(), create: async () => unavailableOpenCell(), update: async () => unavailableOpenCell(), finish: async () => unavailableOpenCell(), listSessions: async () => unavailableOpenCell(), createSession: async () => unavailableOpenCell(), updateSession: async () => unavailableOpenCell(), cancelSession: async () => unavailableOpenCell(), listParticipants: async () => unavailableOpenCell(), enroll: async () => unavailableOpenCell(), removeEnrollment: async () => unavailableOpenCell(), listAttendance: async () => unavailableOpenCell(), addAttendance: async () => unavailableOpenCell(), removeAttendance: async () => unavailableOpenCell(),
};
const unavailableDashboardService: DashboardService = {
  get: async () => { throw new DashboardServiceError(500, "DASHBOARD_SERVICE_UNAVAILABLE", "Dashboard data is temporarily unavailable."); },
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

function unavailableFollowUp(): never {
  throw new FollowUpServiceError(
    500,
    "FOLLOW_UP_SERVICE_UNAVAILABLE",
    "Follow Up data is temporarily unavailable.",
  );
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

function unavailableHarvest(): never {
  throw new HarvestServiceError(
    500,
    "HARVEST_SERVICE_UNAVAILABLE",
    "Harvest data is temporarily unavailable.",
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
function unavailableOpenCell(): never { throw new OpenCellServiceError(500,"OPENCELL_SERVICE_UNAVAILABLE","OpenCell data is temporarily unavailable."); }

export function createApp({
  authService,
  eventService = unavailableEventService,
  followUpService = unavailableFollowUpService,
  frontendOrigin = DEFAULT_FRONTEND_ORIGIN,
  gatheringService = unavailableGatheringService,
  harvestService = unavailableHarvestService,
  lifeGroupService = unavailableLifeGroupService,
  memberService = unavailableMemberService,
  ministryService = unavailableMinistryService,
  openCellService = unavailableOpenCellService,
  dashboardService = unavailableDashboardService,
  visitorService = unavailableVisitorService,
}: AppDependencies) {
  const app = express();

  app.use(cors({ origin: frontendOrigin }));
  app.use(express.json());
  app.use("/api", healthRouter);
  app.use("/api", createMeRouter(authService));
  app.use("/api", createHarvestsRouter(authService, harvestService));
  app.use("/api", createEventsRouter(authService, eventService));
  app.use("/api", createFollowUpsRouter(authService, followUpService));
  app.use("/api", createLifeGroupsRouter(authService, lifeGroupService));
  app.use("/api", createGatheringsRouter(authService, gatheringService));
  app.use("/api", createMembersRouter(authService, memberService));
  app.use("/api", createMinistriesRouter(authService, ministryService));
  app.use("/api", createOpenCellRouter(authService, openCellService));
  app.use("/api", createDashboardRouter(authService, dashboardService));
  app.use("/api", createVisitorsRouter(authService, visitorService));

  return app;
}
