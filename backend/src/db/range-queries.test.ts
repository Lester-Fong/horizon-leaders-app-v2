import { describe, expect, it } from "vitest";

import {
  fetchAllRows,
  fetchRowPage,
  fetchRowsByIds,
  ROW_BATCH_SIZE,
  type CountOptions,
} from "./range-queries.js";

interface FakeRow {
  id: number;
}

interface FakeResult {
  count?: number | null;
  data: FakeRow[] | null;
  error: { code?: string; message?: string } | null;
}

/** A PostgREST-like table that, like the real server, never returns more than max_rows. */
function createFakeTable(rowCount: number, maxRows = ROW_BATCH_SIZE) {
  const rows = Array.from({ length: rowCount }, (_, index) => ({ id: index }));
  const ranges: Array<[number, number]> = [];
  const countOptions: Array<CountOptions | undefined> = [];

  function buildQuery(options?: CountOptions) {
    countOptions.push(options);
    const resolveAll = (): FakeResult =>
      options?.head
        ? { count: rows.length, data: null, error: null }
        : { count: options ? rows.length : null, data: rows.slice(0, maxRows), error: null };

    return {
      range(from: number, to: number) {
        ranges.push([from, to]);
        if (from > 0 && from >= rows.length) {
          return Promise.resolve<FakeResult>({
            count: null,
            data: null,
            error: { code: "PGRST103", message: "Requested range not satisfiable" },
          });
        }
        const end = Math.min(to + 1, from + maxRows);
        return Promise.resolve<FakeResult>({
          count: options ? rows.length : null,
          data: rows.slice(from, end),
          error: null,
        });
      },
      then<TResult1 = FakeResult, TResult2 = never>(
        onFulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
        onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        return Promise.resolve(resolveAll()).then(onFulfilled, onRejected);
      },
    };
  }

  return { buildQuery, countOptions, ranges };
}

describe("fetchAllRows", () => {
  it("returns every row past the 1000-row cap by reading in batches", async () => {
    const table = createFakeTable(2500);

    const { data, error } = await fetchAllRows(() => table.buildQuery());

    expect(error).toBeNull();
    expect(data).toHaveLength(2500);
    expect(data?.at(-1)).toEqual({ id: 2499 });
    expect(new Set(data?.map((row) => row.id)).size).toBe(2500);
    expect(table.ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("reads one extra empty batch when the total is an exact multiple of the batch", async () => {
    const table = createFakeTable(1000);

    const { data } = await fetchAllRows(() => table.buildQuery());

    expect(data).toHaveLength(1000);
    expect(table.ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("returns the first error instead of a partial list", async () => {
    let calls = 0;
    const failing = () => ({
      range: () => {
        calls += 1;
        return Promise.resolve<FakeResult>(
          calls === 1
            ? { data: Array.from({ length: 1000 }, (_, id) => ({ id })), error: null }
            : { data: null, error: { code: "500", message: "boom" } },
        );
      },
      then: () => Promise.resolve(),
    });

    const result = await fetchAllRows(failing as never);

    expect(result.data).toBeNull();
    expect(result.error).toEqual({ code: "500", message: "boom" });
  });
});

describe("fetchRowPage", () => {
  it("reads one exact-count page with the requested range", async () => {
    const table = createFakeTable(132);

    const { data } = await fetchRowPage(table.buildQuery, { limit: 50, offset: 100 });

    expect(data?.total).toBe(132);
    expect(data?.rows.map((row) => row.id)).toEqual(
      Array.from({ length: 32 }, (_, index) => 100 + index),
    );
    expect(table.ranges).toEqual([[100, 149]]);
    expect(table.countOptions).toEqual([{ count: "exact" }]);
  });

  it("returns an empty page with the real total when the offset is past the end", async () => {
    const table = createFakeTable(10);

    const { data, error } = await fetchRowPage(table.buildQuery, { limit: 50, offset: 500 });

    expect(error).toBeNull();
    expect(data).toEqual({ rows: [], total: 10 });
    expect(table.countOptions).toEqual([{ count: "exact" }, { count: "exact", head: true }]);
  });
});

describe("fetchRowsByIds", () => {
  it("splits distinct IDs into chunks of at most 100 per query", async () => {
    const ids = Array.from({ length: 250 }, (_, index) => `id-${index}`);
    const chunks: string[][] = [];

    const { data } = await fetchRowsByIds([...ids, ...ids], (idChunk) => {
      chunks.push(idChunk);
      return Promise.resolve({ data: idChunk.map((id) => ({ id })), error: null });
    });

    expect(chunks.map((idChunk) => idChunk.length)).toEqual([100, 100, 50]);
    expect(data).toHaveLength(250);
  });

  it("does not query when there are no IDs", async () => {
    let called = false;
    const { data } = await fetchRowsByIds([], () => {
      called = true;
      return Promise.resolve({ data: [], error: null });
    });

    expect(called).toBe(false);
    expect(data).toEqual([]);
  });
});
