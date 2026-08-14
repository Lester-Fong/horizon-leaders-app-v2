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
});
