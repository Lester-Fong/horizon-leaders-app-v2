import { Router, type Response } from "express";

import { requireAuth } from "../auth/middleware.js";
import type { AuthService } from "../auth/types.js";
import {
  GatheringServiceError,
  type GatheringService,
  type UpdateGatheringInput,
} from "../gatherings/types.js";
import { PagedData, readPageRequest } from "../http/pagination.js";
import { createRequestHandler, sendError, sendInvalid } from "../http/responses.js";
import {
  hasOwn,
  hasUnknownFields,
  isRecord,
  readCalendarDate,
  readOptionalText,
  readUuid,
} from "../http/validation.js";

const GATHERING_FIELDS = new Set([
  "gatheringDate",
  "location",
  "notes",
  "title",
]);

const handleRequest = createRequestHandler(GatheringServiceError, {
  code: "GATHERING_SERVICE_UNAVAILABLE",
  message: "Gathering data is temporarily unavailable.",
});

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
      const pagination = readPageRequest(request.query);
      if (!pagination.ok) {
        sendInvalid(response, pagination.message);
        return;
      }
      const { page } = pagination;
      response.set("Cache-Control", "private, no-store");
      await handleRequest(response, () =>
        page
          ? gatheringService
              .listPage(request.actor!, ids.lifeGroupId, page)
              .then(({ directory, meta }) => new PagedData(directory, meta))
          : gatheringService.list(request.actor!, ids.lifeGroupId),
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
      if (hasUnknownFields(request.body, GATHERING_FIELDS)) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "Only date, title, location, and notes may be supplied.",
        );
        return;
      }
      const gatheringDate = readCalendarDate(request.body.gatheringDate);
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
      if (hasUnknownFields(request.body, GATHERING_FIELDS)) {
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
        const gatheringDate = readCalendarDate(request.body.gatheringDate);
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

  router.post(
    "/life-groups/:lifeGroupId/gatherings/:gatheringId/visitor-attendance",
    authenticated,
    async (request, response) => {
      const ids = readNestedIds(
        response,
        request.params.lifeGroupId,
        request.params.gatheringId,
      );
      const visitorId = isRecord(request.body)
        ? readUuid(request.body.visitorId)
        : undefined;
      if (
        !ids?.gatheringId ||
        !request.actor ||
        !visitorId ||
        !isRecord(request.body) ||
        Object.keys(request.body).some((key) => key !== "visitorId")
      ) {
        if (ids?.gatheringId && request.actor) {
          sendError(response, 400, "INVALID_REQUEST", "A valid Visitor ID is required.");
        }
        return;
      }
      await handleRequest(
        response,
        () => gatheringService.addVisitorAttendance(
          request.actor!,
          ids.lifeGroupId,
          ids.gatheringId!,
          visitorId,
        ),
        201,
      );
    },
  );

  router.delete(
    "/life-groups/:lifeGroupId/gatherings/:gatheringId/visitor-attendance/:visitorId",
    authenticated,
    async (request, response) => {
      const ids = readNestedIds(
        response,
        request.params.lifeGroupId,
        request.params.gatheringId,
      );
      const visitorId = readUuid(request.params.visitorId);
      if (!ids?.gatheringId || !visitorId || !request.actor) {
        if (ids?.gatheringId && !visitorId) {
          sendError(response, 400, "INVALID_REQUEST", "Visitor ID must be a valid UUID.");
        }
        return;
      }
      await handleRequest(response, () =>
        gatheringService.removeVisitorAttendance(
          request.actor!,
          ids.lifeGroupId,
          ids.gatheringId!,
          visitorId,
        ),
      );
    },
  );

  return router;
}
