import cors from "cors";
import express from "express";

import type { AuthService } from "./auth/types.js";
import {
  LifeGroupServiceError,
  type LifeGroupService,
} from "./life-groups/types.js";
import { healthRouter } from "./routes/health.js";
import { createLifeGroupsRouter } from "./routes/life-groups.js";
import { createMeRouter } from "./routes/me.js";

export interface AppDependencies {
  authService: AuthService;
  frontendOrigin?: string;
  lifeGroupService?: LifeGroupService;
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

function unavailable(): never {
  throw new LifeGroupServiceError(
    500,
    "LIFE_GROUP_SERVICE_UNAVAILABLE",
    "Life Group data is temporarily unavailable.",
  );
}

export function createApp({
  authService,
  frontendOrigin = DEFAULT_FRONTEND_ORIGIN,
  lifeGroupService = unavailableLifeGroupService,
}: AppDependencies) {
  const app = express();

  app.use(cors({ origin: frontendOrigin }));
  app.use(express.json());
  app.use("/api", healthRouter);
  app.use("/api", createMeRouter(authService));
  app.use("/api", createLifeGroupsRouter(authService, lifeGroupService));

  return app;
}
