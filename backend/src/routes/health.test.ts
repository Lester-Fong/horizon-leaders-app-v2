import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../app.js";

describe("GET /api/health", () => {
  it("reports that the API is healthy", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});
