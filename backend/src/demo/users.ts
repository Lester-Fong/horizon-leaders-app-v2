import { checkResult, type DemoContext } from "./context.js";

export const DEMO_ADMIN = { email: "admin@example.test", password: "Admin123!Aa", name: "Demo Admin" };
export const LEADER_PASSWORD = "Leader123!Aa";
export const LEADER_NAMES = ["Daniel Reyes", "Grace Santos", "Miguel Cruz", "Hannah Garcia", "Paolo Mendoza", "Ruth Navarro", "Elijah Tan"];

export async function seedUsers(context: DemoContext) {
  const accounts = [DEMO_ADMIN, ...LEADER_NAMES.map((name, index) => ({ name, email: `leader${index + 1}@example.test`, password: LEADER_PASSWORD }))];
  for (const [index, account] of accounts.entries()) {
    const result = await context.db.auth.admin.createUser({ ...account, user_metadata: { name: account.name }, email_confirm: true });
    checkResult(result, `Creating ${account.email}`);
    if (!result.data.user) throw new Error("Auth returned no demo user.");
    const role = index === 0 ? "admin" : "leader";
    checkResult(await context.db.from("profiles").update({ role, is_active: true }).eq("id", result.data.user.id), "Assigning demo role");
    context.actors.push({ id: result.data.user.id, name: account.name, role, isActive: true });
  }
}
