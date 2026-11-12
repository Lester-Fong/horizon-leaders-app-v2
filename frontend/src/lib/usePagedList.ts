import { useCallback, useRef, useState } from 'react'

import type { ApiPage, PageRequest } from './api'

/** Rows loaded per request on every paginated directory page. */
export const DIRECTORY_PAGE_SIZE = 50

export const DIRECTORY_FIRST_PAGE: PageRequest = {
  limit: DIRECTORY_PAGE_SIZE,
  offset: 0,
}

export type PageLoader<T> = (page: PageRequest) => Promise<ApiPage<T>>

interface PagedListState<T> {
  hasMore: boolean
  items: T[]
  /** Server offset of the next unread row; adjusted when rows leave or join the list. */
  nextOffset: number
  total: number
}

const EMPTY_STATE = { hasMore: false, items: [], nextOffset: 0, total: 0 }

/**
 * Holds a server-paginated directory list. The page loads (and reloads) the
 * first page itself and hands it to `replace`; `loadMore` appends the next
 * page. Local edits keep `total` and the next offset consistent, and a reply
 * that arrives after the list was replaced is ignored.
 */
export function usePagedList<T extends { id: string }>(
  getErrorMessage: (error: unknown) => string,
) {
  const [state, setState] = useState<PagedListState<T>>(EMPTY_STATE)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const stateRef = useRef<PagedListState<T>>(EMPTY_STATE)
  const generationRef = useRef(0)
  const isLoadingMoreRef = useRef(false)

  const commit = useCallback(
    (update: (current: PagedListState<T>) => PagedListState<T>) => {
      stateRef.current = update(stateRef.current)
      setState(stateRef.current)
    },
    [],
  )

  const replace = useCallback(
    (page: ApiPage<T>) => {
      generationRef.current += 1
      isLoadingMoreRef.current = false
      setIsLoadingMore(false)
      setLoadMoreError(null)
      commit(() => ({
        hasMore: page.meta.hasMore,
        items: page.items,
        nextOffset: page.meta.offset + page.items.length,
        total: page.meta.total,
      }))
    },
    [commit],
  )

  const loadMore = useCallback(
    async (loader: PageLoader<T>) => {
      if (isLoadingMoreRef.current || !stateRef.current.hasMore) return
      const generation = generationRef.current
      isLoadingMoreRef.current = true
      setIsLoadingMore(true)
      setLoadMoreError(null)
      try {
        const page = await loader({
          limit: DIRECTORY_PAGE_SIZE,
          offset: stateRef.current.nextOffset,
        })
        if (generation !== generationRef.current) return
        commit((current) => {
          const knownIds = new Set(current.items.map((item) => item.id))
          return {
            hasMore: page.meta.hasMore,
            items: [
              ...current.items,
              ...page.items.filter((item) => !knownIds.has(item.id)),
            ],
            nextOffset: page.meta.offset + page.items.length,
            total: page.meta.total,
          }
        })
      } catch (error) {
        if (generation === generationRef.current) setLoadMoreError(getErrorMessage(error))
      } finally {
        if (generation === generationRef.current) {
          isLoadingMoreRef.current = false
          setIsLoadingMore(false)
        }
      }
    },
    [commit, getErrorMessage],
  )

  /** Applies an edit that keeps every row in its server position (e.g. a count change). */
  const updateItems = useCallback(
    (update: (items: T[]) => T[]) => {
      commit((current) => ({ ...current, items: update(current.items) }))
    },
    [commit],
  )

  /** Drops a loaded row that no longer matches the list (deleted or filtered out). */
  const removeItem = useCallback(
    (id: string) => {
      commit((current) => {
        if (!current.items.some((item) => item.id === id)) return current
        return {
          ...current,
          items: current.items.filter((item) => item.id !== id),
          nextOffset: Math.max(0, current.nextOffset - 1),
          total: Math.max(0, current.total - 1),
        }
      })
    },
    [commit],
  )

  /**
   * Adds a row that now matches the list at its sorted position. When it sorts
   * after every loaded row while more remain, the server may place it in a later
   * page, so the offset is left alone and the duplicate is skipped on load.
   */
  const insertSorted = useCallback(
    (item: T, compare: (left: T, right: T) => number) => {
      commit((current) => {
        if (current.items.some((existing) => existing.id === item.id)) return current
        const index = current.items.findIndex((existing) => compare(item, existing) < 0)
        const isWithinLoadedRows = index !== -1 || !current.hasMore
        const items = [...current.items]
        items.splice(index === -1 ? items.length : index, 0, item)
        return {
          ...current,
          items,
          nextOffset: current.nextOffset + (isWithinLoadedRows ? 1 : 0),
          total: current.total + 1,
        }
      })
    },
    [commit],
  )

  return {
    hasMore: state.hasMore,
    insertSorted,
    isLoadingMore,
    items: state.items,
    loadMore,
    loadMoreError,
    removeItem,
    replace,
    total: state.total,
    updateItems,
  }
}
