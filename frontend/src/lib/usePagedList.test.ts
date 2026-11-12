import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ApiPage, PageRequest } from './api'
import { DIRECTORY_PAGE_SIZE, usePagedList } from './usePagedList'

interface Row {
  id: string
  name: string
}

const rows: Row[] = Array.from({ length: 120 }, (_, index) => ({
  id: `row-${index}`,
  name: `Row ${String(index).padStart(3, '0')}`,
}))

function pageOf(page: PageRequest, source = rows): ApiPage<Row> {
  const items = source.slice(page.offset, page.offset + page.limit)
  return {
    items,
    meta: {
      hasMore: page.offset + items.length < source.length,
      limit: page.limit,
      offset: page.offset,
      total: source.length,
    },
  }
}

const firstPage = pageOf({ limit: DIRECTORY_PAGE_SIZE, offset: 0 })
const byName = (left: Row, right: Row) => left.name.localeCompare(right.name)

function renderPagedList() {
  return renderHook(() => usePagedList<Row>(() => 'Could not load rows.'))
}

describe('usePagedList', () => {
  it('requests the next page after the rows already loaded', async () => {
    const { result } = renderPagedList()
    const loader = vi.fn(async (page: PageRequest) => pageOf(page))

    act(() => result.current.replace(firstPage))
    await act(() => result.current.loadMore(loader))

    expect(loader).toHaveBeenCalledWith({ limit: 50, offset: 50 })
    expect(result.current.items).toHaveLength(100)
    expect(result.current.hasMore).toBe(true)
    expect(result.current.total).toBe(120)
  })

  it('shifts the next offset back when a loaded row leaves the list', async () => {
    const { result } = renderPagedList()
    const loader = vi.fn(async (page: PageRequest) => pageOf(page, rows.slice(1)))

    act(() => result.current.replace(firstPage))
    act(() => result.current.removeItem('row-0'))
    await act(() => result.current.loadMore(loader))

    expect(loader).toHaveBeenCalledWith({ limit: 50, offset: 49 })
    expect(result.current.items).toHaveLength(99)
    expect(result.current.items[49]?.id).toBe('row-50')
    expect(result.current.total).toBe(119)
  })

  it('places a new row in order and skips it when a later page repeats it', async () => {
    const { result } = renderPagedList()
    const newRow = { id: 'new-row', name: 'Row 999' }

    act(() => result.current.replace(firstPage))
    act(() => result.current.insertSorted(newRow, byName))
    expect(result.current.items.at(-1)).toEqual(newRow)
    expect(result.current.total).toBe(121)

    await act(() =>
      result.current.loadMore(async (page) => pageOf(page, [...rows, newRow])),
    )

    expect(result.current.items.filter((row) => row.id === 'new-row')).toHaveLength(1)
  })

  it('ignores a later page that arrives after the list was replaced', async () => {
    const { result } = renderPagedList()
    let resolveLate!: (page: ApiPage<Row>) => void

    act(() => result.current.replace(firstPage))
    let pending!: Promise<void>
    act(() => {
      pending = result.current.loadMore(
        () => new Promise<ApiPage<Row>>((resolve) => { resolveLate = resolve }),
      )
    })
    expect(result.current.isLoadingMore).toBe(true)

    const filteredPage = pageOf({ limit: 50, offset: 0 }, rows.slice(0, 3))
    act(() => result.current.replace(filteredPage))
    await act(async () => {
      resolveLate(pageOf({ limit: 50, offset: 50 }))
      await pending
    })

    expect(result.current.items).toHaveLength(3)
    expect(result.current.isLoadingMore).toBe(false)
    expect(result.current.hasMore).toBe(false)
  })
})
