import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { normalizeUploadedImage } from "./image-processor.js";
import { UploadServiceError } from "./types.js";

async function image(format: "jpeg" | "png" | "webp") {
  const source = sharp({ create: { background: "#333333", channels: 3, height: 24, width: 32 } });
  return format === "jpeg" ? source.jpeg().toBuffer()
    : format === "png" ? source.png().toBuffer()
      : source.webp().toBuffer();
}

describe("uploaded image normalization", () => {
  it.each(["jpeg", "png", "webp"] as const)("accepts %s and stores bounded metadata-free WebP", async (format) => {
    const input = await image(format);
    const output = await normalizeUploadedImage(input);
    const metadata = await sharp(output).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(32);
    expect(metadata.height).toBe(24);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
  });

  it("resizes without exceeding 1600 pixels and applies orientation", async () => {
    const input = await sharp({ create: { background: "#111111", channels: 3, height: 2400, width: 1200 } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const metadata = await sharp(await normalizeUploadedImage(input)).metadata();
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBe(1600);
    expect(metadata.orientation).toBeUndefined();
  });

  it.each([
    ["empty", Buffer.alloc(0), "EMPTY_IMAGE"],
    ["corrupt", Buffer.from("not an image"), "INVALID_IMAGE"],
    ["svg", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), "INVALID_IMAGE"],
  ])("rejects %s input", async (_label, input, code) => {
    await expect(normalizeUploadedImage(input)).rejects.toMatchObject<Partial<UploadServiceError>>({ code });
  });
});
