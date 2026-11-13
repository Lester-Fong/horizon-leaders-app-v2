import { useEffect, useState } from 'react'

import { ApiError, getDashboard, getLifeGroups, type DashboardData, type DashboardPeriod, type LifeGroup } from '../../lib/api'
import { getAccessToken } from '../../lib/session'

const DASHBOARD_UNAVAILABLE_MESSAGE = 'Dashboard data is unavailable right now.'

/** Loads the role-scoped dashboard and, for Admins, the Life Groups for the attendance filter. */
export function useDashboard({ isAdmin, period, lifeGroupId }: { isAdmin: boolean; period: DashboardPeriod; lifeGroupId: string }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [lifeGroups, setLifeGroups] = useState<LifeGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessToken()
        const [dashboard, groups] = await Promise.all([
          getDashboard(token, period, isAdmin && lifeGroupId ? lifeGroupId : undefined),
          isAdmin ? getLifeGroups(token) : Promise.resolve([]),
        ])
        if (!cancelled) {
          setData(dashboard)
          setLifeGroups(groups)
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof ApiError ? reason.message : DASHBOARD_UNAVAILABLE_MESSAGE)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAdmin, lifeGroupId, period])

  return { data, lifeGroups, loading, error }
}
