import type { Response } from "express";

import { PagedData } from "./pagination.js";

export interface ApiErrorBody {
  error: {
    code: string;
    details?: unknown;
    message: string;
  };
}

/** The shape every Horizon service error class exposes to the HTTP layer. */
export interface HttpServiceError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status: number;
}

export interface ServiceUnavailableFallback {
  code: string;
  message: string;
}

export type RequestHandlerFn = (
  response: Response,
  operation: () => Promise<unknown>,
  successStatus?: number,
) => Promise<void>;

export function sendError(
  response: Response<ApiErrorBody>,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return response.status(status).json({
    error: { code, ...(details === undefined ? {} : { details }), message },
  });
}

export function sendInvalid(response: Response, message: string) {
  return sendError(response, 400, "INVALID_REQUEST", message);
}

/**
 * Builds the router-level `{ data }` responder: the operation's result is sent
 * with the success status (a `PagedData` result is sent as `{ data, meta }`),
 * a known service error is sent with its own status,
 * code, message and optional details, and anything else becomes a 500 fallback.
 */
export function createRequestHandler(
  ServiceErrorClass: abstract new (...args: never[]) => HttpServiceError,
  fallback: ServiceUnavailableFallback,
): RequestHandlerFn {
  return async (response, operation, successStatus = 200) => {
    try {
      const result = await operation();
      response
        .status(successStatus)
        .json(
          result instanceof PagedData
            ? { data: result.data, meta: result.meta }
            : { data: result },
        );
    } catch (error) {
      if (error instanceof ServiceErrorClass) {
        sendError(response, error.status, error.code, error.message, error.details);
        return;
      }
      sendError(response, 500, fallback.code, fallback.message);
    }
  };
}
