import cors from "cors";
import express from "express";

import type { AuthService } from "./auth/types.js";
import { healthRouter } from "./routes/health.js";
import { createMeRouter } from "./routes/me.js";

export interface AppDependencies {
  authService: AuthService;
  frontendOrigin?: string;
}

const DEFAULT_FRONTEND_ORIGIN = "http://127.0.0.1:5173";

export function createApp({
  authService,
  frontendOrigin = DEFAULT_FRONTEND_ORIGIN,
}: AppDependencies) {
  const app = express();

  app.use(cors({ origin: frontendOrigin }));
  app.use(express.json());
  app.use("/api", healthRouter);
  app.use("/api", createMeRouter(authService));

  return app;
}
