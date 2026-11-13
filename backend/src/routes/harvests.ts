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

const EVENT_FIELDS = new Set(["description", "eventDate", "location", "title"]);
const VISITOR_FIELDS = new Set(["email", "firstName", "lastName", "phone"]);

const handle = createRequestHandler(HarvestServiceError, {
  code: "HARVEST_SERVICE_UNAVAILABLE",
  message: "Harvest data is temporarily unavailable.",
});

function paramId(response: Response, value: unknown, label: string) {
  const id = readUuid(value);
  if (!id) sendError(response, 400, "INVALID_REQUEST", `${label} must be a valid UUID.`);
  return id;
}
function createInput(body: Record<string, unknown>): HarvestEventInput | undefined {
  if (hasUnknownFields(body, EVENT_FIELDS)) return;
  const title = readRequiredText(body.title); const eventDate = readCalendarDate(body.eventDate);
  const location = readOptionalText(body.location); const description = readOptionalText(body.description);
  return title && eventDate && location !== undefined && description !== undefined ? { description, eventDate, location, title } : undefined;
}
function updateInput(body: Record<string, unknown>): UpdateHarvestEventInput | undefined {
  if (hasUnknownFields(body, EVENT_FIELDS)) return;
  const input: UpdateHarvestEventInput = {};
  if (hasOwn(body, "title")) { const value = readRequiredText(body.title); if (!value) return; input.title = value; }
  if (hasOwn(body, "eventDate")) { const value = readCalendarDate(body.eventDate); if (!value) return; input.eventDate = value; }
  for (const field of ["location", "description"] as const) if (hasOwn(body, field)) { const value = readOptionalText(body[field]); if (value === undefined) return; input[field] = value; }
  return Object.keys(input).length ? input : undefined;
}
function newVisitorInput(body: Record<string, unknown>): NewHarvestVisitorInput | undefined {
  if (hasUnknownFields(body, VISITOR_FIELDS)) return;
  const firstName = readRequiredText(body.firstName); const lastName = readRequiredText(body.lastName);
  const phone = readOptionalText(body.phone); const email = readOptionalText(body.email);
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
    if (!request.actor || !isRecord(request.body)) return void sendError(response, 400, "INVALID_REQUEST", "A request body is required.");
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
    if (!eventId || !request.actor) return;
    if (!isRecord(request.body)) return void sendError(response, 400, "INVALID_REQUEST", "A request body is required.");
    const input = updateInput(request.body);
    if (!input) return void sendError(response, 400, "INVALID_REQUEST", "Provide only valid editable Harvest Event fields.");
    await handle(response, () => service.update(request.actor!, eventId, input));
  });
  router.post("/events/harvest/:eventId/close", authenticated, async (request, response) => {
    const eventId = paramId(response, request.params.eventId, "Event ID");
    if (!eventId || !request.actor) return;
    if (request.body !== undefined && isRecord(request.body) && Object.keys(request.body).length) return void sendError(response, 400, "INVALID_REQUEST", "Closing a Harvest Event does not accept fields.");
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
    const visitorId = isRecord(request.body) ? readUuid(request.body.visitorId) : undefined;
    if (!eventId || !request.actor || !visitorId || !isRecord(request.body) || Object.keys(request.body).some((key) => key !== "visitorId")) return void (eventId && sendError(response, 400, "INVALID_REQUEST", "A valid Visitor ID is required."));
    await handle(response, () => service.registerExistingVisitor(request.actor!, eventId, visitorId), 201);
  });
  router.post("/events/harvest/:eventId/participations/new", authenticated, async (request, response) => {
    const eventId = paramId(response, request.params.eventId, "Event ID");
    if (!eventId || !request.actor) return;
    if (!isRecord(request.body)) return void sendError(response, 400, "INVALID_REQUEST", "A request body is required.");
    const input = newVisitorInput(request.body);
    if (!input) return void sendError(response, 400, "INVALID_REQUEST", "First and last name are required; contact fields must be text or null.");
    await handle(response, () => service.registerNewVisitor(request.actor!, eventId, input), 201);
  });
  router.patch("/events/harvest/:eventId/participations/:visitorId/interest", authenticated, async (request, response) => {
    const eventId = paramId(response, request.params.eventId, "Event ID");
    if (!eventId) return;
    const visitorId = paramId(response, request.params.visitorId, "Visitor ID");
    if (!visitorId || !request.actor) return;
    if (!isRecord(request.body)) return void sendError(response, 400, "INVALID_REQUEST", "A boolean interested decision is required.");
    if (Object.keys(request.body).length !== 1 || typeof request.body.interested !== "boolean") return void sendError(response, 400, "INVALID_REQUEST", "A boolean interested decision is required.");
    await handle(response, () => service.recordInterest(request.actor!, eventId, visitorId, request.body.interested as boolean));
  });

  return router;
}
