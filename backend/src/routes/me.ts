import { Router } from "express";

import { requireAuth } from "../auth/middleware.js";
import type { AuthService } from "../auth/types.js";

export function createMeRouter(authService: AuthService) {
  const meRouter = Router();

  meRouter.get("/me", requireAuth(authService), (request, response) => {
    response.set("Cache-Control", "private, no-store");
    response.status(200).json({ data: request.actor });
  });

  return meRouter;
}
