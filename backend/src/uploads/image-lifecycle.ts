import type { ImageObjectStore, UploadLogger } from "./types.js";

interface ReplaceImageOptions {
  currentPath: string | null;
  input: Buffer;
  logger: UploadLogger;
  nextPath: string;
  normalize(input: Buffer): Promise<Buffer>;
  objectStore: ImageObjectStore;
  setPath(path: string | null): Promise<void>;
}

interface RemoveImageOptions {
  currentPath: string | null;
  logger: UploadLogger;
  objectStore: ImageObjectStore;
  setPath(path: string | null): Promise<void>;
}

async function cleanupObsoleteObject(
  objectStore: ImageObjectStore,
  path: string,
  logger: UploadLogger,
  reason: "failed_database_update" | "obsolete_replacement" | "explicit_remove",
) {
  try {
    await objectStore.remove(path);
  } catch (error) {
    logger.error("Upload object cleanup failed.", {
      error: error instanceof Error ? error.message : "Unknown cleanup error",
      path,
      reason,
    });
  }
}

export async function replaceImage(options: ReplaceImageOptions) {
  const normalized = await options.normalize(options.input);
  await options.objectStore.upload(options.nextPath, normalized);

  try {
    await options.setPath(options.nextPath);
  } catch (error) {
    await cleanupObsoleteObject(
      options.objectStore,
      options.nextPath,
      options.logger,
      "failed_database_update",
    );
    throw error;
  }

  if (options.currentPath && options.currentPath !== options.nextPath) {
    await cleanupObsoleteObject(
      options.objectStore,
      options.currentPath,
      options.logger,
      "obsolete_replacement",
    );
  }

  return options.nextPath;
}

export async function removeImage(options: RemoveImageOptions) {
  if (!options.currentPath) return;

  await options.setPath(null);
  await cleanupObsoleteObject(
    options.objectStore,
    options.currentPath,
    options.logger,
    "explicit_remove",
  );
}
