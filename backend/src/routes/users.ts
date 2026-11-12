import { Router, type Response } from "express";

import { requireAuth, requireRole } from "../auth/middleware.js";
import type { AppRole, AuthService } from "../auth/types.js";
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from "../users/password-policy.js";
import {
  UserServiceError,
  type UpdateUserInput,
  type UserListStatus,
  type UserService,
} from "../users/types.js";

interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 120;
const MAX_SEARCH_LENGTH = 100;
const CREATE_FIELDS = new Set(["email", "name", "password", "role"]);
const UPDATE_FIELDS = new Set(["email", "name", "role"]);
const STATUSES = new Set<UserListStatus>(["active", "all", "inactive"]);

function sendError(
  response: Response<ApiErrorBody>,
  status: number,
  code: string,
  message: string,
) {
  return response.status(status).json({ error: { code, message } });
}

function sendInvalid(response: Response, message: string) {
  return sendError(response, 400, "INVALID_REQUEST", message);
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

function readName(value: unknown) {
  if (typeof value !== "string") return undefined;
  const name = value.trim();
  if (name === "" || name.length > MAX_NAME_LENGTH) return undefined;
  return name;
}

function readEmail(value: unknown) {
  if (typeof value !== "string") return undefined;
  const email = value.trim().toLowerCase();
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) return undefined;
  return email;
}

function readRole(value: unknown): AppRole | undefined {
  return value === "admin" || value === "leader" ? value : undefined;
}

function readUuid(value: unknown) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) return undefined;
  return value;
}

function sendWeakPassword(response: Response) {
  return sendError(response, 422, "WEAK_PASSWORD", PASSWORD_POLICY_MESSAGE);
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
    if (error instanceof UserServiceError) {
      sendError(response, error.status, error.code, error.message);
      return;
    }

    sendError(
      response,
      500,
      "USER_SERVICE_UNAVAILABLE",
      "User data is temporarily unavailable.",
    );
  }
}

export function createUsersRouter(
  authService: AuthService,
  userService: UserService,
) {
  const router = Router();
  const authenticated = requireAuth(authService);
  const adminOnly = [authenticated, requireRole("admin")];

  // Any signed-in user may read their own profile; the id always comes from the verified actor.
  router.get("/me/profile", authenticated, async (request, response) => {
    response.set("Cache-Control", "private, no-store");
    await handleRequest(response, () => userService.getById(request.actor!.id));
  });

  router.get("/users", ...adminOnly, async (request, response) => {
    const { search, status = "active" } = request.query;

    if (typeof status !== "string" || !STATUSES.has(status as UserListStatus)) {
      sendInvalid(response, "Status must be active, inactive, or all.");
      return;
    }

    if (
      search !== undefined &&
      (typeof search !== "string" || search.length > MAX_SEARCH_LENGTH)
    ) {
      sendInvalid(response, `Search must be text up to ${MAX_SEARCH_LENGTH} characters.`);
      return;
    }

    response.set("Cache-Control", "private, no-store");
    await handleRequest(response, () =>
      userService.list({
        search: search?.trim() || undefined,
        status: status as UserListStatus,
      }),
    );
  });

  router.get("/users/:userId", ...adminOnly, async (request, response) => {
    const userId = readUuid(request.params.userId);
    if (!userId) {
      sendInvalid(response, "User ID must be a valid UUID.");
      return;
    }

    response.set("Cache-Control", "private, no-store");
    await handleRequest(response, () => userService.getById(userId));
  });

  router.post("/users", ...adminOnly, async (request, response) => {
    if (!isRecord(request.body) || hasUnknownFields(request.body, CREATE_FIELDS)) {
      sendInvalid(response, "Provide only email, name, password, and role.");
      return;
    }

    const email = readEmail(request.body.email);
    const name = readName(request.body.name);
    const role = readRole(request.body.role);

    if (!name) {
      sendInvalid(response, `Name is required (up to ${MAX_NAME_LENGTH} characters).`);
      return;
    }
    if (!email) {
      sendInvalid(response, "A valid email address is required.");
      return;
    }
    if (!role) {
      sendInvalid(response, "Role must be admin or leader.");
      return;
    }
    if (!isStrongPassword(request.body.password)) {
      sendWeakPassword(response);
      return;
    }

    const password = request.body.password;
    await handleRequest(
      response,
      () => userService.create({ email, name, password, role }),
      201,
    );
  });

  router.patch("/users/:userId", ...adminOnly, async (request, response) => {
    const userId = readUuid(request.params.userId);

    if (!userId || !isRecord(request.body) || hasUnknownFields(request.body, UPDATE_FIELDS)) {
      sendInvalid(response, "A valid User ID and only email, name, or role are required.");
      return;
    }

    const update: UpdateUserInput = {};

    if (hasOwn(request.body, "name")) {
      const name = readName(request.body.name);
      if (!name) {
        sendInvalid(response, `Name cannot be blank (up to ${MAX_NAME_LENGTH} characters).`);
        return;
      }
      update.name = name;
    }

    if (hasOwn(request.body, "email")) {
      const email = readEmail(request.body.email);
      if (!email) {
        sendInvalid(response, "A valid email address is required.");
        return;
      }
      update.email = email;
    }

    if (hasOwn(request.body, "role")) {
      const role = readRole(request.body.role);
      if (!role) {
        sendInvalid(response, "Role must be admin or leader.");
        return;
      }
      update.role = role;
    }

    if (Object.keys(update).length === 0) {
      sendInvalid(response, "Provide an email, name, or role to update.");
      return;
    }

    await handleRequest(response, () =>
      userService.update(request.actor!, userId, update),
    );
  });

  router.patch("/users/:userId/status", ...adminOnly, async (request, response) => {
    const userId = readUuid(request.params.userId);
    const isActive = isRecord(request.body) ? request.body.isActive : undefined;

    if (!userId || typeof isActive !== "boolean") {
      sendInvalid(response, "A valid User ID and boolean isActive value are required.");
      return;
    }

    await handleRequest(response, () =>
      userService.setActive(request.actor!, userId, isActive),
    );
  });

  router.put("/users/:userId/password", ...adminOnly, async (request, response) => {
    const userId = readUuid(request.params.userId);

    if (
      !userId ||
      !isRecord(request.body) ||
      hasUnknownFields(request.body, new Set(["password"]))
    ) {
      sendInvalid(response, "A valid User ID and only a password are required.");
      return;
    }

    if (!isStrongPassword(request.body.password)) {
      sendWeakPassword(response);
      return;
    }

    const password = request.body.password;
    await handleRequest(response, () => userService.resetPassword(userId, password));
  });

  router.delete("/users/:userId", ...adminOnly, async (request, response) => {
    const userId = readUuid(request.params.userId);
    if (!userId) {
      sendInvalid(response, "User ID must be a valid UUID.");
      return;
    }

    await handleRequest(response, () => userService.delete(request.actor!, userId));
  });

  return router;
}
