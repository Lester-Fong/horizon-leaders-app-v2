import { Router, type Response } from "express";

import { requireAuth } from "../auth/middleware.js";
import type { AuthService } from "../auth/types.js";
import {
  GatheringServiceError,
  type GatheringService,
  type UpdateGatheringInput,
} from "../gatherings/types.js";

interface ApiErrorBody {
  error: { code: string; message: string };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const GATHERING_FIELDS = new Set([
  "gatheringDate",
  "location",
  "notes",
  "title",
]);

function sendError(
  response: Response<ApiErrorBody>,
  status: number,
  code: string,
  message: string,
) {
  return response.status(status).json({ error: { code, message } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function hasUnknownFields(record: Record<string, unknown>) {
  return Object.keys(record).some((key) => !GATHERING_FIELDS.has(key));
}

function readUuid(value: unknown) {
  return typeof value === "string" && UUID_PATTERN.test(value)
    ? value
    : undefined;
}

function readDate(value: unknown) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
    ? value
    : undefined;
}

function readOptionalText(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

async function handleRequest(
  response: Response,
  operation: () => Promise<unknown>,
  successStatus = 200,
) {
  try {
    response.status(successStatus).json({ data: await operation() });
  } catch (error) {
    if (error instanceof GatheringServiceError) {
      sendError(response, error.status, error.code, error.message);
      return;
    }
    sendError(
      response,
      500,
      "GATHERING_SERVICE_UNAVAILABLE",
      "Gathering data is temporarily unavailable.",
    );
  }
}

function readNestedIds(
  response: Response,
  lifeGroupValue: unknown,
  gatheringValue?: unknown,
) {
  const lifeGroupId = readUuid(lifeGroupValue);
  const gatheringId =
    gatheringValue === undefined ? undefined : readUuid(gatheringValue);
  if (!lifeGroupId || (gatheringValue !== undefined && !gatheringId)) {
    sendError(
      response,
      400,
      "INVALID_REQUEST",
      "Life Group and Gathering IDs must be valid UUIDs.",
    );
    return undefined;
  }
  return { gatheringId, lifeGroupId };
}

export function createGatheringsRouter(
  authService: AuthService,
  gatheringService: GatheringService,
) {
  const router = Router();
  const authenticated = requireAuth(authService);

  router.get(
    "/life-groups/:lifeGroupId/gatherings",
    authenticated,
    async (request, response) => {
      const ids = readNestedIds(response, request.params.lifeGroupId);
      if (!ids || !request.actor) return;
      response.set("Cache-Control", "private, no-store");
      await handleRequest(response, () =>
        gatheringService.list(request.actor!, ids.lifeGroupId),
      );
    },
  );

  router.post(
    "/life-groups/:lifeGroupId/gatherings",
    authenticated,
    async (request, response) => {
      const ids = readNestedIds(response, request.params.lifeGroupId);
      if (!ids || !request.actor || !isRecord(request.body)) {
        if (ids && !isRecord(request.body)) {
          sendError(response, 400, "INVALID_REQUEST", "A request body is required.");
        }
        return;
      }
      if (hasUnknownFields(request.body)) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "Only date, title, location, and notes may be supplied.",
        );
        return;
      }
      const gatheringDate = readDate(request.body.gatheringDate);
      const title = readOptionalText(request.body.title);
      const location = readOptionalText(request.body.location);
      const notes = readOptionalText(request.body.notes);
      if (!gatheringDate) {
        sendError(response, 400, "INVALID_REQUEST", "A valid Gathering date is required.");
        return;
      }
      if (title === undefined || location === undefined || notes === undefined) {
        sendError(response, 400, "INVALID_REQUEST", "Optional Gathering fields must be text or null.");
        return;
      }
      await handleRequest(
        response,
        () =>
          gatheringService.create(request.actor!, ids.lifeGroupId, {
            gatheringDate,
            location,
            notes,
            title,
          }),
        201,
      );
    },
  );

  router.get(
    "/life-groups/:lifeGroupId/gatherings/:gatheringId",
    authenticated,
    async (request, response) => {
      const ids = readNestedIds(
        response,
        request.params.lifeGroupId,
        request.params.gatheringId,
      );
      if (!ids?.gatheringId || !request.actor) return;
      response.set("Cache-Control", "private, no-store");
      await handleRequest(response, () =>
        gatheringService.getById(
          request.actor!,
          ids.lifeGroupId,
          ids.gatheringId!,
        ),
      );
    },
  );

  router.patch(
    "/life-groups/:lifeGroupId/gatherings/:gatheringId",
    authenticated,
    async (request, response) => {
      const ids = readNestedIds(
        response,
        request.params.lifeGroupId,
        request.params.gatheringId,
      );
      if (!ids?.gatheringId || !request.actor || !isRecord(request.body)) {
        if (ids?.gatheringId && !isRecord(request.body)) {
          sendError(response, 400, "INVALID_REQUEST", "A request body is required.");
        }
        return;
      }
      if (hasUnknownFields(request.body)) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "Gathering Life Group and creator cannot be changed.",
        );
        return;
      }
      const update: UpdateGatheringInput = {};
      if (hasOwn(request.body, "gatheringDate")) {
        const gatheringDate = readDate(request.body.gatheringDate);
        if (!gatheringDate) {
          sendError(response, 400, "INVALID_REQUEST", "Gathering date must be valid.");
          return;
        }
        update.gatheringDate = gatheringDate;
      }
      for (const field of ["title", "location", "notes"] as const) {
        if (hasOwn(request.body, field)) {
          const value = readOptionalText(request.body[field]);
          if (value === undefined) {
            sendError(response, 400, "INVALID_REQUEST", `${field} must be text or null.`);
            return;
          }
          update[field] = value;
        }
      }
      if (Object.keys(update).length === 0) {
        sendError(response, 400, "INVALID_REQUEST", "Provide Gathering details to update.");
        return;
      }
      await handleRequest(response, () =>
        gatheringService.update(
          request.actor!,
          ids.lifeGroupId,
          ids.gatheringId!,
          update,
        ),
      );
    },
  );

