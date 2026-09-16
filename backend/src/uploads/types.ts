import type { HorizonActor } from "../auth/types.js";

export interface ImageAsset {
  imageUrl: string | null;
}

export type UploadErrorCode =
  | "EMPTY_IMAGE"
  | "EVENT_NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_IMAGE"
  | "INVALID_UPLOAD"
  | "LIFE_GROUP_NOT_FOUND"
  | "MEMBER_NOT_FOUND"
  | "UPLOAD_SERVICE_UNAVAILABLE"
  | "UPLOAD_TOO_LARGE"
  | "UNSUPPORTED_IMAGE";

export class UploadServiceError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 413 | 415 | 422 | 500,
    readonly code: UploadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "UploadServiceError";
  }
}

export interface UploadService {
  getEventImage(actor: HorizonActor, eventId: string): Promise<ImageAsset>;
  getLifeGroupLogo(actor: HorizonActor, lifeGroupId: string): Promise<ImageAsset>;
  getMemberPhoto(actor: HorizonActor, memberId: string): Promise<ImageAsset>;
  removeEventImage(actor: HorizonActor, eventId: string): Promise<ImageAsset>;
  removeLifeGroupLogo(actor: HorizonActor, lifeGroupId: string): Promise<ImageAsset>;
  removeMemberPhoto(actor: HorizonActor, memberId: string): Promise<ImageAsset>;
  replaceEventImage(actor: HorizonActor, eventId: string, input: Buffer): Promise<ImageAsset>;
  replaceLifeGroupLogo(actor: HorizonActor, lifeGroupId: string, input: Buffer): Promise<ImageAsset>;
  replaceMemberPhoto(actor: HorizonActor, memberId: string, input: Buffer): Promise<ImageAsset>;
}

export interface ImageObjectStore {
  createSignedUrl(path: string): Promise<string | null>;
  remove(path: string): Promise<void>;
  upload(path: string, image: Buffer): Promise<void>;
}

export interface UploadLogger {
  error(message: string, context: Record<string, unknown>): void;
}
