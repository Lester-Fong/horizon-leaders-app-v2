import type { HorizonActor } from "../auth/types.js";
import type { Enums, Json } from "../types/database.types.js";

export type FollowUpReason = Enums<"follow_up_reason">;
export type FollowUpStatus = Enums<"follow_up_status">;

export const FOLLOW_UP_REASON_LABELS: Record<FollowUpReason, string> = {
  consecutive_sunday_absence: "Consecutive Sunday absences",
  harvest_sunday_interest: "Interested in Sunday Service",
  opencell_high_participation: "Attended most OpenCell sessions",
};

export interface FollowUpSubject {
  id: string;
  name: string;
  recordStatus: "active" | "archived" | "converted";
  type: "member" | "visitor";
}

export interface FollowUp {
  completedAt: string | null;
  completedBy: { id: string; name: string } | null;
  completionNote: string | null;
  context: Json;
  createdAt: string;
  id: string;
  reason: FollowUpReason;
  reasonLabel: string;
  status: FollowUpStatus;
  subject: FollowUpSubject;
}

export interface SundayAbsenceFollowUpContext {
  qualifyingServiceIds: string[];
  threshold: number;
}

export type FollowUpErrorCode =
  | "FOLLOW_UP_ALREADY_COMPLETED"
  | "FOLLOW_UP_NOT_FOUND"
  | "FOLLOW_UP_SERVICE_UNAVAILABLE"
  | "INVALID_TRIGGER_CONTEXT";

export class FollowUpServiceError extends Error {
  constructor(
    readonly status: 404 | 409 | 422 | 500,
    readonly code: FollowUpErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FollowUpServiceError";
  }
}

export interface FollowUpService {
  complete(
    actor: HorizonActor,
    followUpId: string,
    completionNote: string | null,
  ): Promise<FollowUp>;
  list(actor: HorizonActor, status: FollowUpStatus): Promise<FollowUp[]>;
  triggerSundayAbsence(
    memberId: string,
    context: SundayAbsenceFollowUpContext,
  ): Promise<{ followUp: FollowUp; outcome: "created" | "suppressed" }>;
}