  router.get(
    "/life-groups/:lifeGroupId/gatherings/:gatheringId/attendance",
    authenticated,
    async (request, response) => {
      const ids = readNestedIds(
        response,
        request.params.lifeGroupId,
        request.params.gatheringId,
      );
      if (!ids?.gatheringId || !request.actor) return;
      response.set("Cache-Control", "private, no-store");
      await handleRequest(response, () =>
        gatheringService.getAttendance(
          request.actor!,
          ids.lifeGroupId,
          ids.gatheringId!,
        ),
      );
    },
  );

  router.post(
    "/life-groups/:lifeGroupId/gatherings/:gatheringId/attendance",
    authenticated,
    async (request, response) => {
      const ids = readNestedIds(
        response,
        request.params.lifeGroupId,
        request.params.gatheringId,
      );
      const memberId = isRecord(request.body)
        ? readUuid(request.body.memberId)
        : undefined;
      if (
        !ids?.gatheringId ||
        !request.actor ||
        !memberId ||
        !isRecord(request.body) ||
        Object.keys(request.body).some((key) => key !== "memberId")
      ) {
        if (ids?.gatheringId && request.actor) {
          sendError(response, 400, "INVALID_REQUEST", "A valid Member ID is required.");
        }
        return;
      }
      await handleRequest(
        response,
        () =>
          gatheringService.addAttendance(
            request.actor!,
            ids.lifeGroupId,
            ids.gatheringId!,
            memberId,
          ),
        201,
      );
    },
  );

  router.delete(
    "/life-groups/:lifeGroupId/gatherings/:gatheringId/attendance/:memberId",
    authenticated,
    async (request, response) => {
      const ids = readNestedIds(
        response,
        request.params.lifeGroupId,
        request.params.gatheringId,
      );
      const memberId = readUuid(request.params.memberId);
      if (!ids?.gatheringId || !memberId || !request.actor) {
        if (ids?.gatheringId && !memberId) {
          sendError(response, 400, "INVALID_REQUEST", "Member ID must be a valid UUID.");
        }
        return;
      }
      await handleRequest(response, () =>
        gatheringService.removeAttendance(
          request.actor!,
          ids.lifeGroupId,
          ids.gatheringId!,
          memberId,
        ),
      );
    },
  );

  return router;
}
