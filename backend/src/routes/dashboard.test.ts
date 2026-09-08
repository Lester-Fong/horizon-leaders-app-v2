import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import type { DashboardData, DashboardService } from "../dashboard/types.js";

const admin: HorizonActor = { id: "11111111-1111-4111-8111-111111111111", isActive: true, name: "Admin", role: "admin" };
const leader: HorizonActor = { id: "22222222-2222-4222-8222-222222222222", isActive: true, name: "Leader", role: "leader" };
const dashboard: DashboardData = {
  memberSnapshot: { age: [], gender: [] }, metrics: { activeFollowUps: 0, activeOpenCellProgrammes: 0 },
  needsAttention: { byReason: [], total: 0 }, openCell: { activeProgrammes: 0, currentParticipants: 0 },
  recentUpcoming: { recent: [], upcoming: [] }, sundayAttendance: { averageRate: null, points: [] },
};

function app(dashboardService: DashboardService) {
  const authService: AuthService = { authenticate: vi.fn(async (token) => ({ actor: token === "admin" ? admin : leader, ok: true })) };
  return createApp({ authService, dashboardService });
}

describe("Dashboard API", () => {
  it("requires authentication and validates period", async () => {
    const service: DashboardService = { get: vi.fn(async () => dashboard) };
    const testApp = app(service);
    expect((await request(testApp).get("/api/dashboard")).status).toBe(401);
    expect((await request(testApp).get("/api/dashboard?period=3").set("Authorization", "Bearer admin")).status).toBe(400);
    expect(service.get).not.toHaveBeenCalled();
  });

  it("passes Admin filters and strips Leader Life Group filters", async () => {
    const service: DashboardService = { get: vi.fn(async () => dashboard) };
    const testApp = app(service);
    const groupId = "33333333-3333-4333-8333-333333333333";
    await request(testApp).get(`/api/dashboard?period=4&lifeGroupId=${groupId}`).set("Authorization", "Bearer admin");
    await request(testApp).get(`/api/dashboard?period=12&lifeGroupId=${groupId}`).set("Authorization", "Bearer leader");
    expect(service.get).toHaveBeenNthCalledWith(1, admin, { period: "4", lifeGroupId: groupId });
    expect(service.get).toHaveBeenNthCalledWith(2, leader, { period: "12" });
  });
});
