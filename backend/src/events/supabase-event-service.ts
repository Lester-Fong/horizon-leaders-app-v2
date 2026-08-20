import { createClient } from "@supabase/supabase-js";

import type { HorizonActor } from "../auth/types.js";
import type { Database, Tables, TablesInsert, TablesUpdate } from "../types/database.types.js";
import {
  EventServiceError,
  type EventService,
  type NewSundayVisitorInput,
  type SundayAttendanceMember,
  type SundayService,
  type SundayVisitorRegistration,
} from "./types.js";

interface Config { serviceRoleKey: string; supabaseUrl: string }
type EventRow = Tables<"events">;
type MemberRow = Pick<Tables<"members">, "created_at" | "email" | "first_name" | "id" | "is_active" | "last_name" | "life_group_id" | "phone">;

const EVENT_COLUMNS = "id, type, status, title, event_date, location, description, counts_for_absence, created_by_profile_id, created_at, updated_at";
const MEMBER_COLUMNS = "id, first_name, last_name, phone, email, life_group_id, is_active, created_at";

function unavailable() {
  return new EventServiceError(500, "EVENT_SERVICE_UNAVAILABLE", "Sunday Service data is temporarily unavailable.");
}
function notFound() {
  return new EventServiceError(404, "EVENT_NOT_FOUND", "Sunday Service was not found.");
}
function forbidden(message = "You do not have permission to perform this action.") {
  return new EventServiceError(403, "FORBIDDEN", message);
}
function manilaDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit", month: "2-digit", timeZone: "Asia/Manila", year: "numeric",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function isEligibleOn(member: MemberRow, eventDate: string) {
  return member.is_active && manilaDate(member.created_at) <= eventDate;
}

