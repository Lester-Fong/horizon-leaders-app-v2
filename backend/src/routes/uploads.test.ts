import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "../app.js";
import type { AuthService, HorizonActor } from "../auth/types.js";
import { MAX_UPLOAD_INPUT_BYTES } from "../config/constants.js";
import { UploadServiceError, type UploadService } from "../uploads/types.js";

const memberId = "11111111-1111-4111-8111-111111111111";
const lifeGroupId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";
const actor: HorizonActor = { id: "44444444-4444-4444-8444-444444444444", isActive: true, name: "Ada Admin", role: "admin" };

function authService(): AuthService {
  return { authenticate: vi.fn(async () => ({ actor, ok: true })) };
}

function service(): UploadService {
  return {
    getEventImage: vi.fn(async () => ({ imageUrl: "https://signed.test/event" })),
    getLifeGroupLogo: vi.fn(async () => ({ imageUrl: null })),
    getMemberPhoto: vi.fn(async () => ({ imageUrl: "https://signed.test/member" })),
    removeEventImage: vi.fn(async () => ({ imageUrl: null })),
    removeLifeGroupLogo: vi.fn(async () => ({ imageUrl: null })),
    removeMemberPhoto: vi.fn(async () => ({ imageUrl: null })),
    replaceEventImage: vi.fn(async () => ({ imageUrl: "https://signed.test/event" })),
    replaceLifeGroupLogo: vi.fn(async () => ({ imageUrl: "https://signed.test/group" })),
    replaceMemberPhoto: vi.fn(async () => ({ imageUrl: "https://signed.test/member" })),
  };
}

describe("domain image upload routes", () => {
  it("requires authentication", async () => {
    const app = createApp({ authService: { authenticate: vi.fn() }, uploadService: service() });
    expect((await request(app).get(`/api/members/${memberId}/photo`)).status).toBe(401);
    expect((await request(app).put(`/api/life-groups/${lifeGroupId}/logo`).attach("image", Buffer.from("x"), "x.png")).status).toBe(401);
  });

  it("uses domain IDs and forwards only the uploaded bytes", async () => {
    const uploadService = service();
    const app = createApp({ authService: authService(), uploadService });
    const member = await request(app).put(`/api/members/${memberId}/photo`)
      .set("Authorization", "Bearer token")
      .attach("image", Buffer.from("image bytes"), { filename: "../../unsafe.jpg", contentType: "image/jpeg" });
    const group = await request(app).delete(`/api/life-groups/${lifeGroupId}/logo`).set("Authorization", "Bearer token");
    const event = await request(app).get(`/api/events/${eventId}/image`).set("Authorization", "Bearer token");
    expect(member.status).toBe(200);
    expect(group.status).toBe(200);
    expect(event.status).toBe(200);
    expect(uploadService.replaceMemberPhoto).toHaveBeenCalledWith(actor, memberId, Buffer.from("image bytes"));
    expect(uploadService.removeLifeGroupLogo).toHaveBeenCalledWith(actor, lifeGroupId);
    expect(uploadService.getEventImage).toHaveBeenCalledWith(actor, eventId);
  });

  it("rejects missing, oversized, extra, and malformed multipart input", async () => {
    const app = createApp({ authService: authService(), uploadService: service() });
    const missing = await request(app).put(`/api/members/${memberId}/photo`).set("Authorization", "Bearer token");
    const oversized = await request(app).put(`/api/members/${memberId}/photo`)
      .set("Authorization", "Bearer token")
      .attach("image", Buffer.alloc(MAX_UPLOAD_INPUT_BYTES + 1), "large.png");
    const extra = await request(app).put(`/api/members/${memberId}/photo`)
      .set("Authorization", "Bearer token")
      .attach("image", Buffer.from("one"), "one.png")
      .attach("image", Buffer.from("two"), "two.png");
    const malformed = await request(app).put(`/api/members/${memberId}/photo`)
      .set("Authorization", "Bearer token")
      .set("Content-Type", "multipart/form-data; boundary=bad")
      .send("bad");
    expect(missing.status).toBe(400);
    expect(oversized.status).toBe(413);
    expect(extra.status).toBe(400);
    expect(malformed.status).toBe(400);
  });

  it("maps safe service errors without exposing internals", async () => {
    const uploadService = service();
    vi.mocked(uploadService.getMemberPhoto).mockRejectedValueOnce(
      new UploadServiceError(404, "MEMBER_NOT_FOUND", "Member was not found."),
    );
    const response = await request(createApp({ authService: authService(), uploadService }))
      .get(`/api/members/${memberId}/photo`)
      .set("Authorization", "Bearer token");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: "MEMBER_NOT_FOUND", message: "Member was not found." } });
  });
});
