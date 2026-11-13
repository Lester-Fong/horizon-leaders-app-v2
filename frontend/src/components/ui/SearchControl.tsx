import { Search, X } from 'lucide-react'
import { useRef, type RefObject } from 'react'

import { Button } from './Button'
import { FormField, TextInput } from './FormControls'

interface SearchControlProps {
  description: string
  id: string
  /**
   * Optional handle on the search input, so the page can return focus to it
   * after clearing from elsewhere (e.g. an empty state's clear action).
   */
  inputRef?: RefObject<HTMLInputElement | null>
  /** True while a submitted search is filtering the list, which shows Clear. */
  isApplied: boolean
  maxLength?: number
  placeholder: string
  value: string
  onChange(value: string): void
  onClear(): void
}

/**
 * The text search of a list's filter bar: the input with its own Search and
 * Clear buttons, so the action sits next to the text it applies to. It must be
 * placed inside the filter `<form>`, whose submit applies the search.
 */
export function SearchControl({
  description,
  id,
  inputRef,
  isApplied,
  maxLength,
  placeholder,
  value,
  onChange,
  onClear,
}: SearchControlProps) {
  const ownInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = inputRef ?? ownInputRef

  function clear() {
    onClear()
    // Clear unmounts once the search is gone; keep focus in the search field.
    searchInputRef.current?.focus()
  }

  return (
    <FormField id={id} label="Search" description={description}>
      <div className="flex gap-2">
        <TextInput
          ref={searchInputRef}
          id={id}
          type="search"
          className="min-w-0 flex-1 [&::-webkit-search-cancel-button]:appearance-none"
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button type="submit" variant="secondary" className="min-h-11 min-w-11 shrink-0 px-3 sm:px-4">
          <Search aria-hidden="true" className="size-4" />
          <span className="sr-only sm:not-sr-only">Search</span>
        </Button>
        {isApplied && (
          <Button type="button" variant="ghost" className="min-h-11 shrink-0 px-3 text-ink!" onClick={clear}>
            <X aria-hidden="true" className="size-4" />
            Clear{' '}
            <span className="sr-only">search</span>
          </Button>
        )}
      </div>
    </FormField>
  )
}
