import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";

import { requireAuth } from "../auth/middleware.js";
import type { AuthService } from "../auth/types.js";
import { MAX_UPLOAD_INPUT_BYTES } from "../config/constants.js";
import { createRequestHandler, sendError } from "../http/responses.js";
import { readUuid } from "../http/validation.js";
import { UploadServiceError, type UploadService } from "../uploads/types.js";

const parseImage = multer({
  limits: {
    fields: 0,
    fileSize: MAX_UPLOAD_INPUT_BYTES,
    files: 1,
    parts: 1,
  },
  storage: multer.memoryStorage(),
}).single("image");

const handle = createRequestHandler(UploadServiceError, {
  code: "UPLOAD_SERVICE_UNAVAILABLE",
  message: "Image storage is temporarily unavailable.",
});

function requireImage(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  parseImage(request, response, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        sendError(
          response,
          413,
          "UPLOAD_TOO_LARGE",
          "Images must be 5 MB or smaller.",
        );
        return;
      }
      sendError(response, 400, "INVALID_UPLOAD", "Provide one image file in the image field.");
      return;
    }
    if (error) {
      sendError(response, 400, "INVALID_UPLOAD", "The multipart upload could not be read.");
      return;
    }
    if (!request.file) {
      sendError(response, 400, "INVALID_UPLOAD", "Choose an image to upload.");
      return;
    }
    next();
  });
}

function readId(response: Response, value: unknown, label: string) {
  const id = readUuid(value);
  if (!id) sendError(response, 400, "INVALID_REQUEST", `${label} ID must be a valid UUID.`);
  return id;
}

export function createUploadsRouter(
  authService: AuthService,
  uploadService: UploadService,
) {
  const router = Router();
  const authenticated = requireAuth(authService);

  router.get("/members/:memberId/photo", authenticated, async (request, response) => {
    const memberId = readId(response, request.params.memberId, "Member");
    if (!memberId || !request.actor) return;
    response.set("Cache-Control", "private, no-store");
    await handle(response, () => uploadService.getMemberPhoto(request.actor!, memberId));
  });
  router.put("/members/:memberId/photo", authenticated, requireImage, async (request, response) => {
    const memberId = readId(response, request.params.memberId, "Member");
    if (!memberId || !request.actor || !request.file) return;
    await handle(response, () =>
      uploadService.replaceMemberPhoto(request.actor!, memberId, request.file!.buffer),
    );
  });
  router.delete("/members/:memberId/photo", authenticated, async (request, response) => {
    const memberId = readId(response, request.params.memberId, "Member");
    if (!memberId || !request.actor) return;
    await handle(response, () => uploadService.removeMemberPhoto(request.actor!, memberId));
  });

  router.get("/life-groups/:lifeGroupId/logo", authenticated, async (request, response) => {
    const lifeGroupId = readId(response, request.params.lifeGroupId, "Life Group");
    if (!lifeGroupId || !request.actor) return;
    response.set("Cache-Control", "private, no-store");
    await handle(response, () => uploadService.getLifeGroupLogo(request.actor!, lifeGroupId));
  });
  router.put("/life-groups/:lifeGroupId/logo", authenticated, requireImage, async (request, response) => {
    const lifeGroupId = readId(response, request.params.lifeGroupId, "Life Group");
    if (!lifeGroupId || !request.actor || !request.file) return;
    await handle(response, () =>
      uploadService.replaceLifeGroupLogo(request.actor!, lifeGroupId, request.file!.buffer),
    );
  });
  router.delete("/life-groups/:lifeGroupId/logo", authenticated, async (request, response) => {
    const lifeGroupId = readId(response, request.params.lifeGroupId, "Life Group");
    if (!lifeGroupId || !request.actor) return;
    await handle(response, () => uploadService.removeLifeGroupLogo(request.actor!, lifeGroupId));
  });

  router.get("/events/:eventId/image", authenticated, async (request, response) => {
    const eventId = readId(response, request.params.eventId, "Event");
    if (!eventId || !request.actor) return;
    response.set("Cache-Control", "private, no-store");
    await handle(response, () => uploadService.getEventImage(request.actor!, eventId));
  });
  router.put("/events/:eventId/image", authenticated, requireImage, async (request, response) => {
    const eventId = readId(response, request.params.eventId, "Event");
    if (!eventId || !request.actor || !request.file) return;
    await handle(response, () =>
      uploadService.replaceEventImage(request.actor!, eventId, request.file!.buffer),
    );
  });
  router.delete("/events/:eventId/image", authenticated, async (request, response) => {
    const eventId = readId(response, request.params.eventId, "Event");
    if (!eventId || !request.actor) return;
    await handle(response, () => uploadService.removeEventImage(request.actor!, eventId));
  });

  return router;
}
