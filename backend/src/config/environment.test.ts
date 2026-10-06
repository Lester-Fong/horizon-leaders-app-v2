import { describe, expect, it } from "vitest";

import { readEnvironment } from "./environment.js";

const requiredEnvironment = {
  FRONTEND_ORIGIN: "https://horizon.pages.dev",
  SUPABASE_SERVICE_ROLE_KEY: "server-only-test-value",
  SUPABASE_URL: "https://example.supabase.co",
};

describe("backend environment configuration", () => {
  it("uses a Render-compatible production host and supplied port", () => {
    const config = readEnvironment({
      ...requiredEnvironment,
      NODE_ENV: "production",
      PORT: "10042",
    });

    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(10_042);
    expect(config.frontendOrigin).toBe("https://horizon.pages.dev");
  });

  it("keeps loopback defaults for local development", () => {
    const config = readEnvironment({
      SUPABASE_SERVICE_ROLE_KEY: "local-only-test-value",
      SUPABASE_URL: "http://127.0.0.1:54321",
    });

    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(3000);
    expect(config.frontendOrigin).toBe("http://127.0.0.1:5173");
  });

  it("accepts an explicit deploy host", () => {
    expect(
      readEnvironment({
        ...requiredEnvironment,
        HOST: "0.0.0.0",
        NODE_ENV: "production",
      }).host,
    ).toBe("0.0.0.0");
  });

  it.each([
    [{ ...requiredEnvironment, NODE_ENV: "production", PORT: "zero" }, "PORT"],
    [{ ...requiredEnvironment, HOST: "https://host", NODE_ENV: "production" }, "HOST"],
    [
      {
        ...requiredEnvironment,
        FRONTEND_ORIGIN: "https://horizon.pages.dev/path",
        NODE_ENV: "production",
      },
      "FRONTEND_ORIGIN",
    ],
    [
      {
        ...requiredEnvironment,
        FRONTEND_ORIGIN: "*",
        NODE_ENV: "production",
      },
      "FRONTEND_ORIGIN",
    ],
    [
      {
        SUPABASE_SERVICE_ROLE_KEY: "server-only-test-value",
        SUPABASE_URL: "https://example.supabase.co",
        NODE_ENV: "production",
      },
      "FRONTEND_ORIGIN",
    ],
    [
      {
        FRONTEND_ORIGIN: "https://horizon.pages.dev",
        SUPABASE_URL: "https://example.supabase.co",
        NODE_ENV: "production",
      },
      "SUPABASE_SERVICE_ROLE_KEY",
    ],
  ])("fails clearly for invalid production configuration", (environment, message) => {
    expect(() => readEnvironment(environment)).toThrow(message);
  });
});
