import { admin, type DemoContext } from "./context.js";

export async function seedMinistries(context: DemoContext) {
  for (const [index, name] of ["Worship", "Media", "Kids", "Ushers", "Community Outreach"].entries()) {
    const ministry = await context.services.ministries.create({ name, description: `Local demo: ${name} service team.` });
    context.ministryIds.push(ministry.id);
    for (const [memberIndex, member] of context.members.entries()) {
      if (memberIndex % 5 !== 0 && (memberIndex + index) % 3 === 0) await context.services.ministries.assignMember(admin(context), ministry.id, member.id);
    }
    if (index === 4) await context.services.ministries.archive(ministry.id);
  }
}
