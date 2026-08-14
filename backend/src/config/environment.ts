import "dotenv/config";

const DEFAULT_PORT = 3000;
const DEFAULT_FRONTEND_ORIGIN = "http://127.0.0.1:5173";

function readPort(value: string | undefined): number {
  if (value === undefined) {
    return DEFAULT_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return port;
}

function readRequiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export const config = Object.freeze({
  frontendOrigin: process.env.FRONTEND_ORIGIN?.trim() || DEFAULT_FRONTEND_ORIGIN,
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: readPort(process.env.PORT),
  supabaseServiceRoleKey: readRequiredEnvironmentValue(
    "SUPABASE_SERVICE_ROLE_KEY",
  ),
  supabaseUrl: readRequiredEnvironmentValue("SUPABASE_URL"),
});
