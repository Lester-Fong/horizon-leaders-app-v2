import type { DashboardData } from '../../lib/api'

export const CHART_WIDTH = 720
export const CHART_HEIGHT = 220
const CHART_TOP_PADDING = 24

export function formatRate(rate: number | null, emptyLabel: string) {
  return rate === null ? emptyLabel : `${rate}%`
}

/** Places each Service evenly across the width; a null rate (no eligible Members) is drawn at 0%. */
export function chartCoordinates(points: DashboardData['sundayAttendance']['points']) {
  const lastIndex = Math.max(1, points.length - 1)
  return points.map((point, index) => ({
    x: (index / lastIndex) * CHART_WIDTH,
    y: CHART_HEIGHT - ((point.rate ?? 0) / 100) * (CHART_HEIGHT - CHART_TOP_PADDING),
  }))
}
