/** Shared domain configuration. Keep these values stable and reuse them in every trigger. */
export const SUNDAY_CONSECUTIVE_ABSENCE_THRESHOLD = 5;
export const OPENCELL_PARTICIPATION_THRESHOLD_PERCENT = 75;
export const CHURCH_TIME_ZONE = "Asia/Manila";

/** Private normalized domain-image storage configuration. */
export const UPLOAD_BUCKET = "horizon-uploads";
export const UPLOAD_SIGNED_URL_TTL_SECONDS = 15 * 60;
export const MAX_UPLOAD_INPUT_BYTES = 5 * 1024 * 1024;
export const MAX_STORED_IMAGE_DIMENSION = 1600;

/** Staff account password policy enforced by the Users API before Supabase Auth. */
export const USER_PASSWORD_MIN_LENGTH = 10;
export const USER_PASSWORD_MAX_LENGTH = 72;

/** Per-actor request limits for sensitive account routes (in-memory, per API process). */
export const USER_MUTATION_RATE_LIMIT_MAX = 30;
export const USER_MUTATION_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const OWN_PASSWORD_CHANGE_RATE_LIMIT_MAX = 5;
export const OWN_PASSWORD_CHANGE_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Most recent account activity entries returned for one user. */
export const USER_ACTIVITY_LIMIT = 50;
