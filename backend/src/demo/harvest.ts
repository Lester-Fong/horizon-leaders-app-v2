import { admin, type DemoContext } from "./context.js";
import { offsetDate } from "./dates.js";

export async function seedHarvest(context: DemoContext) {
  const past = await context.services.harvest.create(admin(context), { title: "Neighbourhood Welcome Night", eventDate: offsetDate(context.today, -5), description: "Local demo: mixed Sunday interest after a shared meal.", location: "Community Centre" });
  context.harvestIds.push(past.id);
  for (const [index, visitor] of context.visitors.slice(0, 8).entries()) {
    await context.services.harvest.registerExistingVisitor(admin(context), past.id, visitor.id);
    if (index < 3) await context.services.harvest.recordInterest(context.actors[1]!, past.id, visitor.id, true);
    else if (index < 5) await context.services.harvest.recordInterest(context.actors[1]!, past.id, visitor.id, false);
  }
  await context.services.harvest.close(admin(context), past.id);
  const upcoming = await context.services.harvest.create(admin(context), { title: "Bring a Friend Dinner", eventDate: offsetDate(context.today, 8), description: "Upcoming local demo Harvest.", location: "Horizon Courtyard" });
  context.harvestIds.push(upcoming.id);
  for (const visitor of context.visitors.slice(8, 11)) await context.services.harvest.registerExistingVisitor(admin(context), upcoming.id, visitor.id);
}
