import type { DemoContext } from "./context.js";

export const GROUP_NAMES = ["North Life Group", "South Life Group", "Young Adults", "Eastside Families", "West Life Group", "Lakeside Life Group", "Central Life Group"];
export async function seedLifeGroups(context: DemoContext) {
  for (const [index, name] of GROUP_NAMES.entries()) {
    context.groups.push(await context.services.groups.create({ name, description: `Local demo: ${name} meets weekly for fellowship and prayer.`, leaderProfileId: context.actors[index + 1]!.id }));
  }
}
