import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '../../lib/cn'

interface ResponsiveTableProps extends HTMLAttributes<HTMLDivElement> {
  caption: string
  children: ReactNode
  tableClassName?: string
}

export function ResponsiveTable({
  caption,
  children,
  className,
  tableClassName,
  ...containerProps
}: ResponsiveTableProps) {
  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden">
      <div
        {...containerProps}
        role="region"
        aria-label={caption}
        tabIndex={0}
        className={cn(
          'w-full min-w-0 max-w-full overflow-x-auto border-y border-line bg-canvas',
          className,
        )}
      >
        <table className={cn('horizon-table', tableClassName)}>
          <caption className="sr-only">{caption}</caption>
          {children}
        </table>
      </div>
    </div>
  )
}
