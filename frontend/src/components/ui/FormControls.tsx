import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react'

import { cn } from '../../lib/cn'

interface FormFieldProps {
  children: ReactNode
  description?: string
  error?: string | null
  id: string
  label: string
  required?: boolean
}

export function FormField({
  children,
  description,
  error,
  id,
  label,
  required = false,
}: FormFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-1 text-danger">
            *
          </span>
        )}
      </label>
      {description && (
        <p id={`${id}-description`} className="mt-1 text-sm text-muted">
          {description}
        </p>
      )}
      <div className="mt-2">{children}</div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean
}

export function TextInput({ className, hasError, ...inputProps }: TextInputProps) {
  return (
    <input
      {...inputProps}
      className={cn(
        'min-h-11 w-full rounded-lg border bg-surface px-3 py-2 text-base text-ink shadow-xs placeholder:text-muted/75 disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-muted sm:text-sm',
        hasError ? 'border-danger' : 'border-line-strong hover:border-muted/60',
        className,
      )}
    />
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  hasError?: boolean
}

export function Select({ className, hasError, ...selectProps }: SelectProps) {
  return (
    <select
      {...selectProps}
      className={cn(
        'min-h-11 w-full rounded-lg border bg-surface px-3 py-2 text-base text-ink shadow-xs disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-muted sm:text-sm',
        hasError ? 'border-danger' : 'border-line-strong hover:border-muted/60',
        className,
      )}
    />
  )
}
