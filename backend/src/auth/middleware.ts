import type { RequestHandler } from "express";

import { sendError } from "../http/responses.js";
import type { AppRole, AuthService } from "./types.js";

function readBearerToken(authorizationHeader: string | undefined) {
  const match = /^Bearer ([^\s]+)$/i.exec(authorizationHeader ?? "");
  return match?.[1];
}

interface RequireAuthOptions {
  /** Lets a user whose password was set by an Admin reach this route before changing it. */
  allowPendingPasswordChange?: boolean;
}

export function requireAuth(
  authService: AuthService,
  { allowPendingPasswordChange = false }: RequireAuthOptions = {},
): RequestHandler {
  return async (request, response, next) => {
    const accessToken = readBearerToken(request.get("authorization"));

    if (!accessToken) {
      sendError(
        response,
        401,
        "UNAUTHENTICATED",
        "Authentication is required.",
      );
      return;
    }

    try {
      const result = await authService.authenticate(accessToken);

      if (!result.ok) {
        sendError(response, result.status, result.code, result.message);
        return;
      }

      if (result.actor.mustChangePassword && !allowPendingPasswordChange) {
        sendError(
          response,
          403,
          "PASSWORD_CHANGE_REQUIRED",
          "Change your temporary password before continuing.",
        );
        return;
      }

      request.actor = result.actor;
      next();
    } catch {
      sendError(
        response,
        500,
        "AUTH_SERVICE_UNAVAILABLE",
        "Authentication is temporarily unavailable.",
      );
    }
  };
}

export function requireRole(...allowedRoles: AppRole[]): RequestHandler {
  return (request, response, next) => {
    if (!request.actor) {
      sendError(
        response,
        401,
        "UNAUTHENTICATED",
        "Authentication is required.",
      );
      return;
    }

    if (!allowedRoles.includes(request.actor.role)) {
      sendError(
        response,
        403,
        "FORBIDDEN",
        "You do not have permission to perform this action.",
      );
      return;
    }

    next();
  };
}
