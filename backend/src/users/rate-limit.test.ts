import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createActorRateLimit } from "./rate-limit.js";

function createLimitedApp(now: () => number) {
  const app = express();
  app.use((request, _response, next) => {
    const actorId = request.get("x-actor");
    if (actorId) {
      request.actor = { id: actorId, isActive: true, name: "Tester", role: "admin" };
    }
    next();
  });
  app.get("/limited", createActorRateLimit({ max: 2, now, windowMs: 1000 }), (_request, response) => {
    response.json({ ok: true });
  });
  return app;
}

describe("createActorRateLimit", () => {
  it("limits each actor separately and resets after the window", async () => {
    let currentTime = 0;
    const app = createLimitedApp(() => currentTime);
    const call = (actorId: string) => request(app).get("/limited").set("x-actor", actorId);

    expect((await call("a")).status).toBe(200);
    expect((await call("a")).status).toBe(200);
    const limited = await call("a");
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
    expect(limited.get("Retry-After")).toBe("1");
    expect((await call("b")).status).toBe(200);

    currentTime = 1000;
    expect((await call("a")).status).toBe(200);
  });
});
