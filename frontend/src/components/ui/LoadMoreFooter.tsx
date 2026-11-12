import { Button } from './Button'
import { FeedbackBanner } from './Feedback'

interface LoadMoreFooterProps {
  error: string | null
  hasMore: boolean
  isLoading: boolean
  /** Plural record name read by screen readers, e.g. "Members". */
  label: string
  onLoadMore: () => void
  shown: number
  total: number
}

/** The "Showing N of M" status and Load more button below a paginated table. */
export function LoadMoreFooter({
  error,
  hasMore,
  isLoading,
  label,
  onLoadMore,
  shown,
  total,
}: LoadMoreFooterProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" aria-live="polite" className="font-mono text-xs text-muted">
          Showing {shown} of {total}
          <span className="sr-only"> {label}</span>
        </p>
        {hasMore && (
          <Button
            variant="secondary"
            isLoading={isLoading}
            onClick={onLoadMore}
            className="w-full sm:w-auto"
          >
            {isLoading ? 'Loading more' : 'Load more'}
          </Button>
        )}
      </div>
      {error && <FeedbackBanner tone="error">{error}</FeedbackBanner>}
    </div>
  )
}
