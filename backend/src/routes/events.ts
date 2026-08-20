import { Router, type Response } from "express";

import { requireAuth } from "../auth/middleware.js";
import type { AuthService } from "../auth/types.js";
import { EventServiceError, type EventService, type NewSundayVisitorInput, type SundayServiceInput, type UpdateSundayServiceInput } from "../events/types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EVENT_FIELDS = new Set(["countsForAbsence", "description", "eventDate", "location", "title"]);
const VISITOR_FIELDS = new Set(["email", "firstName", "lastName", "phone"]);
type ErrorBody = { error: { code: string; details?: unknown; message: string } };

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function own(value: Record<string, unknown>, key: string) { return Object.prototype.hasOwnProperty.call(value, key); }
function uuid(value: unknown) { return typeof value === "string" && UUID.test(value) ? value : undefined; }
function date(value: unknown) {
  if (typeof value !== "string" || !DATE.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month! - 1 && parsed.getUTCDate() === day ? value : undefined;
}
function requiredText(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function optionalText(value: unknown) { if (value === null || value === undefined) return null; return typeof value === "string" ? value.trim() || null : undefined; }
function sendError(response: Response<ErrorBody>, status: number, code: string, message: string, details?: unknown) {
  return response.status(status).json({ error: { code, ...(details === undefined ? {} : { details }), message } });
}
async function handle(response: Response, operation: () => Promise<unknown>, status = 200) {
  try { response.status(status).json({ data: await operation() }); }
  catch (error) {
    if (error instanceof EventServiceError) { sendError(response, error.status, error.code, error.message, error.details); return; }
    sendError(response, 500, "EVENT_SERVICE_UNAVAILABLE", "Sunday Service data is temporarily unavailable.");
  }
}
function eventId(response: Response, value: unknown) {
  const id = uuid(value);
  if (!id) sendError(response, 400, "INVALID_REQUEST", "Event ID must be a valid UUID.");
  return id;
}
function createInput(body: Record<string, unknown>): SundayServiceInput | undefined {
  if (Object.keys(body).some((key) => !EVENT_FIELDS.has(key))) return undefined;
  const title = requiredText(body.title); const eventDate = date(body.eventDate);
  const location = optionalText(body.location); const description = optionalText(body.description);
  if (!title || !eventDate || location === undefined || description === undefined || typeof body.countsForAbsence !== "boolean") return undefined;
  return { countsForAbsence: body.countsForAbsence, description, eventDate, location, title };
}
function updateInput(body: Record<string, unknown>): UpdateSundayServiceInput | undefined {
  if (Object.keys(body).some((key) => !EVENT_FIELDS.has(key))) return undefined;
  const input: UpdateSundayServiceInput = {};
  if (own(body, "title")) { const value = requiredText(body.title); if (!value) return; input.title = value; }
  if (own(body, "eventDate")) { const value = date(body.eventDate); if (!value) return; input.eventDate = value; }
  for (const field of ["location", "description"] as const) if (own(body, field)) { const value = optionalText(body[field]); if (value === undefined) return; input[field] = value; }
  if (own(body, "countsForAbsence")) { if (typeof body.countsForAbsence !== "boolean") return; input.countsForAbsence = body.countsForAbsence; }
  return Object.keys(input).length ? input : undefined;
}
function newVisitorInput(body: Record<string, unknown>): NewSundayVisitorInput | undefined {
  if (Object.keys(body).some((key) => !VISITOR_FIELDS.has(key))) return;
  const firstName = requiredText(body.firstName); const lastName = requiredText(body.lastName);
  const phone = optionalText(body.phone); const email = optionalText(body.email);
  return firstName && lastName && phone !== undefined && email !== undefined ? { email, firstName, lastName, phone } : undefined;
}

export function createEventsRouter(authService: AuthService, service: EventService) {
  const router = Router(); const authenticated = requireAuth(authService);
  router.get("/events", authenticated, async (request, response) => { if (!request.actor) return; response.set("Cache-Control", "private, no-store"); await handle(response, () => service.list(request.actor!)); });
  router.post("/events", authenticated, async (request, response) => {
    if (!request.actor || !record(request.body)) return void sendError(response, 400, "INVALID_REQUEST", "A request body is required.");
    const input = createInput(request.body); if (!input) return void sendError(response, 400, "INVALID_REQUEST", "Provide the approved title, date, location, description, and counting fields.");
    await handle(response, () => service.create(request.actor!, input), 201);
  });
  router.get("/events/:eventId", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); if (!id || !request.actor) return; response.set("Cache-Control", "private, no-store"); await handle(response, () => service.getById(request.actor!, id)); });
  router.patch("/events/:eventId", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); if (!id || !request.actor || !record(request.body)) return; const input = updateInput(request.body); if (!input) return void sendError(response, 400, "INVALID_REQUEST", "Provide only valid editable Service fields."); await handle(response, () => service.update(request.actor!, id, input)); });
  router.post("/events/:eventId/close", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); if (!id || !request.actor) return; if (request.body !== undefined && record(request.body) && Object.keys(request.body).length) return void sendError(response, 400, "INVALID_REQUEST", "Closing a Service does not accept fields."); await handle(response, () => service.close(request.actor!, id)); });
  router.get("/events/:eventId/attendance", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); if (!id || !request.actor) return; response.set("Cache-Control", "private, no-store"); await handle(response, () => service.getAttendance(request.actor!, id)); });
  router.post("/events/:eventId/attendance", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); const memberId = record(request.body) ? uuid(request.body.memberId) : undefined; if (!id || !request.actor || !memberId || !record(request.body) || Object.keys(request.body).some((key) => key !== "memberId")) return void (id && sendError(response, 400, "INVALID_REQUEST", "A valid Member ID is required.")); await handle(response, () => service.addAttendance(request.actor!, id, memberId), 201); });
  router.post("/events/:eventId/attendance/qr", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); const qrToken = record(request.body) ? requiredText(request.body.qrToken) : undefined; if (!id || !request.actor || !qrToken || !record(request.body) || Object.keys(request.body).some((key) => key !== "qrToken")) return void (id && sendError(response, 400, "INVALID_REQUEST", "A QR token is required.")); await handle(response, () => service.addAttendanceByQr(request.actor!, id, qrToken), 201); });
  router.delete("/events/:eventId/attendance/:memberId", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); const memberId = uuid(request.params.memberId); if (!id || !request.actor || !memberId) return void (id && sendError(response, 400, "INVALID_REQUEST", "Member ID must be a valid UUID.")); await handle(response, () => service.removeAttendance(request.actor!, id, memberId)); });
  router.get("/events/:eventId/visitors", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); if (!id || !request.actor) return; response.set("Cache-Control", "private, no-store"); await handle(response, () => service.listVisitors(request.actor!, id)); });
  router.post("/events/:eventId/visitors", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); const visitorId = record(request.body) ? uuid(request.body.visitorId) : undefined; if (!id || !request.actor || !visitorId || !record(request.body) || Object.keys(request.body).some((key) => key !== "visitorId")) return void (id && sendError(response, 400, "INVALID_REQUEST", "A valid Visitor ID is required.")); await handle(response, () => service.registerExistingVisitor(request.actor!, id, visitorId), 201); });
  router.post("/events/:eventId/visitors/new", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); if (!id || !request.actor || !record(request.body)) return; const input = newVisitorInput(request.body); if (!input) return void sendError(response, 400, "INVALID_REQUEST", "First and last name are required; contact fields must be text or null."); await handle(response, () => service.registerNewVisitor(request.actor!, id, input), 201); });
  router.delete("/events/:eventId/visitors/:visitorId", authenticated, async (request, response) => { const id = eventId(response, request.params.eventId); const visitorId = uuid(request.params.visitorId); if (!id || !request.actor || !visitorId) return void (id && sendError(response, 400, "INVALID_REQUEST", "Visitor ID must be a valid UUID.")); await handle(response, () => service.removeVisitor(request.actor!, id, visitorId)); });
  return router;
}
