import { Router } from "express";

import { requireAuth } from "../auth/middleware.js";
import type { AuthService } from "../auth/types.js";
import { churchDate } from "../config/church-date.js";
import { createRequestHandler, sendInvalid } from "../http/responses.js";
import {
  hasOwn,
  hasUnknownFields,
  isRecord,
  readCalendarDate,
  readRequiredText,
  readUuid,
} from "../http/validation.js";
import {
  OpenCellServiceError,
  type OpenCellProgrammeStatusFilter,
  type OpenCellService,
  type UpdateOpenCellProgrammeInput,
  type UpdateOpenCellSessionInput,
} from "../opencell/types.js";

const PROGRAMME_FIELDS = new Set(["name", "description"]);
const SESSION_FIELDS = new Set(["sessionDate", "title", "location", "notes"]);
const ENROLLMENT_FIELDS = new Set(["visitorId", "enrolledOn"]);
const PROGRAMME_STATUS_FILTERS = ["active", "finished", "all"];
const NULLABLE_SESSION_FIELDS = ["title", "location", "notes"] as const;

const INVALID_PROGRAMME_ID = "Programme ID must be a valid UUID.";
const INVALID_IDS = "IDs must be valid UUIDs.";
const INVALID_PROGRAMME_FIELDS = "Provide only name and description.";
const INVALID_SESSION_FIELDS = "Provide the approved Session fields.";
const PROGRAMME_NAME_REQUIRED = "Programme name is required.";
const SESSION_DATE_REQUIRED = "Session date must be a valid YYYY-MM-DD date.";

const handle = createRequestHandler(OpenCellServiceError, {
  code: "OPENCELL_SERVICE_UNAVAILABLE",
  message: "OpenCell data is temporarily unavailable.",
});

type ParsedInput<Input> = { input: Input } | { message: string };

/**
 * Optional text field: a missing field stays undefined (rejected by callers that
 * require the key), null stays null, and text must be non-blank once trimmed.
 */
function readNullableText(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return readRequiredText(value);
}

function readProgrammeUpdate(
  body: Record<string, unknown>,
): ParsedInput<UpdateOpenCellProgrammeInput> {
  const input: UpdateOpenCellProgrammeInput = {};
  if (hasOwn(body, "name")) {
    const name = readRequiredText(body.name);
    if (!name) return { message: PROGRAMME_NAME_REQUIRED };
    input.name = name;
  }
  if (hasOwn(body, "description")) {
    const description = readNullableText(body.description);
    if (description === undefined) {
      return { message: "Description must be text or null." };
    }
    input.description = description;
  }
  return { input };
}

function readSessionUpdate(
  body: Record<string, unknown>,
): ParsedInput<UpdateOpenCellSessionInput> {
  const input: UpdateOpenCellSessionInput = {};
  if (hasOwn(body, "sessionDate")) {
    const sessionDate = readCalendarDate(body.sessionDate);
    if (!sessionDate) return { message: SESSION_DATE_REQUIRED };
    input.sessionDate = sessionDate;
  }
  for (const field of NULLABLE_SESSION_FIELDS) {
    if (!hasOwn(body, field)) continue;
    const value = readNullableText(body[field]);
    if (value === undefined) {
      return { message: "Session fields must be text or null." };
    }
    input[field] = value;
  }
  return { input };
}

