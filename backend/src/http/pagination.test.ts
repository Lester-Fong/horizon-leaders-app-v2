import { describe, expect, it } from "vitest";

import { pageFromArray, readPageRequest } from "./pagination.js";

describe("readPageRequest", () => {
  it("keeps the complete list when no limit is supplied", () => {
    expect(readPageRequest({})).toEqual({ ok: true, page: undefined });
  });

  it("reads a limit with a default offset of zero", () => {
    expect(readPageRequest({ limit: "50" })).toEqual({
      ok: true,
      page: { limit: 50, offset: 0 },
    });
    expect(readPageRequest({ limit: "100", offset: "250" })).toEqual({
      ok: true,
      page: { limit: 100, offset: 250 },
    });
  });

  it.each([
    [{ limit: "0" }],
    [{ limit: "101" }],
    [{ limit: "-1" }],
    [{ limit: "1.5" }],
    [{ limit: "abc" }],
    [{ limit: "" }],
    [{ limit: ["10", "20"] }],
    [{ limit: "10", offset: "-1" }],
    [{ limit: "10", offset: "1e3" }],
    [{ limit: "10", offset: ["0"] }],
    [{ offset: "10" }],
  ])("rejects %j", (query) => {
    expect(readPageRequest(query)).toMatchObject({ ok: false });
  });
});

describe("pageFromArray", () => {
  it("slices a filtered list and reports whether more remain", () => {
    const items = Array.from({ length: 132 }, (_, index) => index);

    expect(pageFromArray(items, { limit: 50, offset: 50 })).toEqual({
      items: items.slice(50, 100),
      meta: { hasMore: true, limit: 50, offset: 50, total: 132 },
    });
    expect(pageFromArray(items, { limit: 50, offset: 100 }).meta).toEqual({
      hasMore: false,
      limit: 50,
      offset: 100,
      total: 132,
    });
    expect(pageFromArray(items, { limit: 50, offset: 500 })).toEqual({
      items: [],
      meta: { hasMore: false, limit: 50, offset: 500, total: 132 },
    });
  });
});
