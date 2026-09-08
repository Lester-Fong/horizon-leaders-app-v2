import { admin, type DemoContext } from "./context.js";

export async function seedFollowUpHistory(context: DemoContext) {
  // All records originate from Sunday close, Harvest interest, or OpenCell finish.
  const active = await context.services.followUps.list(admin(context), "active");
  const example = active.find((row) => row.reason === "harvest_sunday_interest" && row.subject.id === context.visitors[2]!.id);
  if (!example) throw new Error("Expected generated Harvest Follow Up was not found.");
  await context.services.followUps.complete(context.actors[1]!, example.id, "Local demo: contacted by phone; Sunday visit arrangements discussed.");
}
