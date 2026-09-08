import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";

export const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

/** Deliberately stricter than URL's hostname normalization (e.g. 127.1). */
export function assertLocalUrl(value: string | undefined): string {
  if (!value || !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):54321\/?$/.test(value)) {
    throw new Error("LOCAL DEMO ONLY: refused Supabase URL. Expected http://127.0.0.1:54321 (or localhost/[::1]). Remote, unknown, credential-bearing, and custom-port URLs are not allowed.");
  }
  return value.replace(/\/$/, "");
}

export function readDemoConfig() {
  loadEnv({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });
  const supabaseUrl = assertLocalUrl(process.env.SUPABASE_URL);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Demo seed requires SUPABASE_SERVICE_ROLE_KEY in backend/.env.");
  return { supabaseUrl, serviceRoleKey };
}
