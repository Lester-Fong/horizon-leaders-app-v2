import { Moon, Sun } from 'lucide-react'

import type { ThemePreference } from '../../theme/theme-context'
import { useTheme } from '../../theme/useTheme'
import { cn } from '../../lib/cn'

interface ThemeToggleProps {
  className?: string
  compact?: boolean
}

export function ThemeToggle({ className, compact = false }: ThemeToggleProps) {
  const { preference, resolvedTheme, setPreference } = useTheme()
  const Icon = resolvedTheme === 'dark' ? Moon : Sun

  return (
    <label className={cn('block', className)}>
      <span className={cn('hm-label', compact && 'sr-only')}>Theme</span>
      <span
        className={cn(
          'mt-2 flex min-h-10 min-w-0 items-center gap-2 rounded-control border border-line bg-canvas px-2.5',
          compact && 'mt-0',
        )}
      >
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted" />
        <select
          aria-label={compact ? 'Theme' : undefined}
          value={preference}
          onChange={(event) =>
            setPreference(event.target.value as ThemePreference)
          }
          className="w-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent pr-2 text-xs font-semibold text-ink outline-none"
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="system">System</option>
        </select>
      </span>
    </label>
  )
}
