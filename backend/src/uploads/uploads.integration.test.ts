import { randomBytes, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";

import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import { UPLOAD_BUCKET } from "../config/constants.js";
import type { Database } from "../types/database.types.js";
import { createSupabaseUploadService } from "./supabase-upload-service.js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(supabaseUrl && serviceRoleKey);
const localUrl = supabaseUrl ?? "http://127.0.0.1:54321";
const localKey = serviceRoleKey ?? "unavailable";
const describeLocal = configured ? describe : describe.skip;

describeLocal("private domain uploads with local Supabase", () => {
  const client = createClient<Database>(localUrl, localKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const userIds: string[] = [];
  const groupIds: string[] = [];
  const memberIds: string[] = [];
  const eventIds: string[] = [];

  afterEach(async () => {
    const paths: string[] = [];
    if (memberIds.length) {
      const { data } = await client.from("members").select("photo_path").in("id", memberIds);
      paths.push(...(data ?? []).flatMap(({ photo_path }) => photo_path ? [photo_path] : []));
      const { error } = await client.from("members").delete().in("id", memberIds);
      if (error) throw error;
      memberIds.length = 0;
    }
    if (eventIds.length) {
      const { data } = await client.from("events").select("image_path").in("id", eventIds);
      paths.push(...(data ?? []).flatMap(({ image_path }) => image_path ? [image_path] : []));
      const { error } = await client.from("events").delete().in("id", eventIds);
      if (error) throw error;
      eventIds.length = 0;
    }
    if (groupIds.length) {
      const { data } = await client.from("life_groups").select("logo_path").in("id", groupIds);
      paths.push(...(data ?? []).flatMap(({ logo_path }) => logo_path ? [logo_path] : []));
      const { error } = await client.from("life_groups").delete().in("id", groupIds);
      if (error) throw error;
      groupIds.length = 0;
    }
    if (paths.length) await client.storage.from(UPLOAD_BUCKET).remove(paths);
    for (const id of userIds.splice(0).reverse()) {
      const { error } = await client.auth.admin.deleteUser(id);
      if (error) throw error;
    }
  });

  async function profile(name: string, role: "admin" | "leader") {
    const { data, error } = await client.auth.admin.createUser({
      email: `uploads-${randomUUID()}@example.test`,
      email_confirm: true,
      password: `${randomUUID()}-Aa1!`,
      user_metadata: { name },
    });
    if (error || !data.user) throw error ?? new Error("Profile user was not created.");
    userIds.push(data.user.id);
    const { error: updateError } = await client.from("profiles").update({ role }).eq("id", data.user.id);
    if (updateError) throw updateError;
    return data.user.id;
  }

  async function group(name: string, leaderId: string, isActive = true) {
    const { data, error } = await client.from("life_groups").insert({
      is_active: isActive,
      leader_profile_id: leaderId,
      name,
    }).select("id").single();
    if (error) throw error;
    groupIds.push(data.id);
    return data.id;
  }

  async function member(firstName: string, lifeGroupId: string, isActive = true) {
    const { data, error } = await client.from("members").insert({
      first_name: firstName,
      is_active: isActive,
      last_name: "Upload Member",
      life_group_id: lifeGroupId,
      qr_token: randomBytes(32).toString("base64url"),
    }).select("id").single();
    if (error) throw error;
    memberIds.push(data.id);
    return data.id;
  }

  async function event(title: string, type: "service" | "harvest" | "other", adminId: string, status: "open" | "closed" = "open") {
    const { data, error } = await client.from("events").insert({
      counts_for_absence: type === "service",
      created_by_profile_id: adminId,
      event_date: "2026-09-20",
      status,
      title,
      type,
    }).select("id").single();
    if (error) throw error;
    eventIds.push(data.id);
    return data.id;
  }

  it("enforces private ownership, role scope, validation, replacement, and retention", async () => {
    const adminId = await profile("Upload Admin", "admin");
    const leaderAId = await profile("Upload Leader A", "leader");
    const leaderBId = await profile("Upload Leader B", "leader");
    const groupAId = await group("Upload Group A", leaderAId);
    const groupBId = await group("Upload Group B", leaderBId);
    const inactiveGroupId = await group("Inactive Upload Group", await profile("Inactive Leader", "leader"), false);
    const memberAId = await member("Ana", groupAId);
    const memberBId = await member("Ben", groupBId);
    const archivedMemberId = await member("Archived", groupAId, false);
    const serviceId = await event("Upload Service", "service", adminId);
    const harvestId = await event("Closed Upload Harvest", "harvest", adminId, "closed");
    const otherId = await event("Unsupported Other", "other", adminId);

    const actors: Record<string, HorizonActor> = {
      admin: { id: adminId, isActive: true, name: "Upload Admin", role: "admin" },
      leaderA: { id: leaderAId, isActive: true, name: "Upload Leader A", role: "leader" },
      leaderB: { id: leaderBId, isActive: true, name: "Upload Leader B", role: "leader" },
    };
    const authService: AuthService = {
      authenticate: async (token) => ({ actor: actors[token]!, ok: true }),
    };
    const uploadService = createSupabaseUploadService({ serviceRoleKey: localKey, supabaseUrl: localUrl });
    const app = createApp({ authService, uploadService });
    const api = (actor: string, method: "delete" | "get" | "put", path: string) =>
      request(app)[method](path).set("Authorization", `Bearer ${actor}`);

    const png = await sharp({ create: { background: "#111111", channels: 3, height: 24, width: 48 } }).png().toBuffer();
    const jpeg = await sharp({ create: { background: "#eeeeee", channels: 3, height: 32, width: 16 } }).jpeg().toBuffer();
    const webp = await sharp({ create: { background: "#777777", channels: 3, height: 18, width: 18 } }).webp().toBuffer();

    const memberPath = `/api/members/${memberAId}/photo`;
    const firstUpload = await api("leaderA", "put", memberPath)
      .attach("image", png, { contentType: "image/png", filename: "../../unsafe-name.png" });
    expect(firstUpload.status).toBe(200);
    expect(firstUpload.body.data.imageUrl).toContain("/storage/v1/object/sign/horizon-uploads/");
    expect(JSON.stringify(firstUpload.body)).not.toContain(localKey);
    const { data: firstMember } = await client.from("members").select("photo_path").eq("id", memberAId).single();
    expect(firstMember!.photo_path).toMatch(new RegExp(`^members/${memberAId}/[0-9a-f-]+\\.webp$`));
    expect(firstMember!.photo_path).not.toContain("unsafe-name");
    const downloaded = await fetch(firstUpload.body.data.imageUrl as string);
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers.get("content-type")).toContain("image/webp");
    const normalized = await sharp(Buffer.from(await downloaded.arrayBuffer())).metadata();
    expect(normalized).toMatchObject({ format: "webp", height: 24, width: 48 });
    expect(await fetch(`${localUrl}/storage/v1/object/public/${UPLOAD_BUCKET}/${firstMember!.photo_path}`)).not.toHaveProperty("status", 200);

    const replacement = await api("admin", "put", memberPath)
      .attach("image", jpeg, { contentType: "image/jpeg", filename: "replacement.jpg" });
    expect(replacement.status).toBe(200);
    const { data: replacedMember } = await client.from("members").select("photo_path").eq("id", memberAId).single();
    expect(replacedMember!.photo_path).not.toBe(firstMember!.photo_path);
    expect((await client.storage.from(UPLOAD_BUCKET).download(firstMember!.photo_path!)).error).not.toBeNull();

    expect((await api("leaderB", "get", memberPath)).status).toBe(404);
    expect((await api("leaderB", "put", memberPath).attach("image", png, "photo.png")).status).toBe(404);
    expect((await api("leaderA", "get", `/api/members/${memberBId}/photo`)).status).toBe(404);
    expect((await api("leaderA", "get", `/api/members/${archivedMemberId}/photo`)).status).toBe(404);
    expect((await api("admin", "put", `/api/members/${archivedMemberId}/photo`).attach("image", webp, "archived.webp")).status).toBe(200);
    expect((await api("admin", "get", `/api/members/${archivedMemberId}/photo`)).status).toBe(200);
    expect((await api("admin", "delete", memberPath)).body.data).toEqual({ imageUrl: null });
    expect((await client.from("members").select("photo_path").eq("id", memberAId).single()).data!.photo_path).toBeNull();

    const groupPath = `/api/life-groups/${groupAId}/logo`;
    expect((await api("admin", "put", groupPath).attach("image", png, "group.png")).status).toBe(200);
    expect((await api("leaderA", "get", groupPath)).status).toBe(200);
    expect((await api("leaderA", "put", groupPath).attach("image", png, "group.png")).status).toBe(403);
    expect((await api("leaderA", "delete", groupPath)).status).toBe(403);
    expect((await api("leaderA", "get", `/api/life-groups/${inactiveGroupId}/logo`)).status).toBe(404);
    expect((await api("admin", "put", `/api/life-groups/${inactiveGroupId}/logo`).attach("image", webp, "inactive.webp")).status).toBe(200);

    const servicePath = `/api/events/${serviceId}/image`;
    expect((await api("admin", "put", servicePath).attach("image", webp, "service.webp")).status).toBe(200);
    expect((await api("leaderA", "get", servicePath)).status).toBe(200);
    expect((await api("leaderA", "put", servicePath).attach("image", png, "service.png")).status).toBe(403);
    expect((await api("leaderA", "delete", servicePath)).status).toBe(403);
    expect((await api("admin", "put", `/api/events/${harvestId}/image`).attach("image", jpeg, "closed.jpg")).status).toBe(200);
    expect((await api("leaderA", "get", `/api/events/${harvestId}/image`)).status).toBe(200);
    expect((await api("admin", "get", `/api/events/${otherId}/image`)).status).toBe(404);

    expect((await api("admin", "put", memberPath).attach("image", Buffer.from("not an image"), { contentType: "image/jpeg", filename: "fake.jpg" })).body.error.code).toBe("INVALID_IMAGE");
    expect((await api("admin", "put", memberPath).attach("image", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>", "utf8"), { contentType: "image/svg+xml", filename: "image.svg" })).status).toBe(422);
    expect((await api("admin", "put", memberPath).attach("image", Buffer.alloc(0), { contentType: "image/png", filename: "empty.png" })).status).toBe(400);
    expect((await api("admin", "put", memberPath).attach("image", Buffer.alloc(5 * 1024 * 1024 + 1), { contentType: "image/png", filename: "large.png" })).status).toBe(413);

    const missingPath = `members/${memberAId}/${randomUUID()}.webp`;
    const { error: missingUpdateError } = await client.from("members").update({ photo_path: missingPath }).eq("id", memberAId);
    if (missingUpdateError) throw missingUpdateError;
    const missingResponse = await api("admin", "get", memberPath);
    expect(missingResponse.status).toBe(200);
    expect(missingResponse.body.data).toEqual({ imageUrl: null });
  });
});
