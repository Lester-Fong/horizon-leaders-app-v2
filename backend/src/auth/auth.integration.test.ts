import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import type { Database } from "../types/database.types.js";
import { createSupabaseAuthService } from "./supabase-auth-service.js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publicKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
const hasLocalIntegrationConfig = Boolean(
  supabaseUrl && serviceRoleKey && publicKey,
);
const integrationSupabaseUrl = supabaseUrl ?? "http://127.0.0.1:54321";
const integrationServiceRoleKey = serviceRoleKey ?? "integration-key-unavailable";
const integrationPublicKey = publicKey ?? "integration-key-unavailable";

const describeWithLocalSupabase = hasLocalIntegrationConfig
  ? describe
  : describe.skip;

describeWithLocalSupabase("local Supabase Auth integration", () => {
  const adminClient = createClient<Database>(
    integrationSupabaseUrl,
    integrationServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  let createdUserId: string | undefined;

  afterEach(async () => {
    if (createdUserId) {
      const { error } = await adminClient.auth.admin.deleteUser(createdUserId);
      createdUserId = undefined;

      if (error) {
        throw error;
      }
    }
  });

  it("proves Supabase password auth through Express to the triggered profile", async () => {
    const uniqueId = randomUUID();
    const email = `phase2-${uniqueId}@example.test`;
    const password = `${randomUUID()}-Aa1!`;
    const displayName = "Phase 2 Integration Leader";

    const { data: createdUser, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        email_confirm: true,
        password,
        user_metadata: { name: displayName },
      });

    expect(createError).toBeNull();
    expect(createdUser.user).not.toBeNull();
    createdUserId = createdUser.user!.id;

    const browserClient = createClient<Database>(
      integrationSupabaseUrl,
      integrationPublicKey,
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    );
    const { data: signInData, error: signInError } =
      await browserClient.auth.signInWithPassword({ email, password });

    expect(signInError).toBeNull();
    expect(signInData.session).not.toBeNull();

    const authService = createSupabaseAuthService({
      serviceRoleKey: integrationServiceRoleKey,
      supabaseUrl: integrationSupabaseUrl,
    });
    const response = await request(createApp({ authService }))
      .get("/api/me")
      .set("Authorization", `Bearer ${signInData.session!.access_token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        id: createdUserId,
        isActive: true,
        name: displayName,
        role: "leader",
      },
    });
  });
});
