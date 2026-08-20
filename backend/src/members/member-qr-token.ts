import { randomBytes } from "node:crypto";

export const MEMBER_QR_TOKEN_COLLISION_RETRIES = 3;

export function generateMemberQrToken() {
  return randomBytes(32).toString("base64url");
}

export function isMemberQrTokenCollision(error: {
  code?: string;
  message?: string;
}) {
  return (
    error.code === "23505" &&
    error.message?.includes("members_qr_token_key") === true
  );
}
