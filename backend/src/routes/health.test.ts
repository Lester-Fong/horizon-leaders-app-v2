import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import type { AuthService } from "../auth/types.js";

const unusedAuthService: AuthService = {
  authenticate: async () => ({
    code: "AUTH_SERVICE_UNAVAILABLE",
    message: "Authentication is temporarily unavailable.",
    ok: false,
    status: 500,
  }),
};

const app = createApp({ authService: unusedAuthService });

describe("GET /api/health", () => {
  it("reports that the API is healthy", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("applies baseline security headers without disclosing Express", async () => {
    const response = await request(app).get("/api/health");

    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("returns a safe JSON error for malformed or oversized JSON", async () => {
    const malformed = await request(app)
      .post("/api/unknown")
      .set("Content-Type", "application/json")
      .send('{"broken":');
    const oversized = await request(app)
      .post("/api/unknown")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ value: "x".repeat(110_000) }));

    expect(malformed.status).toBe(400);
    expect(malformed.type).toBe("application/json");
    expect(malformed.body).toEqual({
      error: {
        code: "INVALID_JSON",
        message: "Request body must contain valid JSON.",
      },
    });
    expect(malformed.text).not.toContain("SyntaxError");
    expect(malformed.text).not.toContain("node_modules");
    expect(oversized.status).toBe(413);
    expect(oversized.body.error.code).toBe("REQUEST_TOO_LARGE");
  });

  it("returns the standard JSON envelope for unknown API routes", async () => {
    const response = await request(app).get("/api/unknown");

    expect(response.status).toBe(404);
    expect(response.type).toBe("application/json");
    expect(response.body.error.code).toBe("API_ROUTE_NOT_FOUND");
  });

  it("allows only the exact configured browser origin", async () => {
    const corsApp = createApp({
      authService: unusedAuthService,
      frontendOrigin: "https://horizon.pages.dev",
    });
    const allowed = await request(corsApp)
      .get("/api/health")
      .set("Origin", "https://horizon.pages.dev");
    const wrongScheme = await request(corsApp)
      .get("/api/health")
      .set("Origin", "http://horizon.pages.dev");
    const unrelated = await request(corsApp)
      .get("/api/health")
      .set("Origin", "https://unrelated.example");

    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "https://horizon.pages.dev",
    );
    expect(wrongScheme.headers["access-control-allow-origin"]).toBeUndefined();
    expect(unrelated.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
