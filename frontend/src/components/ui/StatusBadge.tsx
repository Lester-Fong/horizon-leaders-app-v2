import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

type StatusTone = 'neutral' | 'success' | 'warning' | 'error'

const toneClasses: Record<StatusTone, string> = {
  neutral: 'border-line-strong bg-canvas text-muted',
  success: 'border-ink bg-ink text-canvas',
  warning: 'border-ink bg-surface-subtle text-ink',
  error: 'border-ink bg-canvas text-ink',
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
        'inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[0.6875rem] font-semibold tracking-[0.08em] uppercase',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
