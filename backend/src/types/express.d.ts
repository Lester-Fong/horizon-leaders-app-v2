import type { HorizonActor } from "../auth/types.js";

declare global {
  namespace Express {
    interface Request {
      actor?: HorizonActor;
    }
  }
}

export {};
