import type { HorizonActor } from "../auth/types.js";

export type HarvestEventStatus = "open" | "closed";

export interface HarvestEvent {
  countsForAbsence: false;
  createdAt: string;
  createdBy: { id: string; name: string };
  description: string | null;
  eventDate: string;
  id: string;
  location: string | null;
  participationCount: number;
  status: HarvestEventStatus;
  title: string;
  type: "harvest";
  updatedAt: string;
}

export interface HarvestEventInput {
  description: string | null;
  eventDate: string;
  location: string | null;
  title: string;
}

export type UpdateHarvestEventInput = Partial<HarvestEventInput>;

export interface NewHarvestVisitorInput {
  email: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
}

export interface HarvestParticipation {
  createdAt: string;
  followUp: {
    createdAt: string;
    id: string;
    status: "active" | "completed";
  } | null;
  interestRecordedAt: string | null;
  interestRecordedBy: { id: string; name: string } | null;
  registeredBy: { id: string; name: string };
  sundayInterest: boolean | null;
  visitor: {
    email: string | null;
    firstName: string;
    id: string;
    lastName: string;
    phone: string | null;
    status: "active" | "converted";
  };
}

export interface HarvestInterestResult {
  followUpId: string | null;
  followUpResult: "created" | "suppressed" | null;
  result: "recorded_interested" | "recorded_not_interested" | "already_interested" | "already_not_interested";
}

export type HarvestErrorDetails = {
  conflictField?: "email" | "phone";
  existingVisitor?: { id: string; name: string };
  conflictingMember?: { id: string; lifeGroup: string; name: string };
};

export type HarvestErrorCode =
  | "EVENT_ACTIVITY_LOCKS_DATE"
  | "EVENT_ALREADY_CLOSED"
  | "EVENT_CLOSED"
  | "EVENT_NOT_FOUND"
  | "FORBIDDEN"
  | "HARVEST_SERVICE_UNAVAILABLE"
  | "INTEREST_ALREADY_POSITIVE"
  | "MEMBER_CONTACT_CONFLICT"
  | "PARTICIPATION_NOT_FOUND"
  | "VISITOR_CONTACT_CONFLICT"
  | "VISITOR_NOT_ELIGIBLE"
  | "VISITOR_NOT_FOUND";

export class HarvestServiceError extends Error {
  constructor(
    readonly status: 403 | 404 | 409 | 422 | 500,
    readonly code: HarvestErrorCode,
    message: string,
    readonly details?: HarvestErrorDetails,
  ) {
    super(message);
    this.name = "HarvestServiceError";
  }
}

export interface HarvestService {
  close(actor: HorizonActor, eventId: string): Promise<HarvestEvent>;
  create(actor: HorizonActor, input: HarvestEventInput): Promise<HarvestEvent>;
  getById(actor: HorizonActor, eventId: string): Promise<HarvestEvent>;
  list(actor: HorizonActor): Promise<{ events: HarvestEvent[] }>;
  listParticipations(actor: HorizonActor, eventId: string): Promise<{ participations: HarvestParticipation[] }>;
  recordInterest(actor: HorizonActor, eventId: string, visitorId: string, interested: boolean): Promise<HarvestInterestResult>;
  registerExistingVisitor(actor: HorizonActor, eventId: string, visitorId: string): Promise<{ result: "registered" | "already_registered"; visitorId: string }>;
  registerNewVisitor(actor: HorizonActor, eventId: string, input: NewHarvestVisitorInput): Promise<{ result: "registered"; visitorId: string }>;
  update(actor: HorizonActor, eventId: string, input: UpdateHarvestEventInput): Promise<HarvestEvent>;
}
