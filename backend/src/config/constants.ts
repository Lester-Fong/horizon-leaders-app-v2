/** Shared domain configuration. Keep these values stable and reuse them in every trigger. */
export const SUNDAY_CONSECUTIVE_ABSENCE_THRESHOLD = 5;
export const OPENCELL_PARTICIPATION_THRESHOLD_PERCENT = 75;
export const CHURCH_TIME_ZONE = "Asia/Manila";

/** Private normalized domain-image storage configuration. */
export const UPLOAD_BUCKET = "horizon-uploads";
export const UPLOAD_SIGNED_URL_TTL_SECONDS = 15 * 60;
export const MAX_UPLOAD_INPUT_BYTES = 5 * 1024 * 1024;
export const MAX_STORED_IMAGE_DIMENSION = 1600;
