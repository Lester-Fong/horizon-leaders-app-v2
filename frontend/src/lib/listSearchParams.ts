import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Reads an allow-listed value; anything missing or unknown falls back silently. */
export function readEnum<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = params.get(key)
  return allowed.find((option) => option === value) ?? fallback
}

/** Reads the applied text search, trimmed. */
export function readSearch(params: URLSearchParams, key = 'search') {
  return params.get(key)?.trim() ?? ''
}

/** Reads a record ID that must look like a UUID; anything else reads as ''. */
export function readUuid(params: URLSearchParams, key: string) {
  const value = params.get(key) ?? ''
  return UUID_PATTERN.test(value) ? value : ''
}

/**
 * Keeps a list screen's applied search and filters in the URL. `defaults`
 * must be a stable (module-level) object naming every key the screen owns;
 * values equal to their default, or empty, are removed so a plain link shows
 * the default list. Updates replace the history entry, so Back leaves the
 * screen instead of stepping through filter changes.
 */
export function useListSearchParams<K extends string>(defaults: Readonly<Record<K, string>>) {
  const [searchParams, setSearchParams] = useSearchParams()

  const update = useCallback(
    (patch: Partial<Record<K, string>>) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const key of Object.keys(patch) as K[]) {
            const value = patch[key] ?? ''
            if (!value || value === defaults[key]) next.delete(key)
            else next.set(key, value)
          }
          return next
        },
        { replace: true },
      )
    },
    [defaults, setSearchParams],
  )

  /** Returns every owned key to its default, which removes it from the URL. */
  const reset = useCallback(() => {
    update(
      Object.fromEntries(Object.keys(defaults).map((key) => [key, ''])) as Partial<
        Record<K, string>
      >,
    )
  }, [defaults, update])

  return { reset, searchParams, update }
}

/**
 * The text being typed into a list search. It is local until submitted, and
 * resyncs whenever the applied search in the URL changes (Back, a sidebar link,
 * or a clear action).
 */
export function useSearchInput(appliedSearch: string) {
  const [searchInput, setSearchInput] = useState(appliedSearch)
  const [syncedSearch, setSyncedSearch] = useState(appliedSearch)
  if (appliedSearch !== syncedSearch) {
    setSyncedSearch(appliedSearch)
    setSearchInput(appliedSearch)
  }
  return [searchInput, setSearchInput] as const
}
