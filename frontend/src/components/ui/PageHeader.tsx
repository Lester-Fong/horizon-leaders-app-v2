import type { ReactNode } from 'react'

interface PageHeaderProps {
  actions?: ReactNode
  description: string
  title: string
}

export function PageHeader({ actions, description, title }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted sm:text-base">
          {description}
        </p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  )
}
