import {
  USER_PASSWORD_MAX_LENGTH,
  USER_PASSWORD_MIN_LENGTH,
} from "../config/constants.js";

export const PASSWORD_POLICY_MESSAGE =
  `Password must be ${USER_PASSWORD_MIN_LENGTH}-${USER_PASSWORD_MAX_LENGTH} characters ` +
  "and include an uppercase letter, a lowercase letter, and a number.";

/** True when the value satisfies the Horizon staff password policy. */
export function isStrongPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= USER_PASSWORD_MIN_LENGTH &&
    value.length <= USER_PASSWORD_MAX_LENGTH &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /\d/.test(value)
  );
}
