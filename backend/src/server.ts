import { createApp } from "./app.js";
import { createSupabaseAuthService } from "./auth/supabase-auth-service.js";
import { config } from "./config/environment.js";
import { createSupabaseLifeGroupService } from "./life-groups/supabase-life-group-service.js";

const authService = createSupabaseAuthService({
  serviceRoleKey: config.supabaseServiceRoleKey,
  supabaseUrl: config.supabaseUrl,
});
const lifeGroupService = createSupabaseLifeGroupService({
  serviceRoleKey: config.supabaseServiceRoleKey,
  supabaseUrl: config.supabaseUrl,
});

const app = createApp({
  authService,
  frontendOrigin: config.frontendOrigin,
  lifeGroupService,
});

app.listen(config.port, () => {
  console.log(`Horizon API listening on port ${config.port}`);
});
