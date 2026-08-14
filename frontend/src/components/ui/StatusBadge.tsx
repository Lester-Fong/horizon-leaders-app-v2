import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

type StatusTone = 'neutral' | 'success' | 'warning' | 'error'

const toneClasses: Record<StatusTone, string> = {
  neutral: 'bg-surface-subtle text-muted ring-line-strong',
  success: 'bg-success-soft text-success-strong ring-success/25',
  warning: 'bg-warning-soft text-warning-strong ring-warning/30',
  error: 'bg-danger-soft text-danger-strong ring-danger/25',
}

interface StatusBadgeProps {
  children: ReactNode
  className?: string
  tone?: StatusTone
}

export function StatusBadge({
  children,
  className,
  tone = 'neutral',
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
