import { createClient } from "@supabase/supabase-js";

import type { HorizonActor } from "../auth/types.js";
import { MemberServiceError, type MemberService } from "../members/types.js";
import type { Database, Tables, TablesInsert, TablesUpdate } from "../types/database.types.js";
import {
  HarvestServiceError,
  type HarvestEvent,
  type HarvestParticipation,
  type HarvestService,
  type NewHarvestVisitorInput,
} from "./types.js";

interface Config { memberService: MemberService; serviceRoleKey: string; supabaseUrl: string }
type EventRow = Tables<"events">;

const EVENT_COLUMNS = "id, type, status, title, event_date, location, description, counts_for_absence, created_by_profile_id, created_at, updated_at";

function unavailable() {
  return new HarvestServiceError(500, "HARVEST_SERVICE_UNAVAILABLE", "Harvest data is temporarily unavailable.");
}
function notFound() {
  return new HarvestServiceError(404, "EVENT_NOT_FOUND", "Harvest Event was not found.");
}
function forbidden() {
  return new HarvestServiceError(403, "FORBIDDEN", "You do not have permission to perform this action.");
}

export function createSupabaseHarvestService({ memberService, serviceRoleKey, supabaseUrl }: Config): HarvestService {
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });

  async function eventRow(eventId: string) {
    const { data, error } = await supabase.from("events").select(EVENT_COLUMNS).eq("id", eventId).eq("type", "harvest").maybeSingle();
    if (error) throw unavailable();
    if (!data) throw notFound();
    return data;
  }

  async function hydrate(rows: EventRow[]): Promise<HarvestEvent[]> {
    if (rows.length === 0) return [];
    const eventIds = rows.map((row) => row.id);
    const profileIds = [...new Set(rows.map((row) => row.created_by_profile_id))];
    const [participations, profiles] = await Promise.all([
      supabase.from("harvest_participations").select("event_id").in("event_id", eventIds),
      supabase.from("profiles").select("id, name").in("id", profileIds),
    ]);
    if (participations.error || profiles.error) throw unavailable();
    const counts = new Map<string, number>();
    for (const row of participations.data) counts.set(row.event_id, (counts.get(row.event_id) ?? 0) + 1);
    const names = new Map(profiles.data.map((profile) => [profile.id, profile.name]));
    return rows.map((row) => ({
      countsForAbsence: false,
      createdAt: row.created_at,
      createdBy: { id: row.created_by_profile_id, name: names.get(row.created_by_profile_id) ?? "Unknown user" },
      description: row.description,
      eventDate: row.event_date,
      id: row.id,
      location: row.location,
      participationCount: counts.get(row.id) ?? 0,
      status: row.status,
      title: row.title,
      type: "harvest",
      updatedAt: row.updated_at,
    }));
  }

  async function hydrateOne(row: EventRow) {
    const [event] = await hydrate([row]);
    if (!event) throw unavailable();
    return event;
  }

  async function visitorConflictError(visitorId: string, status: "active" | "converted", field: "email" | "phone") {
    let details;
    if (status === "active") {
      const { data, error } = await supabase.from("visitors").select("first_name, last_name").eq("id", visitorId).maybeSingle();
      if (error) throw unavailable();
      if (data) details = { conflictField: field, existingVisitor: { id: visitorId, name: `${data.first_name} ${data.last_name}` } };
    }
    return new HarvestServiceError(
      409,
      "VISITOR_CONTACT_CONFLICT",
      status === "active" ? "An active Visitor already uses this contact. Register the existing Visitor instead." : "This contact belongs to a converted Visitor and cannot be registered again.",
      details ?? { conflictField: field },
    );
  }

  async function memberConflictError(actor: HorizonActor, memberId: string, field: "email" | "phone") {
    let conflictingMember;
    try {
      const member = await memberService.getById(actor, memberId);
      conflictingMember = { id: member.id, lifeGroup: member.lifeGroup.name, name: `${member.firstName} ${member.lastName}` };
    } catch (error) {
      if (!(error instanceof MemberServiceError) || error.status !== 404) throw unavailable();
    }
    return new HarvestServiceError(
      409,
      "MEMBER_CONTACT_CONFLICT",
      conflictingMember ? `This ${field} belongs to ${conflictingMember.name}, a Member in ${conflictingMember.lifeGroup}.` : `This ${field} belongs to an existing Member.`,
      { conflictField: field, ...(conflictingMember ? { conflictingMember } : {}) },
    );
  }

  async function mapConcurrentContactConflict(actor: HorizonActor, input: NewHarvestVisitorInput): Promise<never> {
    for (const field of ["email", "phone"] as const) {
      const value = input[field];
      if (!value) continue;
      const { data: normalized, error } = await supabase.rpc(field === "email" ? "normalize_member_email" : "normalize_member_phone", { value });
      if (error || !normalized) continue;
      const { data: visitor, error: visitorError } = await supabase.from("visitors").select("id, status").eq(`normalized_${field}`, normalized).maybeSingle();
      if (visitorError) throw unavailable();
      if (visitor) throw await visitorConflictError(visitor.id, visitor.status, field);
      const { data: member, error: memberError } = await supabase.from("members").select("id").eq(`normalized_${field}`, normalized).maybeSingle();
      if (memberError) throw unavailable();
      if (member) throw await memberConflictError(actor, member.id, field);
    }
    throw unavailable();
  }

  return {
    async list() {
      const { data, error } = await supabase.from("events").select(EVENT_COLUMNS).eq("type", "harvest").order("event_date", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw unavailable();
      return { events: await hydrate(data) };
    },
    async getById(_actor, eventId) { return hydrateOne(await eventRow(eventId)); },
    async create(actor, input) {
      if (actor.role !== "admin") throw forbidden();
      const insert: TablesInsert<"events"> = {
        counts_for_absence: false,
        created_by_profile_id: actor.id,
        description: input.description,
        event_date: input.eventDate,
        location: input.location,
        title: input.title,
        type: "harvest",
      };
      const { data, error } = await supabase.from("events").insert(insert).select(EVENT_COLUMNS).single();
      if (error) throw unavailable();
      return hydrateOne(data);
    },
    async update(actor, eventId, input) {
      if (actor.role !== "admin") throw forbidden();
      const event = await eventRow(eventId);
      if (input.eventDate !== undefined) {
        if (event.status === "closed") throw new HarvestServiceError(422, "EVENT_ACTIVITY_LOCKS_DATE", "A closed Harvest Event date cannot be changed.");
        const { count, error } = await supabase.from("harvest_participations").select("visitor_id", { count: "exact", head: true }).eq("event_id", eventId);
        if (error) throw unavailable();
        if ((count ?? 0) > 0) throw new HarvestServiceError(422, "EVENT_ACTIVITY_LOCKS_DATE", "Harvest Event date cannot change after participation begins.");
      }
      const update: TablesUpdate<"events"> = {};
      if (input.description !== undefined) update.description = input.description;
      if (input.eventDate !== undefined) update.event_date = input.eventDate;
      if (input.location !== undefined) update.location = input.location;
      if (input.title !== undefined) update.title = input.title;
      const { data, error } = await supabase.from("events").update(update).eq("id", eventId).select(EVENT_COLUMNS).single();
      if (error) throw unavailable();
      return hydrateOne(data);
    },
    async close(actor, eventId) {
      if (actor.role !== "admin") throw forbidden();
      const event = await eventRow(eventId);
      if (event.status === "closed") throw new HarvestServiceError(409, "EVENT_ALREADY_CLOSED", "Harvest Event is already closed.");
      const { data, error } = await supabase.from("events").update({ status: "closed" }).eq("id", eventId).eq("status", "open").select(EVENT_COLUMNS).maybeSingle();
      if (error) throw unavailable();
      if (!data) throw new HarvestServiceError(409, "EVENT_ALREADY_CLOSED", "Harvest Event is already closed.");
      return hydrateOne(data);
    },
    async listParticipations(_actor, eventId) {
      await eventRow(eventId);
      const { data: rows, error } = await supabase.from("harvest_participations").select("event_id, visitor_id, registered_by_profile_id, sunday_interest, interest_recorded_by_profile_id, interest_recorded_at, created_at").eq("event_id", eventId).order("created_at");
      if (error) throw unavailable();
      if (rows.length === 0) return { participations: [] };
      const visitorIds = rows.map((row) => row.visitor_id);
      const profileIds = [...new Set(rows.flatMap((row) => [row.registered_by_profile_id, row.interest_recorded_by_profile_id].filter((id): id is string => Boolean(id))))];
      const [visitors, profiles, followUps] = await Promise.all([
        supabase.from("visitors").select("id, first_name, last_name, phone, email, status").in("id", visitorIds),
        supabase.from("profiles").select("id, name").in("id", profileIds),
        supabase.from("follow_ups").select("id, visitor_id, status, created_at").eq("reason", "harvest_sunday_interest").in("visitor_id", visitorIds).order("created_at", { ascending: false }),
      ]);
      if (visitors.error || profiles.error || followUps.error) throw unavailable();
      const visitorsById = new Map(visitors.data.map((visitor) => [visitor.id, visitor]));
      const profileNames = new Map(profiles.data.map((profile) => [profile.id, profile.name]));
      const followUpsByVisitor = new Map<string, (typeof followUps.data)[number]>();
      for (const followUp of followUps.data) if (followUp.visitor_id && !followUpsByVisitor.has(followUp.visitor_id)) followUpsByVisitor.set(followUp.visitor_id, followUp);
      const participations = rows.map<HarvestParticipation>((row) => {
        const visitor = visitorsById.get(row.visitor_id);
        if (!visitor) throw unavailable();
        const followUp = followUpsByVisitor.get(row.visitor_id);
        return {
          createdAt: row.created_at,
          followUp: followUp ? { createdAt: followUp.created_at, id: followUp.id, status: followUp.status } : null,
          interestRecordedAt: row.interest_recorded_at,
          interestRecordedBy: row.interest_recorded_by_profile_id ? { id: row.interest_recorded_by_profile_id, name: profileNames.get(row.interest_recorded_by_profile_id) ?? "Unknown user" } : null,
          registeredBy: { id: row.registered_by_profile_id, name: profileNames.get(row.registered_by_profile_id) ?? "Unknown user" },
          sundayInterest: row.sunday_interest,
          visitor: { email: visitor.email, firstName: visitor.first_name, id: visitor.id, lastName: visitor.last_name, phone: visitor.phone, status: visitor.status },
        };
      });
      return { participations };
    },
    async registerExistingVisitor(actor, eventId, visitorId) {
      const event = await eventRow(eventId);
      if (event.status !== "open") throw new HarvestServiceError(409, "EVENT_CLOSED", "New participation cannot be registered after Harvest closes.");
      const { data: visitor, error } = await supabase.from("visitors").select("id, status").eq("id", visitorId).maybeSingle();
      if (error) throw unavailable();
      if (!visitor) throw new HarvestServiceError(404, "VISITOR_NOT_FOUND", "Visitor was not found.");
      if (visitor.status !== "active") throw new HarvestServiceError(422, "VISITOR_NOT_ELIGIBLE", "Only active Visitors can be newly registered for Harvest.");
      const insert: TablesInsert<"harvest_participations"> = { event_id: eventId, registered_by_profile_id: actor.id, visitor_id: visitorId };
      const { error: insertError } = await supabase.from("harvest_participations").insert(insert);
      if (insertError?.code === "23505") return { result: "already_registered", visitorId };
      if (insertError?.code === "23514") throw new HarvestServiceError(409, "EVENT_CLOSED", "New participation cannot be registered after Harvest closes.");
      if (insertError) throw unavailable();
      return { result: "registered", visitorId };
    },
    async registerNewVisitor(actor, eventId, input) {
      const event = await eventRow(eventId);
      if (event.status !== "open") throw new HarvestServiceError(409, "EVENT_CLOSED", "New participation cannot be registered after Harvest closes.");
      const { data, error } = await supabase.rpc("create_harvest_visitor_registration", {
        p_email: input.email ?? "",
        p_event_id: eventId,
        p_first_name: input.firstName,
        p_last_name: input.lastName,
        p_phone: input.phone ?? "",
        p_registered_by_profile_id: actor.id,
      });
      if (error?.code === "23505") return mapConcurrentContactConflict(actor, input);
      if (error) throw unavailable();
      const result = data[0];
      if (!result) throw unavailable();
      if (result.outcome === "registered" && result.created_visitor_id) return { result: "registered", visitorId: result.created_visitor_id };
      if (result.outcome === "member_conflict" && result.conflicting_member_id) throw await memberConflictError(actor, result.conflicting_member_id, result.conflict_field === "phone" ? "phone" : "email");
      if (result.outcome === "visitor_conflict" && result.conflicting_visitor_id && result.conflicting_visitor_status) throw await visitorConflictError(result.conflicting_visitor_id, result.conflicting_visitor_status, result.conflict_field === "phone" ? "phone" : "email");
      if (result.outcome === "event_closed") throw new HarvestServiceError(409, "EVENT_CLOSED", "New participation cannot be registered after Harvest closes.");
      if (result.outcome === "event_not_found" || result.outcome === "not_harvest") throw notFound();
      throw unavailable();
    },
    async recordInterest(actor, eventId, visitorId, interested) {
      await eventRow(eventId);
      const { data, error } = await supabase.rpc("record_harvest_sunday_interest", {
        p_event_id: eventId,
        p_interested: interested,
        p_recorded_by_profile_id: actor.id,
        p_visitor_id: visitorId,
      });
      if (error) throw unavailable();
      const result = data[0];
      if (!result) throw unavailable();
      if (result.outcome === "participation_not_found") throw new HarvestServiceError(404, "PARTICIPATION_NOT_FOUND", "Harvest participation was not found.");
      if (result.outcome === "interest_locked") throw new HarvestServiceError(409, "INTEREST_ALREADY_POSITIVE", "Positive Sunday interest cannot be reversed.");
      if (!["recorded_interested", "recorded_not_interested", "already_interested", "already_not_interested"].includes(result.outcome)) throw unavailable();
      return {
        followUpId: result.follow_up_id,
        followUpResult: result.follow_up_outcome === "created" || result.follow_up_outcome === "suppressed" ? result.follow_up_outcome : null,
        result: result.outcome as "recorded_interested" | "recorded_not_interested" | "already_interested" | "already_not_interested",
      };
    },
  };
}
