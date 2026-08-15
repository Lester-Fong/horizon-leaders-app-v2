import { Router, type Response } from "express";

import { requireAuth, requireRole } from "../auth/middleware.js";
import type { AuthService } from "../auth/types.js";
import {
  MinistryServiceError,
  type MinistryListStatus,
  type MinistryService,
  type UpdateMinistryInput,
} from "../ministries/types.js";

interface ApiErrorBody {
  error: { code: string; message: string };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MINISTRY_FIELDS = new Set(["description", "name"]);

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
  return Object.keys(record).some((key) => !MINISTRY_FIELDS.has(key));
}

function readRequiredName(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  return value.trim();
}

function readDescription(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

function readUuid(value: unknown) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) return undefined;
  return value;
}

function readStatus(value: unknown): MinistryListStatus | undefined {
  return value === "active" || value === "archived" || value === "all"
    ? value
    : undefined;
}

async function handleRequest(
  response: Response,
  operation: () => Promise<unknown>,
  successStatus = 200,
) {
  try {
    const data = await operation();
    response.status(successStatus).json({ data });
  } catch (error) {
    if (error instanceof MinistryServiceError) {
      sendError(response, error.status, error.code, error.message);
      return;
    }
    sendError(
      response,
      500,
      "MINISTRY_SERVICE_UNAVAILABLE",
      "Ministry data is temporarily unavailable.",
    );
  }
}

export function createMinistriesRouter(
  authService: AuthService,
  ministryService: MinistryService,
) {
  const router = Router();
  const authenticated = requireAuth(authService);
  const adminOnly = requireRole("admin");

  router.get("/ministries", authenticated, async (request, response) => {
    if (!request.actor) return;
    const searchValue = request.query.search;
    if (searchValue !== undefined && typeof searchValue !== "string") {
      sendError(response, 400, "INVALID_REQUEST", "Search must be text.");
      return;
    }
    const search = typeof searchValue === "string" ? searchValue.trim() : "";

    if (request.actor.role === "leader") {
      response.set("Cache-Control", "private, no-store");
      await handleRequest(response, () =>
        ministryService.list(request.actor!, {
          ...(search ? { search } : {}),
          status: "active",
        }),
      );
      return;
    }

    const statusValue = request.query.status;
    const status = statusValue === undefined ? "active" : readStatus(statusValue);
    if (!status) {
      sendError(
        response,
        400,
        "INVALID_REQUEST",
        "Status must be active, archived, or all.",
      );
      return;
    }

    response.set("Cache-Control", "private, no-store");
    await handleRequest(response, () =>
      ministryService.list(request.actor!, {
        ...(search ? { search } : {}),
        status,
      }),
    );
  });

  router.get(
    "/ministries/:ministryId/members",
    authenticated,
    async (request, response) => {
      const ministryId = readUuid(request.params.ministryId);
      if (!ministryId || !request.actor) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "Ministry ID must be a valid UUID.",
        );
        return;
      }
      response.set("Cache-Control", "private, no-store");
      await handleRequest(response, () =>
        ministryService.listMembers(request.actor!, ministryId),
      );
    },
  );

  router.get(
    "/ministries/:ministryId",
    authenticated,
    async (request, response) => {
      const ministryId = readUuid(request.params.ministryId);
      if (!ministryId || !request.actor) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "Ministry ID must be a valid UUID.",
        );
        return;
      }
      response.set("Cache-Control", "private, no-store");
      await handleRequest(response, () =>
        ministryService.getById(request.actor!, ministryId),
      );
    },
  );

  router.post(
    "/ministries",
    authenticated,
    adminOnly,
    async (request, response) => {
      if (!isRecord(request.body) || hasUnknownFields(request.body)) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "Provide only the approved Ministry fields.",
        );
        return;
      }
      const name = readRequiredName(request.body.name);
      const description = readDescription(request.body.description);
      if (!name || description === undefined) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "Ministry name is required and description must be text or null.",
        );
        return;
      }
      await handleRequest(
        response,
        () => ministryService.create({ description, name }),
        201,
      );
    },
  );

  router.patch(
    "/ministries/:ministryId",
    authenticated,
    adminOnly,
    async (request, response) => {
      const ministryId = readUuid(request.params.ministryId);
      if (
        !ministryId ||
        !isRecord(request.body) ||
        hasUnknownFields(request.body)
      ) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "Provide a valid Ministry ID and approved editable fields.",
        );
        return;
      }

      const update: UpdateMinistryInput = {};
      if (hasOwn(request.body, "name")) {
        const name = readRequiredName(request.body.name);
        if (!name) {
          sendError(
            response,
            400,
            "INVALID_REQUEST",
            "Ministry name cannot be blank.",
          );
          return;
        }
        update.name = name;
      }
      if (hasOwn(request.body, "description")) {
        const description = readDescription(request.body.description);
        if (description === undefined) {
          sendError(
            response,
            400,
            "INVALID_REQUEST",
            "Description must be text or null.",
          );
          return;
        }
        update.description = description;
      }
      if (Object.keys(update).length === 0) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "Provide a name or description to update.",
        );
        return;
      }
      await handleRequest(response, () => ministryService.update(ministryId, update));
    },
  );

  router.patch(
    "/ministries/:ministryId/archive",
    authenticated,
    adminOnly,
    async (request, response) => {
      const ministryId = readUuid(request.params.ministryId);
      if (!ministryId) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "Ministry ID must be a valid UUID.",
        );
        return;
      }
      await handleRequest(response, () => ministryService.archive(ministryId));
    },
  );

  router.post(
    "/ministries/:ministryId/members",
    authenticated,
    adminOnly,
    async (request, response) => {
      const ministryId = readUuid(request.params.ministryId);
      const memberId = isRecord(request.body)
        ? readUuid(request.body.memberId)
        : undefined;
      if (!ministryId || !memberId || Object.keys(request.body).length !== 1) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "Valid Ministry and Member IDs are required.",
        );
        return;
      }
      await handleRequest(
        response,
        () => ministryService.assignMember(request.actor!, ministryId, memberId),
        201,
      );
    },
  );

  router.delete(
    "/ministries/:ministryId/members/:memberId",
    authenticated,
    adminOnly,
    async (request, response) => {
      const ministryId = readUuid(request.params.ministryId);
      const memberId = readUuid(request.params.memberId);
      if (!ministryId || !memberId) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "Valid Ministry and Member IDs are required.",
        );
        return;
      }
      await handleRequest(response, () =>
        ministryService.removeMember(request.actor!, ministryId, memberId),
      );
    },
  );

  return router;
}
