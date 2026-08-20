import { Router, type Response } from "express";

import { requireAuth } from "../auth/middleware.js";
import type { AuthService } from "../auth/types.js";
import {
  FollowUpServiceError,
  type FollowUpService,
  type FollowUpStatus,
} from "../follow-ups/types.js";

type ErrorBody = { error: { code: string; message: string } };
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COMPLETE_FIELDS = new Set(["completionNote"]);
const MAX_COMPLETION_NOTE_LENGTH = 2000;

function sendError(
  response: Response<ErrorBody>,
  status: number,
  code: string,
  message: string,
) {
  return response.status(status).json({ error: { code, message } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

async function handle(
  response: Response,
  operation: () => Promise<unknown>,
) {
  try {
    response.json({ data: await operation() });
  } catch (error) {
    if (error instanceof FollowUpServiceError) {
      sendError(response, error.status, error.code, error.message);
      return;
    }
    sendError(
      response,
      500,
      "FOLLOW_UP_SERVICE_UNAVAILABLE",
      "Follow Up data is temporarily unavailable.",
    );
  }
}

export function createFollowUpsRouter(
  authService: AuthService,
  followUpService: FollowUpService,
) {
  const router = Router();
  const authenticated = requireAuth(authService);

  router.get("/follow-ups", authenticated, async (request, response) => {
    if (!request.actor) return;
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
    await handle(response, () => followUpService.list(request.actor!, status));
  });

  router.patch("/follow-ups/:followUpId/complete", authenticated, async (request, response) => {
    if (!request.actor) return;
    const followUpId = request.params.followUpId;
    if (typeof followUpId !== "string" || !UUID_PATTERN.test(followUpId)) {
      sendError(response, 400, "INVALID_REQUEST", "Follow Up ID must be a valid UUID.");
      return;
    }
    if (!isRecord(request.body) || Object.keys(request.body).some((key) => !COMPLETE_FIELDS.has(key))) {
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
