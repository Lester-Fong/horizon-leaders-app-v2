import {
  BadgeCheck,
  CircleAlert,
  CircleX,
  Inbox,
  Info,
  LoaderCircle,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'

type FeedbackTone = 'info' | 'success' | 'warning' | 'error'

const feedbackStyles: Record<
  FeedbackTone,
  { container: string; icon: LucideIcon }
> = {
  info: { container: 'border-info/25 bg-info-soft text-info-strong', icon: Info },
  success: {
    container: 'border-success/25 bg-success-soft text-success-strong',
    icon: BadgeCheck,
  },
  warning: {
    container: 'border-warning/30 bg-warning-soft text-warning-strong',
    icon: TriangleAlert,
  },
  error: {
    container: 'border-danger/25 bg-danger-soft text-danger-strong',
    icon: CircleAlert,
  },
}

interface FeedbackBannerProps {
  children: ReactNode
  className?: string
  title?: string
  tone?: FeedbackTone
}

export function FeedbackBanner({
  children,
  className,
  title,
  tone = 'info',
}: FeedbackBannerProps) {
  const style = feedbackStyles[tone]
  const Icon = style.icon

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'flex gap-3 rounded-xl border px-4 py-3 text-sm leading-6',
        style.container,
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div className={cn(title && 'mt-0.5')}>{children}</div>
      </div>
    </div>
  )
}

interface LoadingStateProps {
  description?: string
  fullScreen?: boolean
  title?: string
}

export function LoadingState({
  description = 'Please wait while Horizon gets things ready.',
  fullScreen = false,
  title = 'Loading',
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'grid place-items-center px-6 text-center',
        fullScreen ? 'min-h-screen bg-canvas' : 'min-h-72',
      )}
    >
      <div className="max-w-sm">
        <LoaderCircle
          aria-hidden="true"
          className="mx-auto size-8 animate-spin text-primary"
        />
        <p className="mt-4 font-semibold text-ink">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
      </div>
    </div>
  )
}

interface EmptyStateProps {
  action?: ReactNode
  description: string
  icon?: LucideIcon
  title: string
}

export function EmptyState({
  action,
  description,
  icon: Icon = Inbox,
  title,
}: EmptyStateProps) {
  return (
    <section className="rounded-card border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-xl bg-primary-soft text-primary">
        <Icon aria-hidden="true" className="size-6" />
      </div>
      <h2 className="mt-5 text-lg font-bold text-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted">
        {description}
      </p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </section>
  )
}

interface ErrorStateProps {
  action?: ReactNode
  code?: string
  description: string
  title: string
}

export function ErrorState({ action, code, description, title }: ErrorStateProps) {
  return (
    <section
      role="alert"
      className="rounded-card border border-line bg-surface px-6 py-12 text-center shadow-soft"
    >
      <div className="mx-auto grid size-12 place-items-center rounded-xl bg-danger-soft text-danger">
        <CircleX aria-hidden="true" className="size-6" />
      </div>
      {code && (
        <p className="mt-5 text-xs font-bold tracking-[0.18em] text-danger uppercase">
          {code}
        </p>
      )}
      <h1 className={cn('text-2xl font-bold text-ink', code ? 'mt-2' : 'mt-5')}>
        {title}
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted sm:text-base">
        {description}
      </p>
      {action && <div className="mt-7 flex justify-center">{action}</div>}
    </section>
  )
}
