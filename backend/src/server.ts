import { createApp } from "./app.js";
import { createSupabaseAuthService } from "./auth/supabase-auth-service.js";
import { config } from "./config/environment.js";
import { createSupabaseGatheringService } from "./gatherings/supabase-gathering-service.js";
import { createSupabaseLifeGroupService } from "./life-groups/supabase-life-group-service.js";
import { createSupabaseMemberService } from "./members/supabase-member-service.js";
import { createSupabaseMinistryService } from "./ministries/supabase-ministry-service.js";
import { createSupabaseVisitorService } from "./visitors/supabase-visitor-service.js";

const authService = createSupabaseAuthService({
  serviceRoleKey: config.supabaseServiceRoleKey,
  supabaseUrl: config.supabaseUrl,
});
const lifeGroupService = createSupabaseLifeGroupService({
  serviceRoleKey: config.supabaseServiceRoleKey,
  supabaseUrl: config.supabaseUrl,
});
const gatheringService = createSupabaseGatheringService({
  serviceRoleKey: config.supabaseServiceRoleKey,
  supabaseUrl: config.supabaseUrl,
});
const memberService = createSupabaseMemberService({
  serviceRoleKey: config.supabaseServiceRoleKey,
  supabaseUrl: config.supabaseUrl,
});
const ministryService = createSupabaseMinistryService({
  memberService,
  serviceRoleKey: config.supabaseServiceRoleKey,
  supabaseUrl: config.supabaseUrl,
});
const visitorService = createSupabaseVisitorService({
  memberService,
  serviceRoleKey: config.supabaseServiceRoleKey,
  supabaseUrl: config.supabaseUrl,
});

const app = createApp({
  authService,
  frontendOrigin: config.frontendOrigin,
  gatheringService,
  lifeGroupService,
  memberService,
  ministryService,
  visitorService,
});

app.listen(config.port, () => {
  console.log(`Horizon API listening on port ${config.port}`);
});
