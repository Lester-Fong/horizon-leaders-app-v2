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

/** Statuses written by `public.reconcile_sunday_services()` (DEC-067). */
export type AutomationRunStatus = "running" | "succeeded" | "partial" | "failed";

export interface AutomationRun {
  errorCount: number;
  errorSummary: string | null;
  finishedAt: string | null;
  jobName: string;
  processedCount: number;
  startedAt: string;
  status: AutomationRunStatus;
}

export interface PendingSundayService {
  date: string;
  eventId: string;
  title: string;
}

/** Admin-only Sunday reconciliation visibility (DEC-079). */
export interface DashboardAutomationStatus {
  lastRun: AutomationRun | null;
  /** Closed counting Services not yet evaluated; the next daily run retries them. */
  pendingServiceCount: number;
  /** Oldest pending Services first, at most five. */
  pendingServices: PendingSundayService[];
}

export interface DashboardData {
  /** Present only for Admins; Leaders never receive automation data. */
  automation?: DashboardAutomationStatus;
  /** True only for a Leader who leads no Life Group; group-scoped values are then zero/empty. */
  isUnassignedLeader: boolean;
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

export type DashboardErrorCode = "DASHBOARD_SERVICE_UNAVAILABLE";

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
