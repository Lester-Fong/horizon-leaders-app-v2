import { ArrowLeft, History, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import {
  describeUserActivityChanges,
  USER_ACTIVITY_ACTION_LABELS,
} from '../components/users/userActivityFormat'
import { Button, LinkButton } from '../components/ui/Button'
import { EmptyState, ErrorState, FeedbackBanner, LoadingState } from '../components/ui/Feedback'
import { LoadMoreFooter } from '../components/ui/LoadMoreFooter'
import { PageHeader } from '../components/ui/PageHeader'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import { ApiError, getUserAuditPage, type UserActivityEvent } from '../lib/api'
import { formatTimestampDateTime } from '../lib/dates'
import { getAccessToken } from '../lib/session'
import { DIRECTORY_FIRST_PAGE, usePagedList } from '../lib/usePagedList'
import { usePageTitle } from '../lib/usePageTitle'

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  return 'The activity log is unavailable right now.'
}

/** Admin-only, read-only log of every staff account change, newest first. */
export function UserAuditLogPage() {
  usePageTitle('Activity log')
  const auditList = usePagedList<UserActivityEvent>(getErrorMessage)
  const { items: events, loadMore, replace } = auditList
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      replace(await getUserAuditPage(await getAccessToken(), DIRECTORY_FIRST_PAGE))
    } catch (error) {
      setLoadError(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }, [replace])

  const loadMoreEvents = useCallback(
    () => loadMore(async (page) => getUserAuditPage(await getAccessToken(), page)),
    [loadMore],
  )

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void loadData(), 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadData])

  return (
    <div className="space-y-8">
      <div>
        <LinkButton to="/users" variant="ghost" size="sm" className="mb-5 -ml-3">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to Users
        </LinkButton>
        <PageHeader
          marker="09 — Administration"
          title="Activity log"
          description="Every staff account change, newest first. Times are shown in Manila time."
          actions={
            <Button variant="secondary" onClick={() => void loadData()}>
              <RefreshCw aria-hidden="true" className="size-4" />
              Refresh
            </Button>
          }
        />
      </div>

      {loadError && events.length > 0 && <FeedbackBanner tone="error">{loadError}</FeedbackBanner>}

      {isLoading ? (
        <LoadingState title="Loading activity" description="Retrieving recorded account changes." />
      ) : loadError && events.length === 0 ? (
        <ErrorState
          title="Activity could not be loaded"
          description={loadError}
          action={<Button onClick={() => void loadData()}>Try again</Button>}
        />
      ) : events.length === 0 ? (
        <EmptyState
          icon={History}
          title="No account activity yet"
          description="Creating, changing, or deleting a staff account adds an entry here."
        />
      ) : (
        <ResponsiveTable
          caption="Staff account activity, newest first"
          tableClassName="horizon-table--audit"
        >
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Change</th>
              <th scope="col">Account</th>
              <th scope="col">By</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => {
              const changes = describeUserActivityChanges(event)
              return (
                <tr key={event.id}>
                  <td className="audit-cell-when">
                    <span className="hm-table-mobile-label">When</span>
                    <p className="font-mono text-xs text-muted">
                      {formatTimestampDateTime(event.createdAt)}
                    </p>
                  </td>
                  <td className="audit-cell-change">
                    <span className="hm-table-mobile-label">Change</span>
                    <p className="text-sm font-medium text-ink">
                      {USER_ACTIVITY_ACTION_LABELS[event.action]}
                    </p>
                    {changes && <p className="mt-1 break-words text-sm text-muted">{changes}</p>}
                  </td>
                  <td>
                    <span className="hm-table-mobile-label">Account</span>
                    <p className="text-sm text-ink">{event.targetName}</p>
                  </td>
                  <td>
                    <span className="hm-table-mobile-label">By</span>
                    <p className="text-sm text-muted">{event.actorName}</p>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </ResponsiveTable>
      )}

      {!isLoading && events.length > 0 && (
        <LoadMoreFooter
          error={auditList.loadMoreError}
          hasMore={auditList.hasMore}
          isLoading={auditList.isLoadingMore}
          label="activity entries"
          onLoadMore={() => void loadMoreEvents()}
          shown={events.length}
          total={auditList.total}
        />
      )}
    </div>
  )
}
