import { Router } from "express";

import { requireAuth } from "../auth/middleware.js";
import type { AuthService } from "../auth/types.js";
import {
  FollowUpServiceError,
  type FollowUpService,
  type FollowUpStatus,
} from "../follow-ups/types.js";
import { PagedData, readPageRequest } from "../http/pagination.js";
import { createRequestHandler, sendError, sendInvalid } from "../http/responses.js";
import { hasUnknownFields, isRecord, readUuid } from "../http/validation.js";

const COMPLETE_FIELDS = new Set(["completionNote"]);
const MAX_COMPLETION_NOTE_LENGTH = 2000;

const handle = createRequestHandler(FollowUpServiceError, {
  code: "FOLLOW_UP_SERVICE_UNAVAILABLE",
  message: "Follow Up data is temporarily unavailable.",
});

function readStatus(value: unknown): FollowUpStatus | undefined {
  return value === "active" || value === "completed" ? value : undefined;
}

function readCompletionNote(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const note = value.trim();
  if (!note) return null;
  return note.length <= MAX_COMPLETION_NOTE_LENGTH ? note : undefined;
}

export function createFollowUpsRouter(
  authService: AuthService,
  followUpService: FollowUpService,
) {
  const router = Router();
  const authenticated = requireAuth(authService);

  router.get("/follow-ups", authenticated, async (request, response) => {
    if (!request.actor) return;
    const pagination = readPageRequest(request.query);
    if (!pagination.ok) {
      sendInvalid(response, pagination.message);
      return;
    }
    const rawStatus = request.query.status;
    if (rawStatus !== undefined && typeof rawStatus !== "string") {
      sendError(response, 400, "INVALID_REQUEST", "Status must be text.");
      return;
    }
    const status = rawStatus === undefined ? "active" : readStatus(rawStatus);
    if (!status) {
      sendError(response, 400, "INVALID_REQUEST", "Status must be active or completed.");
      return;
    }
    response.set("Cache-Control", "private, no-store");
    const { page } = pagination;
    await handle(response, () =>
      page
        ? followUpService
            .listPage(request.actor!, status, page)
            .then(({ items, meta }) => new PagedData(items, meta))
        : followUpService.list(request.actor!, status),
    );
  });

  router.patch("/follow-ups/:followUpId/complete", authenticated, async (request, response) => {
    if (!request.actor) return;
    const followUpId = readUuid(request.params.followUpId);
    if (!followUpId) {
      sendError(response, 400, "INVALID_REQUEST", "Follow Up ID must be a valid UUID.");
      return;
    }
    if (!isRecord(request.body) || hasUnknownFields(request.body, COMPLETE_FIELDS)) {
      sendError(response, 400, "INVALID_REQUEST", "Provide only an optional completion note.");
      return;
    }
    const completionNote = readCompletionNote(request.body.completionNote);
    if (completionNote === undefined) {
      sendError(response, 400, "INVALID_REQUEST", "Completion note must be at most 2000 characters.");
      return;
    }
    await handle(response, () => followUpService.complete(request.actor!, followUpId, completionNote));
  });

  return router;
}
