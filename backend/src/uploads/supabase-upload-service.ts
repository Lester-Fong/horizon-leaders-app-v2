import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import type { HorizonActor } from "../auth/types.js";
import {
  UPLOAD_BUCKET,
  UPLOAD_SIGNED_URL_TTL_SECONDS,
} from "../config/constants.js";
import type { Database } from "../types/database.types.js";
import { removeImage, replaceImage } from "./image-lifecycle.js";
import { normalizeUploadedImage } from "./image-processor.js";
import {
  UploadServiceError,
  type ImageAsset,
  type ImageObjectStore,
  type UploadLogger,
  type UploadService,
} from "./types.js";

interface SupabaseUploadServiceConfig {
  generateObjectId?: () => string;
  logger?: UploadLogger;
  normalize?: (input: Buffer) => Promise<Buffer>;
  objectStore?: ImageObjectStore;
  serviceRoleKey: string;
  supabaseUrl: string;
}

const defaultLogger: UploadLogger = {
  error(message, context) {
    console.error(message, context);
  },
};

function unavailable() {
  return new UploadServiceError(
    500,
    "UPLOAD_SERVICE_UNAVAILABLE",
    "Image storage is temporarily unavailable.",
  );
}

function notFound(kind: "Member" | "Life Group" | "Event") {
  const code = kind === "Member"
    ? "MEMBER_NOT_FOUND"
    : kind === "Life Group"
      ? "LIFE_GROUP_NOT_FOUND"
      : "EVENT_NOT_FOUND";
  return new UploadServiceError(404, code, `${kind} was not found.`);
}

function forbidden(message = "You do not have permission to change this image.") {
  return new UploadServiceError(403, "FORBIDDEN", message);
}

