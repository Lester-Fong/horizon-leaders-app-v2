import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";

import type { HorizonActor } from "../auth/types.js";
import type { Database } from "../types/database.types.js";
import { churchDate } from "../config/church-date.js";
import { createSupabaseDashboardService } from "./supabase-dashboard-service.js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const suite = url && key ? describe : describe.skip;

suite("Dashboard OpenCell aggregation with local Supabase", () => {
  const db = createClient<Database>(url ?? "http://127.0.0.1:54321", key ?? "missing", {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const users: string[] = [];
  const programmeIds: string[] = [];
  const sessionIds: string[] = [];
  const visitorIds: string[] = [];

  afterEach(async () => {
    if (sessionIds.length) {
      await db.from("opencell_attendance").delete().in("session_id", sessionIds);
    }
    if (programmeIds.length) {
      await db.from("opencell_enrollments").delete().in("programme_id", programmeIds);
      await db.from("opencell_sessions").delete().in("id", sessionIds);
      await db.from("opencell_programmes").delete().in("id", programmeIds);
    }
    if (visitorIds.length) {
      await db.from("visitors").delete().in("id", visitorIds);
    }
    for (const userId of users.splice(0).reverse()) {
      await db.auth.admin.deleteUser(userId);
    }
    programmeIds.splice(0);
    sessionIds.splice(0);
    visitorIds.splice(0);
  });

  it("counts active participants and upcoming sessions beyond the first 100 programmes", async () => {
    const createdUser = await db.auth.admin.createUser({
      email: `dashboard-${Date.now()}@example.test`,
      email_confirm: true,
      password: "Dashboard-Aa1!",
    });
    if (createdUser.error || !createdUser.data.user) throw createdUser.error ?? new Error("User missing");
    const actorId = createdUser.data.user.id;
    users.push(actorId);
    const actor: HorizonActor = { id: actorId, isActive: true, name: "Dashboard Admin", role: "admin" };
    const service = createSupabaseDashboardService({ serviceRoleKey: key!, supabaseUrl: url! });
    const before = await service.get(actor, { period: "8" });

    const programmeRows = Array.from({ length: 101 }, (_, index) => ({
      name: index === 0 ? "Dashboard overflow target" : `Dashboard overflow ${index}`,
      description: null,
      status: "active" as const,
      created_by_profile_id: actorId,
      created_at: new Date(Date.UTC(2025, 0, 1 + index)).toISOString(),
    }));
    const inserted = await db.from("opencell_programmes").insert(programmeRows).select("id, name");
    if (inserted.error) throw inserted.error;
    programmeIds.push(...inserted.data.map((row) => row.id));
    const target = inserted.data.find((row) => row.name === "Dashboard overflow target");
    if (!target) throw new Error("Target Programme missing");

    const visitor = await db.from("visitors").insert({ first_name: "Dashboard", last_name: "Participant", status: "active" }).select("id").single();
    if (visitor.error) throw visitor.error;
    visitorIds.push(visitor.data.id);
    const enrollment = await db.from("opencell_enrollments").insert({
      programme_id: target.id,
      visitor_id: visitor.data.id,
      enrolled_on: churchDate(),
      enrolled_by_profile_id: actorId,
    });
    if (enrollment.error) throw enrollment.error;
    const session = await db.from("opencell_sessions").insert({ programme_id: target.id, session_date: churchDate(), title: "Overflow target session" }).select("id").single();
    if (session.error) throw session.error;
    sessionIds.push(session.data.id);

    const after = await service.get(actor, { period: "8" });
    expect(after.openCell.activeProgrammes).toBe(before.openCell.activeProgrammes + 101);
    expect(after.openCell.currentParticipants).toBe(before.openCell.currentParticipants + 1);
    expect(after.recentUpcoming.upcoming.some((item) => item.id === session.data.id)).toBe(true);
  });
});