export function createOpenCellRouter(
  authService: AuthService,
  openCellService: OpenCellService,
) {
  const router = Router();
  const authenticated = requireAuth(authService);

  router.get("/opencell/programmes", authenticated, async (request, response) => {
    if (!request.actor) return;
    const search =
      typeof request.query.search === "string" ? request.query.search.trim() : "";
    const status = request.query.status === undefined ? "active" : request.query.status;
    if (!PROGRAMME_STATUS_FILTERS.includes(String(status))) {
      sendInvalid(response, "Status must be active, finished, or all.");
      return;
    }
    // Express types query values loosely; the String() check above is the accepted-value rule.
    const statusFilter = status as OpenCellProgrammeStatusFilter;
    await handle(response, () =>
      openCellService.list(request.actor!, { search, status: statusFilter }),
    );
  });

  router.get("/opencell/programmes/:id", authenticated, async (request, response) => {
    const programmeId = readUuid(request.params.id);
    if (!programmeId) {
      sendInvalid(response, INVALID_PROGRAMME_ID);
      return;
    }
    await handle(response, () => openCellService.getById(request.actor!, programmeId));
  });

  router.post("/opencell/programmes", authenticated, async (request, response) => {
    if (
      !request.actor ||
      !isRecord(request.body) ||
      hasUnknownFields(request.body, PROGRAMME_FIELDS)
    ) {
      sendInvalid(response, INVALID_PROGRAMME_FIELDS);
      return;
    }
    const name = readRequiredText(request.body.name);
    const description = readNullableText(request.body.description);
    if (!name || description === undefined) {
      sendInvalid(response, PROGRAMME_NAME_REQUIRED);
      return;
    }
    await handle(
      response,
      () => openCellService.create(request.actor!, { name, description }),
      201,
    );
  });

  router.patch("/opencell/programmes/:id", authenticated, async (request, response) => {
    const programmeId = readUuid(request.params.id);
    if (
      !programmeId ||
      !isRecord(request.body) ||
      hasUnknownFields(request.body, PROGRAMME_FIELDS)
    ) {
      sendInvalid(response, INVALID_PROGRAMME_FIELDS);
      return;
    }
    const update = readProgrammeUpdate(request.body);
    if ("message" in update) {
      sendInvalid(response, update.message);
      return;
    }
    await handle(response, () =>
      openCellService.update(request.actor!, programmeId, update.input),
    );
  });

  router.post("/opencell/programmes/:id/finish", authenticated, async (request, response) => {
    const programmeId = readUuid(request.params.id);
    if (!programmeId) {
      sendInvalid(response, INVALID_PROGRAMME_ID);
      return;
    }
    await handle(response, () => openCellService.finish(request.actor!, programmeId));
  });

  router.get("/opencell/programmes/:id/sessions", authenticated, async (request, response) => {
    const programmeId = readUuid(request.params.id);
    if (!programmeId) {
      sendInvalid(response, INVALID_PROGRAMME_ID);
      return;
    }
    await handle(response, () =>
      openCellService.listSessions(request.actor!, programmeId),
    );
  });

  router.post("/opencell/programmes/:id/sessions", authenticated, async (request, response) => {
    const programmeId = readUuid(request.params.id);
    if (
      !programmeId ||
      !isRecord(request.body) ||
      hasUnknownFields(request.body, SESSION_FIELDS)
    ) {
      sendInvalid(response, INVALID_SESSION_FIELDS);
      return;
    }
    const sessionDate = readCalendarDate(request.body.sessionDate);
    const title = readNullableText(request.body.title);
    const location = readNullableText(request.body.location);
    const notes = readNullableText(request.body.notes);
    if (
      !sessionDate ||
      title === undefined ||
      location === undefined ||
      notes === undefined
    ) {
      sendInvalid(response, SESSION_DATE_REQUIRED);
      return;
    }
    await handle(
      response,
      () =>
        openCellService.createSession(request.actor!, programmeId, {
          sessionDate,
          title,
          location,
          notes,
        }),
      201,
    );
  });

  router.patch(
    "/opencell/programmes/:id/sessions/:sessionId",
    authenticated,
    async (request, response) => {
      const programmeId = readUuid(request.params.id);
      const sessionId = readUuid(request.params.sessionId);
      if (
        !programmeId ||
        !sessionId ||
        !isRecord(request.body) ||
        hasUnknownFields(request.body, SESSION_FIELDS)
      ) {
        sendInvalid(response, INVALID_SESSION_FIELDS);
        return;
      }
      const update = readSessionUpdate(request.body);
      if ("message" in update) {
        sendInvalid(response, update.message);
        return;
      }
      await handle(response, () =>
        openCellService.updateSession(request.actor!, programmeId, sessionId, update.input),
      );
    },
  );

  router.patch(
    "/opencell/programmes/:id/sessions/:sessionId/cancel",
    authenticated,
    async (request, response) => {
      const programmeId = readUuid(request.params.id);
      const sessionId = readUuid(request.params.sessionId);
      if (!programmeId || !sessionId) {
        sendInvalid(response, INVALID_IDS);
        return;
      }
      await handle(response, () =>
        openCellService.cancelSession(request.actor!, programmeId, sessionId),
      );
    },
  );

  router.get(
    "/opencell/programmes/:id/participants",
    authenticated,
    async (request, response) => {
      const programmeId = readUuid(request.params.id);
      if (!programmeId) {
        sendInvalid(response, INVALID_PROGRAMME_ID);
        return;
      }
      await handle(response, () =>
        openCellService.listParticipants(request.actor!, programmeId),
      );
    },
  );

  router.post(
    "/opencell/programmes/:id/participants",
    authenticated,
    async (request, response) => {
      const programmeId = readUuid(request.params.id);
      if (
        !programmeId ||
        !isRecord(request.body) ||
        hasUnknownFields(request.body, ENROLLMENT_FIELDS)
      ) {
        sendInvalid(response, "Provide an existing Visitor and optional enrollment date.");
        return;
      }
      const visitorId = readUuid(request.body.visitorId);
      const enrolledOn =
        request.body.enrolledOn === undefined
          ? churchDate()
          : readCalendarDate(request.body.enrolledOn);
      if (!visitorId || !enrolledOn) {
        sendInvalid(
          response,
          "Visitor ID and a valid YYYY-MM-DD enrollment date are required.",
        );
        return;
      }
      await handle(
        response,
        () => openCellService.enroll(request.actor!, programmeId, visitorId, enrolledOn),
        201,
      );
    },
  );

  router.delete(
    "/opencell/programmes/:id/participants/:visitorId",
    authenticated,
    async (request, response) => {
      const programmeId = readUuid(request.params.id);
      const visitorId = readUuid(request.params.visitorId);
      if (!programmeId || !visitorId) {
        sendInvalid(response, INVALID_IDS);
        return;
      }
      await handle(response, () =>
        openCellService.removeEnrollment(request.actor!, programmeId, visitorId),
      );
    },
  );

  router.get(
    "/opencell/programmes/:id/sessions/:sessionId/attendance",
    authenticated,
    async (request, response) => {
      const programmeId = readUuid(request.params.id);
      const sessionId = readUuid(request.params.sessionId);
      if (!programmeId || !sessionId) {
        sendInvalid(response, INVALID_IDS);
        return;
      }
      await handle(response, () =>
        openCellService.listAttendance(request.actor!, programmeId, sessionId),
      );
    },
  );

  router.post(
    "/opencell/programmes/:id/sessions/:sessionId/attendance",
    authenticated,
    async (request, response) => {
      const programmeId = readUuid(request.params.id);
      const sessionId = readUuid(request.params.sessionId);
      const visitorId = isRecord(request.body)
        ? readUuid(request.body.visitorId)
        : undefined;
      if (!programmeId || !sessionId || !visitorId) {
        sendInvalid(response, "Visitor ID is required.");
        return;
      }
      await handle(
        response,
        () => openCellService.addAttendance(request.actor!, programmeId, sessionId, visitorId),
        201,
      );
    },
  );

  router.delete(
    "/opencell/programmes/:id/sessions/:sessionId/attendance/:visitorId",
    authenticated,
    async (request, response) => {
      const programmeId = readUuid(request.params.id);
      const sessionId = readUuid(request.params.sessionId);
      const visitorId = readUuid(request.params.visitorId);
      if (!programmeId || !sessionId || !visitorId) {
        sendInvalid(response, INVALID_IDS);
        return;
      }
      await handle(response, () =>
        openCellService.removeAttendance(request.actor!, programmeId, sessionId, visitorId),
      );
    },
  );

  return router;
}
