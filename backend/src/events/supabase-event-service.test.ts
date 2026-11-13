import { describe, expect, it } from "vitest";

import type { HorizonActor } from "../auth/types.js";
import {
  createPostgrestFetch,
  inFilterSize,
  requestsTo,
  uuid,
  type Row,
} from "../test-support/fake-postgrest.js";
import { createSupabaseEventService } from "./supabase-event-service.js";

const adminId = "55555555-5555-4555-8555-555555555555";
const groupId = "33333333-3333-4333-8333-333333333333";
const eventId = "77777777-7777-4777-8777-777777777777";
const admin: HorizonActor = { id: adminId, isActive: true, name: "Ada Admin", role: "admin" };

function eventRow(id: string, status: "closed" | "open" = "open") {
  return {
    counts_for_absence: true,
    created_at: "2026-11-01T00:00:00.000Z",
    created_by_profile_id: adminId,
    description: null,
    event_date: "2026-11-08",
    id,
    location: null,
    status,
    title: "Sunday Service",
    type: "service",
    updated_at: "2026-11-01T00:00:00.000Z",
  };
}

function memberRow(index: number) {
  return {
    created_at: "2026-10-01T00:00:00.000Z",
    email: null,
    first_name: `First ${index}`,
    id: uuid("1", index),
    is_active: true,
    last_name: `Last ${String(index).padStart(5, "0")}`,
    life_group_id: groupId,
    phone: null,
  };
}

function createService(tables: Record<string, Row[]>) {
  const postgrest = createPostgrestFetch({
    life_groups: [{ id: groupId, leader_profile_id: null, name: "North" }],
    profiles: [{ id: adminId, name: "Ada Admin" }],
    ...tables,
  });
  const service = createSupabaseEventService({
    fetchImpl: postgrest.fetchImpl,
    serviceRoleKey: "test-service-role-key",
    supabaseUrl: "http://postgrest.test",
  });
  return { ...postgrest, service };
}

const members = (count: number) => Array.from({ length: count }, (_, index) => memberRow(index));

