import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  ThemeContext,
  type ResolvedTheme,
  type ThemePreference,
} from './theme-context'

const THEME_STORAGE_KEY = 'horizon-theme'
const DARK_THEME_QUERY = '(prefers-color-scheme: dark)'

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

function getInitialPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system'

  const storedPreference = window.localStorage.getItem(THEME_STORAGE_KEY)
  return isThemePreference(storedPreference) ? storedPreference : 'system'
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') return preference
  return window.matchMedia(DARK_THEME_QUERY).matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setStoredPreference] =
    useState<ThemePreference>(getInitialPreference)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(getInitialPreference()),
  )

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference)
    setStoredPreference(nextPreference)
  }, [])

  useEffect(() => {
    const colorScheme = window.matchMedia(DARK_THEME_QUERY)

    function applyTheme() {
      const nextResolvedTheme = resolveTheme(preference)
      document.documentElement.dataset.theme = nextResolvedTheme
      document.documentElement.style.colorScheme = nextResolvedTheme
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute(
          'content',
          nextResolvedTheme === 'dark' ? '#0c0c0f' : '#ffffff',
        )
      setResolvedTheme(nextResolvedTheme)
    }

    applyTheme()
    colorScheme.addEventListener('change', applyTheme)

    return () => colorScheme.removeEventListener('change', applyTheme)
  }, [preference])

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
