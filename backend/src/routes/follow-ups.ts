import { Router } from "express";

import { requireAuth } from "../auth/middleware.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import {
  FOLLOW_UP_REASON_LABELS,
  FollowUpServiceError,
  type FollowUpListFilters,
  type FollowUpReason,
  type FollowUpService,
  type FollowUpStatus,
} from "../follow-ups/types.js";
import { PagedData, readPageRequest } from "../http/pagination.js";
import { createRequestHandler, sendError, sendInvalid } from "../http/responses.js";
import { hasUnknownFields, isRecord, readCalendarDate, readUuid } from "../http/validation.js";

const COMPLETE_FIELDS = new Set(["completionNote"]);
const MAX_COMPLETION_NOTE_LENGTH = 2000;

const handle = createRequestHandler(FollowUpServiceError, {
  code: "FOLLOW_UP_SERVICE_UNAVAILABLE",
  message: "Follow Up data is temporarily unavailable.",
});

function readStatus(value: unknown): FollowUpStatus | undefined {
  return value === "active" || value === "completed" ? value : undefined;
}

function readReason(value: string): FollowUpReason | undefined {
  return Object.hasOwn(FOLLOW_UP_REASON_LABELS, value) ? value as FollowUpReason : undefined;
}

type FilterResult =
  | { filters: FollowUpListFilters; ok: true }
  | { code: "FORBIDDEN" | "INVALID_REQUEST"; message: string; ok: false; status: 400 | 403 };

function invalidFilter(message: string): FilterResult {
  return { code: "INVALID_REQUEST", message, ok: false, status: 400 };
}

/**
 * Reads the optional list filters: `reason`, `lifeGroup=mine`, Admin-only
 * `lifeGroupId`, and the inclusive `from`/`to` calendar dates.
 */
function readListFilters(query: Record<string, unknown>, actor: HorizonActor): FilterResult {
  const { from, lifeGroup, lifeGroupId, reason, to } = query;
  for (const value of [from, lifeGroup, lifeGroupId, reason, to]) {
    if (value !== undefined && typeof value !== "string") {
      return invalidFilter("Each filter may be given only once, as text.");
    }
  }
  const filters: FollowUpListFilters = {};

  if (reason !== undefined) {
    const parsedReason = readReason(reason as string);
    if (!parsedReason) return invalidFilter("Reason is not a known Follow Up reason.");
    filters.reason = parsedReason;
  }

  if (lifeGroup !== undefined && lifeGroupId !== undefined) {
    return invalidFilter("Use either lifeGroup or lifeGroupId, not both.");
  }
  if (lifeGroup !== undefined) {
    if (lifeGroup !== "mine") return invalidFilter("lifeGroup must be mine.");
    filters.lifeGroup = { type: "mine" };
  }
  if (lifeGroupId !== undefined) {
    if (actor.role !== "admin") {
      return {
        code: "FORBIDDEN",
        message: "Only an Admin can filter by any Life Group.",
        ok: false,
        status: 403,
      };
    }
    const parsedId = readUuid(lifeGroupId);
    if (!parsedId) return invalidFilter("Life Group ID must be a valid UUID.");
    filters.lifeGroup = { lifeGroupId: parsedId, type: "lifeGroup" };
  }

  if (from !== undefined) {
    const fromDate = readCalendarDate(from);
    if (!fromDate) return invalidFilter("From date must be a valid YYYY-MM-DD date.");
    filters.fromDate = fromDate;
  }
  if (to !== undefined) {
    const toDate = readCalendarDate(to);
    if (!toDate) return invalidFilter("To date must be a valid YYYY-MM-DD date.");
    filters.toDate = toDate;
  }
  if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
    return invalidFilter("From date must be on or before the To date.");
  }

  return { filters, ok: true };
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
    const filterResult = readListFilters(request.query, request.actor);
    if (!filterResult.ok) {
      sendError(response, filterResult.status, filterResult.code, filterResult.message);
      return;
    }
    const { filters } = filterResult;
    response.set("Cache-Control", "private, no-store");
    const { page } = pagination;
    await handle(response, () =>
      page
        ? followUpService
            .listPage(request.actor!, status, page, filters)
            .then(({ items, meta }) => new PagedData(items, meta))
        : followUpService.list(request.actor!, status, filters),
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
