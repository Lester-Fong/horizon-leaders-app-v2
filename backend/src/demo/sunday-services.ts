import { SUNDAY_CONSECUTIVE_ABSENCE_THRESHOLD } from "../config/constants.js";
import { admin, type DemoContext } from "./context.js";
import { offsetDate } from "./dates.js";

export function attendsSunday(memberIndex: number, serviceIndex: number, groupIndex: number) {
  if (memberIndex === 0) return true;
  if (memberIndex === 1) return false;
  // Two runs broken by presence, both below the Follow Up threshold.
  if (memberIndex === 2) return serviceIndex % SUNDAY_CONSECUTIVE_ABSENCE_THRESHOLD === 0;
  if (serviceIndex === 0) return false; // genuine low attendance, not fake absence rows
  return (memberIndex * 3 + serviceIndex * 2 + groupIndex) % 11 < [8, 5, 9, 6][serviceIndex % 4]!;
}

export async function seedSundayServices(context: DemoContext) {
  for (const [index, date] of context.sundays.past.entries()) {
    const service = await context.services.events.create(admin(context), { title: `Sunday Service · ${date}`, eventDate: date, countsForAbsence: true, location: "Horizon Main Hall", description: "Local demo: varied presence with frozen close-time eligibility." });
    context.serviceIds.push(service.id);
    for (const [memberIndex, member] of context.members.entries()) {
      const groupIndex = context.groups.findIndex((group) => group.id === member.lifeGroup.id);
      if (attendsSunday(memberIndex, index, groupIndex)) await context.services.events.addAttendance(admin(context), service.id, member.id);
    }
    if (index === 11) for (const visitor of context.visitors.slice(0, 3)) await context.services.events.registerExistingVisitor(admin(context), service.id, visitor.id);
    await context.services.events.close(admin(context), service.id);
  }
  const excluded = await context.services.events.create(admin(context), { title: "Community Thanksgiving (excluded)", eventDate: offsetDate(context.today, -3), countsForAbsence: false, location: "Horizon Main Hall", description: "Does not count toward Sunday absence." });
  await context.services.events.addAttendance(admin(context), excluded.id, context.members[0]!.id);
  await context.services.events.close(admin(context), excluded.id);
  context.serviceIds.push(excluded.id);
  const open = await context.services.events.create(admin(context), { title: "Upcoming Sunday Service", eventDate: context.sundays.upcoming, countsForAbsence: true, location: "Horizon Main Hall", description: "Open for manual and QR check-in testing." });
  context.serviceIds.push(open.id);
}
