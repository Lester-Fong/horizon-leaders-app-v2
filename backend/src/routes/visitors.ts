import { Router } from "express";

import { requireAuth } from "../auth/middleware.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import {
  PagedData,
  readPageRequest,
  type PageRequest,
} from "../http/pagination.js";
import { toMemberSummary } from "../members/member-projection.js";
import {
  VisitorServiceError,
  type ListVisitorsOptions,
  type UpdateVisitorInput,
  type VisitorInput,
  type VisitorListStatus,
  type VisitorService,
} from "../visitors/types.js";
import { createRequestHandler, sendError, sendInvalid } from "../http/responses.js";
import {
  hasOwn,
  hasUnknownFields,
  isRecord,
  readOptionalText,
  readRequiredText,
  readUuid,
} from "../http/validation.js";

const VISITOR_FIELDS = new Set(["email", "firstName", "lastName", "phone"]);
const CONVERSION_FIELDS = new Set(["lifeGroupId"]);
const LIFE_GROUP_FIELDS = new Set(["lifeGroupId"]);

const handleRequest = createRequestHandler(VisitorServiceError, {
  code: "VISITOR_SERVICE_UNAVAILABLE",
  message: "Visitor data is temporarily unavailable.",
});

function readStatus(value: unknown): VisitorListStatus | undefined {
  return value === "active" || value === "converted" || value === "all"
    ? value
    : undefined;
}

function readCreateInput(body: Record<string, unknown>): VisitorInput | undefined {
  const firstName = readRequiredText(body.firstName);
  const lastName = readRequiredText(body.lastName);
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
    const firstName = readRequiredText(body.firstName);
    if (!firstName) return undefined;
    update.firstName = firstName;
  }
  if (hasOwn(body, "lastName")) {
    const lastName = readRequiredText(body.lastName);
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

export function createVisitorsRouter(
  authService: AuthService,
  visitorService: VisitorService,
) {
  const router = Router();
  const authenticated = requireAuth(authService);

  function listVisitors(
    actor: HorizonActor,
    options: ListVisitorsOptions,
    page: PageRequest | undefined,
  ) {
    if (!page) return visitorService.list(actor, options);
    return visitorService
      .listPage(actor, options, page)
      .then(({ items, meta }) => new PagedData(items, meta));
  }

  router.get("/visitors", authenticated, async (request, response) => {
    if (!request.actor) return;
    const pagination = readPageRequest(request.query);
    if (!pagination.ok) {
      sendInvalid(response, pagination.message);
      return;
    }
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
        listVisitors(request.actor!, options, pagination.page),
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
      listVisitors(request.actor!, options, pagination.page),
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
      let lifeGroupId: string | null = null;
      if (hasOwn(request.body, "lifeGroupId")) {
        const parsedLifeGroupId = readUuid(request.body.lifeGroupId);
        if (!parsedLifeGroupId) {
          sendError(response, 400, "INVALID_REQUEST", "Life Group ID must be a valid UUID when supplied.");
          return;
        }
        lifeGroupId = parsedLifeGroupId;
      }
      await handleRequest(
        response,
        () => visitorService.convert(request.actor!, visitorId, lifeGroupId).then(
          (result) => ({
            ...result,
            member: toMemberSummary(result.member),
          }),
        ),
        201,
      );
    },
  );

  router.patch(
    "/visitors/:visitorId/life-group",
    authenticated,
    async (request, response) => {
      const visitorId = readUuid(request.params.visitorId);
      if (
        !visitorId ||
        !request.actor ||
        !isRecord(request.body) ||
        hasUnknownFields(isRecord(request.body) ? request.body : {}, LIFE_GROUP_FIELDS) ||
        !hasOwn(isRecord(request.body) ? request.body : {}, "lifeGroupId")
      ) {
        sendError(
          response,
          400,
          "INVALID_REQUEST",
          "Provide a valid Visitor and Life Group assignment.",
        );
        return;
      }
      let lifeGroupId: string | null = null;
      if (request.body.lifeGroupId !== null) {
        const parsedLifeGroupId = readUuid(request.body.lifeGroupId);
        if (!parsedLifeGroupId) {
          sendError(response, 400, "INVALID_REQUEST", "Life Group ID must be a valid UUID or null.");
          return;
        }
        lifeGroupId = parsedLifeGroupId;
      }
      await handleRequest(response, () =>
        visitorService.setLifeGroup(request.actor!, visitorId, lifeGroupId),
      );
    },
  );

  return router;
}
