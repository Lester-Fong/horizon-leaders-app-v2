import type { LucideIcon } from 'lucide-react'

import { Button } from './Button'
import { EmptyState } from './Feedback'

const MAX_SEARCH_LABEL_LENGTH = 40

function quoteSearch(search: string) {
  const label =
    search.length > MAX_SEARCH_LABEL_LENGTH
      ? `${search.slice(0, MAX_SEARCH_LABEL_LENGTH)}…`
      : search
  return `“${label}”`
}

interface FilteredEmptyStateProps {
  /** True when any filter other than the text search differs from its default. */
  hasFilters: boolean
  icon?: LucideIcon
  /** Plural record name, e.g. "Members". */
  plural: string
  search: string
  /** What the search looks at, completing "Check the spelling or search by …". */
  searchFields: string
  onClearFilters(): void
  onClearSearch(): void
}

/**
 * The empty list shown when a search or filter excludes every record. Filters
 * take precedence: clearing them also clears the search. Never offers a create
 * action, since the records may exist outside the current filters.
 */
export function FilteredEmptyState({
  hasFilters,
  icon,
  plural,
  search,
  searchFields,
  onClearFilters,
  onClearSearch,
}: FilteredEmptyStateProps) {
  if (hasFilters) {
    return (
      <EmptyState
        icon={icon}
        title={`No ${plural} match these filters`}
        description={`Change or clear the filters to see more ${plural}.`}
        action={
          <Button variant="secondary" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    )
  }

  return (
    <EmptyState
      icon={icon}
      title={`No ${plural} match ${quoteSearch(search)}`}
      description={`Check the spelling or search by ${searchFields}.`}
      action={
        <Button variant="secondary" onClick={onClearSearch}>
          Clear search
        </Button>
      }
    />
  )
}