export function createSupabaseUploadService({
  generateObjectId = randomUUID,
  logger = defaultLogger,
  normalize = normalizeUploadedImage,
  objectStore,
  serviceRoleKey,
  supabaseUrl,
}: SupabaseUploadServiceConfig): UploadService {
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  const storage: ImageObjectStore = objectStore ?? {
    async createSignedUrl(path) {
      const { data, error } = await supabase.storage
        .from(UPLOAD_BUCKET)
        .createSignedUrl(path, UPLOAD_SIGNED_URL_TTL_SECONDS);
      if (error) throw unavailable();
      return data.signedUrl;
    },
    async remove(path) {
      const { error } = await supabase.storage.from(UPLOAD_BUCKET).remove([path]);
      if (error) throw unavailable();
    },
    async upload(path, image) {
      const { error } = await supabase.storage.from(UPLOAD_BUCKET).upload(path, image, {
        cacheControl: "3600",
        contentType: "image/webp",
        upsert: false,
      });
      if (error) throw unavailable();
    },
  };

  async function signedAsset(path: string | null): Promise<ImageAsset> {
    if (!path) return { imageUrl: null };
    try {
      return { imageUrl: await storage.createSignedUrl(path) };
    } catch (error) {
      logger.error("Signed image URL could not be created.", {
        error: error instanceof Error ? error.message : "Unknown signing error",
        path,
      });
      return { imageUrl: null };
    }
  }

  async function leaderLifeGroup(actor: HorizonActor) {
    const { data, error } = await supabase
      .from("life_groups")
      .select("id, is_active")
      .eq("leader_profile_id", actor.id)
      .maybeSingle();
    if (error) throw unavailable();
    return data;
  }

  async function memberState(actor: HorizonActor, memberId: string) {
    if (actor.role === "admin") {
      const { data, error } = await supabase
        .from("members")
        .select("id, is_active, life_group_id, photo_path")
        .eq("id", memberId)
        .maybeSingle();
      if (error) throw unavailable();
      if (!data) throw notFound("Member");
      return data;
    }

    const lifeGroup = await leaderLifeGroup(actor);
    if (!lifeGroup?.is_active) throw notFound("Member");
    const { data, error } = await supabase
      .from("members")
      .select("id, is_active, life_group_id, photo_path")
      .eq("id", memberId)
      .eq("life_group_id", lifeGroup.id)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw unavailable();
    if (!data) throw notFound("Member");
    return data;
  }

  async function lifeGroupState(actor: HorizonActor, lifeGroupId: string) {
    const { data, error } = await supabase
      .from("life_groups")
      .select("id, is_active, logo_path")
      .eq("id", lifeGroupId)
      .maybeSingle();
    if (error) throw unavailable();
    if (!data || (actor.role === "leader" && !data.is_active)) {
      throw notFound("Life Group");
    }
    return data;
  }

  async function eventState(eventId: string) {
    const { data, error } = await supabase
      .from("events")
      .select("id, type, image_path")
      .eq("id", eventId)
      .in("type", ["service", "harvest"])
      .maybeSingle();
    if (error) throw unavailable();
    if (!data) throw notFound("Event");
    return data;
  }

  async function updateMemberPath(memberId: string, path: string | null) {
    const { data, error } = await supabase
      .from("members")
      .update({ photo_path: path })
      .eq("id", memberId)
      .select("id")
      .maybeSingle();
    if (error || !data) throw unavailable();
  }

  async function updateLifeGroupPath(lifeGroupId: string, path: string | null) {
    const { data, error } = await supabase
      .from("life_groups")
      .update({ logo_path: path })
      .eq("id", lifeGroupId)
      .select("id")
      .maybeSingle();
    if (error || !data) throw unavailable();
  }

  async function updateEventPath(eventId: string, path: string | null) {
    const { data, error } = await supabase
      .from("events")
      .update({ image_path: path })
      .eq("id", eventId)
      .select("id")
      .maybeSingle();
    if (error || !data) throw unavailable();
  }

  return {
    async getMemberPhoto(actor, memberId) {
      return signedAsset((await memberState(actor, memberId)).photo_path);
    },
    async replaceMemberPhoto(actor, memberId, input) {
      const member = await memberState(actor, memberId);
      const nextPath = `members/${member.id}/${generateObjectId()}.webp`;
      await replaceImage({
        currentPath: member.photo_path,
        input,
        logger,
        nextPath,
        normalize,
        objectStore: storage,
        setPath: (path) => updateMemberPath(member.id, path),
      });
      return signedAsset(nextPath);
    },
    async removeMemberPhoto(actor, memberId) {
      const member = await memberState(actor, memberId);
      await removeImage({
        currentPath: member.photo_path,
        logger,
        objectStore: storage,
        setPath: (path) => updateMemberPath(member.id, path),
      });
      return { imageUrl: null };
    },
    async getLifeGroupLogo(actor, lifeGroupId) {
      return signedAsset((await lifeGroupState(actor, lifeGroupId)).logo_path);
    },
    async replaceLifeGroupLogo(actor, lifeGroupId, input) {
      if (actor.role !== "admin") throw forbidden();
      const lifeGroup = await lifeGroupState(actor, lifeGroupId);
      const nextPath = `life-groups/${lifeGroup.id}/${generateObjectId()}.webp`;
      await replaceImage({
        currentPath: lifeGroup.logo_path,
        input,
        logger,
        nextPath,
        normalize,
        objectStore: storage,
        setPath: (path) => updateLifeGroupPath(lifeGroup.id, path),
      });
      return signedAsset(nextPath);
    },
    async removeLifeGroupLogo(actor, lifeGroupId) {
      if (actor.role !== "admin") throw forbidden();
      const lifeGroup = await lifeGroupState(actor, lifeGroupId);
      await removeImage({
        currentPath: lifeGroup.logo_path,
        logger,
        objectStore: storage,
        setPath: (path) => updateLifeGroupPath(lifeGroup.id, path),
      });
      return { imageUrl: null };
    },
    async getEventImage(_actor, eventId) {
      return signedAsset((await eventState(eventId)).image_path);
    },
    async replaceEventImage(actor, eventId, input) {
      if (actor.role !== "admin") throw forbidden();
      const event = await eventState(eventId);
      const nextPath = `events/${event.id}/${generateObjectId()}.webp`;
      await replaceImage({
        currentPath: event.image_path,
        input,
        logger,
        nextPath,
        normalize,
        objectStore: storage,
        setPath: (path) => updateEventPath(event.id, path),
      });
      return signedAsset(nextPath);
    },
    async removeEventImage(actor, eventId) {
      if (actor.role !== "admin") throw forbidden();
      const event = await eventState(eventId);
      await removeImage({
        currentPath: event.image_path,
        logger,
        objectStore: storage,
        setPath: (path) => updateEventPath(event.id, path),
      });
      return { imageUrl: null };
    },
  };
}
