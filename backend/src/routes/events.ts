import { Router, type Response } from "express";

import { requireAuth } from "../auth/middleware.js";
import type { AuthService } from "../auth/types.js";
import { EventServiceError, type EventService, type NewSundayVisitorInput, type SundayServiceInput, type UpdateSundayServiceInput } from "../events/types.js";
import { createRequestHandler, sendError } from "../http/responses.js";
import {
  hasOwn,
  hasUnknownFields,
  isRecord,
  readCalendarDate,
  readOptionalText,
  readRequiredText,
  readUuid,
} from "../http/validation.js";

const EVENT_FIELDS = new Set(["countsForAbsence", "description", "eventDate", "location", "title"]);
const VISITOR_FIELDS = new Set(["email", "firstName", "lastName", "phone"]);

const handle = createRequestHandler(EventServiceError, {
  code: "EVENT_SERVICE_UNAVAILABLE",
  message: "Sunday Service data is temporarily unavailable.",
});

function eventId(response: Response, value: unknown) {
  const id = readUuid(value);
  if (!id) sendError(response, 400, "INVALID_REQUEST", "Event ID must be a valid UUID.");
  return id;
}
function createInput(body: Record<string, unknown>): SundayServiceInput | undefined {
  if (hasUnknownFields(body, EVENT_FIELDS)) return undefined;
  const title = readRequiredText(body.title); const eventDate = readCalendarDate(body.eventDate);
  const location = readOptionalText(body.location); const description = readOptionalText(body.description);
  if (!title || !eventDate || location === undefined || description === undefined || typeof body.countsForAbsence !== "boolean") return undefined;
  return { countsForAbsence: body.countsForAbsence, description, eventDate, location, title };
}
function updateInput(body: Record<string, unknown>): UpdateSundayServiceInput | undefined {
  if (hasUnknownFields(body, EVENT_FIELDS)) return undefined;
  const input: UpdateSundayServiceInput = {};
  if (hasOwn(body, "title")) { const value = readRequiredText(body.title); if (!value) return; input.title = value; }
  if (hasOwn(body, "eventDate")) { const value = readCalendarDate(body.eventDate); if (!value) return; input.eventDate = value; }
  for (const field of ["location", "description"] as const) if (hasOwn(body, field)) { const value = readOptionalText(body[field]); if (value === undefined) return; input[field] = value; }
  if (hasOwn(body, "countsForAbsence")) { if (typeof body.countsForAbsence !== "boolean") return; input.countsForAbsence = body.countsForAbsence; }
  return Object.keys(input).length ? input : undefined;
}
function newVisitorInput(body: Record<string, unknown>): NewSundayVisitorInput | undefined {
  if (hasUnknownFields(body, VISITOR_FIELDS)) return;
  const firstName = readRequiredText(body.firstName); const lastName = readRequiredText(body.lastName);
  const phone = readOptionalText(body.phone); const email = readOptionalText(body.email);
  return firstName && lastName && phone !== undefined && email !== undefined ? { email, firstName, lastName, phone } : undefined;
}

export function createEventsRouter(authService: AuthService, service: EventService) {
  const router = Router(); const authenticated = requireAuth(authService);
  router.get("/events", authenticated, async (request, response) => { if (!request.actor) return; response.set("Cache-Control", "private, no-store"); await handle(response, () => service.list(request.actor!)); });
  router.post("/events", authenticated, async (request, response) => {
    if (!request.actor || !isRecord(request.body)) return void sendError(response, 400, "INVALID_REQUEST", "A request body is required.");
    const input = createInput(request.body); if (!input) return void sendError(response, 400, "INVALID_REQUEST", "Provide the approved title, date, location, description, and counting fields.");
    await handle(response, () => service.create(request.actor!, input), 201);
  });
  router.get("/events/:eventId", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); if (!id || !request.actor) return; response.set("Cache-Control", "private, no-store"); await handle(response, () => service.getById(request.actor!, id)); });
  router.patch("/events/:eventId", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); if (!id || !request.actor || !isRecord(request.body)) return; const input = updateInput(request.body); if (!input) return void sendError(response, 400, "INVALID_REQUEST", "Provide only valid editable Service fields."); await handle(response, () => service.update(request.actor!, id, input)); });
  router.post("/events/:eventId/close", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); if (!id || !request.actor) return; if (request.body !== undefined && isRecord(request.body) && Object.keys(request.body).length) return void sendError(response, 400, "INVALID_REQUEST", "Closing a Service does not accept fields."); await handle(response, () => service.close(request.actor!, id)); });
  router.get("/events/:eventId/attendance", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); if (!id || !request.actor) return; response.set("Cache-Control", "private, no-store"); await handle(response, () => service.getAttendance(request.actor!, id)); });
  router.post("/events/:eventId/attendance", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); const memberId = isRecord(request.body) ? readUuid(request.body.memberId) : undefined; if (!id || !request.actor || !memberId || !isRecord(request.body) || Object.keys(request.body).some((key) => key !== "memberId")) return void (id && sendError(response, 400, "INVALID_REQUEST", "A valid Member ID is required.")); await handle(response, () => service.addAttendance(request.actor!, id, memberId), 201); });
  router.post("/events/:eventId/attendance/qr", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); const qrToken = isRecord(request.body) ? readRequiredText(request.body.qrToken) : undefined; if (!id || !request.actor || !qrToken || !isRecord(request.body) || Object.keys(request.body).some((key) => key !== "qrToken")) return void (id && sendError(response, 400, "INVALID_REQUEST", "A QR token is required.")); await handle(response, () => service.addAttendanceByQr(request.actor!, id, qrToken), 201); });
  router.delete("/events/:eventId/attendance/:memberId", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); const memberId = readUuid(request.params.memberId); if (!id || !request.actor || !memberId) return void (id && sendError(response, 400, "INVALID_REQUEST", "Member ID must be a valid UUID.")); await handle(response, () => service.removeAttendance(request.actor!, id, memberId)); });
  router.get("/events/:eventId/visitors", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); if (!id || !request.actor) return; response.set("Cache-Control", "private, no-store"); await handle(response, () => service.listVisitors(request.actor!, id)); });
  router.post("/events/:eventId/visitors", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); const visitorId = isRecord(request.body) ? readUuid(request.body.visitorId) : undefined; if (!id || !request.actor || !visitorId || !isRecord(request.body) || Object.keys(request.body).some((key) => key !== "visitorId")) return void (id && sendError(response, 400, "INVALID_REQUEST", "A valid Visitor ID is required.")); await handle(response, () => service.registerExistingVisitor(request.actor!, id, visitorId), 201); });
  router.post("/events/:eventId/visitors/new", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); if (!id || !request.actor || !isRecord(request.body)) return; const input = newVisitorInput(request.body); if (!input) return void sendError(response, 400, "INVALID_REQUEST", "First and last name are required; contact fields must be text or null."); await handle(response, () => service.registerNewVisitor(request.actor!, id, input), 201); });
  router.delete("/events/:eventId/visitors/:visitorId", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); const visitorId = readUuid(request.params.visitorId); if (!id || !request.actor || !visitorId) return void (id && sendError(response, 400, "INVALID_REQUEST", "Visitor ID must be a valid UUID.")); await handle(response, () => service.removeVisitor(request.actor!, id, visitorId)); });
  return router;
}
