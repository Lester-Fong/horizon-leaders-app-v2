import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { usePageTitle } from './usePageTitle'

describe('usePageTitle', () => {
  it('suffixes the screen title with the app name', () => {
    renderHook(() => usePageTitle('Members'))
    expect(document.title).toBe('Members · Horizon')
  })

  it('falls back to the app name without a title', () => {
    renderHook(() => usePageTitle())
    expect(document.title).toBe('Horizon')
  })

  it('updates when the title changes', () => {
    const { rerender } = renderHook(({ title }) => usePageTitle(title), {
      initialProps: { title: 'Sunday Service' },
    })
    rerender({ title: 'Easter · Sunday Service' })
    expect(document.title).toBe('Easter · Sunday Service · Horizon')
  })
})
