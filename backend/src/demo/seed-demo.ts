import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readDemoConfig, repositoryRoot } from "./config.js";
import { assertEmptyDatabase, createDemoContext } from "./context.js";
import { seedUsers } from "./users.js";
import { seedLifeGroups } from "./life-groups.js";
import { archiveDemoMembers, seedMembers } from "./members.js";
import { seedMinistries } from "./ministries.js";
import { convertDemoVisitors, seedVisitors } from "./visitors.js";
import { seedGatherings } from "./gatherings.js";
import { seedSundayServices } from "./sunday-services.js";
import { seedHarvest } from "./harvest.js";
import { seedOpenCell } from "./opencell.js";
import { seedFollowUpHistory } from "./follow-up.js";
import { verifyDemo } from "./verify.js";

async function resetLocalDatabase() {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("Run reset with npm run demo:reset from the repository root.");
  console.log("Resetting the disposable local Supabase database. ALL existing local data will be removed.");
  // Invoke the existing root script through Node (no Windows shell quoting,
  // global CLI, --linked flag, or caller-supplied reset arguments).
  await new Promise<void>((accept, reject) => {
    const child = spawn(process.execPath, [npmCli, "run", "supabase:reset"], { cwd: repositoryRoot, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? accept() : reject(new Error("Local Supabase reset failed; seeding was not started.")));
  });
}

export async function runDemo(args: string[]) {
  if (args.some((arg) => arg !== "--reset") || args.length > 1) throw new Error("Usage: npm run demo:seed or npm run demo:reset");
  const config = readDemoConfig(); // MUST happen before reset or any client creation.
  if (args.includes("--reset")) await resetLocalDatabase();
  const context = createDemoContext(config);
  await assertEmptyDatabase(context);
  const stages = [
    ["Auth users / Profiles", seedUsers], ["Life Groups", seedLifeGroups],
    ["Members", seedMembers], ["Ministries", seedMinistries], ["Visitors", seedVisitors],
    ["Gatherings", seedGatherings], ["Sunday Services / absence evaluation", seedSundayServices],
    ["Harvest / Sunday interest", seedHarvest], ["OpenCell / finish evaluation", seedOpenCell],
    ["Visitor conversion", convertDemoVisitors], ["Member archive", archiveDemoMembers],
    ["Follow Up history", seedFollowUpHistory],
  ] as const;
  for (const [name, seed] of stages) { console.log(`Seeding ${name}...`); await seed(context); }
  console.log("Verifying authentication, relationships, scenarios, and Dashboard...");
  const counts = await verifyDemo(context);
  console.log(`\nDemo seed complete (LOCAL ONLY)\n\nAdmin: admin@example.test / Admin123!Aa\nLeaders: leader1@example.test ... leader7@example.test\nLeader password: Leader123!Aa\n\nLife Groups: ${counts.life_groups}\nMembers: ${counts.members} (44 active, 2 archived)\nVisitors: ${counts.visitors} (16 active, 2 converted)\nMinistries: ${counts.ministries}\nGatherings: ${counts.life_group_gatherings}\nSunday Services: ${context.serviceIds.length}\nHarvest Events: ${context.harvestIds.length}\nOpenCell Programmes: ${counts.opencell_programmes}\nFollow Ups: ${counts.follow_ups}\n\nVerification passed. Use npm run demo:reset for a fresh demo dataset.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runDemo(process.argv.slice(2)).catch((error: unknown) => {
    console.error(`Demo seed failed: ${error instanceof Error ? error.message : "Database request failed"}`);
    console.error("No automatic cleanup was performed. If seeding had started, use npm run demo:reset to replace the partial disposable dataset.");
    process.exitCode = 1;
  });
}
