import "dotenv/config";

const DEFAULT_PORT = 3000;
const DEFAULT_DEVELOPMENT_HOST = "127.0.0.1";
const DEFAULT_PRODUCTION_HOST = "0.0.0.0";
const DEFAULT_FRONTEND_ORIGIN = "http://127.0.0.1:5173";

export interface EnvironmentConfig {
  frontendOrigin: string;
  host: string;
  nodeEnv: string;
  port: number;
  supabaseServiceRoleKey: string;
  supabaseUrl: string;
}

function readPort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return port;
}

function readRequiredEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function readHost(value: string | undefined, isProduction: boolean): string {
  const host =
    value?.trim() ||
    (isProduction ? DEFAULT_PRODUCTION_HOST : DEFAULT_DEVELOPMENT_HOST);

  const isHostname = /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(
    host,
  );
  const isIpLiteral = /^[0-9a-fA-F:.]+$/.test(host);

  if (!isHostname && !isIpLiteral) {
    throw new Error("HOST must be a hostname or IP address");
  }

  return host;
}

function readHttpUrl(name: string, value: string): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid http(s) URL`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must be a valid http(s) URL`);
  }

  return url;
}

function readFrontendOrigin(value: string): string {
  const url = readHttpUrl("FRONTEND_ORIGIN", value);

  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "FRONTEND_ORIGIN must contain only an http(s) scheme, host, and optional port",
    );
  }

  return url.origin;
}

export function readEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): EnvironmentConfig {
  const nodeEnv = environment.NODE_ENV?.trim() || "development";
  const isProduction = nodeEnv === "production";
  const frontendOriginValue = isProduction
    ? readRequiredEnvironmentValue(environment, "FRONTEND_ORIGIN")
    : environment.FRONTEND_ORIGIN?.trim() || DEFAULT_FRONTEND_ORIGIN;
  const supabaseUrl = readRequiredEnvironmentValue(environment, "SUPABASE_URL");

  readHttpUrl("SUPABASE_URL", supabaseUrl);

  return Object.freeze({
    frontendOrigin: readFrontendOrigin(frontendOriginValue),
    host: readHost(environment.HOST, isProduction),
    nodeEnv,
    port: readPort(environment.PORT),
    supabaseServiceRoleKey: readRequiredEnvironmentValue(
      environment,
      "SUPABASE_SERVICE_ROLE_KEY",
    ),
    supabaseUrl,
  });
}

export const config = readEnvironment();
