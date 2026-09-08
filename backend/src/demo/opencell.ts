import { admin, type DemoContext } from "./context.js";
import { offsetDate } from "./dates.js";

export async function seedOpenCell(context: DemoContext) {
  const actor = context.actors[2]!; // church-wide Leader management
  const completed = await context.services.openCell.create(actor, { name: "OpenCell Foundations — Completed", description: "Local demo: 4/4, 3/4, 2/4 and late-enrollment 0/2 participation." });
  context.programmeIds.push(completed.id);
  for (let index = 0; index < 4; index++) await context.services.openCell.enroll(actor, completed.id, context.visitors[index]!.id, offsetDate(context.today, index === 3 ? -16 : -35));
  for (const [index, daysAgo] of [30, 23, 16, 9, 2].entries()) {
    const session = await context.services.openCell.createSession(actor, completed.id, { sessionDate: offsetDate(context.today, -daysAgo), title: `Foundations ${index + 1}`, location: "Horizon Small Hall", notes: null });
    if (index === 4) { await context.services.openCell.cancelSession(actor, completed.id, session.id); continue; }
    for (let participant = 0; participant < 3; participant++) {
      if (index < 4 - participant) await context.services.openCell.addAttendance(actor, completed.id, session.id, context.visitors[participant]!.id);
    }
  }
  context.finished = await context.services.openCell.finish(actor, completed.id);
  for (let index = 0; index < 2; index++) {
    const programme = await context.services.openCell.create(admin(context), { name: index === 0 ? "OpenCell New Beginnings" : "OpenCell Discovery", description: "Active local demo Programme with past and upcoming Sessions." });
    context.programmeIds.push(programme.id);
    const participants = index === 0 ? context.visitors.slice(2, 8) : context.visitors.slice(8, 13);
    // Includes a repeat participant after the previous Programme has finished.
    for (const visitor of participants) await context.services.openCell.enroll(actor, programme.id, visitor.id, offsetDate(context.today, -14));
    for (const [sessionIndex, offset] of [-12, -5, 1 + index, 10 + index, 17 + index].entries()) {
      const session = await context.services.openCell.createSession(actor, programme.id, { sessionDate: offsetDate(context.today, offset), title: `Discovery ${sessionIndex + 1}`, location: "Horizon Small Hall", notes: null });
      if (sessionIndex === 4) await context.services.openCell.cancelSession(actor, programme.id, session.id);
      if (offset < 0) for (const [participantIndex, visitor] of participants.entries()) {
        if ((participantIndex + sessionIndex) % 3 !== 0) await context.services.openCell.addAttendance(actor, programme.id, session.id, visitor.id);
      }
    }
  }
}
