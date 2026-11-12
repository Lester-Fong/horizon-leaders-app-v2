import type { RequestHandler } from "express";

interface RateLimitOptions {
  /** Requests allowed per window for one signed-in actor. */
  max: number;
  windowMs: number;
  now?: () => number;
}

interface WindowCounter {
  count: number;
  resetAt: number;
}

const SWEEP_THRESHOLD = 1000;

/**
 * Small in-memory fixed-window limiter keyed by the authenticated actor.
 * Must run after requireAuth. It is per process, which matches the single
 * Render instance in DEC-072; a multi-instance deployment needs a shared store.
 */
export function createActorRateLimit({
  max,
  windowMs,
  now = Date.now,
}: RateLimitOptions): RequestHandler {
  const counters = new Map<string, WindowCounter>();

  function sweepExpired(currentTime: number) {
    for (const [key, counter] of counters) {
      if (counter.resetAt <= currentTime) counters.delete(key);
    }
  }

  return (request, response, next) => {
    const actorId = request.actor?.id;
    if (!actorId) {
      next();
      return;
    }

    const currentTime = now();
    if (counters.size > SWEEP_THRESHOLD) sweepExpired(currentTime);

    let counter = counters.get(actorId);
    if (!counter || counter.resetAt <= currentTime) {
      counter = { count: 0, resetAt: currentTime + windowMs };
      counters.set(actorId, counter);
    }

    counter.count += 1;

    if (counter.count > max) {
      response.set("Retry-After", String(Math.ceil((counter.resetAt - currentTime) / 1000)));
      response.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please wait a moment and try again.",
        },
      });
      return;
    }

    next();
  };
}
