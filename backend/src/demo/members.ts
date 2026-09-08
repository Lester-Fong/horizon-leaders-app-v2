import { admin, checkResult, type DemoContext } from "./context.js";
import { birthDateForAge, offsetDate } from "./dates.js";

const FIRST_NAMES = ["Ana", "Marco", "Isabel", "Gabriel", "Sofia", "Noah", "Camille", "Luis", "Elena", "Joshua", "Mara", "Caleb", "Esther", "Rafael", "Clara", "Samuel"];
const LAST_NAMES = ["Dela Cruz", "Bautista", "Villanueva", "Ramos", "Aquino", "Castillo", "Fernandez"];
const AGES = [15, 21, 29, 39, 49, 64, null];
export async function seedMembers(context: DemoContext) {
  for (const [groupIndex, group] of context.groups.entries()) {
    for (let index = 0; index < 5 + groupIndex % 4; index++) {
      const serial = context.members.length;
      const age = AGES[serial % AGES.length];
      const member = await context.services.members.create(admin(context), {
        firstName: FIRST_NAMES[serial % FIRST_NAMES.length]!, lastName: LAST_NAMES[groupIndex]!,
        email: serial % 4 === 0 ? null : `member${serial + 1}@example.test`,
        phone: serial % 3 === 0 ? null : `0917${String(1000000 + serial)}`,
        address: serial % 3 === 0 ? null : `${12 + serial} Mabini Street, Quezon City`,
        birthDate: age == null ? null : birthDateForAge(context.today, age),
        gender: serial % 3 === 0 ? null : serial % 3 === 1 ? "female" : "male",
        lifeGroupId: group.id,
      });
      context.members.push(member);
    }
  }
  // Base-record fixture time: Members existed before the historical Services.
  // It must be set BEFORE attendance/closing, never by editing frozen snapshots.
  const createdAt = `${offsetDate(context.sundays.past[0]!, -30)}T09:00:00+08:00`;
  checkResult(await context.db.from("members").update({ created_at: createdAt }).in("id", context.members.map((member) => member.id)), "Dating base Member fixtures");
}

export async function archiveDemoMembers(context: DemoContext) {
  // Archive after history/Ministry assignment: those relationships must survive.
  for (const index of [context.members.length - 1, context.members.length - 3]) {
    const member = context.members[index]!;
    context.members[index] = await context.services.members.archive(member.id);
  }
}
