import { Router, type Response } from "express";

import { requireAuth, requireRole } from "../auth/middleware.js";
import type { AuthService } from "../auth/types.js";
import {
  LifeGroupServiceError,
  type LifeGroupService,
  type UpdateLifeGroupInput,
} from "../life-groups/types.js";

interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

async function handleRequest(
  response: Response,
  operation: () => Promise<unknown>,
  successStatus = 200,
) {
  try {
    const data = await operation();
    response.status(successStatus).json({ data });
  } catch (error) {
    if (error instanceof LifeGroupServiceError) {
      sendError(response, error.status, error.code, error.message);
      return;
    }

    sendError(
      response,
      500,
      "LIFE_GROUP_SERVICE_UNAVAILABLE",
      "Life Group data is temporarily unavailable.",
    );
  }
}

export function createLifeGroupsRouter(
  authService: AuthService,
  lifeGroupService: LifeGroupService,
) {
  const router = Router();
  const authenticated = requireAuth(authService);
  const adminOnly = requireRole("admin");

  router.get("/life-groups", authenticated, async (request, response) => {
    response.set("Cache-Control", "private, no-store");
    await handleRequest(response, () =>
      lifeGroupService.list({
        includeInactive: request.actor?.role === "admin",
      }),
    );
  });

  router.get(
    "/life-groups/leaders",
    authenticated,
    adminOnly,
    async (_request, response) => {
      response.set("Cache-Control", "private, no-store");
      await handleRequest(response, () => lifeGroupService.listLeaderOptions());
    },
  );

  router.get(
    "/life-groups/:lifeGroupId",
    authenticated,
    async (request, response) => {
      const lifeGroupId = readUuid(request.params.lifeGroupId);

      if (!lifeGroupId) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "Life Group ID must be a valid UUID.",
        );
        return;
      }

      response.set("Cache-Control", "private, no-store");
      await handleRequest(response, async () => {
        const lifeGroup = await lifeGroupService.getById(lifeGroupId);

        if (request.actor?.role === "leader" && !lifeGroup.isActive) {
          throw new LifeGroupServiceError(
            404,
            "LIFE_GROUP_NOT_FOUND",
            "Life Group was not found.",
          );
        }

        return lifeGroup;
      });
    },
  );

  router.post(
    "/life-groups",
    authenticated,
    adminOnly,
    async (request, response) => {
      if (!isRecord(request.body)) {
        sendError(response, 400, "INVALID_REQUEST", "A request body is required.");
        return;
      }

      const name = readRequiredName(request.body.name);
      const description = readDescription(request.body.description);
      const leaderProfileId = readUuid(request.body.leaderProfileId);

      if (!name) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "Life Group name is required.",
        );
        return;
      }

      if (description === undefined) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "Description must be text or null.",
        );
        return;
      }

      if (!leaderProfileId) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "A valid Leader Profile ID is required.",
        );
        return;
      }

      await handleRequest(
        response,
        () => lifeGroupService.create({ description, leaderProfileId, name }),
        201,
      );
    },
  );

  router.patch(
    "/life-groups/:lifeGroupId",
    authenticated,
    adminOnly,
    async (request, response) => {
      const lifeGroupId = readUuid(request.params.lifeGroupId);

      if (!lifeGroupId || !isRecord(request.body)) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "A valid Life Group ID and request body are required.",
        );
        return;
      }

      const update: UpdateLifeGroupInput = {};

      if (hasOwn(request.body, "name")) {
        const name = readRequiredName(request.body.name);
        if (!name) {
          sendError(
            response,
            400,
            "INVALID_REQUEST",
            "Life Group name cannot be blank.",
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

      if (hasOwn(request.body, "leaderProfileId")) {
        const leaderProfileId = readUuid(request.body.leaderProfileId);
        if (!leaderProfileId) {
          sendError(
            response,
            400,
            "INVALID_REQUEST",
            "Leader Profile ID must be a valid UUID.",
          );
          return;
        }
        update.leaderProfileId = leaderProfileId;
      }

      if (Object.keys(update).length === 0) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "Provide a name, description, or Leader assignment to update.",
        );
        return;
      }

      await handleRequest(response, () =>
        lifeGroupService.update(lifeGroupId, update),
      );
    },
  );

  router.patch(
    "/life-groups/:lifeGroupId/status",
    authenticated,
    adminOnly,
    async (request, response) => {
      const lifeGroupId = readUuid(request.params.lifeGroupId);
      const isActive = isRecord(request.body) ? request.body.isActive : undefined;

      if (!lifeGroupId || typeof isActive !== "boolean") {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "A valid Life Group ID and boolean isActive value are required.",
        );
        return;
      }

      await handleRequest(response, () =>
        lifeGroupService.setActive(lifeGroupId, isActive),
      );
    },
  );

  return router;
}
