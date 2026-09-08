import type { HorizonActor } from "../auth/types.js";

export type DashboardPeriod = "4" | "8" | "12" | "year";

export interface DashboardOptions {
  lifeGroupId?: string;
  period: DashboardPeriod;
}

export interface DashboardMetricSet {
  activeFollowUps: number;
  activeMembers?: number;
  activeOpenCellProgrammes: number;
  activeVisitors?: number;
  myLifeGroupMembers?: number;
  myLifeGroupVisitors?: number;
  newVisitorsThisMonth?: number;
}

export interface DashboardChartPoint {
  date: string;
  eligibleCount: number;
  eventId: string;
  presentCount: number;
  rate: number | null;
}

export interface DashboardActivityItem {
  context: string | null;
  date: string;
  href: string | null;
  id: string;
  kind: string;
  status: string | null;
  title: string;
}

export interface DashboardBreakdown {
  count: number;
  key: string;
  label: string;
  percentage: number;
}

export interface DashboardData {
  memberSnapshot: { age: DashboardBreakdown[]; gender: DashboardBreakdown[] };
  metrics: DashboardMetricSet;
  needsAttention: {
    byReason: DashboardBreakdown[];
    total: number;
  };
  openCell: { activeProgrammes: number; currentParticipants: number };
  recentUpcoming: {
    recent: DashboardActivityItem[];
    upcoming: DashboardActivityItem[];
  };
  sundayAttendance: {
    averageRate: number | null;
    points: DashboardChartPoint[];
  };
}

export interface DashboardService {
  get(actor: HorizonActor, options: DashboardOptions): Promise<DashboardData>;
}

export type DashboardErrorCode = "DASHBOARD_SERVICE_UNAVAILABLE" | "LIFE_GROUP_SCOPE_NOT_FOUND";

export class DashboardServiceError extends Error {
  constructor(
    readonly status: 403 | 404 | 500,
    readonly code: DashboardErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DashboardServiceError";
  }
}
