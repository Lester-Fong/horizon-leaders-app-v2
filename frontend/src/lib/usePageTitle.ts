import { useEffect } from 'react'

export const APP_TITLE = 'Horizon'

export function formatPageTitle(title?: string) {
  return title ? `${title} · ${APP_TITLE}` : APP_TITLE
}

/**
 * Sets the browser tab title for the current screen. Titles name the screen or
 * record type only; never pass person names or search terms.
 */
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = formatPageTitle(title)
  }, [title])
}
