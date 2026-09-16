import sharp from "sharp";

import { MAX_STORED_IMAGE_DIMENSION } from "../config/constants.js";
import { UploadServiceError } from "./types.js";

const ALLOWED_INPUT_FORMATS = new Set(["jpeg", "png", "webp"]);

export async function normalizeUploadedImage(input: Buffer): Promise<Buffer> {
  if (input.length === 0) {
    throw new UploadServiceError(400, "EMPTY_IMAGE", "Choose a non-empty image file.");
  }

  try {
    const image = sharp(input, {
      animated: false,
      failOn: "error",
      limitInputPixels: 64_000_000,
    });
    const metadata = await image.metadata();

    if (!metadata.format || !ALLOWED_INPUT_FORMATS.has(metadata.format)) {
      throw new UploadServiceError(
        415,
        "UNSUPPORTED_IMAGE",
        "Use a JPEG, PNG, or WebP image.",
      );
    }

    return await image
      .rotate()
      .resize({
        fit: "inside",
        height: MAX_STORED_IMAGE_DIMENSION,
        width: MAX_STORED_IMAGE_DIMENSION,
        withoutEnlargement: true,
      })
      .webp({ quality: 84 })
      .toBuffer();
  } catch (error) {
    if (error instanceof UploadServiceError) throw error;
    throw new UploadServiceError(
      422,
      "INVALID_IMAGE",
      "The selected file is not a valid readable image.",
    );
  }
}
