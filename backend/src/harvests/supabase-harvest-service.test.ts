import { describe, expect, it } from "vitest";

import type { HorizonActor } from "../auth/types.js";
import type { MemberService } from "../members/types.js";
import { createPostgrestFetch, requestsTo, uuid, type Row } from "../test-support/fake-postgrest.js";
import { createSupabaseHarvestService } from "./supabase-harvest-service.js";

const adminId = "55555555-5555-4555-8555-555555555555";
const eventId = "77777777-7777-4777-8777-777777777777";
const admin: HorizonActor = { id: adminId, isActive: true, name: "Ada Admin", role: "admin" };

function timestamp(seconds: number) {
  return new Date(Date.UTC(2026, 10, 8) + seconds * 1000).toISOString();
}

const harvestEvent = {
  counts_for_absence: false,
  created_at: "2026-11-01T00:00:00.000Z",
  created_by_profile_id: adminId,
  description: null,
  event_date: "2026-11-08",
  id: eventId,
  location: null,
  status: "open",
  title: "Harvest",
  type: "harvest",
  updated_at: "2026-11-01T00:00:00.000Z",
};

function visitorRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    email: null,
    first_name: `Visitor ${index}`,
    id: uuid("2", index),
    last_name: "Guest",
    phone: null,
    status: "active",
  }));
}

function participationRows(visitors: Row[]) {
  return visitors.map((visitor, index) => ({
    created_at: timestamp(index),
    event_id: eventId,
    interest_recorded_at: null,
    interest_recorded_by_profile_id: null,
    registered_by_profile_id: adminId,
    sunday_interest: null,
    visitor_id: visitor.id,
  }));
}

function createService(tables: Record<string, Row[]>) {
  const postgrest = createPostgrestFetch({
    events: [harvestEvent],
    profiles: [{ id: adminId, name: "Ada Admin" }],
    ...tables,
  });
  const service = createSupabaseHarvestService({
    fetchImpl: postgrest.fetchImpl,
    memberService: {} as MemberService,
    serviceRoleKey: "test-service-role-key",
    supabaseUrl: "http://postgrest.test",
  });
  return { ...postgrest, service };
}

describe("Supabase Harvest list completeness", () => {
  it("returns and counts every participation past the 1000-row cap", async () => {
    const visitors = visitorRows(1200);
    const { service } = createService({ harvest_participations: participationRows(visitors), visitors });

    const { participations } = await service.listParticipations(admin, eventId);
    const event = await service.getById(admin, eventId);

    expect(participations).toHaveLength(1200);
    expect(participations.map((participation) => participation.visitor.id)).toEqual(visitors.map((visitor) => visitor.id));
    expect(event.participationCount).toBe(1200);
  });

  it("gives each Visitor their newest follow-up when a chunk holds over 1000 follow-ups", async () => {
    const visitors = visitorRows(150);
    const followUpsPerVisitor = 12;
    const followUps = visitors.flatMap((visitor, visitorIndex) =>
      Array.from({ length: followUpsPerVisitor }, (_, index) => ({
        created_at: timestamp(index * 1000 + visitorIndex),
        id: uuid("4", visitorIndex * followUpsPerVisitor + index),
        reason: "harvest_sunday_interest",
        status: index === followUpsPerVisitor - 1 ? "active" : "completed",
        visitor_id: visitor.id,
      })),
    );
    const { requests, service } = createService({
      follow_ups: followUps,
      harvest_participations: participationRows(visitors),
      visitors,
    });

    const { participations } = await service.listParticipations(admin, eventId);

    const followUpRequests = requestsTo(requests, "follow_ups");
    // 100 visitors x 12 follow-ups = 1200 rows in the first chunk: two batches, then one for the last 50 visitors.
    expect(followUpRequests).toHaveLength(3);
    expect(participations).toHaveLength(150);
    participations.forEach((participation, visitorIndex) => {
      expect(participation.followUp).toEqual({
        createdAt: timestamp((followUpsPerVisitor - 1) * 1000 + visitorIndex),
        id: uuid("4", visitorIndex * followUpsPerVisitor + followUpsPerVisitor - 1),
        status: "active",
      });
    });
  });
});

describe("Supabase Harvest edits", () => {
  it("treats a re-sent stored date on a closed Harvest as unchanged", async () => {
    const { requests, service } = createService({ events: [{ ...harvestEvent, status: "closed" }] });

    const updated = await service.update(admin, eventId, { eventDate: "2026-11-08", title: "Renamed" });

    expect(updated.eventDate).toBe("2026-11-08");
    expect(requestsTo(requests, "harvest_participations").every((url) => url.searchParams.get("select") === "event_id")).toBe(true);
  });

  it("returns the stored Harvest without writing when only the unchanged date is sent", async () => {
    const { requests, service } = createService({ events: [{ ...harvestEvent, status: "closed" }] });

    const updated = await service.update(admin, eventId, { eventDate: "2026-11-08" });

    expect(updated.status).toBe("closed");
    expect(requestsTo(requests, "events")).toHaveLength(1);
  });

  it("still locks a real date change on a closed Harvest", async () => {
    const { service } = createService({ events: [{ ...harvestEvent, status: "closed" }] });

    await expect(service.update(admin, eventId, { eventDate: "2026-11-09" })).rejects.toMatchObject({ code: "EVENT_ACTIVITY_LOCKS_DATE", status: 422 });
  });
});
