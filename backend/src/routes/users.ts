import { Router, type Response } from "express";

import { requireAuth, requireRole } from "../auth/middleware.js";
import type { AppRole, AuthService } from "../auth/types.js";
import {
  OWN_PASSWORD_CHANGE_RATE_LIMIT_MAX,
  OWN_PASSWORD_CHANGE_RATE_LIMIT_WINDOW_MS,
  USER_MUTATION_RATE_LIMIT_MAX,
  USER_MUTATION_RATE_LIMIT_WINDOW_MS,
} from "../config/constants.js";
import { PagedData, pageFromArray, readPageRequest } from "../http/pagination.js";
import { createRequestHandler, sendError, sendInvalid } from "../http/responses.js";
import {
  hasOwn,
  hasUnknownFields,
  isRecord,
  readUuid,
} from "../http/validation.js";
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from "../users/password-policy.js";
import { createActorRateLimit } from "../users/rate-limit.js";
import {
  DELETED_EMAIL_DOMAIN,
  UserServiceError,
  type UpdateUserInput,
  type UserListStatus,
  type UserService,
} from "../users/types.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 120;
const MAX_SEARCH_LENGTH = 100;
const CREATE_FIELDS = new Set(["email", "name", "password", "role"]);
const UPDATE_FIELDS = new Set(["email", "name", "role"]);
/** Audit log rows returned when the client does not send a limit. */
const AUDIT_LOG_DEFAULT_PAGE_SIZE = 50;
const STATUSES = new Set<UserListStatus>(["active", "all", "deleted", "inactive"]);

const handleRequest = createRequestHandler(UserServiceError, {
  code: "USER_SERVICE_UNAVAILABLE",
  message: "User data is temporarily unavailable.",
});

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

/** Deleted users keep a placeholder sign-in email on this reserved domain. */
function isReservedEmail(email: string) {
  return email.endsWith(`@${DELETED_EMAIL_DOMAIN}`);
}

function sendReservedEmail(response: Response) {
  return sendError(
    response,
    422,
    "EMAIL_NOT_ALLOWED",
    "This email address is reserved. Use the person's real email address.",
  );
}

function readRole(value: unknown): AppRole | undefined {
  return value === "admin" || value === "leader" ? value : undefined;
}

function sendWeakPassword(response: Response) {
  return sendError(response, 422, "WEAK_PASSWORD", PASSWORD_POLICY_MESSAGE);
}

export function createUsersRouter(
  authService: AuthService,
  userService: UserService,
) {
  const router = Router();
  const authenticated = requireAuth(authService);
  const pendingPasswordAllowed = requireAuth(authService, { allowPendingPasswordChange: true });
  const adminOnly = [authenticated, requireRole("admin")];
  const adminMutation = [
    ...adminOnly,
    createActorRateLimit({
      max: USER_MUTATION_RATE_LIMIT_MAX,
      windowMs: USER_MUTATION_RATE_LIMIT_WINDOW_MS,
    }),
  ];
  const ownPasswordLimit = createActorRateLimit({
    max: OWN_PASSWORD_CHANGE_RATE_LIMIT_MAX,
    windowMs: OWN_PASSWORD_CHANGE_RATE_LIMIT_WINDOW_MS,
  });

  // Any signed-in user may read their own profile; the id always comes from the verified actor.
  router.get("/me/profile", pendingPasswordAllowed, async (request, response) => {
    response.set("Cache-Control", "private, no-store");
    await handleRequest(response, () => userService.getById(request.actor!.id));
  });

  // Any signed-in user may change their own password, including a required first change.
  router.put(
    "/me/password",
    pendingPasswordAllowed,
    ownPasswordLimit,
    async (request, response) => {
      if (
        !isRecord(request.body) ||
        hasUnknownFields(request.body, new Set(["currentPassword", "newPassword"])) ||
        typeof request.body.currentPassword !== "string" ||
        request.body.currentPassword === ""
      ) {
        sendInvalid(response, "Provide only your current password and a new password.");
        return;
      }

      if (!isStrongPassword(request.body.newPassword)) {
        sendWeakPassword(response);
        return;
      }

      const { currentPassword, newPassword } = request.body;
      await handleRequest(response, () =>
        userService.changeOwnPassword(request.actor!, currentPassword, newPassword),
      );
    },
  );

  router.get("/users", ...adminOnly, async (request, response) => {
    const { search, status = "active" } = request.query;
    const pagination = readPageRequest(request.query);
    if (!pagination.ok) {
      sendInvalid(response, pagination.message);
      return;
    }

    if (typeof status !== "string" || !STATUSES.has(status as UserListStatus)) {
      sendInvalid(response, "Status must be active, inactive, all, or deleted.");
      return;
    }

    if (
      search !== undefined &&
      (typeof search !== "string" || search.length > MAX_SEARCH_LENGTH)
    ) {
      sendInvalid(response, `Search must be text up to ${MAX_SEARCH_LENGTH} characters.`);
      return;
    }

    const { page } = pagination;
    response.set("Cache-Control", "private, no-store");
    // Search matches Auth emails in memory, so the filtered list is paged in memory.
    // Staff accounts are few, which keeps this cheap.
    await handleRequest(response, async () => {
      const users = await userService.list({
        search: search?.trim() || undefined,
        status: status as UserListStatus,
      });
      if (!page) return users;
      const { items, meta } = pageFromArray(users, page);
      return new PagedData(items, meta);
    });
  });

  // Registered before /users/:userId so "audit-events" is never read as a User ID.
  router.get("/users/audit-events", ...adminOnly, async (request, response) => {
    const pagination = readPageRequest(request.query);
    if (!pagination.ok) {
      sendInvalid(response, pagination.message);
      return;
    }

    const page = pagination.page ?? { limit: AUDIT_LOG_DEFAULT_PAGE_SIZE, offset: 0 };
    response.set("Cache-Control", "private, no-store");
    await handleRequest(response, async () => {
      const { items, meta } = await userService.listAuditPage(page);
      return new PagedData(items, meta);
    });
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

  router.get("/users/:userId/activity", ...adminOnly, async (request, response) => {
    const userId = readUuid(request.params.userId);
    if (!userId) {
      sendInvalid(response, "User ID must be a valid UUID.");
      return;
    }

    response.set("Cache-Control", "private, no-store");
    await handleRequest(response, () => userService.listActivity(userId));
  });

  router.post("/users", ...adminMutation, async (request, response) => {
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
    if (isReservedEmail(email)) {
      sendReservedEmail(response);
      return;
    }
    if (!isStrongPassword(request.body.password)) {
      sendWeakPassword(response);
      return;
    }

    const password = request.body.password;
    await handleRequest(
      response,
      () => userService.create(request.actor!, { email, name, password, role }),
      201,
    );
  });

  router.patch("/users/:userId", ...adminMutation, async (request, response) => {
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
      if (isReservedEmail(email)) {
        sendReservedEmail(response);
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

  router.patch("/users/:userId/status", ...adminMutation, async (request, response) => {
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

  router.put("/users/:userId/password", ...adminMutation, async (request, response) => {
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
    await handleRequest(response, () => userService.resetPassword(request.actor!, userId, password));
  });

  router.delete("/users/:userId", ...adminMutation, async (request, response) => {
    const userId = readUuid(request.params.userId);
    if (!userId) {
      sendInvalid(response, "User ID must be a valid UUID.");
      return;
    }

    await handleRequest(response, () => userService.delete(request.actor!, userId));
  });

  return router;
}
