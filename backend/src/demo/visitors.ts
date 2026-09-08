import { admin, checkResult, type DemoContext } from "./context.js";
import { offsetDate } from "./dates.js";

const NAMES = ["Lucia Mercado", "Adrian Flores", "Bea Salazar", "Carlo Lim", "Diana Torres", "Ethan Domingo", "Faith Robles", "Gio Santiago", "Hazel Perez", "Ivan Soriano", "Julia Vega", "Kevin Alonzo", "Leah Valdez", "Mateo Rivera", "Nina Pascual", "Oscar Dizon", "Pia Angeles", "Simon David"];
export async function seedVisitors(context: DemoContext) {
  for (const [index, name] of NAMES.entries()) {
    let visitor = await context.services.visitors.create({
      firstName: name.split(" ")[0]!, lastName: name.split(" ")[1]!,
      email: index % 3 === 0 ? null : `visitor${index + 1}@example.test`,
      phone: index % 4 === 0 ? null : `0918${String(2000000 + index)}`,
    });
    if (index < 14) visitor = await context.services.visitors.setLifeGroup(admin(context), visitor.id, context.groups[index % 7]!.id);
    // Older participants existed for historical OpenCell; leave recent visitors
    // at their actual creation timestamp so This Month always has examples.
    if (index < 14) checkResult(await context.db.from("visitors").update({ created_at: `${offsetDate(context.today, -90)}T09:00:00+08:00` }).eq("id", visitor.id), "Dating Visitor base fixture");
    context.visitors.push(visitor);
  }
}

export async function convertDemoVisitors(context: DemoContext) {
  for (const index of [0, 1]) {
    const visitor = context.visitors[index]!;
    const result = await context.services.visitors.convert(admin(context), visitor.id, visitor.lifeGroup!.id);
    context.visitors[index] = result.visitor;
    context.members.push(result.member);
  }
}