describe("Supabase Sunday Service list completeness", () => {
  it("returns the whole open roster past the 1000-row cap", async () => {
    const { requests, service } = createService({ events: [eventRow(eventId)], members: members(1250) });

    const { members: roster } = await service.getAttendance(admin, eventId);

    expect(roster).toHaveLength(1250);
    const memberRequests = requestsTo(requests, "members");
    expect(memberRequests.map((url) => [url.searchParams.get("offset"), url.searchParams.get("limit")])).toEqual([
      ["0", "1000"],
      ["1000", "1000"],
    ]);
    expect(memberRequests[0]?.searchParams.get("order")).toBe("id.asc");
  });

  it("reads a large closed eligibility snapshot and its Members in chunks", async () => {
    const roster = members(1250);
    const eligibility = roster.map((member) => ({ event_id: eventId, life_group_id_at_close: groupId, member_id: member.id }));
    const { requests, service } = createService({
      events: [eventRow(eventId, "closed")],
      members: roster,
      sunday_service_eligibility: eligibility,
    });

    const { members: attendance } = await service.getAttendance(admin, eventId);

    expect(attendance).toHaveLength(1250);
    expect(requestsTo(requests, "sunday_service_eligibility")).toHaveLength(2);
    const memberRequests = requestsTo(requests, "members");
    expect(memberRequests).toHaveLength(13);
    expect(memberRequests.every((url) => inFilterSize(url, "id") <= 100)).toBe(true);
  });

  it("marks Members present when their presence row lies past row 1000", async () => {
    const roster = members(1200);
    const presence = roster.map((member) => ({ event_id: eventId, member_id: member.id }));
    const { service } = createService({ events: [eventRow(eventId)], members: roster, sunday_service_presence: presence });

    const { members: attendance } = await service.getAttendance(admin, eventId);

    expect(attendance).toHaveLength(1200);
    expect(attendance.every((member) => member.isPresent)).toBe(true);
  });

  it("returns every Visitor registration in registration order", async () => {
    const visitors = Array.from({ length: 1100 }, (_, index) => ({
      email: null,
      first_name: `Visitor ${index}`,
      id: uuid("2", index),
      last_name: "Guest",
      phone: null,
      status: "active",
    }));
    // Stored newest first so the result order must come from `created_at`.
    const registrations = visitors.map((visitor, index) => ({
      created_at: new Date(Date.UTC(2026, 10, 8) + index * 1000).toISOString(),
      event_id: eventId,
      registered_by_profile_id: adminId,
      visitor_id: visitor.id,
    })).reverse();
    const { service } = createService({
      events: [eventRow(eventId)],
      sunday_service_visitor_registrations: registrations,
      visitors,
    });

    const { registrations: result } = await service.listVisitors(admin, eventId);

    expect(result).toHaveLength(1100);
    expect(result.map((registration) => registration.visitor.id)).toEqual(visitors.map((visitor) => visitor.id));
  });

  it("counts attendance past the 1000-row cap", async () => {
    const presence = Array.from({ length: 1500 }, (_, index) => ({ event_id: eventId, member_id: uuid("1", index) }));
    const { service } = createService({ events: [eventRow(eventId)], sunday_service_presence: presence });

    const event = await service.getById(admin, eventId);

    expect(event.attendanceCount).toBe(1500);
  });

  it("chunks event IDs when counting for more than 100 Services", async () => {
    const events = Array.from({ length: 150 }, (_, index) => eventRow(uuid("3", index)));
    const { requests, service } = createService({ events });

    const { events: listed } = await service.list(admin);

    expect(listed).toHaveLength(150);
    for (const table of ["sunday_service_presence", "sunday_service_eligibility", "sunday_service_visitor_registrations"]) {
      const tableRequests = requestsTo(requests, table);
      expect(tableRequests).toHaveLength(2);
      expect(tableRequests.map((url) => inFilterSize(url, "event_id"))).toEqual([100, 50]);
    }
  });
});

describe("Supabase Sunday Service edits and Leader scope", () => {
  const unassignedLeader: HorizonActor = { id: "66666666-6666-4666-8666-666666666666", isActive: true, name: "Una Leader", role: "leader" };

  it("treats a re-sent stored date on a closed Service as unchanged", async () => {
    const { requests, service } = createService({ events: [eventRow(eventId, "closed")] });

    const updated = await service.update(admin, eventId, { eventDate: "2026-11-08", title: "Renamed" });

    expect(updated.eventDate).toBe("2026-11-08");
    expect(requestsTo(requests, "sunday_service_presence").every((url) => url.searchParams.get("select") === "event_id")).toBe(true);
    expect(requestsTo(requests, "sunday_service_visitor_registrations").every((url) => url.searchParams.get("select") === "event_id")).toBe(true);
  });

  it("still locks a real date change on a closed Service", async () => {
    const { service } = createService({ events: [eventRow(eventId, "closed")] });

    await expect(service.update(admin, eventId, { eventDate: "2026-11-15" })).rejects.toMatchObject({ code: "EVENT_ACTIVITY_LOCKS_DATE", status: 422 });
  });

  it("returns an empty roster to a Leader without a Life Group", async () => {
    const { requests, service } = createService({ events: [eventRow(eventId)], members: members(3) });

    const attendance = await service.getAttendance(unassignedLeader, eventId);

    expect(attendance).toEqual({ isUnassignedLeader: true, members: [] });
    expect(requestsTo(requests, "members")).toHaveLength(0);
  });

  it("keeps check-in forbidden for a Leader without a Life Group", async () => {
    const roster = members(1);
    const { service } = createService({ events: [eventRow(eventId)], members: roster });

    await expect(service.addAttendance(unassignedLeader, eventId, roster[0]!.id)).rejects.toMatchObject({ status: 403 });
  });
});
