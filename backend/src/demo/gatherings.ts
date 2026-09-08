import { type DemoContext } from "./context.js";
import { offsetDate } from "./dates.js";

export async function seedGatherings(context: DemoContext) {
  for (const [groupIndex, group] of context.groups.entries()) {
    const actor = context.actors[groupIndex + 1]!;
    for (const [index, daysAgo] of [22, 15, 8, 1].entries()) {
      const gathering = await context.services.gatherings.create(actor, group.id, {
        gatheringDate: offsetDate(context.today, -daysAgo),
        title: ["Welcome and belonging", "Growing in faith", "Serving our neighbours", "Prayer and gratitude"][index]!,
        location: `${group.name} meeting home`, notes: "Shared a meal, reflected on the weekly passage, and prayed together.",
      });
      context.gatheringIds.push(gathering.id);
      for (const [memberIndex, member] of context.members.filter((value) => value.lifeGroup.id === group.id).entries()) {
        if ((memberIndex + index) % 4 !== 0) await context.services.gatherings.addAttendance(actor, group.id, gathering.id, member.id);
      }
      for (const visitor of context.visitors.filter((value) => value.lifeGroup?.id === group.id)) {
        await context.services.gatherings.addVisitorAttendance(actor, group.id, gathering.id, visitor.id);
      }
    }
  }
}
