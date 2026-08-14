import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '../../lib/cn'

interface ResponsiveTableProps extends HTMLAttributes<HTMLDivElement> {
  caption: string
  children: ReactNode
}

export function ResponsiveTable({
  caption,
  children,
  className,
  ...containerProps
}: ResponsiveTableProps) {
  return (
    <div
      {...containerProps}
      role="region"
      aria-label={caption}
      tabIndex={0}
      className={cn(
        'overflow-x-auto rounded-card border border-line bg-surface shadow-soft',
        className,
      )}
    >
      <table className="horizon-table">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  )
}