export function createSupabaseEventService({ serviceRoleKey, supabaseUrl }: Config): EventService {
  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });

  async function leaderGroupId(actor: HorizonActor) {
    if (actor.role === "admin") return undefined;
    const { data, error } = await supabase.from("life_groups").select("id").eq("leader_profile_id", actor.id).maybeSingle();
    if (error) throw unavailable();
    if (!data) throw forbidden("A current Life Group assignment is required.");
    return data.id;
  }

  async function eventRow(eventId: string) {
    const { data, error } = await supabase.from("events").select(EVENT_COLUMNS).eq("id", eventId).eq("type", "service").maybeSingle();
    if (error) throw unavailable();
    if (!data) throw notFound();
    return data;
  }

  async function counts(eventIds: string[], table: "sunday_service_presence" | "sunday_service_eligibility" | "sunday_service_visitor_registrations") {
    const result = new Map<string, number>();
    if (eventIds.length === 0) return result;
    const { data, error } = await supabase.from(table).select("event_id").in("event_id", eventIds);
    if (error) throw unavailable();
    for (const row of data) result.set(row.event_id, (result.get(row.event_id) ?? 0) + 1);
    return result;
  }

  async function hydrate(rows: EventRow[]): Promise<SundayService[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const profileIds = [...new Set(rows.map((row) => row.created_by_profile_id))];
    const [attendance, eligibility, visitors, profilesResult] = await Promise.all([
      counts(ids, "sunday_service_presence"), counts(ids, "sunday_service_eligibility"),
      counts(ids, "sunday_service_visitor_registrations"),
      supabase.from("profiles").select("id, name").in("id", profileIds),
    ]);
    if (profilesResult.error) throw unavailable();
    const names = new Map(profilesResult.data.map((profile) => [profile.id, profile.name]));
    return rows.map((row) => ({
      attendanceCount: attendance.get(row.id) ?? 0,
      countsForAbsence: row.counts_for_absence,
      createdAt: row.created_at,
      createdBy: { id: row.created_by_profile_id, name: names.get(row.created_by_profile_id) ?? "Unknown user" },
      description: row.description,
      eligibilityCount: eligibility.get(row.id) ?? 0,
      eventDate: row.event_date,
      id: row.id,
      location: row.location,
      status: row.status,
      title: row.title,
      updatedAt: row.updated_at,
      visitorCount: visitors.get(row.id) ?? 0,
    }));
  }

  async function hydrateOne(row: EventRow) {
    const [event] = await hydrate([row]);
    if (!event) throw unavailable();
    return event;
  }

  async function groupNames(ids: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map<string, string>();
    const { data, error } = await supabase.from("life_groups").select("id, name").in("id", unique);
    if (error) throw unavailable();
    return new Map(data.map((row) => [row.id, row.name]));
  }

  async function attendanceRows(actor: HorizonActor, event: EventRow) {
    const groupId = await leaderGroupId(actor);
    const { data: presence, error: presenceError } = await supabase.from("sunday_service_presence").select("member_id").eq("event_id", event.id);
    if (presenceError) throw unavailable();
    const present = new Set(presence.map((row) => row.member_id));
    let members: MemberRow[];
    let snapshotGroups = new Map<string, string>();
    if (event.status === "closed") {
      let snapshotQuery = supabase.from("sunday_service_eligibility").select("member_id, life_group_id_at_close").eq("event_id", event.id);
      if (groupId) snapshotQuery = snapshotQuery.eq("life_group_id_at_close", groupId);
      const { data: snapshot, error } = await snapshotQuery;
      if (error) throw unavailable();
      if (snapshot.length === 0) return [];
      snapshotGroups = new Map(snapshot.map((row) => [row.member_id, row.life_group_id_at_close]));
      const { data, error: membersError } = await supabase.from("members").select(MEMBER_COLUMNS).in("id", snapshot.map((row) => row.member_id));
      if (membersError) throw unavailable();
      members = data;
    } else {
      let memberQuery = supabase.from("members").select(MEMBER_COLUMNS).eq("is_active", true);
      if (groupId) memberQuery = memberQuery.eq("life_group_id", groupId);
      const { data, error } = await memberQuery;
      if (error) throw unavailable();
      members = data.filter((member) => isEligibleOn(member, event.event_date));
    }
    const scopedGroupIds = members.map((member) => snapshotGroups.get(member.id) ?? member.life_group_id);
    const names = await groupNames(scopedGroupIds);
    return members.map<SundayAttendanceMember>((member) => {
      const lifeGroupId = snapshotGroups.get(member.id) ?? member.life_group_id;
      const isPresent = present.has(member.id);
      const attendanceStatus = isPresent ? "present" : event.status === "open" ? "not_checked_in" : event.counts_for_absence ? "absent" : "not_counted";
      return {
        attendanceStatus, email: member.email, firstName: member.first_name, id: member.id,
        isActive: member.is_active, isPresent, lastName: member.last_name,
        lifeGroup: { id: lifeGroupId, name: names.get(lifeGroupId) ?? "Unknown Life Group" }, phone: member.phone,
      };
    }).sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
  }

  async function eligibleMember(actor: HorizonActor, event: EventRow, memberId: string) {
    const groupId = await leaderGroupId(actor);
    const { data, error } = await supabase.from("members").select(MEMBER_COLUMNS).eq("id", memberId).maybeSingle();
    if (error) throw unavailable();
    if (!data) throw new EventServiceError(404, "MEMBER_NOT_FOUND", "Member was not found.");
    if (event.status === "open") {
      if (!isEligibleOn(data, event.event_date) || (groupId && data.life_group_id !== groupId)) {
        throw new EventServiceError(404, "MEMBER_NOT_ELIGIBLE", "Member is not eligible for this Sunday Service.");
      }
    } else {
      if (actor.role !== "admin") throw forbidden("Closed Service attendance is read-only for Leaders.");
      const { data: snapshot, error: snapshotError } = await supabase.from("sunday_service_eligibility").select("member_id").eq("event_id", event.id).eq("member_id", memberId).maybeSingle();
      if (snapshotError) throw unavailable();
      if (!snapshot) throw new EventServiceError(422, "MEMBER_NOT_ELIGIBLE", "Only Members in the close-time eligibility snapshot can be corrected.");
    }
    return data;
  }

  async function recordPresence(actor: HorizonActor, event: EventRow, memberId: string) {
    await eligibleMember(actor, event, memberId);
    const insert: TablesInsert<"sunday_service_presence"> = { event_id: event.id, member_id: memberId };
    const { error } = await supabase.from("sunday_service_presence").insert(insert);
    if (error?.code === "23505") return { memberId, result: "already_present" as const };
    if (error) throw unavailable();
    return { memberId, result: "recorded" as const };
  }

  async function assertVisitorMutation(actor: HorizonActor, event: EventRow) {
    if (event.status === "closed" && actor.role !== "admin") throw forbidden("Closed Service registrations are read-only for Leaders.");
  }

  async function visitorConflictError(visitorId: string, status: "active" | "converted", field: "email" | "phone") {
    let details;
    if (status === "active") {
      const { data, error } = await supabase.from("visitors").select("first_name, last_name").eq("id", visitorId).maybeSingle();
      if (error) throw unavailable();
      if (data) details = { conflictField: field, existingVisitor: { id: visitorId, name: `${data.first_name} ${data.last_name}` } };
    }
    return new EventServiceError(409, "VISITOR_CONTACT_CONFLICT", status === "active" ? "An active Visitor already uses this contact. Register the existing Visitor instead." : "This contact belongs to a converted Visitor and cannot be registered again.", details);
  }

  async function mapConcurrentContactConflict(input: NewSundayVisitorInput): Promise<never> {
    for (const [field, value, normalizer] of [
      ["email", input.email, "normalize_member_email"],
      ["phone", input.phone, "normalize_member_phone"],
    ] as const) {
      if (!value) continue;
      const normalized = await supabase.rpc(normalizer, { value });
      if (normalized.error) throw unavailable();
      if (!normalized.data) continue;
      const { data: visitor, error: visitorError } = await supabase.from("visitors").select("id, status").eq(`normalized_${field}`, normalized.data).maybeSingle();
      if (visitorError) throw unavailable();
      if (visitor) throw await visitorConflictError(visitor.id, visitor.status, field);
      const { data: member, error: memberError } = await supabase.from("members").select("id").eq(`normalized_${field}`, normalized.data).maybeSingle();
      if (memberError) throw unavailable();
      if (member) throw new EventServiceError(409, "MEMBER_CONTACT_CONFLICT", `This ${field} belongs to a Member. Use Member check-in instead.`, { conflictField: field });
    }
    throw unavailable();
  }

  return {
    async list() {
      const { data, error } = await supabase.from("events").select(EVENT_COLUMNS).eq("type", "service").order("event_date", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw unavailable();
      return { events: await hydrate(data) };
    },
    async getById(_actor, eventId) { return hydrateOne(await eventRow(eventId)); },
    async create(actor, input) {
      if (actor.role !== "admin") throw forbidden();
      const insert: TablesInsert<"events"> = { counts_for_absence: input.countsForAbsence, created_by_profile_id: actor.id, description: input.description, event_date: input.eventDate, location: input.location, title: input.title, type: "service" };
      const { data, error } = await supabase.from("events").insert(insert).select(EVENT_COLUMNS).single();
      if (error?.code === "23505") throw new EventServiceError(409, "EVENT_DATE_CONFLICT", "A counting Sunday Service already exists on this date.");
      if (error?.code === "23514") throw new EventServiceError(422, "EVENT_DATE_INVALID", "Counting Services must use a Sunday date.");
      if (error) throw unavailable();
      return hydrateOne(data);
    },
    async update(actor, eventId, input) {
      if (actor.role !== "admin") throw forbidden();
      const event = await eventRow(eventId);
      if (input.eventDate !== undefined) {
        if (event.status === "closed") throw new EventServiceError(422, "EVENT_ACTIVITY_LOCKS_DATE", "A closed Service date cannot be changed.");
        const [presence, visitors] = await Promise.all([
          supabase.from("sunday_service_presence").select("member_id", { count: "exact", head: true }).eq("event_id", eventId),
          supabase.from("sunday_service_visitor_registrations").select("visitor_id", { count: "exact", head: true }).eq("event_id", eventId),
        ]);
        if (presence.error || visitors.error) throw unavailable();
        if ((presence.count ?? 0) > 0 || (visitors.count ?? 0) > 0) throw new EventServiceError(422, "EVENT_ACTIVITY_LOCKS_DATE", "Service date cannot change after attendance or Visitor registration begins.");
      }
      const update: TablesUpdate<"events"> = {};
      if (input.countsForAbsence !== undefined) update.counts_for_absence = input.countsForAbsence;
      if (input.description !== undefined) update.description = input.description;
      if (input.eventDate !== undefined) update.event_date = input.eventDate;
      if (input.location !== undefined) update.location = input.location;
      if (input.title !== undefined) update.title = input.title;
      const { data, error } = await supabase.from("events").update(update).eq("id", eventId).select(EVENT_COLUMNS).single();
      if (error?.code === "23505") throw new EventServiceError(409, "EVENT_DATE_CONFLICT", "A counting Sunday Service already exists on this date.");
      if (error?.code === "23514") throw new EventServiceError(422, "EVENT_DATE_INVALID", "Counting Services must use a Sunday date.");
      if (error) throw unavailable();
      return hydrateOne(data);
    },
    async close(actor, eventId) {
      if (actor.role !== "admin") throw forbidden();
      await eventRow(eventId);
      const { data, error } = await supabase.rpc("close_sunday_service", { p_event_id: eventId });
      if (error) throw unavailable();
      const outcome = data[0]?.outcome;
      if (outcome === "already_closed") throw new EventServiceError(409, "EVENT_ALREADY_CLOSED", "Sunday Service is already closed.");
      if (outcome !== "closed") throw unavailable();
      return hydrateOne(await eventRow(eventId));
    },
    async getAttendance(actor, eventId) { return { members: await attendanceRows(actor, await eventRow(eventId)) }; },
    async addAttendance(actor, eventId, memberId) { return recordPresence(actor, await eventRow(eventId), memberId); },
    async addAttendanceByQr(actor, eventId, qrToken) {
      const event = await eventRow(eventId);
      const { data, error } = await supabase.from("members").select("id").eq("qr_token", qrToken).maybeSingle();
      if (error) throw unavailable();
      if (!data) throw new EventServiceError(404, "MEMBER_NOT_FOUND", "No eligible Member was found for that QR token.");
      const result = await recordPresence(actor, event, data.id);
      const member = (await attendanceRows(actor, event)).find((entry) => entry.id === data.id);
      if (!member) throw new EventServiceError(404, "MEMBER_NOT_ELIGIBLE", "No eligible Member was found for that QR token.");
      return { member, result: result.result };
    },
    async removeAttendance(actor, eventId, memberId) {
      const event = await eventRow(eventId);
      await eligibleMember(actor, event, memberId);
      const { data, error } = await supabase.from("sunday_service_presence").delete().eq("event_id", eventId).eq("member_id", memberId).select("member_id").maybeSingle();
      if (error) throw unavailable();
      if (!data) throw new EventServiceError(404, "ATTENDANCE_NOT_FOUND", "Member is not marked present.");
      return { memberId, result: "removed" };
    },
    async listVisitors(_actor, eventId) {
      await eventRow(eventId);
      const { data: rows, error } = await supabase.from("sunday_service_visitor_registrations").select("visitor_id, registered_by_profile_id, created_at").eq("event_id", eventId).order("created_at");
      if (error) throw unavailable();
      if (rows.length === 0) return { registrations: [] };
      const visitorIds = rows.map((row) => row.visitor_id);
      const actorIds = [...new Set(rows.map((row) => row.registered_by_profile_id))];
      const [visitorsResult, actorsResult] = await Promise.all([
        supabase.from("visitors").select("id, first_name, last_name, phone, email, status").in("id", visitorIds),
        supabase.from("profiles").select("id, name").in("id", actorIds),
      ]);
      if (visitorsResult.error || actorsResult.error) throw unavailable();
      const visitors = new Map(visitorsResult.data.map((row) => [row.id, row]));
      const actors = new Map(actorsResult.data.map((row) => [row.id, row.name]));
      const registrations = rows.map<SundayVisitorRegistration>((row) => {
        const visitor = visitors.get(row.visitor_id);
        if (!visitor) throw unavailable();
        return { createdAt: row.created_at, registeredBy: { id: row.registered_by_profile_id, name: actors.get(row.registered_by_profile_id) ?? "Unknown user" }, visitor: { email: visitor.email, firstName: visitor.first_name, id: visitor.id, lastName: visitor.last_name, phone: visitor.phone, status: visitor.status } };
      });
      return { registrations };
    },
    async registerExistingVisitor(actor, eventId, visitorId) {
      const event = await eventRow(eventId);
      await assertVisitorMutation(actor, event);
      const { data: visitor, error } = await supabase.from("visitors").select("id, status, created_at").eq("id", visitorId).maybeSingle();
      if (error) throw unavailable();
      if (!visitor) throw new EventServiceError(404, "VISITOR_NOT_FOUND", "Visitor was not found.");
      if (visitor.status !== "active" || (event.status === "closed" && manilaDate(visitor.created_at) > event.event_date)) throw new EventServiceError(422, "VISITOR_NOT_ELIGIBLE", "Only active Visitors who existed by the Service date can be registered.");
      const insert: TablesInsert<"sunday_service_visitor_registrations"> = { event_id: eventId, registered_by_profile_id: actor.id, visitor_id: visitorId };
      const { error: insertError } = await supabase.from("sunday_service_visitor_registrations").insert(insert);
      if (insertError?.code === "23505") return { result: "already_registered", visitorId };
      if (insertError) throw unavailable();
      return { result: "registered", visitorId };
    },
    async registerNewVisitor(actor, eventId, input: NewSundayVisitorInput) {
      const event = await eventRow(eventId);
      if (event.status !== "open") throw new EventServiceError(409, "EVENT_CLOSED", "New Visitors cannot be created from a closed Service.");
      const { data, error } = await supabase.rpc("create_sunday_visitor_registration", {
        p_email: input.email ?? "",
        p_event_id: eventId,
        p_first_name: input.firstName,
        p_last_name: input.lastName,
        p_phone: input.phone ?? "",
        p_registered_by_profile_id: actor.id,
      });
      if (error?.code === "23505") return mapConcurrentContactConflict(input);
      if (error) throw unavailable();
      const result = data[0];
      if (!result) throw unavailable();
      if (result.outcome === "registered" && result.created_visitor_id) return { result: "registered", visitorId: result.created_visitor_id };
      if (result.outcome === "member_conflict") throw new EventServiceError(409, "MEMBER_CONTACT_CONFLICT", `This ${result.conflict_field ?? "contact"} belongs to a Member. Use Member check-in instead.`, { conflictField: result.conflict_field === "phone" ? "phone" : "email" });
      if (result.outcome === "visitor_conflict" && result.conflicting_visitor_id && result.conflicting_visitor_status) throw await visitorConflictError(result.conflicting_visitor_id, result.conflicting_visitor_status, result.conflict_field === "phone" ? "phone" : "email");
      if (result.outcome === "event_closed") throw new EventServiceError(409, "EVENT_CLOSED", "New Visitors cannot be created from a closed Service.");
      throw unavailable();
    },
    async removeVisitor(actor, eventId, visitorId) {
      const event = await eventRow(eventId);
      await assertVisitorMutation(actor, event);
      const { data, error } = await supabase.from("sunday_service_visitor_registrations").delete().eq("event_id", eventId).eq("visitor_id", visitorId).select("visitor_id").maybeSingle();
      if (error) throw unavailable();
      if (!data) throw new EventServiceError(404, "VISITOR_REGISTRATION_NOT_FOUND", "Visitor registration was not found.");
      return { result: "removed", visitorId };
    },
  };
}
