import type { PageRequest } from "../http/pagination.js";

/**
 * Rows requested per batch. It matches PostgREST `max_rows` (supabase/config.toml),
 * so a batch shorter than this is always the last one.
 */
export const ROW_BATCH_SIZE = 1000;

/** IDs per `.in()` filter, keeping request URLs well below proxy limits. */
export const IN_FILTER_CHUNK_SIZE = 100;

/** PostgREST error for an offset past the last row ("Requested range not satisfiable"). */
const RANGE_NOT_SATISFIABLE = "PGRST103";

export interface RowsError {
  code?: string;
  message?: string;
}

interface RowsResult<Row> {
  count?: number | null;
  data: Row[] | null;
  error: RowsError | null;
}

interface RangeableQuery<Row> extends PromiseLike<RowsResult<Row>> {
  range(from: number, to: number): PromiseLike<RowsResult<Row>>;
}

export interface CountOptions {
  count: "exact";
  head?: boolean;
}

type QueryOutcome<T> = { data: T; error: null } | { data: null; error: RowsError };

/**
 * Reads every row of an ordered query in `.range()` batches, so a list is never
 * silently cut at the PostgREST row cap. `buildQuery` must return a fresh,
 * deterministically ordered query (with a unique tiebreaker such as `id`).
 */
export async function fetchAllRows<Row>(
  buildQuery: () => RangeableQuery<Row>,
  batchSize = ROW_BATCH_SIZE,
): Promise<QueryOutcome<Row[]>> {
  const rows: Row[] = [];
  for (let from = 0; ; from += batchSize) {
    const { data, error } = await buildQuery().range(from, from + batchSize - 1);
    // A batch starting exactly at the end of an evenly divided list may be refused.
    if (from > 0 && error?.code === RANGE_NOT_SATISFIABLE) return { data: rows, error: null };
    if (error || !data) return { data: null, error: error ?? {} };
    rows.push(...data);
    if (data.length < batchSize) return { data: rows, error: null };
  }
}

/**
 * Reads one page of an ordered query with an exact total. `buildQuery` receives
 * the count options to pass to `.select()`, after which all scope filters apply.
 */
export async function fetchRowPage<Row>(
  buildQuery: (countOptions: CountOptions) => RangeableQuery<Row>,
  page: PageRequest,
): Promise<QueryOutcome<{ rows: Row[]; total: number }>> {
  const { count, data, error } = await buildQuery({ count: "exact" }).range(
    page.offset,
    page.offset + page.limit - 1,
  );

  if (error?.code === RANGE_NOT_SATISFIABLE) {
    const head = await buildQuery({ count: "exact", head: true });
    if (head.error || typeof head.count !== "number") {
      return { data: null, error: head.error ?? {} };
    }
    return { data: { rows: [], total: head.count }, error: null };
  }

  if (error || !data || typeof count !== "number") {
    return { data: null, error: error ?? {} };
  }
  return { data: { rows: data, total: count }, error: null };
}

export function chunk<T>(items: readonly T[], size = IN_FILTER_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * Reads rows by ID with one `.in()` query per chunk of distinct IDs, so neither
 * the request URL nor any single response grows with the size of the list.
 * Each chunk query must return at most one row per ID.
 */
export async function fetchRowsByIds<Row>(
  ids: readonly string[],
  buildQuery: (idChunk: string[]) => PromiseLike<RowsResult<Row>>,
): Promise<QueryOutcome<Row[]>> {
  const results = await Promise.all(chunk([...new Set(ids)]).map(buildQuery));
  const rows: Row[] = [];
  for (const { data, error } of results) {
    if (error || !data) return { data: null, error: error ?? {} };
    rows.push(...data);
  }
  return { data: rows, error: null };
}
