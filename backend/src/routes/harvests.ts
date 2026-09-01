import { Router, type Response } from "express";

import { requireAuth } from "../auth/middleware.js";
import type { AuthService } from "../auth/types.js";
import {
  HarvestServiceError,
  type HarvestEventInput,
  type HarvestService,
  type NewHarvestVisitorInput,
  type UpdateHarvestEventInput,
} from "../harvests/types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EVENT_FIELDS = new Set(["description", "eventDate", "location", "title"]);
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
    if (error instanceof HarvestServiceError) { sendError(response, error.status, error.code, error.message, error.details); return; }
    sendError(response, 500, "HARVEST_SERVICE_UNAVAILABLE", "Harvest data is temporarily unavailable.");
  }
}
function paramId(response: Response, value: unknown, label: string) {
  const id = uuid(value);
  if (!id) sendError(response, 400, "INVALID_REQUEST", `${label} must be a valid UUID.`);
  return id;
}
function createInput(body: Record<string, unknown>): HarvestEventInput | undefined {
  if (Object.keys(body).some((key) => !EVENT_FIELDS.has(key))) return;
  const title = requiredText(body.title); const eventDate = date(body.eventDate);
  const location = optionalText(body.location); const description = optionalText(body.description);
  return title && eventDate && location !== undefined && description !== undefined ? { description, eventDate, location, title } : undefined;
}
function updateInput(body: Record<string, unknown>): UpdateHarvestEventInput | undefined {
  if (Object.keys(body).some((key) => !EVENT_FIELDS.has(key))) return;
  const input: UpdateHarvestEventInput = {};
  if (own(body, "title")) { const value = requiredText(body.title); if (!value) return; input.title = value; }
  if (own(body, "eventDate")) { const value = date(body.eventDate); if (!value) return; input.eventDate = value; }
  for (const field of ["location", "description"] as const) if (own(body, field)) { const value = optionalText(body[field]); if (value === undefined) return; input[field] = value; }
  return Object.keys(input).length ? input : undefined;
}
function newVisitorInput(body: Record<string, unknown>): NewHarvestVisitorInput | undefined {
  if (Object.keys(body).some((key) => !VISITOR_FIELDS.has(key))) return;
  const firstName = requiredText(body.firstName); const lastName = requiredText(body.lastName);
  const phone = optionalText(body.phone); const email = optionalText(body.email);
  return firstName && lastName && phone !== undefined && email !== undefined ? { email, firstName, lastName, phone } : undefined;
}

export function createHarvestsRouter(authService: AuthService, service: HarvestService) {
  const router = Router(); const authenticated = requireAuth(authService);

  router.get("/events/harvest", authenticated, async (request, response) => {
    if (!request.actor) return;
    response.set("Cache-Control", "private, no-store");
    await handle(response, () => service.list(request.actor!));
  });
  router.post("/events/harvest", authenticated, async (request, response) => {
    if (!request.actor || !record(request.body)) return void sendError(response, 400, "INVALID_REQUEST", "A request body is required.");
    const input = createInput(request.body);
    if (!input) return void sendError(response, 400, "INVALID_REQUEST", "Provide the approved Harvest title, date, location, and description fields.");
    await handle(response, () => service.create(request.actor!, input), 201);
  });
  router.get("/events/harvest/:eventId", authenticated, async (request, response) => {
    const eventId = paramId(response, request.params.eventId, "Event ID");
    if (!eventId || !request.actor) return;
    response.set("Cache-Control", "private, no-store");
    await handle(response, () => service.getById(request.actor!, eventId));
  });
  router.patch("/events/harvest/:eventId", authenticated, async (request, response) => {
    const eventId = paramId(response, request.params.eventId, "Event ID");
    if (!eventId || !request.actor || !record(request.body)) return;
    const input = updateInput(request.body);
    if (!input) return void sendError(response, 400, "INVALID_REQUEST", "Provide only valid editable Harvest Event fields.");
    await handle(response, () => service.update(request.actor!, eventId, input));
  });
  router.post("/events/harvest/:eventId/close", authenticated, async (request, response) => {
    const eventId = paramId(response, request.params.eventId, "Event ID");
    if (!eventId || !request.actor) return;
    if (request.body !== undefined && record(request.body) && Object.keys(request.body).length) return void sendError(response, 400, "INVALID_REQUEST", "Closing a Harvest Event does not accept fields.");
    await handle(response, () => service.close(request.actor!, eventId));
  });
  router.get("/events/harvest/:eventId/participations", authenticated, async (request, response) => {
    const eventId = paramId(response, request.params.eventId, "Event ID");
    if (!eventId || !request.actor) return;
    response.set("Cache-Control", "private, no-store");
    await handle(response, () => service.listParticipations(request.actor!, eventId));
  });
  router.post("/events/harvest/:eventId/participations", authenticated, async (request, response) => {
    const eventId = paramId(response, request.params.eventId, "Event ID");
    const visitorId = record(request.body) ? uuid(request.body.visitorId) : undefined;
    if (!eventId || !request.actor || !visitorId || !record(request.body) || Object.keys(request.body).some((key) => key !== "visitorId")) return void (eventId && sendError(response, 400, "INVALID_REQUEST", "A valid Visitor ID is required."));
    await handle(response, () => service.registerExistingVisitor(request.actor!, eventId, visitorId), 201);
  });
  router.post("/events/harvest/:eventId/participations/new", authenticated, async (request, response) => {
    const eventId = paramId(response, request.params.eventId, "Event ID");
    if (!eventId || !request.actor || !record(request.body)) return;
    const input = newVisitorInput(request.body);
    if (!input) return void sendError(response, 400, "INVALID_REQUEST", "First and last name are required; contact fields must be text or null.");
    await handle(response, () => service.registerNewVisitor(request.actor!, eventId, input), 201);
  });
  router.patch("/events/harvest/:eventId/participations/:visitorId/interest", authenticated, async (request, response) => {
    const eventId = paramId(response, request.params.eventId, "Event ID");
    const visitorId = paramId(response, request.params.visitorId, "Visitor ID");
    if (!eventId || !visitorId || !request.actor || !record(request.body)) return;
    if (Object.keys(request.body).length !== 1 || typeof request.body.interested !== "boolean") return void sendError(response, 400, "INVALID_REQUEST", "A boolean interested decision is required.");
    await handle(response, () => service.recordInterest(request.actor!, eventId, visitorId, request.body.interested as boolean));
  });

  return router;
}
