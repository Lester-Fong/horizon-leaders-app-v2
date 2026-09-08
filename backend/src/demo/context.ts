import { createClient } from "@supabase/supabase-js";
import type { HorizonActor } from "../auth/types.js";
import { createSupabaseLifeGroupService } from "../life-groups/supabase-life-group-service.js";
import { createSupabaseMemberService } from "../members/supabase-member-service.js";
import { createSupabaseMinistryService } from "../ministries/supabase-ministry-service.js";
import { createSupabaseVisitorService } from "../visitors/supabase-visitor-service.js";
import { createSupabaseGatheringService } from "../gatherings/supabase-gathering-service.js";
import { createSupabaseEventService } from "../events/supabase-event-service.js";
import { createSupabaseHarvestService } from "../harvests/supabase-harvest-service.js";
import { createSupabaseOpenCellService } from "../opencell/supabase-opencell-service.js";
import { createSupabaseFollowUpService } from "../follow-ups/supabase-follow-up-service.js";
import type { Database } from "../types/database.types.js";
import type { Member } from "../members/types.js";
import type { Visitor } from "../visitors/types.js";
import type { LifeGroup } from "../life-groups/types.js";
import type { OpenCellFinishResult } from "../opencell/types.js";
import { churchDate, sundayDates } from "./dates.js";

export function createDemoContext(config: { supabaseUrl: string; serviceRoleKey: string }) {
  const db = createClient<Database>(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { fetch: (input, init) => fetch(input, { ...init, redirect: "error" }) },
  });
  const members = createSupabaseMemberService(config);
  return {
    config, db, today: churchDate(), sundays: sundayDates(churchDate()),
    services: {
      members,
      groups: createSupabaseLifeGroupService(config),
      ministries: createSupabaseMinistryService({ ...config, memberService: members }),
      visitors: createSupabaseVisitorService({ ...config, memberService: members }),
      gatherings: createSupabaseGatheringService(config),
      events: createSupabaseEventService(config),
      harvest: createSupabaseHarvestService({ ...config, memberService: members }),
      openCell: createSupabaseOpenCellService(config),
      followUps: createSupabaseFollowUpService(config),
    },
    actors: [] as HorizonActor[], groups: [] as LifeGroup[], members: [] as Member[],
    visitors: [] as Visitor[], finished: null as OpenCellFinishResult | null,
    serviceIds: [] as string[], gatheringIds: [] as string[], harvestIds: [] as string[],
    programmeIds: [] as string[], ministryIds: [] as string[],
  };
}
export type DemoContext = ReturnType<typeof createDemoContext>;
export function admin(context: DemoContext) { return context.actors[0]!; }

export function checkResult(result: { error: { code?: string | undefined } | null }, step: string) {
  // Never print raw Auth/PostgREST objects or configuration to terminal.
  if (result.error) throw new Error(`${step} failed (${result.error.code ?? "request error"}).`);
}

export async function assertEmptyDatabase(context: DemoContext) {
  const users = await context.db.auth.admin.listUsers({ page: 1, perPage: 1 });
  checkResult(users, "Checking local Auth users");
  if (users.data.users.length) throw new Error("Demo seed requires an empty local database; existing Auth users found. Nothing was changed. Use npm run demo:reset to discard disposable local data and reseed.");
  for (const table of ["profiles", "life_groups", "members", "visitors", "ministries", "events", "life_group_gatherings", "opencell_programmes", "follow_ups"] as const) {
    const result = await context.db.from(table).select("id", { count: "exact", head: true });
    checkResult(result, `Checking ${table}`);
    if (result.count !== 0) throw new Error(`Demo seed refused: ${table} contains existing data. Nothing was changed. Use npm run demo:reset only if you want to discard local data.`);
  }
}
