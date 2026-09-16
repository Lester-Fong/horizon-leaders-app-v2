import { describe, expect, it, vi } from "vitest";

import { removeImage, replaceImage } from "./image-lifecycle.js";
import type { ImageObjectStore, UploadLogger } from "./types.js";

function dependencies() {
  const calls: string[] = [];
  const objectStore: ImageObjectStore = {
    createSignedUrl: vi.fn(async () => null),
    remove: vi.fn(async (path) => { calls.push(`remove:${path}`); }),
    upload: vi.fn(async (path) => { calls.push(`upload:${path}`); }),
  };
  const logger: UploadLogger = { error: vi.fn() };
  const setPath = vi.fn(async (path: string | null) => { calls.push(`db:${path}`); });
  return { calls, logger, objectStore, setPath };
}

describe("image replacement lifecycle", () => {
  it("uploads new content, changes the pointer, then removes the old object", async () => {
    const setup = dependencies();
    await replaceImage({
      currentPath: "old.webp",
      input: Buffer.from("input"),
      logger: setup.logger,
      nextPath: "new.webp",
      normalize: async () => Buffer.from("normalized"),
      objectStore: setup.objectStore,
      setPath: setup.setPath,
    });
    expect(setup.calls).toEqual(["upload:new.webp", "db:new.webp", "remove:old.webp"]);
  });

  it("preserves the old pointer when processing or upload fails", async () => {
    const processing = dependencies();
    await expect(replaceImage({
      currentPath: "old.webp", input: Buffer.from("input"), logger: processing.logger,
      nextPath: "new.webp", normalize: async () => { throw new Error("invalid"); },
      objectStore: processing.objectStore, setPath: processing.setPath,
    })).rejects.toThrow("invalid");
    expect(processing.calls).toEqual([]);

    const upload = dependencies();
    vi.mocked(upload.objectStore.upload).mockRejectedValueOnce(new Error("storage down"));
    await expect(replaceImage({
      currentPath: "old.webp", input: Buffer.from("input"), logger: upload.logger,
      nextPath: "new.webp", normalize: async () => Buffer.from("normalized"),
      objectStore: upload.objectStore, setPath: upload.setPath,
    })).rejects.toThrow("storage down");
    expect(upload.setPath).not.toHaveBeenCalled();
    expect(upload.objectStore.remove).not.toHaveBeenCalled();
  });

  it("cleans the new orphan when the database update fails", async () => {
    const setup = dependencies();
    setup.setPath.mockRejectedValueOnce(new Error("database down"));
    await expect(replaceImage({
      currentPath: "old.webp", input: Buffer.from("input"), logger: setup.logger,
      nextPath: "new.webp", normalize: async () => Buffer.from("normalized"),
      objectStore: setup.objectStore, setPath: setup.setPath,
    })).rejects.toThrow("database down");
    expect(setup.calls).toEqual(["upload:new.webp", "remove:new.webp"]);
    expect(setup.setPath).toHaveBeenCalledWith("new.webp");
  });

  it("keeps a valid new pointer when obsolete cleanup fails", async () => {
    const setup = dependencies();
    vi.mocked(setup.objectStore.remove).mockRejectedValueOnce(new Error("cleanup down"));
    await expect(replaceImage({
      currentPath: "old.webp", input: Buffer.from("input"), logger: setup.logger,
      nextPath: "new.webp", normalize: async () => Buffer.from("normalized"),
      objectStore: setup.objectStore, setPath: setup.setPath,
    })).resolves.toBe("new.webp");
    expect(setup.setPath).toHaveBeenCalledWith("new.webp");
    expect(setup.logger.error).toHaveBeenCalledOnce();
  });

  it("clears the pointer before best-effort explicit deletion", async () => {
    const setup = dependencies();
    vi.mocked(setup.objectStore.remove).mockRejectedValueOnce(new Error("cleanup down"));
    await removeImage({
      currentPath: "old.webp",
      logger: setup.logger,
      objectStore: setup.objectStore,
      setPath: setup.setPath,
    });
    expect(setup.calls).toEqual(["db:null"]);
    expect(setup.objectStore.remove).toHaveBeenCalledWith("old.webp");
    expect(setup.logger.error).toHaveBeenCalledOnce();
  });
});
