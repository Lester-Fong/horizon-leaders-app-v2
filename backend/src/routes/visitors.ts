import { Router, type Response } from "express";

import { requireAuth } from "../auth/middleware.js";
import type { AuthService } from "../auth/types.js";
import {
  VisitorServiceError,
  type ListVisitorsOptions,
  type UpdateVisitorInput,
  type VisitorInput,
  type VisitorListStatus,
  type VisitorService,
} from "../visitors/types.js";

interface ApiErrorBody {
  error: { code: string; message: string };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VISITOR_FIELDS = new Set(["email", "firstName", "lastName", "phone"]);
const CONVERSION_FIELDS = new Set(["lifeGroupId"]);

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

function hasUnknownFields(record: Record<string, unknown>, allowed: Set<string>) {
  return Object.keys(record).some((key) => !allowed.has(key));
}

function readRequiredName(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalText(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

function readUuid(value: unknown) {
  return typeof value === "string" && UUID_PATTERN.test(value)
    ? value
    : undefined;
}

function readStatus(value: unknown): VisitorListStatus | undefined {
  return value === "active" || value === "converted" || value === "all"
    ? value
    : undefined;
}

function readCreateInput(body: Record<string, unknown>): VisitorInput | undefined {
  const firstName = readRequiredName(body.firstName);
  const lastName = readRequiredName(body.lastName);
  const phone = readOptionalText(body.phone);
  const email = readOptionalText(body.email);
  if (!firstName || !lastName || phone === undefined || email === undefined) {
    return undefined;
  }
  return { email, firstName, lastName, phone };
}

function readUpdateInput(body: Record<string, unknown>) {
  const update: UpdateVisitorInput = {};
  if (hasOwn(body, "firstName")) {
    const firstName = readRequiredName(body.firstName);
    if (!firstName) return undefined;
    update.firstName = firstName;
  }
  if (hasOwn(body, "lastName")) {
    const lastName = readRequiredName(body.lastName);
    if (!lastName) return undefined;
    update.lastName = lastName;
  }
  if (hasOwn(body, "phone")) {
    const phone = readOptionalText(body.phone);
    if (phone === undefined) return undefined;
    update.phone = phone;
  }
  if (hasOwn(body, "email")) {
    const email = readOptionalText(body.email);
    if (email === undefined) return undefined;
    update.email = email;
  }
  return update;
}

async function handleRequest(
  response: Response,
  operation: () => Promise<unknown>,
  successStatus = 200,
) {
  try {
    response.status(successStatus).json({ data: await operation() });
  } catch (error) {
    if (error instanceof VisitorServiceError) {
      sendError(response, error.status, error.code, error.message);
      return;
    }
    sendError(
      response,
      500,
      "VISITOR_SERVICE_UNAVAILABLE",
      "Visitor data is temporarily unavailable.",
    );
  }
}

export function createVisitorsRouter(
  authService: AuthService,
  visitorService: VisitorService,
) {
  const router = Router();
  const authenticated = requireAuth(authService);

  router.get("/visitors", authenticated, async (request, response) => {
    if (!request.actor) return;
    const searchValue = request.query.search;
    if (searchValue !== undefined && typeof searchValue !== "string") {
      sendError(response, 400, "INVALID_REQUEST", "Search must be text.");
      return;
    }
    const search = typeof searchValue === "string" ? searchValue.trim() : "";
    if (request.actor.role === "leader") {
      const options: ListVisitorsOptions = {
        ...(search ? { search } : {}),
        status: "active",
      };
      response.set("Cache-Control", "private, no-store");
      await handleRequest(response, () =>
        visitorService.list(request.actor!, options),
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
        "Status must be active, converted, or all.",
      );
      return;
    }
    const options: ListVisitorsOptions = {
      ...(search ? { search } : {}),
      status,
    };
    response.set("Cache-Control", "private, no-store");
    await handleRequest(response, () =>
      visitorService.list(request.actor!, options),
    );
  });

  router.get("/visitors/:visitorId", authenticated, async (request, response) => {
    const visitorId = readUuid(request.params.visitorId);
    if (!visitorId || !request.actor) {
      sendError(response, 400, "INVALID_REQUEST", "Visitor ID must be a valid UUID.");
      return;
    }
    response.set("Cache-Control", "private, no-store");
    await handleRequest(response, () =>
      visitorService.getById(request.actor!, visitorId),
    );
  });

  router.post("/visitors", authenticated, async (request, response) => {
    if (!isRecord(request.body) || hasUnknownFields(request.body, VISITOR_FIELDS)) {
      sendError(response, 400, "INVALID_REQUEST", "Provide only the approved Visitor fields.");
      return;
    }
    const input = readCreateInput(request.body);
    if (!input) {
      sendError(
        response,
        400,
        "INVALID_REQUEST",
        "First name and last name are required; phone and email must be text or null.",
      );
      return;
    }
    await handleRequest(response, () => visitorService.create(input), 201);
  });

  router.patch("/visitors/:visitorId", authenticated, async (request, response) => {
    const visitorId = readUuid(request.params.visitorId);
    if (
      !visitorId ||
      !request.actor ||
      !isRecord(request.body) ||
      hasUnknownFields(isRecord(request.body) ? request.body : {}, VISITOR_FIELDS)
    ) {
      sendError(
        response,
        400,
        "INVALID_REQUEST",
        "Provide a valid Visitor ID and only editable Visitor fields.",
      );
      return;
    }
    const input = readUpdateInput(request.body);
    if (!input || Object.keys(input).length === 0) {
      sendError(response, 400, "INVALID_REQUEST", "Provide Visitor details to update.");
      return;
    }
    await handleRequest(response, () =>
      visitorService.update(request.actor!, visitorId, input),
    );
  });

  router.post(
    "/visitors/:visitorId/convert",
    authenticated,
    async (request, response) => {
      const visitorId = readUuid(request.params.visitorId);
      if (
        !visitorId ||
        !request.actor ||
        !isRecord(request.body) ||
        hasUnknownFields(isRecord(request.body) ? request.body : {}, CONVERSION_FIELDS)
      ) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "A valid Visitor and Life Group are required for conversion.",
        );
        return;
      }
      const lifeGroupId = readUuid(request.body.lifeGroupId);
      if (!lifeGroupId) {
        sendError(response, 400, "INVALID_REQUEST", "Life Group ID must be a valid UUID.");
        return;
      }
      await handleRequest(
        response,
        () => visitorService.convert(request.actor!, visitorId, lifeGroupId),
        201,
      );
    },
  );

  return router;
}
