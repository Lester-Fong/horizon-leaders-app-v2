import "dotenv/config";

const DEFAULT_PORT = 3000;

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

export const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: readPort(process.env.PORT),
});
