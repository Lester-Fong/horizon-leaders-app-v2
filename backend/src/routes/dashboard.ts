import { Router } from "express";

import { requireAuth } from "../auth/middleware.js";
import type { AuthService } from "../auth/types.js";
import { DashboardServiceError, type DashboardPeriod, type DashboardService } from "../dashboard/types.js";
import { createRequestHandler, sendError } from "../http/responses.js";
import { readUuid } from "../http/validation.js";

const handle = createRequestHandler(DashboardServiceError, {
  code: "DASHBOARD_SERVICE_UNAVAILABLE",
  message: "Dashboard data is temporarily unavailable.",
});

export function createDashboardRouter(authService: AuthService, dashboardService: DashboardService) {
  const router = Router();
  router.get("/dashboard", requireAuth(authService), async (request, response) => {
    if (!request.actor) return;
    const rawPeriod = request.query.period;
    const period: DashboardPeriod = rawPeriod === undefined ? "8" : rawPeriod === "4" || rawPeriod === "8" || rawPeriod === "12" || rawPeriod === "year" ? rawPeriod as DashboardPeriod : (() => { sendError(response, 400, "INVALID_REQUEST", "Period must be 4, 8, 12, or year."); return "8" as DashboardPeriod; })();
    if (response.headersSent) return;
    const rawLifeGroup = request.query.lifeGroupId;
    if (rawLifeGroup !== undefined && !readUuid(rawLifeGroup)) {
      sendError(response, 400, "INVALID_REQUEST", "Life Group ID must be a valid UUID.");
      return;
    }
    const actor = request.actor;
    const lifeGroupScope = actor.role === "admin" && typeof rawLifeGroup === "string" ? { lifeGroupId: rawLifeGroup } : {};
    await handle(response, async () => {
      const dashboard = await dashboardService.get(actor, { period, ...lifeGroupScope });
      // Only successful responses are marked private; errors keep default caching headers.
      response.set("Cache-Control", "private, no-store");
      return dashboard;
    });
  });
  return router;
}
