/** Largest page a client may request from a paginated list endpoint. */
export const MAX_PAGE_LIMIT = 100;

const NON_NEGATIVE_INTEGER_PATTERN = /^\d{1,9}$/;

export interface PageRequest {
  limit: number;
  offset: number;
}

export interface PageMeta {
  hasMore: boolean;
  limit: number;
  offset: number;
  total: number;
}

export interface Page<T> {
  items: T[];
  meta: PageMeta;
}

/**
 * A successful list result that the shared request handler sends as
 * `{ data, meta }` instead of the plain `{ data }` envelope.
 */
export class PagedData<T> {
  constructor(
    readonly data: T,
    readonly meta: PageMeta,
  ) {}
}

export type PageRequestResult =
  | { ok: true; page: PageRequest | undefined }
  | { message: string; ok: false };

function readNonNegativeInteger(value: unknown) {
  return typeof value === "string" && NON_NEGATIVE_INTEGER_PATTERN.test(value)
    ? Number(value)
    : undefined;
}

/**
 * Reads the optional `limit` and `offset` query parameters. Without `limit`
 * the caller keeps the complete, unpaginated list; `offset` alone is invalid.
 */
export function readPageRequest(query: Record<string, unknown>): PageRequestResult {
  const { limit: limitValue, offset: offsetValue } = query;
  if (limitValue === undefined) {
    return offsetValue === undefined
      ? { ok: true, page: undefined }
      : { message: "Offset requires a limit.", ok: false };
  }

  const limit = readNonNegativeInteger(limitValue);
  if (limit === undefined || limit < 1 || limit > MAX_PAGE_LIMIT) {
    return {
      message: `Limit must be an integer from 1 to ${MAX_PAGE_LIMIT}.`,
      ok: false,
    };
  }

  const offset = offsetValue === undefined ? 0 : readNonNegativeInteger(offsetValue);
  if (offset === undefined) {
    return { message: "Offset must be a non-negative integer.", ok: false };
  }

  return { ok: true, page: { limit, offset } };
}

export function buildPageMeta(
  page: PageRequest,
  total: number,
  returnedCount: number,
): PageMeta {
  return {
    hasMore: page.offset + returnedCount < total,
    limit: page.limit,
    offset: page.offset,
    total,
  };
}

/** Pages a list that was already scoped, filtered and ordered in memory. */
export function pageFromArray<T>(items: T[], page: PageRequest): Page<T> {
  const pageItems = items.slice(page.offset, page.offset + page.limit);
  return { items: pageItems, meta: buildPageMeta(page, items.length, pageItems.length) };
}
