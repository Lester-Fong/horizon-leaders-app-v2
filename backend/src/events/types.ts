import type { HorizonActor } from "../auth/types.js";

export type SundayServiceStatus = "open" | "closed";

export interface SundayService {
  attendanceCount: number;
  countsForAbsence: boolean;
  createdAt: string;
  createdBy: { id: string; name: string };
  description: string | null;
  eligibilityCount: number;
  eventDate: string;
  id: string;
  location: string | null;
  status: SundayServiceStatus;
  title: string;
  updatedAt: string;
  visitorCount: number;
}

export interface SundayServiceInput {
  countsForAbsence: boolean;
  description: string | null;
  eventDate: string;
  location: string | null;
  title: string;
}

export type UpdateSundayServiceInput = Partial<SundayServiceInput>;

export interface SundayAttendanceMember {
  attendanceStatus: "present" | "not_checked_in" | "absent" | "not_counted";
  email: string | null;
  firstName: string;
  id: string;
  isActive: boolean;
  isPresent: boolean;
  lastName: string;
  lifeGroup: { id: string; name: string };
  phone: string | null;
}

export interface SundayVisitorRegistration {
  createdAt: string;
  registeredBy: { id: string; name: string };
  visitor: {
    email: string | null;
    firstName: string;
    id: string;
    lastName: string;
    phone: string | null;
    status: "active" | "converted";
  };
}

export interface NewSundayVisitorInput {
  email: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
}

export type EventErrorDetails = {
  conflictField?: "email" | "phone";
  existingVisitor?: { id: string; name: string };
};

export type EventErrorCode =
  | "ATTENDANCE_NOT_FOUND"
  | "EVENT_ACTIVITY_LOCKS_DATE"
  | "EVENT_ALREADY_CLOSED"
  | "EVENT_CLOSED"
  | "EVENT_DATE_CONFLICT"
  | "EVENT_DATE_INVALID"
  | "EVENT_NOT_FOUND"
  | "EVENT_SERVICE_UNAVAILABLE"
  | "FORBIDDEN"
  | "MEMBER_CONTACT_CONFLICT"
  | "MEMBER_NOT_ELIGIBLE"
  | "MEMBER_NOT_FOUND"
  | "VISITOR_CONTACT_CONFLICT"
  | "VISITOR_NOT_ELIGIBLE"
  | "VISITOR_NOT_FOUND"
  | "VISITOR_REGISTRATION_NOT_FOUND";

export class EventServiceError extends Error {
  constructor(
    readonly status: 403 | 404 | 409 | 422 | 500,
    readonly code: EventErrorCode,
    message: string,
    readonly details?: EventErrorDetails,
  ) {
    super(message);
    this.name = "EventServiceError";
  }
}

export interface EventService {
  addAttendance(actor: HorizonActor, eventId: string, memberId: string): Promise<{ memberId: string; result: "recorded" | "already_present" }>;
  addAttendanceByQr(actor: HorizonActor, eventId: string, qrToken: string): Promise<{ member: SundayAttendanceMember; result: "recorded" | "already_present" }>;
  close(actor: HorizonActor, eventId: string): Promise<SundayService>;
  create(actor: HorizonActor, input: SundayServiceInput): Promise<SundayService>;
  getAttendance(actor: HorizonActor, eventId: string): Promise<{ members: SundayAttendanceMember[] }>;
  getById(actor: HorizonActor, eventId: string): Promise<SundayService>;
  list(actor: HorizonActor): Promise<{ events: SundayService[] }>;
  listVisitors(actor: HorizonActor, eventId: string): Promise<{ registrations: SundayVisitorRegistration[] }>;
  registerExistingVisitor(actor: HorizonActor, eventId: string, visitorId: string): Promise<{ result: "registered" | "already_registered"; visitorId: string }>;
  registerNewVisitor(actor: HorizonActor, eventId: string, input: NewSundayVisitorInput): Promise<{ result: "registered"; visitorId: string }>;
  removeAttendance(actor: HorizonActor, eventId: string, memberId: string): Promise<{ memberId: string; result: "removed" }>;
  removeVisitor(actor: HorizonActor, eventId: string, visitorId: string): Promise<{ result: "removed"; visitorId: string }>;
  update(actor: HorizonActor, eventId: string, input: UpdateSundayServiceInput): Promise<SundayService>;
}
