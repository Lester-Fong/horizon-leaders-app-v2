import { Router, type Response } from "express";

import { requireAuth, requireRole } from "../auth/middleware.js";
import type { AuthService } from "../auth/types.js";
import {
  MemberServiceError,
  type CreateMemberInput,
  type ListMembersOptions,
  type MemberGender,
  type MemberListStatus,
  type MemberService,
  type UpdateMemberInput,
} from "../members/types.js";

interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CREATE_FIELDS = new Set([
  "address",
  "birthDate",
  "email",
  "firstName",
  "gender",
  "lastName",
  "lifeGroupId",
  "phone",
]);
const UPDATE_FIELDS = CREATE_FIELDS;

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

function hasUnknownFields(
  record: Record<string, unknown>,
  allowedFields: Set<string>,
) {
  return Object.keys(record).some((key) => !allowedFields.has(key));
}

function readRequiredName(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  return value.trim();
}

function readOptionalText(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  return value.trim() || null;
}

function readGender(value: unknown): MemberGender | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (value === "male" || value === "female") return value;
  return undefined;
}

function readBirthDate(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value
    ? undefined
    : value;
}

function readUuid(value: unknown) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) return undefined;
  return value;
}

function readQueryString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function readStatus(value: unknown): MemberListStatus | undefined {
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
    if (error instanceof MemberServiceError) {
      sendError(response, error.status, error.code, error.message);
      return;
    }

    sendError(
      response,
      500,
      "MEMBER_SERVICE_UNAVAILABLE",
      "Member data is temporarily unavailable.",
    );
  }
}

function readCreateInput(body: Record<string, unknown>): CreateMemberInput | undefined {
  const firstName = readRequiredName(body.firstName);
  const lastName = readRequiredName(body.lastName);
  const phone = readOptionalText(body.phone);
  const email = readOptionalText(body.email);
  const address = readOptionalText(body.address);
  const birthDate = readBirthDate(body.birthDate);
  const gender = readGender(body.gender);
  const lifeGroupId = readUuid(body.lifeGroupId);

  if (
    !firstName ||
    !lastName ||
    phone === undefined ||
    email === undefined ||
    address === undefined ||
    birthDate === undefined ||
    gender === undefined ||
    !lifeGroupId
  ) {
    return undefined;
  }

  return {
    address,
    birthDate,
    email,
    firstName,
    gender,
    lastName,
    lifeGroupId,
    phone,
  };
}

function readUpdateInput(body: Record<string, unknown>) {
  const update: UpdateMemberInput = {};

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
  if (hasOwn(body, "address")) {
    const address = readOptionalText(body.address);
    if (address === undefined) return undefined;
    update.address = address;
  }
  if (hasOwn(body, "birthDate")) {
    const birthDate = readBirthDate(body.birthDate);
    if (birthDate === undefined) return undefined;
    update.birthDate = birthDate;
  }
  if (hasOwn(body, "gender")) {
    const gender = readGender(body.gender);
    if (gender === undefined) return undefined;
    update.gender = gender;
  }
  if (hasOwn(body, "lifeGroupId")) {
    const lifeGroupId = readUuid(body.lifeGroupId);
    if (!lifeGroupId) return undefined;
    update.lifeGroupId = lifeGroupId;
  }

  return update;
}

export function createMembersRouter(
  authService: AuthService,
  memberService: MemberService,
) {
  const router = Router();
  const authenticated = requireAuth(authService);
  const adminOnly = requireRole("admin");

  router.get("/members", authenticated, async (request, response) => {
    if (!request.actor) return;

    const searchValue = request.query.search;
    if (searchValue !== undefined && typeof searchValue !== "string") {
      sendError(response, 400, "INVALID_REQUEST", "Search must be text.");
      return;
    }
    const search = readQueryString(searchValue)?.trim() || undefined;

    if (request.actor.role === "leader") {
      const options: ListMembersOptions = {
        ...(search ? { search } : {}),
        status: "active",
      };
      response.set("Cache-Control", "private, no-store");
      await handleRequest(response, () =>
        memberService.list(request.actor!, options),
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

    const lifeGroupValue = request.query.lifeGroupId;
    const lifeGroupId =
      lifeGroupValue === undefined ? undefined : readUuid(lifeGroupValue);
    if (lifeGroupValue !== undefined && !lifeGroupId) {
      sendError(
        response,
        400,
        "INVALID_REQUEST",
        "Life Group ID must be a valid UUID.",
      );
      return;
    }

    const options: ListMembersOptions = {
      ...(lifeGroupId ? { lifeGroupId } : {}),
      ...(search ? { search } : {}),
      status,
    };
    response.set("Cache-Control", "private, no-store");
    await handleRequest(response, () =>
      memberService.list(request.actor!, options),
    );
  });

  router.get(
    "/members/:memberId",
    authenticated,
    async (request, response) => {
      const memberId = readUuid(request.params.memberId);
      if (!memberId || !request.actor) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "Member ID must be a valid UUID.",
        );
        return;
      }

      response.set("Cache-Control", "private, no-store");
      await handleRequest(response, () =>
        memberService.getById(request.actor!, memberId),
      );
    },
  );

  router.post("/members", authenticated, async (request, response) => {
    if (
      !isRecord(request.body) ||
      hasUnknownFields(request.body, CREATE_FIELDS)
    ) {
      sendError(
        response,
        400,
        hasOwn(isRecord(request.body) ? request.body : {}, "qrToken")
          ? "QR_TOKEN_CLIENT_CONTROLLED"
          : "INVALID_REQUEST",
        "Provide only the approved Member fields; QR tokens are generated by Horizon.",
      );
      return;
    }

    const input = readCreateInput(request.body);
    if (!input || !request.actor) {
      sendError(
        response,
        400,
        "INVALID_REQUEST",
        "First name, last name, and a valid Life Group are required; optional fields must use approved formats.",
      );
      return;
    }

    await handleRequest(
      response,
      () => memberService.create(request.actor!, input),
      201,
    );
  });

  router.patch(
    "/members/:memberId",
    authenticated,
    async (request, response) => {
      const memberId = readUuid(request.params.memberId);
      if (
        !memberId ||
        !isRecord(request.body) ||
        hasUnknownFields(request.body, UPDATE_FIELDS)
      ) {
        const hasQrToken =
          isRecord(request.body) && hasOwn(request.body, "qrToken");
        sendError(
          response,
          400,
          hasQrToken ? "QR_TOKEN_IMMUTABLE" : "INVALID_REQUEST",
          hasQrToken
            ? "A Member's permanent QR token cannot be changed."
            : "Provide a valid Member ID and only approved editable fields.",
        );
        return;
      }

      const update = readUpdateInput(request.body);
      if (!update || Object.keys(update).length === 0 || !request.actor) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "Provide at least one valid editable Member field.",
        );
        return;
      }

      await handleRequest(response, () =>
        memberService.update(request.actor!, memberId, update),
      );
    },
  );

  router.patch(
    "/members/:memberId/archive",
    authenticated,
    adminOnly,
    async (request, response) => {
      const memberId = readUuid(request.params.memberId);
      if (!memberId) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "Member ID must be a valid UUID.",
        );
        return;
      }

      await handleRequest(response, () => memberService.archive(memberId));
    },
  );

  return router;
}
