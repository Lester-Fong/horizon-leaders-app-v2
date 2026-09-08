import { Router, type Response } from "express";

import { requireAuth } from "../auth/middleware.js";
import type { AuthService } from "../auth/types.js";
import { DashboardServiceError, type DashboardPeriod, type DashboardService } from "../dashboard/types.js";

type ErrorBody = { error: { code: string; message: string } };
function sendError(response: Response<ErrorBody>, status: number, code: string, message: string) {
  response.status(status).json({ error: { code, message } });
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createDashboardRouter(authService: AuthService, dashboardService: DashboardService) {
  const router = Router();
  router.get("/dashboard", requireAuth(authService), async (request, response) => {
    if (!request.actor) return;
    const rawPeriod = request.query.period;
    const period: DashboardPeriod = rawPeriod === undefined ? "8" : rawPeriod === "4" || rawPeriod === "8" || rawPeriod === "12" || rawPeriod === "year" ? rawPeriod as DashboardPeriod : (() => { sendError(response, 400, "INVALID_REQUEST", "Period must be 4, 8, 12, or year."); return "8" as DashboardPeriod; })();
    if (response.headersSent) return;
    const rawLifeGroup = request.query.lifeGroupId;
    if (rawLifeGroup !== undefined && (typeof rawLifeGroup !== "string" || !UUID.test(rawLifeGroup))) {
      sendError(response, 400, "INVALID_REQUEST", "Life Group ID must be a valid UUID.");
      return;
    }
    try {
      const data = await dashboardService.get(request.actor, { period, ...(request.actor.role === "admin" && typeof rawLifeGroup === "string" ? { lifeGroupId: rawLifeGroup } : {}) });
      response.set("Cache-Control", "private, no-store");
      response.json({ data });
    } catch (error) {
      if (error instanceof DashboardServiceError) {
        sendError(response, error.status, error.code, error.message);
        return;
      }
      sendError(response, 500, "DASHBOARD_SERVICE_UNAVAILABLE", "Dashboard data is temporarily unavailable.");
    }
  });
  return router;
}
