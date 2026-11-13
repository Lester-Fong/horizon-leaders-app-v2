/**
 * Test-only fake of the Supabase PostgREST HTTP API for service tests that
 * need realistic paging. Never import this from application code; ESLint
 * blocks `test-support` imports outside tests.
 */

export type Row = Record<string, unknown>;

/** PostgREST `max_rows`: no single response returns more rows than this. */
export const POSTGREST_MAX_ROWS = 1000;

/** A valid, sortable UUID whose first block repeats `prefix` (e.g. "1"). */
export function uuid(prefix: string, index: number) {
  return `${prefix.repeat(8)}-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

/** Sorts rows by a PostgREST `order` value such as `created_at.desc,id.asc`. */
export function compareRows(order: string) {
  const keys = order.split(",").map((term) => term.split("."));
  return (a: Row, b: Row) => {
    for (const [column = "", direction] of keys) {
      const left = String(a[column]);
      const right = String(b[column]);
      if (left !== right) return (left < right ? -1 : 1) * (direction === "desc" ? -1 : 1);
    }
    return 0;
  };
}

/**
 * Serves tables like PostgREST: eq./in. filters, `order`, an `offset`/`limit`
 * window, and never more than max_rows rows in one response. Every request URL
 * is recorded in `requests`.
 */
export function createPostgrestFetch(tables: Record<string, Row[]>) {
  const requests: URL[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push(url);
    let rows = tables[url.pathname.split("/").at(-1) ?? ""] ?? [];
    for (const [column, filter] of url.searchParams) {
      if (["select", "order", "offset", "limit"].includes(column)) continue;
      if (filter.startsWith("eq.")) {
        rows = rows.filter((row) => String(row[column]) === filter.slice(3));
      } else if (filter.startsWith("in.(")) {
        const values = new Set(filter.slice(4, -1).split(",").map((value) => value.replace(/^"|"$/g, "")));
        rows = rows.filter((row) => values.has(String(row[column])));
      } else {
        throw new Error(`Unsupported filter ${column}=${filter}`);
      }
    }
    const order = url.searchParams.get("order");
    if (order) rows = [...rows].sort(compareRows(order));
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? POSTGREST_MAX_ROWS), POSTGREST_MAX_ROWS);
    const window = rows.slice(offset, offset + limit);
    const headers = { "Content-Type": "application/json" };
    if (new Headers(init?.headers).get("Accept")?.includes("vnd.pgrst.object")) {
      return new Response(JSON.stringify(window[0] ?? null), { headers, status: 200 });
    }
    return new Response(JSON.stringify(window), { headers, status: 200 });
  };
  return { fetchImpl, requests };
}

/** The recorded requests made to one table. */
export function requestsTo(requests: URL[], table: string) {
  return requests.filter((url) => url.pathname.endsWith(`/${table}`));
}

/** How many values a request's `in.(…)` filter on `column` carries. */
export function inFilterSize(url: URL, column: string) {
  return url.searchParams.get(column)?.slice(4, -1).split(",").length ?? 0;
}
