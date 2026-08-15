import type { ReactNode } from 'react'

interface PageHeaderProps {
  actions?: ReactNode
  description: string
  marker?: string
  title: string
}

export function PageHeader({
  actions,
  description,
  marker = 'Horizon / Workspace',
  title,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-6 border-b border-line pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        <p className="hm-label">{marker}</p>
        <h1 className="mt-3 font-display text-[2rem] leading-none font-medium tracking-[-0.05em] text-ink sm:text-[2.45rem]">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-[0.9375rem]">
          {description}
        </p>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">{actions}</div>
      )}
    </header>
  )
}
