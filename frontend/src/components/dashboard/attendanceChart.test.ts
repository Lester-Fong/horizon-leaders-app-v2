import { describe, expect, it } from 'vitest'

import { CHART_HEIGHT, CHART_WIDTH, chartCoordinates, formatRate } from './attendanceChart'

const point = (eventId: string, rate: number | null) => ({ date: '2026-11-01', eligibleCount: 10, eventId, presentCount: 5, rate })

describe('attendanceChart', () => {
  it('spreads Services across the full width and scales the rate', () => {
    const coordinates = chartCoordinates([point('a', 100), point('b', 50), point('c', 0)])
    expect(coordinates.map(({ x }) => x)).toEqual([0, CHART_WIDTH / 2, CHART_WIDTH])
    expect(coordinates[0].y).toBe(24)
    expect(coordinates[2].y).toBe(CHART_HEIGHT)
  })

  it('draws a null rate at 0% and labels it with the empty label', () => {
    expect(chartCoordinates([point('a', null)])[0]).toEqual({ x: 0, y: CHART_HEIGHT })
    expect(formatRate(null, 'No eligible Members')).toBe('No eligible Members')
    expect(formatRate(75, '—')).toBe('75%')
  })
})
