import type { RequestHandler, Response } from "express";

import type { AppRole, AuthService } from "./types.js";

interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

function sendError(
  response: Response<ApiErrorBody>,
  status: number,
  code: string,
  message: string,
) {
  return response.status(status).json({ error: { code, message } });
}

function readBearerToken(authorizationHeader: string | undefined) {
  const match = /^Bearer ([^\s]+)$/i.exec(authorizationHeader ?? "");
  return match?.[1];
}

export function requireAuth(authService: AuthService): RequestHandler {
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
